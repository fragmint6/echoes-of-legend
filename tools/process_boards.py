"""Turn generated board art into shippable 512x284 backdrops.

The generator returns ~1536x1024 (3:2) full-colour images. The board is
1.80:1, so each is centre-cropped to that aspect, downsampled, then
quantised hard. See docs/BATTLEFIELD-ART-SPEC.md.

Downsampling uses LANCZOS *then* quantise-without-dither: going straight to
NEAREST at a 3x reduction drops whole features (a torch is only a few source
pixels), while dithering at this scale reads as noise rather than as banding
and inflates the palette past the limit.

Run:  python3 tools/process_boards.py
"""

import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art-src", "boards")
OUT = os.path.join(ROOT, "assets", "boards")

W, H = 512, 284
MAX_COLORS = 24


def centre_crop(im, ratio):
    w, h = im.size
    if w / h > ratio:
        nw = int(round(h * ratio))
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(round(w / ratio))
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def source_for(fid):
    for ext in (".jpg", ".png"):
        p = os.path.join(RAW, fid + ext)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(fid)


def process(fid):
    src = source_for(fid)
    dst = os.path.join(OUT, fid + ".png")
    im = Image.open(src).convert("RGB")
    im = centre_crop(im, W / H).resize((W, H), Image.LANCZOS)

    # Quantise with no dither: dithering at 512 wide looks like film grain
    # once the board upscales it x3.3, and it blows the palette budget.
    # Single pass only - quantising twice re-samples an already-indexed
    # image and measurably WORSENS compression (61 KB vs 47 KB on the
    # colosseum) for no visual gain.
    q = im.quantize(colors=MAX_COLORS, method=Image.MEDIANCUT, dither=Image.NONE)
    q.save(dst, format="PNG", optimize=True)

    cols = len(set(q.convert("RGB").getdata()))
    kb = os.path.getsize(dst) / 1024.0
    return cols, kb


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.isdir(RAW):
        print("no art-src/boards directory")
        return
    ids = sorted({f[:-4] for f in os.listdir(RAW) if f.endswith((".png", ".jpg"))})
    for fid in ids:
        cols, kb = process(fid)
        print("%-20s %2d colours  %5.1f KB" % (fid, cols, kb))


if __name__ == "__main__":
    main()
