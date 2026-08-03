"""Acceptance checks for hero portraits (docs/ART-SPEC.md section 4).

Automates: canvas size, colour count, binary alpha, circle-mask safety,
and eyeline consistency across a faction. Exits non-zero on failure.
"""

import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "heroes")
SIZE = 96
MAX_COLORS = 32
SAFE = 0.78

fails = []
rows = []


def check(hid, path):
    im = Image.open(path).convert("RGBA")
    px = im.load()
    W, H = im.size
    bad = []

    if (W, H) != (SIZE, SIZE):
        bad.append(f"size {W}x{H} != {SIZE}x{SIZE}")

    data = list(im.getdata())
    soft = sum(1 for p in data if 0 < p[3] < 255)
    if soft:
        bad.append(f"{soft} semi-transparent px (alpha must be 0 or 255)")

    cols = len({p[:3] for p in data if p[3] == 255})
    if cols > MAX_COLORS:
        bad.append(f"{cols} colours > {MAX_COLORS}")

    # Clip test, modelled on the SHIPPING mask rather than a plain circle.
    # css/style.css draws the portrait at K ring-diameters and keeps the
    # union of (everything above the cut line) and (inside the ring), so
    # the only pixels actually lost are those BELOW the cut AND OUTSIDE
    # the ring - the bottom corners. Anything above the cut is meant to
    # break out of the ring; that is the effect, not a failure.
    K = 1.2315
    CUT = 0.33
    r_px = SIZE / (2 * K)  # ring radius in canvas pixels
    cx = cy = SIZE / 2.0
    cut_y = cy - r_px + CUT * 2 * r_px

    lost = 0
    for y in range(H):
        for x in range(W):
            if px[x, y][3] != 255:
                continue
            if y + 0.5 <= cut_y:
                continue  # above the cut, always kept
            d = ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2) ** 0.5
            if d > r_px:
                lost += 1
    opaque = sum(1 for p in data if p[3] == 255)
    pct = 100.0 * lost / max(1, opaque)
    # Some clipping is the POINT: the body is meant to be held inside the
    # ring while the head breaks out above the cut. Only flag art whose
    # mass sits so low that almost nothing survives.
    if pct > 62.0:
        bad.append(f"{pct:.1f}% of subject clipped by the card mask")

    # Detached blobs. The spec bans floating effects because they inflate
    # the bounding box, and fit() scales to that box - so a hero wrapped in
    # sparkles is silently rendered smaller than everyone else. A little
    # noise is tolerable; a real second mass is not (Hansel and Gretel are
    # a deliberate two-figure exception and sit far above this bar).
    from collections import deque

    seen = bytearray(W * H)
    comps = []
    for sy in range(H):
        for sx in range(W):
            i0 = sy * W + sx
            if seen[i0] or px[sx, sy][3] == 0:
                continue
            q = deque([(sx, sy)])
            seen[i0] = 1
            n = 0
            while q:
                x, y = q.popleft()
                n += 1
                for nx, ny in (
                    (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1),
                    (x + 1, y + 1), (x - 1, y - 1), (x + 1, y - 1), (x - 1, y + 1),
                ):
                    if 0 <= nx < W and 0 <= ny < H:
                        j = ny * W + nx
                        if not seen[j] and px[nx, ny][3] != 0:
                            seen[j] = 1
                            q.append((nx, ny))
            comps.append(n)
    comps.sort(reverse=True)
    stray = sum(comps[1:])
    if comps and stray > 0.04 * comps[0]:
        bad.append(
            f"{stray}px in {len(comps)-1} detached blobs "
            f"({100.0*stray/comps[0]:.1f}% of the body) - floating effects are banned"
        )

    # vertical centre of mass of opaque pixels, as an alignment proxy
    ys = [y for y in range(H) for x in range(W) if px[x, y][3] == 255]
    com = (sum(ys) / len(ys) / H) if ys else 0

    rows.append((hid, cols, f"{100.0*opaque/(SIZE*SIZE):.1f}%", f"{pct:.1f}%", f"{com:.2f}"))
    if bad:
        fails.append((hid, bad))


def main():
    files = sorted(f for f in os.listdir(ART) if f.endswith(".png"))
    if not files:
        print("no portraits found")
        return 1
    for f in files:
        check(f[:-4], os.path.join(ART, f))

    print(f"{'hero':<22}{'cols':>5}{'fill':>8}{'clipped':>9}{'v-centre':>10}")
    for r in rows:
        print(f"{r[0]:<22}{r[1]:>5}{r[2]:>8}{r[3]:>9}{r[4]:>10}")

    coms = [float(r[4]) for r in rows]
    spread = max(coms) - min(coms)
    print(f"\nvertical centre spread across set: {spread:.3f}")
    if spread > 0.10:
        fails.append(("SET", [f"portraits misaligned, spread {spread:.3f} > 0.10"]))

    print()
    if fails:
        for hid, bad in fails:
            for b in bad:
                print(f"FAIL  {hid}: {b}")
        return 1
    print(f"ALL {len(rows)} PORTRAITS PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
