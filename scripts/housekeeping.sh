#!/usr/bin/env bash
# Scheduled repository housekeeping: remove worktrees & branches whose work has merged or closed.
# The launchd agent from install-housekeeping-agent.sh runs this hourly from the primary checkout.
# Output goes to a log trimmed to its most recent lines.
set -uo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
log=${MISTRIA_HOUSEKEEPING_LOG:-$HOME/Library/Logs/mistria-housekeeping.log}

mkdir -p "$(dirname "$log")"
if [ -f "$log" ]; then
  tail -n 2000 "$log" >"$log.tmp" && mv "$log.tmp" "$log"
fi
exec >>"$log" 2>&1
printf '\n== %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"

cd "$repository_root" || exit 1
lock="$(git rev-parse --path-format=absolute --git-common-dir)/housekeeping.lock"
if ! mkdir "$lock" 2>/dev/null; then
  # A crashed run leaves its lock behind; reclaim it once its process is gone.
  if kill -0 "$(cat "$lock/pid" 2>/dev/null || echo 0)" 2>/dev/null; then
    echo "Another housekeeping run holds $lock; skipping."
    exit 0
  fi
  rm -rf "$lock" && mkdir "$lock" || exit 1
fi
echo $$ >"$lock/pid"
trap 'rm -rf "$lock"' EXIT

bash scripts/cleanup-worktrees.sh --apply
