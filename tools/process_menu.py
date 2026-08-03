"""Turn generated menu-layer art into shippable, horizontally tileable PNGs.

The main menu background is a parallax stack: several layers scrolling at
different speeds. For that to loop forever without a visible jump, every
layer must tile SEAMLESSLY in x. The generator cannot do that, so the seam
is built here.

Method: generate wider than needed, then cross-fade the right edge over
the left edge and crop the overlap off. If `B` is the blend width and the
source is `W+B` wide, the output is `W` wide and

    out[x] = src[x] * t + src[W + x] * (1 - t),   t = x / B

so out[0] == src[W], which is exactly the column that followed out[W-1] in
the source. The wrap is therefore continuous by construction rather than by
luck. Blending happens in PREMULTIPLIED alpha, otherwise transparent pixels
drag their colour into the fade and leave a halo.

Run:  python3 tools/process_menu.py
"""

import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art-src", "menu")
OUT = os.path.join(ROOT, "assets", "menu")

W, H = 640, 360          # final tile, 16:9 so it scales cleanly
BLEND = 200              # cross-fade width, cropped away
MAX_COLORS = 24

# Layers that must keep an alpha channel (they sit over the sky).
TRANSPARENT = {"far", "mid", "near"}

BG_TOL = 26
CHECKER = ((254, 254, 254), (235, 235, 235))


def _is_bg(px):
    r, g, b = px[:3]
    if abs(r - g) > 10 or abs(g - b) > 10 or abs(r - b) > 10:
        return False
    for cr, cg, cb in CHECKER:
        if abs(r - cr) <= tol_ok(cr) and abs(g - cg) <= tol_ok(cg) and abs(b - cb) <= tol_ok(cb):
            return True
    return False


def tol_ok(_c):
    return BG_TOL


def cut_out(im):
    """Flood fill the flattened checkerboard away from every border."""
    from collections import deque

    im = im.convert("RGB")
    w, h = im.size
    px = im.load()
    bg = bytearray(w * h)
    q = deque()

    def push(x, y):
        i = y * w + x
        if not bg[i] and _is_bg(px[x, y]):
            bg[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                push(nx, ny)

    # Enclosed pockets. The border fill cannot reach background that the
    # art fully surrounds - the sky visible THROUGH a colosseum arch - so
    # those stayed opaque and rendered as pale stone-coloured blobs where
    # the real sky layer should show through. Same failure the character
    # pipeline hit with Tomoe Gozen's neck gap.
    #
    # No size or shape guard is needed here, unlike the portraits: these
    # layers are silhouettes with no near-white costume to protect, so any
    # enclosed region matching the checkerboard is genuinely a hole.
    seen = bytearray(bg)
    for sy in range(h):
        base = sy * w
        for sx in range(w):
            i = base + sx
            if seen[i] or not _is_bg(px[sx, sy]):
                continue
            pocket = [(sx, sy)]
            seen[i] = 1
            qq = deque([(sx, sy)])
            while qq:
                x, y = qq.popleft()
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not seen[j] and _is_bg(px[nx, ny]):
                            seen[j] = 1
                            pocket.append((nx, ny))
                            qq.append((nx, ny))
            for x, y in pocket:
                bg[y * w + x] = 1

    out = im.convert("RGBA")
    op = out.load()
    for y in range(h):
        base = y * w
        for x in range(w):
            if bg[base + x]:
                op[x, y] = (0, 0, 0, 0)
    return out


def crop_to_aspect(im, ratio):
    w, h = im.size
    if w / h > ratio:
        nw = int(round(h * ratio))
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(round(w / ratio))
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def make_tileable(im, blend=BLEND):
    """Cross-fade the wrap seam. Input (W+blend) x H, output W x H."""
    w, h = im.size
    out_w = w - blend
    src = im.load()
    out = Image.new("RGBA", (out_w, h))
    dst = out.load()

    for y in range(h):
        for x in range(out_w):
            if x >= blend:
                dst[x, y] = src[x, y]
                continue
            t = x / float(blend)
            a = src[x, y]
            b = src[out_w + x, y]
            # premultiplied blend so transparency does not smear colour
            aa, ba = a[3] / 255.0, b[3] / 255.0
            na = aa * t + ba * (1 - t)
            if na <= 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            dst[x, y] = (
                int(round((a[0] * aa * t + b[0] * ba * (1 - t)) / na)),
                int(round((a[1] * aa * t + b[1] * ba * (1 - t)) / na)),
                int(round((a[2] * aa * t + b[2] * ba * (1 - t)) / na)),
                int(round(na * 255)),
            )
    return out


def quantise(im, n=MAX_COLORS, keep_alpha=True):
    if keep_alpha:
        alpha = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
        q = im.convert("RGB").quantize(colors=n, method=Image.MEDIANCUT,
                                       dither=Image.NONE).convert("RGBA")
        q.putalpha(alpha)
        return q
    return im.convert("RGB").quantize(colors=n, method=Image.MEDIANCUT,
                                      dither=Image.NONE)


def source_for(name):
    for ext in (".jpg", ".png"):
        p = os.path.join(RAW, name + ext)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def erode_fringe(im, rounds=2, tol=150):
    """Strip the pale halo left along an alpha edge.

    The generator flattens transparency to a light checkerboard. Resizing
    with LANCZOS averages that checkerboard into the pixels next to every
    silhouette edge BEFORE the cutout can classify them, so those pixels
    end up opaque but far too bright - a 1px white rim tracing every
    colosseum arch and roofline. Measured: 50.2% of edge pixels came out
    above 140 luminance, peaking at (255, 255, 241).

    Cutting at a fixed brightness is not safe (the snow caps on `far` are
    legitimately that bright), so this only removes a pixel that is BOTH
    too light for its own neighbourhood AND touching transparency. Two
    passes clear the 1-2px bleed without eating real detail.
    """
    for _ in range(rounds):
        px = im.load()
        w, h = im.size
        doomed = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] != 255:
                    continue
                nb = []
                edge = False
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h):
                        continue
                    p = px[nx, ny]
                    if p[3] == 0:
                        edge = True
                    else:
                        nb.append(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2])
                if not edge or not nb:
                    continue
                me = 0.2126 * px[x, y][0] + 0.7152 * px[x, y][1] + 0.0722 * px[x, y][2]
                # brighter than the art it borders, and bright in absolute
                # terms: that is checkerboard bleed, not a lit surface
                if me > tol and me > (sum(nb) / len(nb)) + 18:
                    doomed.append((x, y))
        if not doomed:
            break
        for x, y in doomed:
            px[x, y] = (0, 0, 0, 0)
    return im


