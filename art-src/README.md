# Raw generated art (build input, never served)

Full-resolution generator output. `process_art.py` and `process_boards.py`
read this directory and write the shipping assets:

```
art-src/*.jpg         ->  assets/heroes/*.png   96x96,  <=32 colours
art-src/boards/*.jpg  ->  assets/boards/*.png   512x284, <=24 colours
```

## RULE: sources are stored as JPEG q92, never PNG

**Always run `python3 tools/shrink_sources.py` after generating art.**

The generator emits ~1254x1254 (heroes) and ~1536x1024 (boards) PNGs at
**2.2-3.0 MB each**. At 57 heroes plus 10 boards that is roughly 160 MB of
build input for ~1 MB of shipped art, which overruns the workspace budget
long before the roster is finished. It already hit 101.5 MB at 42 files.

JPEG q92 cuts each source by ~86% with no visible effect on the output:

| | before | after |
| --- | --- | --- |
| 42 sources | 101.5 MB | 13.9 MB |
| project total | 105 MB | 17 MB |

### Why lossy is safe here

- Sources are **intermediates**. Nothing in `art-src/` is ever served.
- `process_art.py` reduces every portrait to 96x96 with a **32-colour
  palette and binary alpha**, so JPEG artefacts land far below the
  quantisation floor. Re-processing from JPEG changed **0.34%** of alpha
  pixels on Medusa and was visually indistinguishable at render size.
- Boards quantise to 24 colours at 512x284: max channel delta 22, mean
  **2.75**.
- Losing PNG's alpha channel costs nothing: the generator already returns
  RGB with transparency flattened into a light checkerboard, and
  `cut_out()` reconstructs alpha by flood-filling inward from the border.

### What was rejected, and why

**Downscaling sources to 384px** would have saved more, but re-processing
from 384px changes **39.6%** of the final 96px pixels - the shipped art
would silently drift if the pipeline were ever re-run. Measured, rejected.

## Workflow

```
generate  ->  art-src/<id>.png
              python3 tools/shrink_sources.py     # PNG -> JPEG q92, deletes PNG
              python3 tools/process_art.py        # or process_boards.py
              python3 tools/wire_art.py           # or wire_boards.py
              python3 tools/verify_art.py         # or verify_boards.py
```

Both processors accept `.jpg` or `.png`, so a freshly generated batch works
before shrinking - but shrink before finishing, or the folder grows again.
