# 128px PNG legend-art build

Generated from `assets/legends/` by the detail-preserving pipeline:

```bash
python tools/resize_legend_art.py
```

Each legend is **128 x 176 px**, preserving the source ratio of 640:880 (8:11).

- Lossless **PNG** output
- Linear-light RGB downsampling
- Lanczos resampling
- Very light edge sharpening (default amount: 15)
- No quantization, posterization, masking, or palette reduction
- Original 640 x 880 JPEGs remain untouched in `assets/legends/`

The previous JPEG conversion folders were removed. `MANIFEST.csv` records the
output dimensions and byte size for each file.

Optional variants:

```bash
# Explicit cleanup of legacy JPEGs in the output directory
python tools/resize_legend_art.py --clean-legacy --overwrite

# Disable sharpening
python tools/resize_legend_art.py --sharpen 0 --overwrite

# Create a JPEG build only when needed
python tools/resize_legend_art.py --format jpg --output assets/legends-128-jpg
```
