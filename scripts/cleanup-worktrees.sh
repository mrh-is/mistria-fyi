#!/usr/bin/env bash
# Remove linked worktrees whose work is finished: clean, idle, & on a branch whose PR is merged or
# closed, or detached at a commit on a current remote branch. Previews by default; pass --apply to
# remove. A branch goes too only when its tip is the PR's head, so unpushed commits survive.
# Check idle local branches without a worktree, then prune missing worktree registrations.
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

# Refresh remote heads once before using them to authorize cleanup.
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

containing_remote() {
  git for-each-ref --contains="$1" --format='%(refname) %(symref)' "refs/remotes/$2/" |
    awk -v excluded="refs/remotes/$2/${3:-}" '
      !found && NF == 1 && $1 != excluded { sub(/^refs\/remotes\//, "", $1); print; found = 1 }
    '
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

latest_pr() {
  # gh can read stdin. A fork's PR can share the branch name.
  gh pr list --head "$1" --state all --limit 20 \
    --json state,headRefOid,isCrossRepository \
    --jq 'map(select(.isCrossRepository | not)) | .[0] // empty | "\(.state) \(.headRefOid)"' \
    </dev/null 2>/dev/null
}

load_branch_prs() {
  branch_prs_loaded=true
  local number tip state branch ref advertised_refs
  local fetch_refs=()
  local missing_refs=() merged_filters=()
  if ! branch_prs=$(gh api --paginate 'repos/{owner}/{repo}/pulls?state=all&sort=created&direction=desc&per_page=100' \
    --jq '.[] | select(.head.repo != null and .head.repo.id == .base.repo.id)
      | [.number, .head.sha, (if .state == "open" then "OPEN" elif .merged_at then "MERGED" else "CLOSED" end), .head.ref] | @tsv' \
    </dev/null 2>/dev/null); then
    branch_prs=
    echo "Couldn't verify PR history. Keeping standalone branches."
    return
  fi
  branch_prs_verified=true
  while read -r number tip state branch; do
    [ "$state" = MERGED ] || continue
    git cat-file -e "$tip^{commit}" 2>/dev/null || missing_refs+=("refs/pull/$number/head")
  done <<< "$branch_prs"
  # Some old PR refs are no longer served. One missing ref would make the whole fetch fail.
  if [ "${#missing_refs[@]}" -gt 0 ] &&
    advertised_refs=$(GIT_TERMINAL_PROMPT=0 git ls-remote origin "${missing_refs[@]}" </dev/null 2>/dev/null); then
    while read -r tip ref; do
      [ -z "$ref" ] || fetch_refs+=("$ref")
    done <<< "$advertised_refs"
  fi
  if [ "${#fetch_refs[@]}" -gt 0 ]; then
    GIT_TERMINAL_PROMPT=0 git fetch --quiet --no-tags --no-write-fetch-head origin \
      "${fetch_refs[@]}" </dev/null 2>/dev/null ||
      echo "Couldn't fetch all merged PR heads. Checking available commits."
  fi
  while read -r number tip state branch; do
    [ "$state" = MERGED ] || continue
    git cat-file -e "$tip^{commit}" 2>/dev/null && merged_filters+=("--merged=$tip")
  done <<< "$branch_prs"
  if [ "${#merged_filters[@]}" -gt 0 ]; then
    merged_branch_tips=$(git for-each-ref "${merged_filters[@]}" \
      --format='%(objectname)' refs/heads) || merged_branch_tips=
  fi
}

branch_kept() {
  [ "$(git config --bool --get "branch.$1.mistria-keep")" = true ]
}

while IFS=$'\t' read -r path branch_type locked; do
  [ -d "$path" ] || continue
  [ "$locked" != true ] || { echo "keep $path: locked"; continue; }
  branch=
  [ "$branch_type" = detached ] || branch=${branch_type#branch:}
  if [ -n "$branch" ] && branch_kept "$branch"; then
    echo "keep $path: branch $branch is marked to keep"
    continue
  fi
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
      remote=$(containing_remote "$head" "$remote_name")
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
    pr=$(latest_pr "$branch") || pr=
    read -r state pr_head <<< "$pr"
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
branch_refs=$(git for-each-ref \
  --format='%(refname) %(objectname) %(committerdate:unix) %(if)%(worktreepath)%(then)checked-out%(end)' \
  refs/heads) || exit 1
branch_prs_loaded=false
branch_prs_verified=false
merged_branch_tips=
while read -r ref head latest checked_out; do
  [ -n "$ref" ] && [ -z "$checked_out" ] || continue
  branch=${ref#refs/heads/}
  case "$branch" in main | next) continue ;; esac
  if branch_kept "$branch"; then
    echo "keep branch $branch: marked to keep"
    continue
  fi
  # A branch can have moved recently even when its tip commit is old.
  reflog_entry=$(git reflog show -1 --date=unix --format=%gD "$ref") || continue
  reflog_time=${reflog_entry##*@\{}
  reflog_time=${reflog_time%\}}
  if [[ "$reflog_time" =~ ^[0-9]+$ ]] && [ "$reflog_time" -gt "$latest" ]; then
    latest=$reflog_time
  fi
  [ $((now - latest)) -ge "$idle_seconds" ] || continue
  [ "$branch_prs_loaded" = true ] || load_branch_prs
  [ "$branch_prs_verified" = true ] || break
  pr=$(awk -v branch="$branch" '
    $4 == branch {
      if ($3 == "OPEN") { first = "OPEN"; exit }
      if (!first) first = $3 " " $2
    }
    END { print first }
  ' <<< "$branch_prs")
  read -r state pr_head <<< "$pr"
  reason=
  exclude_remote_branch=$branch
  case "$state" in
    OPEN) continue ;;
    MERGED | CLOSED)
      exclude_remote_branch=
      [ "$head" != "$pr_head" ] || reason="PR $state"
      ;;
  esac
  if [ -z "$reason" ]; then
    [ "$remote_check_complete" = true ] || refresh_remote_refs
    if grep -Fxq origin <<< "$refreshed_remotes"; then
      remote=$(containing_remote "$head" origin "$exclude_remote_branch") || remote=
      [ -z "$remote" ] || reason="reachable from $remote"
    fi
  fi
  if [ -z "$reason" ]; then
    if awk -v head="$head" '$2 == head && $3 != "OPEN" { found = 1 } END { exit !found }' <<< "$branch_prs"; then
      reason="matches a finished PR"
    elif grep -Fxq -- "$head" <<< "$merged_branch_tips"; then
      reason="contained in a merged PR"
    fi
  fi
  [ -n "$reason" ] || continue
  if [ "$apply" = false ]; then
    echo "would delete branch $branch ($reason)"
    continue
  fi
  # Refresh the checkout check after the remote and PR lookups. Require the verified tip inside Git's
  # ref transaction so another process moving the branch can't cause unverified work to be deleted.
  checkout=$(git for-each-ref --format='%(worktreepath)' "$ref") || { failed=1; continue; }
  if [ -n "$checkout" ]; then
    echo "keep branch $branch: checked out"
  elif git update-ref --no-deref -d "$ref" "$head"; then
    echo "deleted branch $branch ($reason)"
  else
    echo "failed to delete branch $branch"
    failed=1
  fi
done <<< "$branch_refs"
if [ "$apply" = true ]; then
  git worktree prune -v || failed=1
fi
exit "$failed"
