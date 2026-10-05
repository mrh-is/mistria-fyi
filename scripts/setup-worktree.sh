#!/usr/bin/env bash
# Sets up an existing linked worktree per AGENTS.md §1: symlinks the `.worktreeinclude` entries from
# the main checkout, then installs dependencies. `worktree:new` runs it after creating a worktree;
# run it directly inside a harness-created worktree (e.g. under `.claude/worktrees/`).
# Usage: pnpm run worktree:setup
set -euo pipefail
shopt -s nullglob

worktree_dir=$(git rev-parse --show-toplevel)
# `git worktree list` lists the main worktree first; strip the label rather than splitting on
# whitespace so paths containing spaces survive.
repo_root=$(git worktree list --porcelain | sed -n '1{s/^worktree //;p;q;}')

if [ "$worktree_dir" = "$repo_root" ]; then
  echo "error: $worktree_dir is the main checkout; run this inside a linked worktree." >&2
  exit 1
fi

while IFS= read -r pattern; do
  [ -z "$pattern" ] && continue
  if [[ "$pattern" == */ ]]; then
    src="$repo_root/${pattern%/}"
    dest="$worktree_dir/${pattern%/}"
    # Skip entries the harness already copied or a previous run already linked.
    if [ -e "$src" ] && [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
      ln -s "$src" "$dest"
    fi
  else
    for src in "$repo_root"/$pattern; do
      dest="$worktree_dir/$(basename "$src")"
      # Skip files the checkout already tracks (e.g. .env.example matches .env.*).
      [ -e "$dest" ] || [ -L "$dest" ] && continue
      ln -s "$src" "$dest"
    done
  fi
done <"$repo_root/.worktreeinclude"

(cd "$worktree_dir" && pnpm install --frozen-lockfile && pnpm run prepare)
