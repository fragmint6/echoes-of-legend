#!/usr/bin/env python3
"""Build a shipped legend-art PNG from a generated source image.

Usage:
    python tools/legend_art/build_card_art.py <source.png> <assets/legends/<id>.png>

Match the shipped legend-art build exactly.

Shipped files measure 64x88 RGB PNG (docs and MANIFEST.csv both claim
128x176 - they are wrong; see the commit message). This reproduces the
real thing: centre-crop to the 8:11 card ratio, downsample in
linear-light RGB with lanczos, light sharpen, save lossless RGB PNG.
"""
import sys
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

ASPECT = 640 / 880          # 8:11
OUT_W, OUT_H = 64, 88       # what actually ships
SHARPEN = 15

def crop_to_aspect(im, aspect=ASPECT):
    w, h = im.size
    cur = w / h
    if abs(cur - aspect) < 1e-9:
        return im
    if cur > aspect:                     # too wide -> trim sides
        nw = round(h * aspect)
        left = (w - nw) // 2
        return im.crop((left, 0, left + nw, h))
    nh = round(w / aspect)               # too tall -> trim top/bottom
    top = (h - nh) // 2
    return im.crop((0, top, w, top + nh))

def srgb_to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)

def linear_to_srgb(a):
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * np.power(a, 1 / 2.4) - 0.055)

def downsize(im, w=OUT_W, h=OUT_H):
    """Resize in linear light so dark/bright edges don't blend muddy."""
    arr = np.asarray(im.convert('RGB'), dtype=np.float32) / 255.0
    lin = srgb_to_linear(arr)
    tmp = Image.fromarray((lin * 65535).clip(0, 65535).astype(np.uint16).reshape(im.size[1], im.size[0], 3)[:, :, 0])
    # resize each channel at 16-bit to keep precision
    chans = []
    for c in range(3):
        ch = Image.fromarray((lin[:, :, c] * 65535).clip(0, 65535).astype(np.uint16), mode='I;16')
        chans.append(np.asarray(ch.resize((w, h), Image.Resampling.LANCZOS), dtype=np.float32) / 65535.0)
    out_lin = np.stack(chans, axis=-1).clip(0, 1)
    out = (linear_to_srgb(out_lin) * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, mode='RGB')

def build(src, dst, sharpen=SHARPEN):
    im = Image.open(src).convert('RGB')
    im = crop_to_aspect(im)
    im = downsize(im)
    if sharpen:
        im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=sharpen, threshold=3))
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, format='PNG', optimize=True)
    return im.size, Path(dst).stat().st_size

if __name__ == '__main__':
    size, nbytes = build(sys.argv[1], sys.argv[2])
    print(f'{sys.argv[2]}  {size[0]}x{size[1]}  {nbytes} bytes')
