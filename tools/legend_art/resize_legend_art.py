#!/usr/bin/env python3
"""Compatibility entry point for the detail-preserving legend-art pipeline.

Use `resize_legend_art_hq.py` for the implementation. This wrapper keeps the
original command name working while using the improved HQ defaults.
"""

from resize_legend_art_hq import main


if __name__ == '__main__':
    main()
