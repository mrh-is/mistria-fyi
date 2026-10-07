#!/usr/bin/env bash

# Remove merged local branches and clean worktrees, including detached worktrees.
# Run without arguments to preview the changes.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/cleanup-merged-worktrees.sh [--apply]

Preview or remove local branches and detached worktrees whose tip is reachable from the freshly
fetched origin default branch, or is confirmed in a merged GitHub pull request. Associated
worktrees are removed first, but only when clean and unlocked.

Without --apply, the script only reports what it would remove. It never removes branches with an
open pull request, branches with local commits after the merged pull request, dirty worktrees, or
worktrees that Git refuses to remove. The invoking and primary worktrees are always preserved.
If refreshing the default branch fails, only GitHub PR evidence is used.
EOF
}

apply=false

case "${1:-}" in
  "") ;;
  --apply) apply=true ;;
  -h | --help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v gh >/dev/null; then
  printf 'gh is required to confirm pull-request merge status.\n' >&2
  exit 1
fi

repository_root=$(git rev-parse --show-toplevel)
cd "$repository_root"
current_branch=$(git branch --show-current)
default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
default_branch=${default_branch#origin/}
primary_worktree=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
ancestry_available=false
if [[ -n $default_branch ]]; then
  if git fetch --quiet origin "refs/heads/$default_branch:refs/remotes/origin/$default_branch"; then
    ancestry_available=true
  else
    printf 'Warning: could not refresh origin/%s; using only confirmed PR evidence.\n' "$default_branch" >&2
  fi
fi

worktree_is_safe() {
  local target=$1
  local status worktree_path= line
  if [[ $target == "$repository_root" || $target == "$primary_worktree" ]]; then
    printf 'Keeping worktree %s: it is the invoking or primary worktree.\n' "$target"
    return 1
  fi
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) worktree_path=${line#worktree } ;;
      locked*)
        if [[ $worktree_path == "$target" ]]; then
          printf 'Keeping worktree %s: it is locked (%s).\n' "$target" "$line"
          return 1
        fi
        ;;
    esac
  done < <(git worktree list --porcelain)
  if ! status=$(git -C "$target" status --porcelain); then
    printf 'Keeping worktree %s: could not inspect its status.\n' "$target" >&2
    return 1
  fi
  if [[ -n $status ]]; then
    printf 'Keeping worktree %s: it has uncommitted changes.\n' "$target"
    return 1
  fi
}

tip_is_in_default_branch() {
  [[ $ancestry_available == true ]] && git merge-base --is-ancestor "$1" "refs/remotes/origin/$default_branch"
}

commit_has_no_open_pr() {
  local associated_prs pr_number pr_state pr_branch open_pr
  if ! associated_prs=$(gh api "repos/{owner}/{repo}/commits/$1/pulls" --paginate \
    --jq '.[] | [.number, (if .merged_at != null then "merged" else .state end), .head.ref] | @tsv'); then
    printf 'Skipping %s: GitHub could not confirm its open pull requests.\n' "$branch" >&2
    return 1
  fi
  while IFS=$'\t' read -r pr_number pr_state pr_branch; do
    if [[ $pr_state == open ]]; then
      printf 'Keeping %s: its commit is associated with open pull request #%s.\n' "$branch" "$pr_number" >&2
      return 1
    fi
    [[ $pr_state == merged ]] || continue
    if ! open_pr=$(gh pr list --head "$pr_branch" --state open --limit 1 --json number --jq '.[].number'); then
      printf 'Skipping %s: GitHub could not confirm its parent branch open pull requests.\n' "$branch" >&2
      return 1
    fi
    if [[ -n $open_pr ]]; then
      printf 'Keeping %s: parent branch %s has open pull request #%s.\n' "$branch" "$pr_branch" "$open_pr" >&2
      return 1
    fi
  done <<< "$associated_prs"
  return 0
}

