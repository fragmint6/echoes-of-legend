"""Turn generated raw art into shippable 96x96 hero portraits.

The generator returns ~1254px RGB images whose "transparent" background has
been flattened into a light checkerboard (alternating ~#fefefe and ~#ebebeb
squares). Alpha must therefore be reconstructed, not read.

Pipeline per hero:
  1. flood fill from the border to find background, which keeps light
     pixels INSIDE the figure (Zeus's white himation) opaque
  2. despeckle the mask so lone stray pixels do not punch holes
  3. trim to the subject's bounding box
  4. scale so the subject fills the target safe area, nearest neighbour
  5. paste centred on a square canvas with the eyeline at 36%
  6. quantise to <= 32 colours
  7. harden alpha to strictly 0 or 255 - no soft edges

Run:  python3 tools/process_art.py
"""

import os
from collections import deque

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art-src")
OUT = os.path.join(ROOT, "assets", "heroes")

SIZE = 96          # final canvas
SAFE = 0.78        # fraction of canvas the subject may span
EYELINE = 0.36     # where the eyeline should land
MAX_COLORS = 32

# how far a pixel may sit from the checkerboard tones and still be background
BG_TOL = 26
CHECKER = ((254, 254, 254), (235, 235, 235))


def _is_bg(px, tol=BG_TOL):
    r, g, b = px[:3]
    # background is light and near-neutral
    if abs(r - g) > 10 or abs(g - b) > 10 or abs(r - b) > 10:
        return False
    for cr, cg, cb in CHECKER:
        if abs(r - cr) <= tol and abs(g - cg) <= tol and abs(b - cb) <= tol:
            return True
    return False


def build_mask(im):
    """Flood fill background inward from the border.

    A global colour threshold would delete white cloth inside the figure.
    Only background *connected to the edge* is removed.
    """
    W, H = im.size
    px = im.load()
    bg = bytearray(W * H)  # 1 = background
    q = deque()

    def push(x, y):
        i = y * W + x
        if not bg[i] and _is_bg(px[x, y]):
            bg[i] = 1
            q.append((x, y))

    for x in range(W):
        push(x, 0)
        push(x, H - 1)
    for y in range(H):
        push(0, y)
        push(W - 1, y)

    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H:
                push(nx, ny)

    return bg


def despeckle(bg, W, H, passes=2):
    """Fill single-pixel holes: a subject pixel ringed by background is noise
    from the checkerboard, and vice versa."""
    for _ in range(passes):
        changed = 0
        new = bytearray(bg)
        for y in range(1, H - 1):
            base = y * W
            for x in range(1, W - 1):
                i = base + x
                n = (
                    bg[i - 1] + bg[i + 1] + bg[i - W] + bg[i + W]
                    + bg[i - W - 1] + bg[i - W + 1] + bg[i + W - 1] + bg[i + W + 1]
                )
                if bg[i] == 0 and n >= 7:
                    new[i] = 1
                    changed += 1
                elif bg[i] == 1 and n <= 1:
                    new[i] = 0
                    changed += 1
        bg = new
        if not changed:
            break
    return bg


def cut_out(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    bg = despeckle(build_mask(im), W, H)

    rgba = im.convert("RGBA")
    px = rgba.load()
    for y in range(H):
        base = y * W
        for x in range(W):
            if bg[base + x]:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def strip_detached(img, keep_frac=0.06):
    """Delete blobs that are not connected to the main figure.

    Generated art scatters sparkles, embers and glow motes around the
    subject. They are visually small but they inflate the bounding box,
    and `fit()` scales to that box - so a hero surrounded by particles
    gets shrunk to make room for them and ends up a different apparent
    size from everyone else. That is what made a single fixed card mask
    impossible. Anything under `keep_frac` of the largest component is
    removed; a genuine second body part (Hansel and Gretel are two
    figures) is far above that threshold.
    """
    from collections import deque

    px = img.load()
    W, H = img.size
    seen = bytearray(W * H)
    comps = []

    for sy in range(H):
        for sx in range(W):
            i = sy * W + sx
            if seen[i] or px[sx, sy][3] == 0:
                continue
            q = deque([(sx, sy)])
            seen[i] = 1
            cells = []
            while q:
                x, y = q.popleft()
                cells.append((x, y))
                for nx, ny in (
                    (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1),
                    (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1),
                ):
                    if 0 <= nx < W and 0 <= ny < H:
                        j = ny * W + nx
                        if not seen[j] and px[nx, ny][3] != 0:
                            seen[j] = 1
                            q.append((nx, ny))
            comps.append(cells)

    if not comps:
        return img, 0

    comps.sort(key=len, reverse=True)
    cutoff = max(1, int(len(comps[0]) * keep_frac))
    removed = 0
    for cells in comps[1:]:
        if len(cells) < cutoff:
            for x, y in cells:
                px[x, y] = (0, 0, 0, 0)
            removed += len(cells)
    return img, removed


def fit(rgba):
    """Trim, scale into the safe area, place with the eyeline at 36%."""
    bbox = rgba.getbbox()
    if not bbox:
        raise ValueError("empty image after cutout")
    sub = rgba.crop(bbox)

    target = SIZE * SAFE
    scale = min(target / sub.width, target / sub.height)
    w = max(1, round(sub.width * scale))
    h = max(1, round(sub.height * scale))
    # LANCZOS down to near-target, then NEAREST for the final step keeps
    # detail without reintroducing soft edges
    sub = sub.resize((w, h), Image.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    x = (SIZE - w) // 2
    # the head occupies roughly the top third of a bust, so aligning the
    # crop's top edge to just above the eyeline lines portraits up
    y = max(0, min(SIZE - h, round(SIZE * EYELINE - h * 0.30)))
    canvas.paste(sub, (x, y), sub)
    return canvas


def harden(img, cutoff=128):
    """Alpha must be binary: the CSS uses image-rendering: pixelated, and
    semi-transparent edge pixels read as blur."""
    r, g, b, a = img.split()
    a = a.point(lambda v: 255 if v >= cutoff else 0)
    out = Image.merge("RGBA", (r, g, b, a))
    # clear colour data under fully transparent pixels so quantise ignores it
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            if px[x, y][3] == 0:
                px[x, y] = (0, 0, 0, 0)
    return out


def quantise(img, n=MAX_COLORS):
    """Reduce to n colours, preserving binary alpha."""
    alpha = img.getchannel("A")
    rgb = img.convert("RGB")
    q = rgb.quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
    out = q.convert("RGBA")
    out.putalpha(alpha)
    return out


def process(hero_id):
    src = os.path.join(RAW, hero_id + ".png")
    dst = os.path.join(OUT, hero_id + ".png")
    cut, stripped = strip_detached(cut_out(src))
    img = harden(fit(cut))
    img = quantise(img)
    img = harden(img)  # quantise can nudge alpha
    img.save(dst, format="PNG", optimize=True)

    opaque = sum(1 for p in img.getdata() if p[3] == 255)
    cols = len({p[:3] for p in img.getdata() if p[3] == 255})
    return dst, cols, opaque, stripped


def main():
    os.makedirs(OUT, exist_ok=True)
    ids = sorted(
        f[:-4] for f in os.listdir(RAW) if f.endswith(".png")
    )
    for hid in ids:
        dst, cols, opaque, stripped = process(hid)
        fill = 100.0 * opaque / (SIZE * SIZE)
        print(
            f"{hid:<26} {cols:>3} colours  {fill:5.1f}% filled"
            f"  {stripped:>4}px detached removed"
        )


if __name__ == "__main__":
    main()
