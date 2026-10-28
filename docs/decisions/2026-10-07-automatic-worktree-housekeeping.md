---
id: 2026-10-07-automatic-worktree-housekeeping
status: needs-review
summary: >-
  A `SessionStart` hook in both Claude Code and Codex fast-forwards local `main`. It never fails the
  session and writes nothing to the model's context.; An opt-in macOS launchd agent (`pnpm run
  housekeeping:install`) runs hourly: refresh `main`, then apply the existing cleanup script with a
  two-hour idle window.; The cleanup script keeps any worktree that a running process uses as its
  working directory, and, given `--idle-minutes`, any worktree whose `HEAD` moved recently.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-07-automatic-worktree-housekeeping.md#decision
relationships: []
---

# Automatic worktree housekeeping

## Context

Every agent session creates a worktree & branch, and nothing removed them after their PRs merged.
Local `main` in the primary checkout also fell behind `origin/main`. Cleanup depended on the
maintainer noticing and running `pnpm run worktree:cleanup -- --apply`
([mrh-is/mistria-fyi-private#663](https://github.com/mrh-is/mistria-fyi-private/issues/663)).

## Decision

- A `SessionStart` hook in both Claude Code and Codex fast-forwards local `main`. It never fails the
  session and writes nothing to the model's context.
- An opt-in macOS launchd agent (`pnpm run housekeeping:install`) runs hourly: refresh `main`, then
  apply the existing cleanup script with a two-hour idle window.
- The cleanup script keeps any worktree that a running process uses as its working directory, and,
  given `--idle-minutes`, any worktree whose `HEAD` moved recently.

## Alternatives

- **Clean up when a session ends or is archived:** rejected. Claude Code has no archive hook,
  `SessionEnd` fires before the PR merges, and a hook in one harness misses the other's worktrees.
- **Run cleanup in the `SessionStart` hook:** rejected. It makes session startup wait on several
  GitHub API calls, and a schedule already covers it.
- **Idle guard based on the index or file modification times:** rejected. The script's own
  `git status` rewrites the index, and walking the worktree's files is slow with `node_modules`.

## Revisit if

The maintainer works on a non-macOS machine, a harness gains an archive or post-merge hook, or the
in-use guard keeps abandoned worktrees indefinitely (for example, terminal tabs left open in them).