def bleed_colour(im, rounds=4):
    """Push edge colour outward into the transparent margin.

    LANCZOS resamples RGB and A independently, so a cleared pixel still
    contributes its COLOUR to opaque neighbours. Cleared pixels carrying
    the light checkerboard tone are therefore what produced the pale rim
    around every silhouette. Filling the transparent side with the nearest
    opaque colour makes the resample a no-op there. Alpha is untouched.
    """
    px = im.load()
    w, h = im.size
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
    return im


def process(name):
    src = Image.open(source_for(name))
    pre_w = W + BLEND
    im = crop_to_aspect(src.convert("RGB"), pre_w / float(H))

    if name in TRANSPARENT:
        # Cut out at FULL SOURCE RESOLUTION, before any resize. Doing it
        # after the downscale meant LANCZOS had already averaged the light
        # checkerboard into every edge pixel, so those pixels were opaque
        # and far too bright - the pale rim around each silhouette. At full
        # res the checkerboard is still pure and the classification is
        # exact; bleeding the colour outward then keeps the later resize
        # from reintroducing it.
        im = cut_out(im)
        im = bleed_colour(im)
        im = im.resize((pre_w, H), Image.LANCZOS)
        # binary alpha again after resampling
        r, g, b, a = im.split()
        im = Image.merge("RGBA", (r, g, b, a.point(lambda v: 255 if v >= 128 else 0)))
    else:
        im = im.convert("RGB").resize((pre_w, H), Image.LANCZOS).convert("RGBA")

    # Quantise, fade, quantise again.
    #
    # Fading last leaves a hard edge where the palette reduction lands
    # (measured seam ratios 2.03 far / 4.65 near). Fading first is worse:
    # the cross-fade invents thousands of intermediate tones and blows the
    # 24-colour budget outright (2756 colours on `far`). Doing it on both
    # sides gives a smooth wrap AND an in-budget palette - the second pass
    # snaps the blended pixels back onto the palette the first pass chose.
    im = quantise(im, keep_alpha=name in TRANSPARENT)
    im = make_tileable(im)
    im = quantise(im, keep_alpha=name in TRANSPARENT)

    dst = os.path.join(OUT, name + ".png")
    im.save(dst, format="PNG", optimize=True)
    kb = os.path.getsize(dst) / 1024.0
    cols = len(set(im.convert("RGB").getdata()))
    return cols, kb


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(RAW):
        print("no art-src/menu")
        return
    names = sorted({f.rsplit(".", 1)[0] for f in os.listdir(RAW)
                    if f.endswith((".png", ".jpg"))})
    for n in names:
        cols, kb = process(n)
        print("%-8s %2d colours  %5.1f KB" % (n, cols, kb))


if __name__ == "__main__":
    main()
