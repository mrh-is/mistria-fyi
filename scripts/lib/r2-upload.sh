#!/usr/bin/env bash
# Shared helpers for the R2 upload scripts (sprites & locale fonts). Source this file, then call
# `r2_upload_tree`. Callers set BUCKET, ORIGIN, FORCE, & PARALLEL before sourcing.
#
# Set DRY_RUN=1 to print what would be uploaded without touching the network or Wrangler.

# Portable MD5 (stock macOS has no md5sum; OpenSSL/LibreSSL is present on macOS & Linux).
md5_of() {
  openssl dgst -md5 -r "$1" | cut -d' ' -f1
}

# Prints the unquoted ETag of a public object, or nothing when it is absent.
remote_etag() {
  curl -fsS -I "$ORIGIN/$1" | tr -d '\r' \
    | awk -F': ' 'tolower($1) == "etag" { print $2 }' | tr -d '"'
}

# Returns 0 when the remote object is already current.
remote_is_current() {
  local key=$1 file=$2
  case "$SKIP_MODE" in
    etag)
      local local_md5 etag
      local_md5=$(md5_of "$file")
      etag=$(remote_etag "$key" || true)
      [ -n "$etag" ] && [ "$etag" = "$local_md5" ]
      ;;
    exists)
      local status
      status=$(curl -s -o /dev/null -w '%{http_code}' -I "$ORIGIN/$key" || true)
      [ "$status" = "200" ]
      ;;
    *)
      echo "unknown SKIP_MODE: $SKIP_MODE" >&2
      return 2
      ;;
  esac
}

# Uploads one file (path relative to the current directory). Env: KEY_PREFIX, CONTENT_TYPE,
# SKIP_MODE, CACHE_CONTROL. Shows Wrangler's output only when the final attempt fails.
upload_one() {
  set -euo pipefail
  local file=$1
  local key="$KEY_PREFIX$file"
  if [ "$FORCE" != "1" ] && remote_is_current "$key" "$file"; then
    echo "skip $key"
    return 0
  fi
  if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "would put $key"
    return 0
  fi
  # Wrangler occasionally fails with a transient "fetch failed"; retry before giving up.
  local attempt output=
  for attempt in 1 2 3; do
    # --allow-build lets wrangler's native deps (esbuild, workerd) run their install scripts
    # non-interactively; without it, a pnpm store that hasn't approved them yet fails every upload.
    if output=$(pnpx --allow-build=esbuild --allow-build=workerd wrangler r2 object put \
      "$BUCKET/$key" --remote --file "$file" \
      --content-type "$CONTENT_TYPE" \
      --cache-control "$CACHE_CONTROL" 2>&1); then
      echo "put  $key"
      return 0
    fi
    [ "$attempt" -lt 3 ] && sleep "$attempt"
  done
  echo "FAILED $key" >&2
  printf '%s\n' "$output" | sed 's/^/  wrangler: /' >&2
  return 1
}
export -f md5_of remote_etag remote_is_current upload_one

# r2_upload_tree <dir> <find -name pattern> <key prefix> <content type> <skip mode: etag|exists>
#   [cache-control]
# Uploads every matching file under <dir>, keyed as <key prefix><path relative to dir>. The
# Cache-Control defaults to a one-year immutable policy, right for versioned keys (locale fonts);
# callers whose keys are overwritten in place or must stay revocable pass a revalidating one.
r2_upload_tree() {
  local dir=$1 pattern=$2
  export KEY_PREFIX=$3 CONTENT_TYPE=$4 SKIP_MODE=$5
  export CACHE_CONTROL=${6:-"public, max-age=31536000, immutable"}
  export BUCKET ORIGIN FORCE DRY_RUN
  local count
  cd "$dir"
  # shellcheck disable=SC2016 # The child bash expands $1, the file xargs passes it.
  if ! find . -type f -name "$pattern" | sed 's|^\./||' | sort \
    | xargs -P "$PARALLEL" -I{} bash -c 'upload_one "$1"' _ {}; then
    echo "Some uploads failed; rerun to retry them." >&2
    return 1
  fi
  count=$(find . -type f -name "$pattern" | wc -l | tr -d ' ')
  echo "Done: $count objects staged for $BUCKET"
}
