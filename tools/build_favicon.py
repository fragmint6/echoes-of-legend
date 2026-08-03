"""Build assets/favicon.ico and assets/icon-128.png from tools/make_icon.py.

Two things worth knowing about the ICO container:

1. 256 is the hard ceiling. Directory entries store width and height in one
   byte each, and 0 means 256, so a 512 frame records 512 & 0xFF == 0 and
   reads back as 256 with a size-mismatch warning.

2. PIL's save(format='ICO', sizes=..., append_images=...) silently emits a
   single 16x16 frame - it treats the smallest image as the base. The
   container is therefore written by hand below.
"""

import io
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_icon import make  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)
PNG_SIZE = 128


def build_ico(path):
    frames = [(s, make(s).convert("RGBA")) for s in sorted(ICO_SIZES)]

    blobs = []
    for _, im in frames:
        b = io.BytesIO()
        im.save(b, format="PNG", optimize=True)
        blobs.append(b.getvalue())

    n = len(frames)
    offset = 6 + 16 * n
    dirents = b""
    for (s, _), blob in zip(frames, blobs):
        # 0 in the size byte means 256
        dirents += struct.pack(
            "<BBBBHHII", s & 0xFF, s & 0xFF, 0, 0, 1, 32, len(blob), offset
        )
        offset += len(blob)

    with open(path, "wb") as f:
        f.write(struct.pack("<HHH", 0, 1, n) + dirents + b"".join(blobs))
    return n, offset


def main():
    ico = os.path.join(ROOT, "assets", "favicon.ico")
    png = os.path.join(ROOT, "assets", f"icon-{PNG_SIZE}.png")

    n, size = build_ico(ico)
    print(f"{ico}: {n} frames {sorted(ICO_SIZES)}, {size:,} bytes")

    make(PNG_SIZE).convert("RGBA").save(png, format="PNG", optimize=True)
    print(f"{png}: {PNG_SIZE}x{PNG_SIZE}, {os.path.getsize(png):,} bytes")


if __name__ == "__main__":
    main()
