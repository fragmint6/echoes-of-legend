# Raw generated art

Full-resolution generator output, kept out of `assets/` so it is never
deployed. Roughly 1254x1254 RGB with the transparency flattened into a
light checkerboard.

`tools/process_art.py` reads this directory and writes the shipping
96x96 portraits to `assets/heroes/`. Nothing here is served to players:
16 MB of sources produce 60 KB of shipped art.

Regenerate:  python3 tools/process_art.py
Verify:      python3 tools/verify_art.py
