#!/usr/bin/env bash
# Uploads the staged woff2 chunks from build-locale-fonts.ts to the R2 bucket behind
# assets.mistria.fyi. Objects are keyed by family + version, so they are safe to mark immutable,
# and keys that already serve publicly are skipped (set FORCE=1 to re-upload everything).
#
#   pnpm run fonts:upload [dist-dir]
set -euo pipefail

BUCKET="${R2_BUCKET:-mistria-fyi-assets}"
ORIGIN="${ASSET_ORIGIN:-https://assets.mistria.fyi}"
DIST="${1:-$(dirname "$0")/../../.locale-fonts-dist}"
PARALLEL="${PARALLEL:-8}"
FORCE="${FORCE:-0}"

if [ ! -d "$DIST/fonts" ]; then
  echo "No staged fonts in $DIST; run pnpm run fonts:build first." >&2
  exit 1
fi

upload_one() {
  local key="$1"
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
    if pnpx wrangler r2 object put "$BUCKET/$key" --remote --file "$key" \
      --content-type font/woff2 --cache-control "public, max-age=31536000, immutable" >/dev/null 2>&1; then
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

cd "$DIST"
if ! find fonts -type f -name '*.woff2' | sort | xargs -P "$PARALLEL" -I{} bash -c 'upload_one "$1"' _ {}; then
  echo "Some uploads failed; rerun to retry them." >&2
  exit 1
fi
echo "Done: $(find fonts -type f -name '*.woff2' | wc -l | tr -d ' ') objects staged for $BUCKET"
