#!/usr/bin/env bash
# Remove linked worktrees whose work is finished: clean, idle, & on a branch whose PR is merged or
# closed, or detached at a commit on a current remote branch. Previews by default; pass --apply to
# remove. A branch goes too only when its tip is the PR's head, so unpushed commits survive. Then
# prune registrations whose folders are gone.
# Removal deletes ignored files, so a worktree stays while it holds any ignored file that isn't a
# link, a build or dependency output, or an unchanged copy of the primary checkout's.
set -uo pipefail

apply=false
[ "${1:-}" = --apply ] && apply=true
idle_seconds=$((${MISTRIA_CLEANUP_IDLE_MINUTES:-120} * 60))
now=$(date +%s)
cwd=$(pwd -P)
primary=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
failed=0
remote_check_complete=false
remote_fetch_failed=false
refreshed_remotes=
# GNU first: GNU stat reads `-f %m` as a filesystem query plus a second file, & prints both.
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1"; }

# Refresh remote heads once before using them to authorize detached-worktree removal.
refresh_remote_refs() {
  remote_check_complete=true
  remote_fetch_failed=false
  refreshed_remotes=
  local remote_name remote_count=0
  while IFS= read -r remote_name; do
    [ -n "$remote_name" ] || continue
    remote_count=$((remote_count + 1))
    if GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags --no-write-fetch-head --prune "$remote_name" \
      "+refs/heads/*:refs/remotes/$remote_name/*" </dev/null 2>/dev/null; then
      refreshed_remotes+="$remote_name"$'\n'
    else
      remote_fetch_failed=true
    fi
  done < <(git remote)
  [ "$remote_count" -gt 0 ] || remote_fetch_failed=true
}

# Whether removing worktree $1 may delete its ignored entry $2.
disposable() {
  [ -L "$1/${2%/}" ] && return 0
  case "$2" in
    node_modules/ | */node_modules/ | .svelte-kit/ | .wrangler/ | build/ | .husky/_/ | \
      _headers | _redirects | .playwright-*/) return 0 ;;
    # Claude Code copies it into each worktree; it holds that session's permission approvals.
    .claude/settings.local.json) return 0 ;;
  esac
  [ -e "$primary/$2" ] && diff -rq "$1/$2" "$primary/$2" >/dev/null 2>&1
}

while IFS=$'\t' read -r path branch_type locked; do
  [ -d "$path" ] || continue
  [ "$locked" != true ] || { echo "keep $path: locked"; continue; }
  branch=
  [ "$branch_type" = detached ] || branch=${branch_type#branch:}
  case "$cwd/" in "$path"/*) echo "keep $path: current worktree"; continue ;; esac
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
  local_file=
  while IFS= read -r -d '' entry; do
    [ "${entry:0:3}" = '!! ' ] && ! disposable "$path" "${entry:3}" && { local_file=${entry:3}; break; }
  done < <(git --no-optional-locks -C "$path" status --porcelain -z --ignored)
  [ -z "$local_file" ] || { echo "keep $path: ignored local file $local_file"; continue; }
  if [ "$branch_type" = detached ]; then
    head=$(git -C "$path" rev-parse HEAD)
    [ "$remote_check_complete" = true ] || refresh_remote_refs
    remote=
    while IFS= read -r remote_name; do
      [ -n "$remote_name" ] || continue
      remote=$(git for-each-ref --contains="$head" --format='%(refname:strip=2) %(symref)' \
        "refs/remotes/$remote_name" | awk '$2 == "" { print $1; exit }')
      [ -z "$remote" ] || break
    done <<< "$refreshed_remotes"
    if [ -z "$remote" ]; then
      if [ "$remote_fetch_failed" = true ]; then
        echo "keep $path: couldn't verify current remote branches"
      else
        echo "keep $path: detached HEAD isn't reachable from a current remote branch"
      fi
      continue
    fi
    reason="detached, reachable from $remote"
  else
    # gh reads stdin, which here is the worktree list. A fork's PR can share the branch name.
    read -r state pr_head < <(gh pr list --head "$branch" --state all --limit 20 \
      --json state,headRefOid,isCrossRepository \
      --jq 'map(select(.isCrossRepository | not)) | .[0] // empty | "\(.state) \(.headRefOid)"' \
      </dev/null 2>/dev/null)
    case "${state:-}" in
      MERGED | CLOSED) ;;
      *) echo "keep $path: PR ${state:-not found}"; continue ;;
    esac
    reason="$branch, PR $state"
  fi
  if [ "$apply" = false ]; then
    echo "would remove $path ($reason)"
  elif git worktree remove "$path"; then
    echo "removed $path ($reason)"
    [ -z "$branch" ] ||
      { [ "$(git rev-parse "refs/heads/$branch")" = "$pr_head" ] && git branch -D -q "$branch"; }
  else
    echo "failed to remove $path"
    failed=1
  fi
done < <(git worktree list --porcelain | awk -v RS= '
  NR > 1 {
    match($0, /^worktree [^\n]+/); path = substr($0, 10, RLENGTH - 9)
    branch = ""
    if (match($0, /\nbranch refs\/heads\/[^\n]+/))
      branch = "branch:" substr($0, RSTART + 19, RLENGTH - 19)
    else
      branch = "detached"
    locked = $0 ~ /\nlocked([ \t]|$)/ ? "true" : "false"
    print path "\t" branch "\t" locked
  }')
[ "$apply" = true ] && git worktree prune -v
exit "$failed"
