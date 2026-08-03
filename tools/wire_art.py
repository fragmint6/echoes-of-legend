"""Attach `art:` to every card that has a portrait in assets/heroes/.

Idempotent: run it after each batch of art lands and it adds only the
new entries. Cards without a portrait keep their icon glyph, so the
roster can be illustrated a faction at a time.

Run:  python3 tools/wire_art.py
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "heroes")
DATA = os.path.join(ROOT, "data")

FACTIONS = [
    "camelot", "olympus", "sherwood", "grimmwood", "yamato",
    "huaxia", "roma", "takamagahara", "duat",
]


def main():
    have = sorted(f[:-4] for f in os.listdir(ART) if f.endswith(".png"))
    total = 0
    missing = []

    for fac in FACTIONS:
        path = os.path.join(DATA, fac + ".js")
        s = open(path).read()
        added = 0
        for hid in have:
            if not hid.startswith(fac + "-"):
                continue
            if "art: 'assets/heroes/%s.png'" % hid in s:
                continue
            key = "id: '%s'" % hid
            if key not in s:
                missing.append(hid)
                continue
            i = s.index(key)
            j = s.index("icon: '", i)
            k = s.index("\n", j)
            indent = " " * (j - s.rindex("\n", 0, j) - 1)
            s = s[:k] + "\n" + indent + "art: 'assets/heroes/%s.png'," % hid + s[k:]
            added += 1
        if added:
            open(path, "w").write(s)
        wired = s.count("art: 'assets/heroes/")
        total += wired
        print("%-14s %2d wired (+%d)" % (fac, wired, added))

    print("\n%d of 57 heroes have art" % total)
    if missing:
        print("portrait with no matching card id:", missing)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
