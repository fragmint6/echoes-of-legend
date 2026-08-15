# -*- coding: utf-8 -*-
"""Generate the Olympus card portraits: marble busts as vector tone-bands.

    python3 tools/gen_olympus_art.py

Reads the greyscale plates in assets/heroes-line/plates/ and writes six SVGs
to assets/heroes-line/. Both the plates and the SVGs are committed, so this
only needs running when the art changes.

WHY IT LOOKS LIKE THIS
----------------------
The first attempt drew each god as a handful of thin coloured strokes on
black. It read as cheap wireframe clip-art, because a few outlines cannot
carry the one thing sculpture is actually about: MASS. So nothing here is
stroked. Each portrait is a photograph of a classical bust posterized into
five luminance bands, and every band is traced into filled vector regions -
lit planes against shadow, the way a relief carving reads.

The palette is marble, not poster paint: a flat saturated fill in the card's
element colour looked like a pop-art print, so the ramp runs from an
element-tinted shadow up to a near-white highlight, keeping the colour
mostly in the darks. Element hues match css/style.css:37-43.

The plates are pre-cropped to 320x440 (8:11), matching every hero PNG, with
the head inside x 17..303 / y 17..401 - exactly the region that survives
both crops the game applies with object-fit: cover (the collection card
trims the sides, the battle tile trims top and bottom). Reframing a plate
means re-checking both; see sim/verify_card_art.js.

Thresholds are per-card because the busts are lit differently - one global
set crushed Ares and blew out Medusa.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from lib_trace_bands import bands

PLATES = os.path.join(ROOT, 'assets', 'heroes-line', 'plates')
OUT = os.path.join(ROOT, 'assets', 'heroes-line')

# element colours, css/style.css:37-43
EL = {
    'zeus': '#63d7ff',      # Lightning
    'athena': '#ffd977',    # Light
    'hercules': '#ff4d4d',  # Physical
    'apollo': '#ffd977',    # Light
    'medusa': '#a05cd8',    # Shadow
    'ares': '#ff7a4d',      # Fire
}

THR = {
    'zeus':     [66, 100, 134, 168, 202],
    'athena':   [62, 96, 130, 166, 200],
    'hercules': [66, 100, 136, 170, 204],
    'apollo':   [70, 106, 142, 176, 208],
    'medusa':   [80, 116, 150, 182, 212],
    'ares':     [56, 90, 124, 158, 192],
}

NAMES = {
    'zeus': 'Zeus', 'athena': 'Athena', 'hercules': 'Hercules',
    'apollo': 'Apollo', 'medusa': 'Medusa', 'ares': 'Ares',
}

BG = (0x06, 0x07, 0x0d)
WHITE = (255, 255, 255)


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hx(c):
    return '#%02x%02x%02x' % c


def palette(el):
    """Shadow -> highlight. Element colour lives in the darks; the lit
    planes climb to near-white so the stone reads as stone."""
    e = hexrgb(el)
    return [
        hx(mix(BG, e, 0.30)),
        hx(mix(BG, e, 0.72)),
        hx(mix(e, WHITE, 0.24)),
        hx(mix(e, WHITE, 0.60)),
        hx(mix(e, WHITE, 0.88)),
    ]


def build(name):
    plate = os.path.join(PLATES, name + '.png')
    ds = bands(plate, THR[name])
    layers = []
    for d, col in zip(ds, palette(EL[name])):
        if d.strip():
            layers.append(
                '    <path fill="%s" fill-rule="evenodd" d="%s"/>' % (col, d))
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440"'
        ' width="320" height="440" role="img" aria-label="%s">\n'
        '  <title>%s</title>\n'
        '  <rect width="320" height="440" fill="#06070d"/>\n'
        '  <g>\n%s\n  </g>\n</svg>\n'
    ) % (NAMES[name], NAMES[name], '\n'.join(layers))


def main():
    for name in sorted(EL):
        svg = build(name)
        path = os.path.join(OUT, 'olympus-%s.svg' % name)
        with open(path, 'w') as fh:
            fh.write(svg)
        print('%-9s %6.1f KB' % (name, len(svg) / 1024.0))


if __name__ == '__main__':
    main()
