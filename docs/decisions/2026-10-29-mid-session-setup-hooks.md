---
id: 2026-10-29-mid-session-setup-hooks
status: current
summary: >-
  Claude Code keeps worktree setup current mid-session with FileChanged & CwdChanged hooks; Codex
  has no equivalent event, so it keeps session-start setup & a deferred PreToolUse alternative.
evidence:
  - docs/agent-reference.md
  - scripts/setup-worktree.ts
  - https://github.com/mrh-is/mistria-fyi/issues/199
  - https://github.com/mrh-is/mistria-fyi/pull/288
relationships: []
---

# Mid-session setup hooks are Claude-only

## Context

Session-start setup (#195, #198) covers the state a session begins with. A lockfile-changing merge
mid-session, or a move into a fresh worktree, still leaves the next pnpm command failing with
`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` ([#199](https://github.com/mrh-is/mistria-fyi/issues/199)). Claude
Code has `FileChanged` & `CwdChanged` events for exactly this; Codex documents neither.

## Decision

- **Claude Code gets both hooks.** `.claude/settings.json` runs `scripts/setup-worktree.ts` with
  `--file-changed` (manifest watch) & `--cwd-changed` (move into another checkout). The Claude-only
  asymmetry with `.codex/hooks.json` is deliberate, not drift.
- **Codex keeps session-start setup** plus the preauthorized `pnpm install --frozen-lockfile`.
- **These events never block.** Hooks exit 0 & report through `systemMessage`; the agent learns of a
  failure from the next pnpm command’s own error.
- **Setups serialize** on a lock directory in the checkout’s git directory.

## Alternatives

- **Codex synchronous `PreToolUse` on `Bash`:** deferred. Its payload & per-call directory handling
  are unvalidated, a compound command such as `git pull && pnpm exec …` runs the hook before the
  pull, & new hooks need trust review. Setup would also have to be sequenced with the post-tool
  formatter, which runs concurrently with any other matching hook.
- **Codex `PostToolUse` eager repair:** cannot repair a pnpm command that already failed.
- **Claude `PreToolUse` check on every shell call:** pays a pnpm probe per command to cover what the
  file watcher already catches.

## Revisit if

- Codex ships file-change or directory-change events.
- A validated Codex `PreToolUse` payload shows a reliable per-call directory.
- Agents repeatedly hit stale-dependency errors despite the hooks, which would favor a synchronous
  pre-command check in both clients.
