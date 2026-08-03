"""Attach `art:` to every battlefield that has a backdrop in assets/boards/.

Idempotent, same pattern as tools/wire_art.py for characters.
Run:  python3 tools/wire_boards.py
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "assets", "boards")
DATA = os.path.join(ROOT, "data", "battlefields.js")


def main():
    have = sorted(f[:-4] for f in os.listdir(ART) if f.endswith(".png"))
    s = open(DATA).read()
    added, missing = 0, []
    for fid in have:
        if "art: 'assets/boards/%s.png'" % fid in s:
            continue
        key = "id: '%s'," % fid
        if key not in s:
            missing.append(fid)
            continue
        i = s.index(key)
        k = s.index("\n", i)
        indent = " " * (i - s.rindex("\n", 0, i) - 1)
        s = s[:k] + "\n" + indent + "art: 'assets/boards/%s.png'," % fid + s[k:]
        added += 1
    if added:
        open(DATA, "w").write(s)
    total = s.count("art: 'assets/boards/")
    print("%d of 10 battlefields have art (+%d)" % (total, added))
    if missing:
        print("backdrop with no matching field id:", missing)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
