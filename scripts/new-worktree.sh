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

# Branch from the freshest origin/main, not whatever the main checkout has checked out.
git -C "$repo_root" fetch origin main

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

git -C "$repo_root" worktree add "$worktree_dir" -b "$slug" --no-track origin/main
created=true

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
