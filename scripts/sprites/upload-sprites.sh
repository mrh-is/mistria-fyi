#!/usr/bin/env bash
# Uploads staged sprites (pnpm run pipeline -- <path> --sprites) to the R2 bucket behind
# assets.mistria.fyi. Objects are keyed by stable entity ID (sprites/items/<id>.webp,
# sprites/villagers/<id>.webp), overwritten in place rather than versioned, so a no-change run must
# not re-upload: a key is skipped when its remote ETag already matches the local file's MD5 (set
# FORCE=1 to re-upload everything regardless).
#
#   pnpm run sprites:upload [sprites-dir]   (DRY_RUN=1 previews without uploading)
set -euo pipefail

BUCKET="${R2_BUCKET:-mistria-fyi-assets}"
ORIGIN="${ASSET_ORIGIN:-https://assets.mistria.fyi}"
SPRITES_DIR="${1:-$(dirname "$0")/../../pipeline/output/sprites}"
PARALLEL="${PARALLEL:-8}"
FORCE="${FORCE:-0}"
DRY_RUN="${DRY_RUN:-0}"

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

# shellcheck source=../lib/r2-upload.sh
source "$(dirname "$0")/../lib/r2-upload.sh"
r2_upload_tree "$SPRITES_DIR" '*.webp' "sprites/" image/webp etag