worktree_for_branch() {
  local target_branch=$1
  local worktree_path=
  local worktree_branch=

  while IFS= read -r line; do
    case "$line" in
    worktree\ *) worktree_path=${line#worktree } ;;
    branch\ refs/heads/*)
      worktree_branch=${line#branch refs/heads/}
      if [[ $worktree_branch == "$target_branch" ]]; then
        printf '%s\n' "$worktree_path"
        return 0
      fi
      ;;
    esac
  done < <(git worktree list --porcelain)
}

merged_pr_for_commit() {
  local commit=$1
  local associated_prs pr_number pr_state pr_branch pr_commits open_pr

  if ! associated_prs=$(gh api "repos/{owner}/{repo}/commits/$commit/pulls" --paginate \
    --jq '.[] | [.number, (if .merged_at != null then "merged" else .state end), .head.ref] | @tsv'); then
    return 1
  fi

  while IFS=$'\t' read -r pr_number pr_state pr_branch; do
    if [[ $pr_state == open ]]; then
      printf 'Keeping %s: its commit is associated with open pull request #%s.\n' "$branch" "$pr_number" >&2
      return 2
    fi
  done <<< "$associated_prs"

  # Commit associations can include PRs that merely have this commit in their base history.
  # Require membership in the PR's actual commit list before accepting a merged association.
  while IFS=$'\t' read -r pr_number pr_state pr_branch; do
    [[ -n $pr_number ]] || continue
    [[ $pr_state == merged ]] || continue
    if ! pr_commits=$(gh api "repos/{owner}/{repo}/pulls/$pr_number/commits" --paginate --jq '.[].sha'); then
      return 1
    fi
    if ! grep -Fxq "$commit" <<< "$pr_commits"; then
      continue
    fi
    if ! open_pr=$(gh pr list --head "$pr_branch" --state open --limit 1 --json number --jq '.[].number'); then
      return 1
    fi
    if [[ -n $open_pr ]]; then
      printf 'Keeping %s: parent branch %s has open pull request #%s.\n' "$branch" "$pr_branch" "$open_pr" >&2
      return 2
    fi
    printf '%s\n' "$pr_number"
    return 0
  done <<< "$associated_prs"
}

for branch in $(git for-each-ref --format='%(refname:short)' refs/heads); do
  if [[ $branch == "$current_branch" ]]; then
    printf 'Skipping current branch: %s\n' "$branch"
    continue
  fi
  if [[ -n $default_branch ]] && [[ $branch == "$default_branch" ]]; then
    printf 'Skipping default branch: %s\n' "$branch"
    continue
  fi

  head_oid=$(git rev-parse "$branch")
  worktree_path=$(worktree_for_branch "$branch" || true)
  if [[ -n $worktree_path ]] && ! worktree_is_safe "$worktree_path"; then
    continue
  fi
  if ! open_pr=$(gh pr list --head "$branch" --state open --limit 1 --json number --jq '.[].number' 2>/dev/null); then
    printf 'Skipping %s: GitHub could not confirm whether it has an open pull request.\n' "$branch" >&2
    continue
  fi
  if [[ -n $open_pr ]]; then
    printf 'Keeping %s: it has open pull request #%s.\n' "$branch" "$open_pr"
    continue
  fi

  reason=
  if tip_is_in_default_branch "$head_oid"; then
    if ! commit_has_no_open_pr "$head_oid"; then
      continue
    fi
    reason="reachable from origin/$default_branch"
  else
    if ! merged_pr=$(gh pr list --head "$branch" --state merged --limit 100 --json number,headRefOid --jq ".[] | select(.headRefOid == \"$head_oid\") | .number" 2>/dev/null); then
      printf 'Skipping %s: GitHub could not confirm its merge status.\n' "$branch" >&2
      continue
    fi

    if [[ -z $merged_pr ]]; then
      if merged_pr=$(merged_pr_for_commit "$head_oid"); then
        if [[ -z $merged_pr ]]; then
          printf 'Keeping %s: its current commit has no merged pull request.\n' "$branch"
          continue
        fi
      else
        lookup_status=$?
        if [[ $lookup_status != 2 ]]; then
          printf 'Skipping %s: GitHub could not confirm its merge status.\n' "$branch" >&2
        fi
        continue
      fi
    fi
    reason="merged PR #$merged_pr"
  fi

  if [[ $apply == false ]]; then
    if [[ -n $worktree_path ]]; then
      printf 'Would remove worktree %s and branch %s (%s).\n' "$worktree_path" "$branch" "$reason"
    else
      printf 'Would delete branch %s (%s).\n' "$branch" "$reason"
    fi
    continue
  fi

  if [[ -n $worktree_path ]]; then
    if ! git worktree remove "$worktree_path"; then
      printf 'Keeping %s: Git refused to remove worktree %s.\n' "$branch" "$worktree_path" >&2
      continue
    fi
  fi

  git branch -D "$branch"
  printf 'Removed branch %s (%s).\n' "$branch" "$reason"
done

# Detached worktrees have no refs/heads entry, so the branch loop never sees them.
while IFS= read -r line; do
  case "$line" in
    worktree\ *) worktree_path=${line#worktree } ;;
    HEAD\ *) head_oid=${line#HEAD } ;;
    detached)
      branch="detached worktree $worktree_path"
      if ! worktree_is_safe "$worktree_path"; then
        continue
      fi
      if tip_is_in_default_branch "$head_oid"; then
        if ! commit_has_no_open_pr "$head_oid"; then
          continue
        fi
        reason="reachable from origin/$default_branch"
      else
        if merged_pr=$(merged_pr_for_commit "$head_oid"); then
          if [[ -z $merged_pr ]]; then
            printf 'Keeping %s: its current commit has no merged pull request.\n' "$branch"
            continue
          fi
          reason="merged PR #$merged_pr"
        else
          lookup_status=$?
          if [[ $lookup_status != 2 ]]; then
            printf 'Skipping %s: GitHub could not confirm its merge status.\n' "$branch" >&2
          fi
          continue
        fi
      fi
      if [[ $apply == false ]]; then
        printf 'Would remove detached worktree %s (%s).\n' "$worktree_path" "$reason"
      elif git worktree remove "$worktree_path"; then
        printf 'Removed detached worktree %s (%s).\n' "$worktree_path" "$reason"
      else
        printf 'Keeping detached worktree %s: Git refused to remove it.\n' "$worktree_path" >&2
      fi
      ;;
  esac
done < <(git worktree list --porcelain)
