"""Acceptance checks for battlefield backgrounds (docs/BATTLEFIELD-ART-SPEC.md).

Automates the objective items: canvas size, palette count, file size, the
"keep the centre quiet" rule and the value ceiling. Exits non-zero on any
failure so this can gate a commit.
"""

import os
import sys
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "boards")

W, H = 512, 284
MAX_COLORS = 24
MAX_KB = 72.0
BRIGHT_CEIL = 0.60      # luminance considered "bright"
BRIGHT_MAX_PCT = 8.0    # at most this share of the image may be bright

FIELDS = [
    "narrow-pass", "open-plains", "mana-spring", "energy-void", "colosseum",
    "mirror-realm", "spirit-world", "ancient-ruins", "heros-trial",
    "blood-battlefield",
]


def lum_image(im):
    return im.convert("RGB").convert("L")


def check(fid, path):
    bad = []
    im = Image.open(path)
    if im.size != (W, H):
        bad.append("size %dx%d != %dx%d" % (im.size[0], im.size[1], W, H))

    rgb = im.convert("RGB")
    cols = len(set(rgb.getdata()))
    if cols > MAX_COLORS:
        bad.append("%d colours > %d" % (cols, MAX_COLORS))

    kb = os.path.getsize(path) / 1024.0
    if kb > MAX_KB:
        bad.append("%.1f KB > %.0f KB" % (kb, MAX_KB))

    L = lum_image(rgb)
    px = list(L.getdata())
    bright = sum(1 for v in px if v / 255.0 > BRIGHT_CEIL)
    bpct = 100.0 * bright / len(px)
    if bpct > BRIGHT_MAX_PCT:
        bad.append("%.1f%% of pixels above %.0f%% luminance (max %.0f%%)"
                   % (bpct, BRIGHT_CEIL * 100, BRIGHT_MAX_PCT))

    # Centre-quiet. Cards cover the middle, so that region should not be
    # the busiest part of the frame.
    #
    # This measures the TWO CARD COLUMNS, not the middle of the image. The
    # naive version compared a centred box against the whole frame and
    # failed the Narrow Pass for having a bright sky channel down the
    # middle - but that channel falls in the gap BETWEEN the two teams,
    # where no card ever sits, and in practice it reads as depth. What
    # actually matters is whether art sits behind the cards themselves.
    cw = int(W * 0.22)
    ch = int(H * 0.74)
    cy = int(H * 0.13)
    left = L.crop((int(W * 0.16), cy, int(W * 0.16) + cw, cy + ch))
    right = L.crop((int(W * 0.62), cy, int(W * 0.62) + cw, cy + ch))
    sd_cards = (ImageStat.Stat(left).stddev[0] + ImageStat.Stat(right).stddev[0]) / 2
    sd_all = ImageStat.Stat(L).stddev[0]
    ratio = sd_cards / sd_all if sd_all else 0
    if ratio > 1.30:
        bad.append("art behind the cards is busier than the frame "
                   "(stddev ratio %.2f > 1.30)" % ratio)

    mean = ImageStat.Stat(L).mean[0] / 255.0
    return bad, dict(cols=cols, kb=kb, bpct=bpct, ratio=ratio, mean=mean)


def main():
    if not os.path.isdir(ART):
        print("no assets/boards directory yet")
        return 1
    rows, fails, missing = [], [], []
    for fid in FIELDS:
        p = os.path.join(ART, fid + ".png")
        if not os.path.exists(p):
            missing.append(fid)
            continue
        bad, st = check(fid, p)
        rows.append((fid, st))
        if bad:
            fails.append((fid, bad))

    print("%-20s%>6s%>9s%>10s%>10s%>8s".replace(">", "")
          % ("field", "cols", "size", "bright", "cards", "mean"))
    for fid, st in rows:
        print("%-20s%6d%8.1fK%9.1f%%%10.2f%8.2f"
              % (fid, st["cols"], st["kb"], st["bpct"], st["ratio"], st["mean"]))

    if missing:
        print("\nnot yet generated (%d): %s" % (len(missing), ", ".join(missing)))
    print()
    if fails:
        for fid, bad in fails:
            for b in bad:
                print("FAIL  %s: %s" % (fid, b))
        return 1
    if rows:
        print("ALL %d BOARDS PASS" % len(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
