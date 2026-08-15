# -*- coding: utf-8 -*-
"""Generate the Olympus card portraits: minimal outline drawings.

    python3 tools/gen_olympus_art.py

Reads the white-on-black ink plates in assets/heroes-line/ink/ and writes
six SVGs to assets/heroes-line/. Both the plates and the SVGs are
committed, so this only needs running when the art changes.

WHY THE ART IS DERIVED, NOT TRACED DIRECTLY
-------------------------------------------
The intent was to trace the existing pixel-art card sources in
assets/heroes/. That is not possible: those files are 64x88, so a whole
head is about 20x24 pixels. Posterized to a few levels it is noise - there
is no face in there for any tracer to find. Four different automated
approaches were tried against them and all produced abstract puddles:

  1. Sobel + non-max suppression + Zhang-Suen thinning + chain walking.
     The skeleton snaps at every junction; longest chain was ~50 px, so
     the output was detached confetti.
  2. Stroking raw luminance-band boundaries. Contours followed shading
     blobs, not features - a mid-grey threshold cuts through a lit cheek.
  3. Figure/ground mask (warm+saturated vs sky+marble), stroking the
     silhouette. The mask was good but the outline of a head-and-shoulders
     is a potato: no identity at card size.
  4. Same mask, stroking the dark shapes inside it. Still puddles.

So each pixel-art source was used as a visual REFERENCE to draw the same
character - same pose, same costume, same attributes - at a resolution
where clean outlines survive, and those drawings are what gets traced.
The gods, their poses and their gear all come from the original card art.

Element hues match css/style.css:37-43. Output is 320x440 (8:11), the
same ratio as every hero PNG, with the figure inside the region that
survives both crops the game applies with object-fit: cover (the
collection card trims the sides, the battle tile trims top and bottom).
See sim/verify_card_art.js.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from lib_trace_ink import trace

INK = os.path.join(ROOT, 'assets', 'heroes-line', 'ink')
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

NAMES = {
    'zeus': 'Zeus', 'athena': 'Athena', 'hercules': 'Hercules',
    'apollo': 'Apollo', 'medusa': 'Medusa', 'ares': 'Ares',
}


def build(name):
    ds = trace(os.path.join(INK, name + '.png'))

    # ALL subpaths go in ONE <path>. fill-rule="evenodd" only punches holes
    # within a single element, so emitting one <path> per loop filled every
    # enclosed gap solid - Zeus's robe and Hercules's beard came out as
    # slabs of colour until these were merged.
    body = '    <path d="%s"/>' % ' '.join(ds)

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 440"'
        ' width="320" height="440" role="img" aria-label="%s">\n'
        '  <title>%s</title>\n'
        '  <rect width="320" height="440" fill="#06070d"/>\n'
        '  <g fill="%s" fill-rule="evenodd">\n%s\n  </g>\n</svg>\n'
    ) % (NAMES[name], NAMES[name], EL[name], body), len(ds)


def main():
    for name in sorted(EL):
        svg, n = build(name)
        with open(os.path.join(OUT, 'olympus-%s.svg' % name), 'w') as fh:
            fh.write(svg)
        print('%-9s %2d subpaths  %5.1f KB' % (name, n, len(svg) / 1024.0))


if __name__ == '__main__':
    main()
