#!/usr/bin/env bash
#
# Build the CrazyGames upload zip.
#
#   ./tools/make_cg_build.sh            -> ../echoes-of-legend-cg.zip
#   ./tools/make_cg_build.sh /tmp/out   -> /tmp/out/echoes-of-legend-cg.zip
#
# WHAT GOES IN. Only what index.html actually loads: assets, css, data,
# js, and index.html itself. Everything else in the repo is tooling or
# documentation and is left out.
#
# WHAT IS DELIBERATELY LEFT OUT, and why it is safe:
#
#   .git/        history. Huge, and nothing reads it.
#   sim/         the test suites. Node-only, never fetched by the game.
#   docs/        setup notes. Includes SQL and deploy steps - do not ship.
#   tools/       this script and the art/icon helpers.
#   supabase/    THE EDGE FUNCTION. It runs on Supabase's servers, NOT in
#                the browser. The game reaches it over https at
#                <project>/functions/v1/cg-auth. Uploading it would do
#                nothing; deleting it from the copy breaks nothing.
#   rune-lab.html  an orphan dev page - nothing in the game links to it.
#
#   js/dev.js is KEPT: index.html only injects it when
#   platform.devConsole is true, which is false on the portal build, so
#   it never loads there. Removing it would break the web build.
#
# THE EDGE FUNCTION IS NOT PART OF THIS BUILD. `supabase functions
# deploy` is run ONCE against your Supabase project, from the git repo -
# not per upload, and never from the copy.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$(dirname "$ROOT")}"
NAME="echoes-of-legend-cg"
STAGE="$(mktemp -d)"
ZIP="$OUT_DIR/$NAME.zip"

trap 'rm -rf "$STAGE"' EXIT

echo "repo   : $ROOT"
echo "staging: $STAGE/$NAME"

mkdir -p "$STAGE/$NAME"
for item in index.html assets css data js; do
  if [ ! -e "$ROOT/$item" ]; then
    echo "MISSING: $item - aborting" >&2
    exit 1
  fi
  cp -R "$ROOT/$item" "$STAGE/$NAME/"
done

# Belt and braces: drop anything that crept into those folders.
find "$STAGE/$NAME" -name '.DS_Store' -delete
find "$STAGE/$NAME" -name '*.map' -delete
find "$STAGE/$NAME" -name '__MACOSX' -prune -exec rm -rf {} + 2>/dev/null || true

# Working files that live under assets/ but are never loaded by the
# game: the source art the finals were cut from, and the notes that
# describe them. Verified unreferenced by index.html, js/, css/, data/.
rm -rf "$STAGE/$NAME/assets/rivals-src"
find "$STAGE/$NAME/assets" -name '*.md' -delete

# index.html must be at the ZIP ROOT - CrazyGames rejects a build whose
# index sits inside a wrapper folder.
mkdir -p "$OUT_DIR"
rm -f "$ZIP"
( cd "$STAGE/$NAME" && zip -qr "$ZIP" . -x '.*' )

echo
echo "wrote  : $ZIP"
echo "size   : $(du -h "$ZIP" | cut -f1)"
echo
echo "index.html at the zip root:"
unzip -l "$ZIP" | grep -E ' index\.html$' || {
  echo "  NOT FOUND - the upload would be rejected" >&2
  exit 1
}
echo
echo "top level inside the zip:"
unzip -l "$ZIP" | awk '{print $4}' | grep -E '^[^/]+/?$' | sort -u | sed 's/^/  /'
