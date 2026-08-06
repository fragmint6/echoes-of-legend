#!/usr/bin/env python3
"""Normalize card-art sources to the canonical 640×880 portrait canvas.

The original hero-art helper was fixed to one local directory.  This version
keeps that default while allowing campaign/rival source art to use the exact
same crop-and-normalize step before `resize_hero_art_hq.py` creates the
lossless 128×176 delivery assets.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

TARGET_W, TARGET_H = 640, 880
TARGET_ASPECT = TARGET_W / TARGET_H


def normalize(im: Image.Image) -> Image.Image:
    """Centre-crop to the authoritative 8:11 card aspect, then resize."""
    im = im.convert('RGB')
    w, h = im.size
    current = w / h
    if current > TARGET_ASPECT:
        new_w = round(h * TARGET_ASPECT)
        left = (w - new_w) // 2
        im = im.crop((left, 0, left + new_w, h))
    elif current < TARGET_ASPECT:
        new_h = round(w / TARGET_ASPECT)
        top = (h - new_h) // 2
        im = im.crop((0, top, w, top + new_h))
    return im.resize((TARGET_W, TARGET_H), Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--source',
        type=Path,
        default=Path('/home/user/assets/heroes'),
        help='directory containing source JPEGs (default: legacy hero-art directory)',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=None,
        help='directory for normalized JPEGs; omit to replace the sources in place',
    )
    parser.add_argument('--quality', type=int, default=85, help='JPEG quality 1–95 (default: 85)')
    args = parser.parse_args()

    if not args.source.is_dir():
        parser.error(f'source directory does not exist: {args.source}')
    if not 1 <= args.quality <= 95:
        parser.error('--quality must be between 1 and 95')

    output = args.output or args.source
    output.mkdir(parents=True, exist_ok=True)
    sources = sorted(p for p in args.source.glob('*.jpg') if p.is_file())
    if not sources:
        parser.error(f'no JPEG sources found in {args.source}')

    for src in sources:
        with Image.open(src) as opened:
            im = normalize(opened)
            dst = output / src.name
            im.save(dst, 'JPEG', quality=args.quality, optimize=True, progressive=True, subsampling=2)
        print(f'{src.name}\t{TARGET_W}x{TARGET_H}\t{dst.stat().st_size} bytes')


if __name__ == '__main__':
    main()
