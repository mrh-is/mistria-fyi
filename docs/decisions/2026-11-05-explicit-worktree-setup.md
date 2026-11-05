# Explicit worktree setup

## Context

`SessionStart`, `FileChanged`, `CwdChanged`, & manifest-edit hooks all ran
`scripts/setup-worktree.ts`, so opening a session or changing directories could install
dependencies. Overlapping triggers needed a lock, stale-owner recovery, debouncing, & a failure
marker. One failed install then left a marker that stopped every later session until someone ran a
manual repair, even a session that only reads (#461). The script had grown to 571 lines, and its
lock still couldn’t stop a race with an agent’s own pnpm command.

## Decision

No hook links files or installs dependencies. `node scripts/setup-worktree.ts` is the one explicit
command that prepares a new editing worktree, and `pnpm run worktree:new` calls it. Stale
dependencies surface through pnpm’s `verifyDepsBeforeRun: error`, and the fix is
`pnpm install --frozen-lockfile`. Equivalent-enough setups across machines & cloud environments are
the goal, not identical execution.

## Alternatives

1. **Keep `SessionStart` setup & drop only the mid-session hooks:** rejected; a read-only session
   would still install, and a failed install would still need a recovery path before any work.
2. **Keep a link-only `SessionStart` hook:** rejected; a session that needs links is an editing
   session, which runs setup anyway, so the hook would add a second path for no gain.

## Revisit if

Agents regularly edit before running setup despite the formatter hook’s error, or a harness gains a
reliable per-worktree creation hook that runs once, outside any session.
