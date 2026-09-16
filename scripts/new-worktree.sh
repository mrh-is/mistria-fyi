#!/usr/bin/env bash
# Creates and sets up an isolated agent worktree per AGENTS.md §1.
# Usage: pnpm run worktree:new <issue-number>-<short-description>
set -euo pipefail
shopt -s nullglob

if [ $# -ne 1 ]; then
  echo "Usage: pnpm run worktree:new <issue-number>-<short-description>" >&2
  exit 1
fi

slug=$1
# Always resolve to the main checkout, even when invoked from inside another
# worktree — `git worktree list` lists the main worktree first.
repo_root=$(git worktree list --porcelain | awk '/^worktree /{print $2; exit}')
worktree_dir="$repo_root/.worktrees/$slug"

git -C "$repo_root" check-ignore -q .worktrees/placeholder || {
  echo "error: .worktrees/ is not gitignored; refusing to create a worktree." >&2
  exit 1
}

git -C "$repo_root" worktree add "$worktree_dir" -b "$slug"

while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  if [[ "$pattern" == */ ]]; then
    src="$repo_root/${pattern%/}"
    [ -e "$src" ] && ln -s "$src" "$worktree_dir/${pattern%/}"
  else
    for src in "$repo_root"/$pattern; do
      dest="$worktree_dir/$(basename "$src")"
      # Skip files the checkout already tracks (e.g. .env.example matches .env.*).
      [ -e "$dest" ] && continue
      ln -s "$src" "$dest"
    done
  fi
done <"$repo_root/.worktreeinclude"

(cd "$worktree_dir" && pnpm install --frozen-lockfile && pnpm run prepare)

printf '\nWorktree ready: %s (branch %s)\n' "$worktree_dir" "$slug"
printf 'cd %s\n' "$worktree_dir"
