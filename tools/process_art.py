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

SIZE = 128         # final canvas
# 96 was the original target, chosen when the collection slot measured
# 154 CSS px (x1.60 upscale). It cost real detail: at 96 the eyes, brow
# and beard tones collapse into each other. 128 renders at x1.20 in the
# collection and x0.99 in battle - effectively 1:1 - and the face reads
# properly. Storage is unaffected in any way that matters: the whole
# shipped hero set is well under 1 MB either way.
SAFE = 0.78        # fraction of canvas the subject may span
EYELINE = 0.36     # where the eyeline should land
MAX_COLORS = 32

# how far a pixel may sit from the checkerboard tones and still be background
BG_TOL = 26
CHECKER = ((254, 254, 254), (235, 235, 235))


def _is_strict_bg(px, tol=7):
    """Much tighter than _is_bg, for ENCLOSED pockets only.

    The border fill can afford a loose tolerance: it starts from pixels
    that are definitely background and only spreads through connected
    ones. An interior pocket has no such anchor, so a loose test turns
    any pale region into a hole. At BG_TOL=26 the warm off-white of
    Merlin's beard (230,225,221) passed as background and 33,523 px of
    it were carved out, which then bled black through the resize.

    The real checkerboard is near-neutral and sits within a few units of
    254 or 235, so tol=7 keeps it while rejecting costume.
    """
    r, g, b = px[:3]
    if abs(r - g) > 4 or abs(g - b) > 4 or abs(r - b) > 4:
        return False
    return any(abs(r - c) <= tol and abs(g - c) <= tol and abs(b - c) <= tol
               for c in (254, 235))


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

    # ---- enclosed background pockets ----
    #
    # The border fill alone cannot reach background that the subject fully
    # surrounds: the gap between Tomoe Gozen's hair strand and her neck,
    # the loops in Kaguya's drifting hair, the space under an arm. Those
    # pockets stayed OPAQUE and kept the flattened checkerboard colour,
    # which renders as a cream blob that is not in the source art.
    # Measured across the roster: 27 of 42 portraits were affected, worst
    # 8.2% of the canvas (Kaguya).
    #
    # A pocket is background if it looks like background AND is not part of
    # the figure. Requiring it to look like the checkerboard is what keeps
    # this safe: genuinely light costume (Zeus's white himation, Amaterasu's
    # shrine silks) is not near-neutral at these exact tones, and the
    # existing _is_bg test already rejects it.
    # A pocket is only removed if it is a NARROW SLIVER.
    #
    # Colour cannot separate these cases: Kaguya's white junihitoe has the
    # same tone AND the same tonal spread (~44) as the checkerboard, so any
    # threshold that removes it also removes real costume. Area alone fails
    # too - her robe is 1.92% of canvas but so is a big hair gap on someone
    # else.
    #
    # What does separate them is SHAPE. A genuine enclosed gap is a thin
    # sliver between two parts of the figure: Tomoe's are 20-133 px wide
    # against 68-139 px tall, i.e. long and thin. A costume region is a
    # broad mass. So the test is the pocket's FILL RATIO inside its own
    # bounding box plus a cap on the box's short side.
    MAX_POCKET = 0.005 * W * H
    MAX_SHORT_SIDE = 0.14 * min(W, H)
    # Whole-image safety valve. If the pockets add up to more than this
    # share of the FIGURE, the art almost certainly has a genuinely
    # near-white costume rather than gaps, and removing them would punch
    # holes in it. Kaguya's junihitoe is the case that forced this: her
    # robe is the same tone AND the same tonal spread as the checkerboard,
    # so no per-pocket test can tell them apart. Measured, every other
    # hero loses at most 2.9%; she loses 11.6%. Above the threshold we
    # keep the border fill only and accept the odd cream sliver.
    MAX_TOTAL_SHARE = 0.06

    seen = bytearray(bg)
    keep = []
    for sy in range(H):
        base = sy * W
        for sx in range(W):
            i = base + sx
            if seen[i] or not _is_strict_bg(px[sx, sy]):
                continue
            pocket = [(sx, sy)]
            seen[i] = 1
            qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < W and 0 <= ny < H:
                        j = ny * W + nx
                        if not seen[j] and _is_strict_bg(px[nx, ny]):
                            seen[j] = 1
                            pocket.append((nx, ny))
                            qq.append((nx, ny))
            xs = [c[0] for c in pocket]
            ys = [c[1] for c in pocket]
            short = min(max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)
            if len(pocket) <= MAX_POCKET and short <= MAX_SHORT_SIDE:
                keep.append(pocket)

    figure = sum(1 for v in bg if not v)
    total = sum(len(p) for p in keep)
    if figure and total / figure <= MAX_TOTAL_SHARE:
        for pocket in keep:
            for x, y in pocket:
                bg[y * W + x] = 1

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


def _bleed_colour(img, rounds=3):
    """Push edge colour outward into the transparent margin.

    LANCZOS resamples RGB and A independently, so a transparent pixel still
    contributes its COLOUR to opaque neighbours. cut_out() writes cleared
    pixels as (0, 0, 0, 0), so every alpha boundary - including the inside
    of an enclosed pocket - bleeds pure black into the art on downscale.
    That is what put black scribbles through Merlin's white beard,
    Momotaro's hair and Amaterasu's face: 137,231 interior black pixels
    smearing outward.

    Filling the transparent side with the nearest opaque colour first makes
    the resample a no-op there. Alpha is untouched, so the silhouette is
    unchanged - only the colour that alpha multiplies against.
    """
    px = img.load()
    w, h = img.size
    for _ in range(rounds):
        todo = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] != 0:
                    continue
                acc = []
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                               (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] != 0:
                        acc.append(px[nx, ny])
                if acc:
                    todo.append((x, y,
                                 sum(p[0] for p in acc) // len(acc),
                                 sum(p[1] for p in acc) // len(acc),
                                 sum(p[2] for p in acc) // len(acc)))
        if not todo:
            break
        for x, y, r, g, b in todo:
            px[x, y] = (r, g, b, 0)
    return img


def fit(rgba):
    """Trim, scale into the safe area, place with the eyeline at 36%."""
    bbox = rgba.getbbox()
    if not bbox:
        raise ValueError("empty image after cutout")
    sub = rgba.crop(bbox)

    # Must run BEFORE any resize - see _bleed_colour.
    sub = _bleed_colour(sub)

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


def source_for(hero_id):
    """Sources may be .jpg (shrunk, the normal case) or .png (freshly
    generated, before tools/shrink_sources.py has run)."""
    for ext in (".jpg", ".png"):
        p = os.path.join(RAW, hero_id + ext)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(hero_id)


def process(hero_id):
    src = source_for(hero_id)
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
        {f[:-4] for f in os.listdir(RAW) if f.endswith((".png", ".jpg"))}
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
