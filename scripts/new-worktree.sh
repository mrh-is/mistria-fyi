#!/usr/bin/env bash
# Creates and sets up an isolated agent worktree per AGENTS.md §1.
# Usage: pnpm run worktree:new <issue-number>-<short-description> [starting-branch]
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "Usage: pnpm run worktree:new <issue-number>-<short-description> [starting-branch]" >&2
  exit 1
fi

slug=$1
starting_branch=${2:-main}
git check-ref-format "refs/heads/$starting_branch" >/dev/null || {
  echo "error: invalid starting branch: $starting_branch" >&2
  exit 1
}
if [[ ! $slug =~ ^[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "error: slug \"$slug\" must look like <issue-number>-<short-description> (lowercase, digits, hyphens)." >&2
  exit 1
fi
# Always resolve to the main checkout, even when invoked from inside another
# worktree. `git worktree list` lists the main worktree first; strip the label rather than
# splitting on whitespace so paths containing spaces survive.
repo_root=$(git worktree list --porcelain | sed -n '1{s/^worktree //;p;q;}')
worktree_dir="$repo_root/.worktrees/$slug"

git -C "$repo_root" check-ignore -q .worktrees/placeholder || {
  echo "error: .worktrees/ is not gitignored; refusing to create a worktree." >&2
  exit 1
}

if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$slug"; then
  echo "error: branch $slug already exists." >&2
  exit 1
fi
if [ -e "$worktree_dir" ]; then
  echo "error: $worktree_dir already exists." >&2
  exit 1
fi

# Refresh the starting branch before branching, without switching or modifying the main checkout.
# An explicit refspec also refreshes the remote-tracking ref in narrow-fetch clones.
git -C "$repo_root" fetch origin "refs/heads/$starting_branch:refs/remotes/origin/$starting_branch"

# Remove a half-built worktree & branch if any later step fails.
created=false
cleanup() {
  local rc=$?
  if [ "$rc" -ne 0 ] && [ "$created" = true ]; then
    echo "error: setup failed; removing $worktree_dir and branch $slug." >&2
    git -C "$repo_root" worktree remove --force "$worktree_dir" >/dev/null 2>&1 || true
    git -C "$repo_root" branch -D "$slug" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

git -C "$repo_root" worktree add "$worktree_dir" -b "$slug" --no-track "origin/$starting_branch"
created=true

(cd "$worktree_dir" && bash scripts/setup-worktree.sh)

printf '\nWorktree ready: %s (branch %s)\n' "$worktree_dir" "$slug"
printf 'cd %s\n' "$worktree_dir"
