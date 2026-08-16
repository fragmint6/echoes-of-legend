#!/usr/bin/env bash
#
# Build the CrazyGames upload.
#
#   ./tools/make_cg_build.sh                  -> ../echoes-of-legend-cg/   (folder)
#   ./tools/make_cg_build.sh --zip            -> ../echoes-of-legend-cg.zip
#   ./tools/make_cg_build.sh /somewhere       -> /somewhere/echoes-of-legend-cg/
#   ./tools/make_cg_build.sh --zip /somewhere -> /somewhere/echoes-of-legend-cg.zip
#
# Folder is the default: CrazyGames' dashboard accepts a dropped folder
# as well as a zip, and a folder is easier to eyeball before uploading.
#
# WHAT GOES IN. Only what index.html actually loads: assets, css, data,
# js, and index.html itself - with index.html at the TOP LEVEL, which
# CrazyGames requires (an index nested inside a wrapper folder is
# rejected).
#
# WHAT IS LEFT OUT, and why it is safe:
#
#   .git/        history. Huge, and nothing reads it.
#   sim/         the test suites. Node-only, never fetched by the game.
#   docs/        setup notes, including SQL and deploy steps.
#   tools/       this script and the art/icon helpers.
#   supabase/    THE EDGE FUNCTION - see below.
#   rune-lab.html  an orphan dev page; nothing links to it.
#   assets/rivals-src/  source art the finals were cut from (~1.2 MB),
#                verified unreferenced by index.html, js/, css/, data/.
#
#   js/dev.js is KEPT deliberately: index.html only injects it when
#   platform.devConsole is true, which is false on the portal build, so
#   it never loads there. Removing it would break the web build.
#
# THE EDGE FUNCTION IS NOT PART OF THIS BUILD.
# supabase/functions/cg-auth runs on SUPABASE'S SERVERS, not in the
# browser. The game calls it over https at
# <project>/functions/v1/cg-auth. So `supabase functions deploy` is a
# ONE-TIME step run from the git repo against your project. It is not
# repeated per copy, per upload, or per build - and it is never run
# from the copied build folder, which has no supabase/ directory at all.
# Re-uploading the game never requires redeploying the function.

set -euo pipefail

MODE="folder"
OUT_DIR=""
for arg in "$@"; do
  case "$arg" in
    --zip) MODE="zip" ;;
    --folder) MODE="folder" ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) OUT_DIR="$arg" ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$(dirname "$ROOT")}"
NAME="echoes-of-legend-cg"
DEST="$OUT_DIR/$NAME"
ZIP="$OUT_DIR/$NAME.zip"

echo "repo  : $ROOT"
echo "mode  : $MODE"

# Refuse to clobber anything that is not a previous build of ours.
if [ -e "$DEST" ] && [ ! -e "$DEST/.eol-cg-build" ]; then
  echo "REFUSING to overwrite $DEST - it was not made by this script." >&2
  echo "Move or delete it first." >&2
  exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
: > "$DEST/.eol-cg-build"

for item in index.html assets css data js; do
  if [ ! -e "$ROOT/$item" ]; then
    echo "MISSING: $item - aborting" >&2
    exit 1
  fi
  cp -R "$ROOT/$item" "$DEST/"
done

# Belt and braces: drop anything that crept into those folders.
find "$DEST" -name '.DS_Store' -delete
find "$DEST" -name '*.map' -delete
find "$DEST" -name '__MACOSX' -prune -exec rm -rf {} + 2>/dev/null || true

# Working files under assets/ that the game never loads.
rm -rf "$DEST/assets/rivals-src"
find "$DEST/assets" -name '*.md' -delete

# ---- self-check: would this build actually run? --------------------
fail=0

[ -f "$DEST/index.html" ] || { echo "  index.html is not at the top level" >&2; fail=1; }

# every local src/href in index.html must resolve inside the build
python3 - "$DEST" <<'PY' || fail=1
import re, os, sys
root = sys.argv[1]
html = open(os.path.join(root, 'index.html'), encoding='utf8').read()
refs = set(re.findall(r'(?:src|href)="([^"]+)"', html))
# document.write() injects a couple of scripts the parser cannot see
refs |= set(re.findall(r'document\.write\(\'<script src="([^"]+)"', html))
missing = [r for r in refs
           if not re.match(r'^(https?:|//|#|data:|mailto:)', r)
           and not os.path.exists(os.path.join(root, r.split('?')[0]))]
if missing:
    print('  MISSING FILES: ' + ', '.join(sorted(missing)[:10]))
    sys.exit(1)
print('  all local references resolve')
PY

# nothing sensitive should ship
if grep -rqE 'sb_secret_[A-Za-z0-9_-]{8,}' "$DEST" 2>/dev/null; then
  echo "  A SECRET KEY IS IN THE BUILD - stopping" >&2
  fail=1
fi
if find "$DEST" \( -name '*.sql' -o -name '*.md' \) | grep -q .; then
  echo "  .sql/.md files leaked into the build" >&2
  fail=1
fi
[ "$fail" -eq 0 ] || exit 1

# The marker STAYS in folder mode: it is how the next run knows this
# directory is a previous build and may be replaced. It is a hidden,
# empty file, so it does not affect the upload. Zip mode drops it,
# since the zip is rebuilt from scratch every time.

if [ "$MODE" = "zip" ]; then
  rm -f "$DEST/.eol-cg-build"
  rm -f "$ZIP"
  ( cd "$DEST" && zip -qr "$ZIP" . -x '.*' )
  rm -rf "$DEST"
  echo
  echo "wrote : $ZIP  ($(du -h "$ZIP" | cut -f1))"
  echo "upload this file."
else
  echo
  echo "wrote : $DEST  ($(du -sh "$DEST" | cut -f1))"
  echo "upload the CONTENTS of this folder (index.html must be at the top)."
  echo
  echo "top level:"
  ls -1 "$DEST" | sed 's/^/  /'
fi

echo
echo "Reminder: the cg-auth Edge Function is NOT in this build and does"
echo "not need redeploying. It lives on Supabase; the game calls it over"
echo "https. Deploy it once, from the git repo - never from here."
