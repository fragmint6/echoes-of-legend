"""Re-encode raw generator output as JPEG q92 to keep art-src/ small.

WHY THIS IS SAFE
----------------
art-src/ is build INPUT, never served. process_art.py reduces every
portrait to 96x96 with a 32-colour palette and binary alpha, so JPEG
artefacts land far below the quantisation floor. Verified on four heroes:
re-processing from JPEG q92 changes ~0.1-1.0% of alpha pixels and is
visually indistinguishable at render size.

The generator already returns RGB with transparency flattened into a
light checkerboard, and cut_out() reconstructs alpha by flood-filling
inward from the border - so losing PNG's alpha channel costs nothing.

WHY IT MATTERS
--------------
Sources averaged 2.24 MB (heroes) and 2.97 MB (boards). At 57 heroes plus
10 boards that is ~160 MB of build input for ~1 MB of shipped art. JPEG
q92 cuts each source by roughly 85%.

Run:  python3 tools/shrink_sources.py [--dry-run]
"""

import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = [
    os.path.join(ROOT, "art-src"),
    os.path.join(ROOT, "art-src", "boards"),
    os.path.join(ROOT, "art-src", "menu"),
]
QUALITY = 92


def main():
    dry = "--dry-run" in sys.argv
    before = after = 0
    n = 0

    for d in DIRS:
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if not name.endswith(".png"):
                continue
            src = os.path.join(d, name)
            dst = src[:-4] + ".jpg"
            b = os.path.getsize(src)
            before += b
            if dry:
                after += b // 7  # rough
                n += 1
                continue
            Image.open(src).convert("RGB").save(
                dst, "JPEG", quality=QUALITY, optimize=True, progressive=True
            )
            os.remove(src)
            after += os.path.getsize(dst)
            n += 1

    print("%d sources: %.1f MB -> %.1f MB  (saved %.1f MB, %.0f%%)"
          % (n, before / 1048576, after / 1048576,
             (before - after) / 1048576,
             100 * (before - after) / before if before else 0))


if __name__ == "__main__":
    main()
