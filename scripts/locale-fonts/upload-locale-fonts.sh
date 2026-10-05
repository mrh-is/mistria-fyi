#!/usr/bin/env bash
# Uploads the staged woff2 chunks from build-locale-fonts.ts to the R2 bucket behind
# assets.mistria.fyi. Objects are keyed by family + version, so they are safe to mark immutable,
# and keys that already serve publicly are skipped (set FORCE=1 to re-upload everything).
#
#   pnpm run fonts:upload [dist-dir]   (DRY_RUN=1 previews without uploading)
set -euo pipefail

BUCKET="${R2_BUCKET:-mistria-fyi-assets}"
ORIGIN="${ASSET_ORIGIN:-https://assets.mistria.fyi}"
DIST="${1:-$(dirname "$0")/../../.locale-fonts-dist}"
PARALLEL="${PARALLEL:-8}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"

if [ ! -d "$DIST/fonts" ]; then
  echo "No staged fonts in $DIST; run pnpm run fonts:build first." >&2
  exit 1
fi

# shellcheck source=../lib/r2-upload.sh
source "$(dirname "$0")/../lib/r2-upload.sh"
# Keys are the paths under the dist dir (fonts/...), so upload from the dist root.
cd "$DIST"
r2_upload_tree "fonts" '*.woff2' "fonts/" font/woff2 exists
