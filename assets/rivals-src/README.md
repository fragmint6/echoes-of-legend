# Chapter 1 Rival Card-Art Sources

These ten JPEGs are the canonical, tracked **640 × 880** full-art portrait
sources for the Chapter 1 rivals.

Their corresponding runtime assets live in `../rivals/` as lossless
**128 × 176 PNGs**. They are produced from these sources with:

```bash
python3 tools/legend_art/resize_legend_art_hq.py \
  --source assets/rivals-src --output /tmp/rivals-delivery \
  --width 128 --format png --sharpen 15 --overwrite
```

The tool requires Pillow and optionally NumPy for the linear-light path. The
build uses the repository’s normal card-art pipeline: 8:11 source aspect,
linear-light Lanczos downsampling, and a restrained 15% final sharpen pass.
The delivery manifest at `../rivals/MANIFEST.csv` records each source and
runtime file pair.
