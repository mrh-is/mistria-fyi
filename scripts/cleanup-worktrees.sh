#!/usr/bin/env bash
# Remove linked worktrees whose work is finished: clean, idle, & on a branch whose PR is merged or
# closed. Previews by default; pass --apply to remove. A branch goes too only when its tip is the
# PR's head, so unpushed commits survive. Then prune registrations whose folders are gone.
set -uo pipefail

apply=false
[ "${1:-}" = --apply ] && apply=true
idle_seconds=$((${MISTRIA_CLEANUP_IDLE_MINUTES:-120} * 60))
now=$(date +%s)
mtime() { stat -f %m "$1" 2>/dev/null || stat -c %Y "$1"; }

git worktree list --porcelain | awk -v RS= '
  NR > 1 && !/\nlocked/ && /\nbranch / {
    match($0, /^worktree [^\n]+/); path = substr($0, 10, RLENGTH - 9)
    match($0, /\nbranch refs\/heads\/[^\n]+/); branch = substr($0, RSTART + 19, RLENGTH - 19)
    print path "\t" branch
  }' | while IFS=$'\t' read -r path branch; do
  [ -d "$path" ] || continue
  # A nested worktree sits in an ignored folder, which removing its parent would delete.
  git worktree list --porcelain | grep -qF "worktree $path/" &&
    { echo "keep $path: holds another worktree"; continue; }
  # Idle first: a status refresh may rewrite the index, so it also skips optional locks.
  gitdir=$(git -C "$path" rev-parse --absolute-git-dir)
  latest=$(git -C "$path" log -1 --format=%ct)
  for file in "$gitdir/HEAD" "$gitdir/index"; do
    [ -f "$file" ] && [ "$(mtime "$file")" -gt "$latest" ] && latest=$(mtime "$file")
  done
  [ $((now - latest)) -ge "$idle_seconds" ] || { echo "keep $path: active recently"; continue; }
  [ -z "$(git --no-optional-locks -C "$path" status --porcelain)" ] ||
    { echo "keep $path: uncommitted changes"; continue; }
  # gh reads stdin, which here is the worktree list.
  read -r state head < <(gh pr list --head "$branch" --state all --limit 1 \
    --json state,headRefOid --jq '.[0] // empty | "\(.state) \(.headRefOid)"' </dev/null 2>/dev/null)
  case "${state:-}" in MERGED | CLOSED) ;; *) echo "keep $path: PR ${state:-not found}"; continue ;; esac
  if [ "$apply" = false ]; then
    echo "would remove $path ($branch, PR $state)"
  elif git worktree remove "$path"; then
    echo "removed $path ($branch, PR $state)"
    [ "$(git rev-parse "refs/heads/$branch")" = "$head" ] && git branch -D -q "$branch"
  fi
done
[ "$apply" = true ] && git worktree prune -v
exit 0
