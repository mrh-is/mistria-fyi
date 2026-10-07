#!/usr/bin/env bash
# Fast-forward the local default branch to origin's. The Claude Code & Codex SessionStart hooks run
# this, as does the scheduled housekeeping job. It never fails its caller, and it writes only to
# stderr, because a SessionStart hook's stdout reaches the model's context.
set -uo pipefail
exec 1>&2

# Cloud sessions run in an ephemeral checkout whose local default branch nobody reads.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
export GIT_TERMINAL_PROMPT=0

default_branch=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null) ||
  default_branch=origin/main
default_branch=${default_branch#origin/}
remote_ref="refs/remotes/origin/$default_branch"

if ! git fetch --quiet origin "refs/heads/$default_branch:$remote_ref"; then
  printf 'refresh-default-branch: could not fetch origin/%s; leaving it as is.\n' "$default_branch"
  exit 0
fi

# Where is the default branch checked out, if anywhere?
checkout=
worktree_path=
while IFS= read -r line; do
  case "$line" in
    worktree\ *) worktree_path=${line#worktree } ;;
    "branch refs/heads/$default_branch") checkout=$worktree_path ;;
  esac
done < <(git worktree list --porcelain)

if [ -n "$checkout" ]; then
  # Git refuses when local changes conflict or history diverged; either way, leave it to a human.
  git -C "$checkout" merge --ff-only --quiet "$remote_ref" ||
    printf 'refresh-default-branch: could not fast-forward %s in %s.\n' "$default_branch" "$checkout"
elif local_oid=$(git rev-parse --verify --quiet "refs/heads/$default_branch"); then
  if git merge-base --is-ancestor "$local_oid" "$remote_ref"; then
    git update-ref "refs/heads/$default_branch" "$remote_ref" "$local_oid"
  else
    printf 'refresh-default-branch: local %s has diverged from origin; leaving it.\n' "$default_branch"
  fi
fi
exit 0
