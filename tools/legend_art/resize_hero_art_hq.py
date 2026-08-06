#!/usr/bin/env python3
"""Detail-preserving downsize pipeline for the Echoes of Legend hero cards.

The source art is 640x880 and the default target is 128x176 (an exact 5x
reduction). Compared with a basic resize, this pipeline:

* crops only to the authoritative 8:11 ratio; it never stretches the art;
* downsamples in linear-light RGB to reduce dark/bright edge blending;
* keeps full chroma (JPEG 4:4:4) to prevent colour bleeding at 128px;
* writes lossless PNG by default, with high-quality JPEG as an optional format;
* applies a restrained, configurable final sharpen to recover edge crispness;
* never quantizes, posterizes, keys, masks, or rewrites the original files.

Requires Pillow. NumPy is used for linear-light resizing when available; if it
is not installed, the script falls back to Pillow's high-quality sRGB resize.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from PIL import Image, ImageFilter

try:
    import numpy as np
except ImportError:  # pragma: no cover - fallback for minimal installs
    np = None

SOURCE_ASPECT = 640 / 880  # exact 8:11 card ratio


def crop_to_aspect(im: Image.Image, aspect: float) -> Image.Image:
    w, h = im.size
    current = w / h
    if abs(current - aspect) < 1e-9:
        return im
    if current > aspect:
        new_w = round(h * aspect)
        left = (w - new_w) // 2
        return im.crop((left, 0, left + new_w, h))
    new_h = round(w / aspect)
    top = (h - new_h) // 2
    return im.crop((0, top, w, top + new_h))


def pillow_filter(name: str):
    return {
        'lanczos': Image.Resampling.LANCZOS,
        'bicubic': Image.Resampling.BICUBIC,
        'bilinear': Image.Resampling.BILINEAR,
        'box': Image.Resampling.BOX,
        'nearest': Image.Resampling.NEAREST,
    }[name]


def resize_linear_rgb(im: Image.Image, size: tuple[int, int], filter_name: str) -> Image.Image:
    """Resize in linear-light RGB to avoid gamma-darkened blends."""
    if np is None or filter_name == 'nearest':
        return im.resize(size, resample=pillow_filter(filter_name))

    arr = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    # sRGB -> linear-light RGB.
    linear = np.where(
        arr <= 0.04045,
        arr / 12.92,
        ((arr + 0.055) / 1.055) ** 2.4,
    )

    channels = []
    for channel in range(3):
        plane = Image.fromarray(linear[:, :, channel].astype('float32'), mode='F')
        plane = plane.resize(size, resample=pillow_filter(filter_name))
        channels.append(np.asarray(plane, dtype=np.float32))
    reduced = np.stack(channels, axis=2)
    reduced = np.clip(reduced, 0.0, 1.0)

    # linear-light RGB -> sRGB.
    srgb = np.where(
        reduced <= 0.0031308,
        reduced * 12.92,
        1.055 * np.power(reduced, 1 / 2.4) - 0.055,
    )
    return Image.fromarray(np.clip(np.round(srgb * 255), 0, 255).astype('uint8'), 'RGB')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path('assets/heroes'),
                        help='input directory containing hero JPGs')
    parser.add_argument('--output', type=Path, default=Path('assets/heroes-128'),
                        help='output directory (default: assets/heroes-128)')
    parser.add_argument('--width', type=int, default=128,
                        help='output width in pixels (default: 128)')
    parser.add_argument('--quality', type=int, default=95,
                        help='JPEG quality, 1-95 (default: 95)')
    parser.add_argument('--format', choices=('jpg', 'png'), default='png',
                        help='output format; PNG is lossless (default: png)')
    parser.add_argument('--filter', choices=('lanczos', 'bicubic', 'bilinear', 'box', 'nearest'),
                        default='lanczos', help='downsampling filter (default: lanczos)')
    parser.add_argument('--sharpen', type=int, default=15,
                        help='final UnsharpMask amount 0-200 (default: 15; use 0 to disable)')
    parser.add_argument('--overwrite', action='store_true',
                        help='replace existing files in the output directory')
    parser.add_argument('--clean-legacy', action='store_true',
                        help='remove legacy JPG/JPEG conversions from the output directory')
    args = parser.parse_args()

    if args.width <= 0:
        parser.error('--width must be positive')
    if not 1 <= args.quality <= 95:
        parser.error('--quality must be between 1 and 95')
    if not 0 <= args.sharpen <= 200:
        parser.error('--sharpen must be between 0 and 200')
    if not args.source.is_dir():
        parser.error(f'source directory does not exist: {args.source}')

    height = round(args.width / SOURCE_ASPECT)
    args.output.mkdir(parents=True, exist_ok=True)
    if args.clean_legacy:
        for legacy in (*args.output.glob('*.jpg'), *args.output.glob('*.jpeg')):
            legacy.unlink()
            print(f'DELETE {legacy}')
    rows = []
    inputs = sorted(p for p in args.source.glob('*.jpg') if p.is_file())

    for src in inputs:
        ext = '.png' if args.format == 'png' else '.jpg'
        dst = args.output / (src.stem + ext)
        if dst.exists() and not args.overwrite:
            print(f'SKIP  {dst} (exists; use --overwrite to replace)')
            continue

        with Image.open(src) as opened:
            im = crop_to_aspect(opened.convert('RGB'), SOURCE_ASPECT)
            im = resize_linear_rgb(im, (args.width, height), args.filter)
            if args.sharpen:
                # Radius below one pixel gives edge recovery without a visible halo.
                im = im.filter(ImageFilter.UnsharpMask(radius=0.55,
                                                       percent=args.sharpen,
                                                       threshold=2))

            if args.format == 'png':
                im.save(dst, 'PNG', optimize=True)
            else:
                # 4:4:4 avoids the chroma bleed caused by 4:2:0 at tiny sizes.
                im.save(dst, 'JPEG', quality=args.quality, optimize=True,
                        progressive=True, subsampling=0)

        with Image.open(dst) as check:
            assert check.size == (args.width, height), (dst, check.size)
        rows.append({
            'id': dst.stem,
            'file': dst.name,
            'width': args.width,
            'height': height,
            'bytes': dst.stat().st_size,
            'format': args.format,
            'quality': args.quality if args.format == 'jpg' else 'lossless',
            'filter': args.filter,
            'linear_light': bool(np is not None and args.filter != 'nearest'),
            'sharpen': args.sharpen,
        })
        print(f'WRITE {dst} ({args.width}x{height}, {dst.stat().st_size} bytes)')

    manifest = args.output / 'MANIFEST.csv'
    fields = ['id', 'file', 'width', 'height', 'bytes', 'format', 'quality',
              'filter', 'linear_light', 'sharpen']
    with manifest.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f'Wrote {len(rows)} resized files to {args.output}')
    print(f'Manifest: {manifest}')


if __name__ == '__main__':
    main()
