# -*- coding: utf-8 -*-
"""Trace a greyscale plate into flat vector tone-bands (a carved-relief look).

Used by tools/gen_olympus_art.py. This is NOT an outline tracer: the image is
posterized into luminance bands and each band becomes filled SVG regions, so
the result is sculptural mass rather than wireframe outlines.

Pure Python over PIL - there is no numpy, scipy, potrace or autotrace on the
build box, so contours are marched by hand, simplified with
Ramer-Douglas-Peucker and smoothed with Chaikin corner-cutting.
"""
from PIL import Image, ImageFilter
import math

# ---------------------------------------------------------------- contours
def mask_of(px, w, h, thr):
    return [[1 if px[x, y] >= thr else 0 for x in range(w)] for y in range(h)]

def marching_squares(m, w, h):
    """Return closed loops around every region of 1s.

    Every segment is DIRECTED with a consistent winding, and loops are
    stitched by matching each segment's end to the next segment's start.
    Getting four of the sixteen cases backwards (4, 6, 13, 14) is what
    turned the first attempt into confetti: the chains could never close,
    so each contour came out as dozens of open shards.
    """
    def val(x, y):
        if x < 0 or y < 0 or x >= w or y >= h: return 0
        return m[y][x]

    TABLE = {
        1:  [('L','B')],
        2:  [('B','R')],
        3:  [('L','R')],
        4:  [('R','T')],
        5:  [('L','T'), ('R','B')],
        6:  [('B','T')],
        7:  [('L','T')],
        8:  [('T','L')],
        9:  [('T','B')],
        10: [('T','R'), ('B','L')],
        11: [('T','R')],
        12: [('R','L')],
        13: [('R','B')],
        14: [('B','L')],
    }

    starts = {}
    for y in range(-1, h):
        for x in range(-1, w):
            tl, tr = val(x, y), val(x+1, y)
            bl, br = val(x, y+1), val(x+1, y+1)
            idx = (tl << 3) | (tr << 2) | (br << 1) | bl
            if idx in (0, 15): continue
            pts = {
                'T': (x + 0.5, y + 0.0),
                'B': (x + 0.5, y + 1.0),
                'L': (x + 0.0, y + 0.5),
                'R': (x + 1.0, y + 0.5),
            }
            for a, b in TABLE[idx]:
                starts.setdefault(pts[a], []).append(pts[b])

    loops = []
    while starts:
        p0 = next(iter(starts))
        loop = [p0]
        cur = p0
        while True:
            nxts = starts.get(cur)
            if not nxts:
                break
            nxt = nxts.pop()
            if not nxts: del starts[cur]
            loop.append(nxt)
            cur = nxt
            if cur == p0:
                break
        if len(loop) > 8:
            loops.append(loop)
    return loops

# ------------------------------------------------------------ simplify
def rdp(pts, eps):
    if len(pts) < 3: return pts
    ax, ay = pts[0]; bx, by = pts[-1]
    dx, dy = bx-ax, by-ay
    n = math.hypot(dx, dy)
    worst, wi = -1.0, 0
    for i in range(1, len(pts)-1):
        px, py = pts[i]
        d = abs(dy*px - dx*py + bx*ay - by*ax)/n if n > 1e-9 else math.hypot(px-ax, py-ay)
        if d > worst: worst, wi = d, i
    if worst > eps:
        return rdp(pts[:wi+1], eps)[:-1] + rdp(pts[wi:], eps)
    return [pts[0], pts[-1]]

def chaikin(pts, iters=2):
    """Corner-cutting: turns the 45-degree marching-squares staircase into
    something that reads as a carved edge."""
    for _ in range(iters):
        out = []
        n = len(pts)
        for i in range(n):
            x0, y0 = pts[i]; x1, y1 = pts[(i+1) % n]
            out.append((x0*0.75 + x1*0.25, y0*0.75 + y1*0.25))
            out.append((x0*0.25 + x1*0.75, y0*0.25 + y1*0.75))
        pts = out
    return pts

def area(pts):
    a = 0.0
    for i in range(len(pts)):
        x0, y0 = pts[i]; x1, y1 = pts[(i+1) % len(pts)]
        a += x0*y1 - x1*y0
    return abs(a)/2

def to_path(pts, sx, sy):
    """Integer coords: the 320-unit viewBox paints at ~250 px on a card, so
    decimals buy nothing visible and cost ~35% of the file size. Repeated
    points after rounding are collapsed."""
    out = []
    last = None
    for x, y in pts:
        p = (round(x*sx), round(y*sy))
        if p != last:
            out.append(p); last = p
    if len(out) < 3: return ''
    d = 'M%d %d' % out[0]
    for p in out[1:]:
        d += 'L%d %d' % p
    return d + 'Z'

def bands(plate, thresholds, work=180, min_area=18, eps=1.15, smooth=2):
    """Return one SVG path string per threshold, darkest band first."""
    im = Image.open(plate).convert('L')
    W0, H0 = im.size
    im = im.resize((work, int(work*H0/W0)), Image.LANCZOS)
    im = im.filter(ImageFilter.MedianFilter(3))
    w, h = im.size
    px = im.load()
    sx, sy = W0/w, H0/h
    out = []
    for thr in thresholds:
        m = mask_of(px, w, h, thr)
        loops = marching_squares(m, w, h)
        ds = []
        for lp in loops:
            if area(lp) < min_area: continue
            s = rdp(lp, eps)
            if len(s) < 4: continue
            s = chaikin(s, smooth)
            p = to_path(s, sx, sy)
            if p: ds.append(p)
        out.append(' '.join(ds))
    return out
