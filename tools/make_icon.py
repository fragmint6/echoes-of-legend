"""Echoes of Legend icon - flat vector crossed swords.

Drawn procedurally from real geometry (no generated art), supersampled 8x
and downsampled, so the result is crisp and flat rather than illustrated.

One source of truth for every output size. `detail` drops features as the
canvas shrinks, because sub-pixel shapes turn into mud:
  full  (>=64) two-tone blades, fuller line, pommels, ring
  mid   (32-48) two-tone blades, pommels, ring, no fuller
  small (24)    flat blades, guards, pommels, no ring
  tiny  (16)    flat blades, no guards, no pommels
"""

import math
from PIL import Image, ImageChops, ImageDraw

SS = 8  # supersample factor

BG = (16, 19, 28, 255)
GOLD_LIGHT = (255, 224, 150)
GOLD_MID = (232, 178, 66)
GOLD_DARK = (198, 137, 40)
GRIP = (61, 52, 44)
RING = (150, 108, 38)


def rot(pts, ang, cx, cy):
    """Rotate local blade coords into canvas coords."""
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + x * ca - y * sa, cy - (x * sa + y * ca)) for (x, y) in pts]


def sword(d, cx, cy, ang, L, detail):
    """One sword. Local frame: +y runs hilt -> tip, x runs across the blade."""
    if detail.startswith("_measure_"):
        detail = detail[len("_measure_"):]
    w = L * (0.052 if detail in ("full", "mid") else 0.066)  # blade half-width
    # Guard position sets how even the four arms of the X look. A realistic
    # sword puts it at 0.30, but below 32px the short bottom arms vanish and
    # the mark reads as a V, so small frames move it toward the middle.
    y_guard = L * (0.30 if detail in ("full", "mid") else 0.40)
    y_taper = L * 0.86  # tip taper begins
    y_pommel = L * 0.075
    gw = L * (0.150 if detail in ("full", "mid") else 0.185)  # guard half-length
    gt = L * (0.030 if detail in ("full", "mid") else 0.040)  # guard half-thickness

    def R(pts):
        return rot(pts, ang, cx, cy)

    # ---- blade: flat base colour, then the left half lighter.
    # Two flat tones read as "vector" where a gradient reads as "render".
    blade = [(-w, y_guard), (w, y_guard), (w, y_taper), (0, L), (-w, y_taper)]
    d.polygon(R(blade), fill=GOLD_MID)

    if detail in ("full", "mid"):
        lit = [(-w, y_guard), (0, y_guard), (0, L), (-w, y_taper)]
        d.polygon(R(lit), fill=GOLD_LIGHT)

    if detail == "full":
        # fuller: single thin dark line down the blade centre
        fw = w * 0.16
        d.polygon(
            R([(-fw, y_guard + L * 0.04), (fw, y_guard + L * 0.04),
               (fw, y_taper - L * 0.02), (-fw, y_taper - L * 0.02)]),
            fill=GOLD_DARK,
        )

    # ---- grip
    # A dark grip disappears against the dark background at small sizes,
    # which deletes the lower two arms of the X and leaves a V. Small frames
    # therefore run a gold grip: less realistic, but it keeps the silhouette.
    gwid = w * (0.62 if detail in ("full", "mid") else 0.78)
    d.polygon(
        R([(-gwid, y_pommel), (gwid, y_pommel),
           (gwid, y_guard), (-gwid, y_guard)]),
        fill=GRIP if detail in ("full", "mid") else GOLD_DARK,
    )

    # ---- crossguard: flat bar, outer edge slightly wider than inner.
    # Kept even at 16px: without it the two blades read as a V, not swords.
    if True:
        d.polygon(
            R([(-gw, y_guard - gt), (gw, y_guard - gt),
               (gw * 0.88, y_guard + gt), (-gw * 0.88, y_guard + gt)]),
            fill=GOLD_MID if detail == "full" else GOLD_LIGHT,
        )
        if detail == "full":
            d.polygon(
                R([(-gw, y_guard - gt), (gw, y_guard - gt),
                   (gw, y_guard - gt * 0.1), (-gw, y_guard - gt * 0.1)]),
                fill=GOLD_LIGHT,
            )

    # ---- pommel: diamond, not a circle. Circles read as blobs when small.
    if detail in ("full", "mid", "small"):
        pr = w * 1.05
        d.polygon(
            R([(0, y_pommel + pr), (pr, y_pommel),
               (0, y_pommel - pr), (-pr, y_pommel)]),
            fill=GOLD_MID,
        )


def _render(size, detail, L_frac):
    """Draw one frame at a given blade length. Separated from make() so the
    fitter can call it twice."""
    S = size * SS
    img = Image.new("RGBA", (S, S), BG)
    d = ImageDraw.Draw(img)
    c = S / 2

    if detail in ("full", "mid"):
        rw = max(1.0, S * 0.026)
        r = S * 0.445
        d.ellipse([c - r, c - r, c + r, c + r], outline=RING, width=int(round(rw)))

    # Geometry of a true X, solved rather than eyeballed.
    #
    # A blade leaving (c - dx, cy) at `ang` from vertical reaches the centre
    # line after travelling dx / sin(ang). Setting that to L/2 puts the cross
    # at the blade midpoint, which is the only placement where the tips end
    # up as far out as the hilts. Any smaller dx crosses low and the tips
    # splay into a V; any larger crosses high and they pinch.
    ang = math.radians(42)
    L = S * L_frac
    dx = 0.5 * L * math.sin(ang)
    cy = c + 0.5 * L * math.cos(ang)  # centres the mark vertically

    sword(d, c - dx, cy, -ang, L, detail)
    sword(d, c + dx, cy, ang, L, detail)
    return img


def make(size):
    if size >= 64:
        detail = "full"
    elif size >= 32:
        detail = "mid"
    elif size >= 24:
        detail = "small"
    else:
        detail = "tiny"

    # How much of the canvas the swords may occupy.
    # Ringed sizes must fit *inside* the ring: a square inscribed in a circle
    # of radius 0.445*S spans 0.445 * sqrt(2) * 2 = 0.629*S, so anything above
    # that pushes the tips and pommels through the ring.
    safe = 0.62 if detail in ("full", "mid") else 0.86

    # Two-pass fit: draw once, measure what the geometry actually spans
    # (guards and pommels stick out past the blades, so this is not
    # analytically obvious), then correct. Measured on a ring-free render
    # at 8x so the correction is sub-pixel accurate.
    probe_frac = 0.80
    probe = _render(size, "_measure_" + detail, probe_frac)
    bg = Image.new("RGBA", probe.size, BG)
    diff = ImageChops.difference(probe.convert("RGB"), bg.convert("RGB"))
    bbox = diff.getbbox()
    S = size * SS
    span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    L_frac = probe_frac * (safe * S) / span

    return _render(size, detail, L_frac).resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for s in (16, 24, 32, 48, 64, 128, 256):
        make(s).save(f"/tmp/ico/v{s}.png")
    print("ok")
