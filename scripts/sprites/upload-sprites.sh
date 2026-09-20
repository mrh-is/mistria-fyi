#!/usr/bin/env bash
# Uploads staged item sprites (pnpm run pipeline -- <path> --sprites) to the R2 bucket behind
# assets.mistria.fyi. Objects are keyed by game version, so they are safe to mark immutable, and
# keys that already serve publicly are skipped (set FORCE=1 to re-upload everything).
#
#   pnpm run sprites:upload [sprites-dir]
set -euo pipefail

BUCKET="${R2_BUCKET:-mistria-fyi-assets}"
ORIGIN="${ASSET_ORIGIN:-https://assets.mistria.fyi}"
SPRITES_DIR="${1:-$(dirname "$0")/../../pipeline/output/sprites}"
PARALLEL="${PARALLEL:-8}"
FORCE="${FORCE:-0}"

if [ ! -d "$SPRITES_DIR" ]; then
  echo "No staged sprites in $SPRITES_DIR; run pnpm run pipeline -- <path> --sprites first." >&2
  exit 1
fi

# Original game assets must never reach the public bucket by accident: refuse to upload anything
# that isn't a converted .webp sprite.
non_webp=$(find "$SPRITES_DIR" -type f ! -name '*.webp')
if [ -n "$non_webp" ]; then
  echo "Refusing to upload: $SPRITES_DIR contains non-.webp files:" >&2
  echo "$non_webp" >&2
  exit 1
fi

upload_one() {
  local relpath="$1"
  local key="sprites/$relpath"
  if [ "$FORCE" != "1" ]; then
    local status
    status=$(curl -s -o /dev/null -w '%{http_code}' -I "$ORIGIN/$key")
    if [ "$status" = "200" ]; then
      echo "skip $key"
      return 0
    fi
  fi
  # wrangler occasionally fails with a transient "fetch failed"; retry before giving up.
  local attempt
  for attempt in 1 2 3; do
    if pnpx wrangler r2 object put "$BUCKET/$key" --remote --file "$relpath" \
      --content-type image/webp --cache-control "public, max-age=31536000, immutable" >/dev/null 2>&1; then
      echo "put  $key"
      return 0
    fi
    sleep "$attempt"
  done
  echo "FAILED $key" >&2
  return 1
}
export -f upload_one
export BUCKET ORIGIN FORCE

cd "$SPRITES_DIR"
if ! find . -type f -name '*.webp' | sed 's|^\./||' | sort | xargs -P "$PARALLEL" -I{} bash -c 'upload_one "$1"' _ {}; then
  echo "Some uploads failed; rerun to retry them." >&2
  exit 1
fi
echo "Done: $(find . -type f -name '*.webp' | wc -l | tr -d ' ') objects staged for $BUCKET"
