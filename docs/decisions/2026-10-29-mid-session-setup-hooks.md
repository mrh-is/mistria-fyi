---
id: 2026-10-29-mid-session-setup-hooks
status: current
summary: >-
  Claude Code watches manifest & directory changes; Codex checks setup synchronously before tools &
  before post-tool formatting. Automatic setup failures require an explicitly authorized repair.
evidence:
  - docs/agent-reference.md
  - scripts/setup-worktree.ts
  - https://github.com/mrh-is/mistria-fyi/issues/199
  - https://github.com/mrh-is/mistria-fyi/pull/288
relationships: []
---

# Mid-session setup hooks

## Context

Session-start setup (#195, #198) covers the state a session begins with. A lockfile-changing merge
mid-session, or a move into a fresh worktree, still leaves the next pnpm command failing with
`ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` ([#199](https://github.com/mrh-is/mistria-fyi/issues/199)). Claude
Code has `FileChanged` & `CwdChanged` events for exactly this; Codex documents neither. The user
requested Codex support in the same PR on October 30. Source inspection & payload fixtures now
address the original directory-validation revisit condition; live hook activation remains
unverified.

## Decision

- **Claude Code gets both hooks.** `.claude/settings.json` runs `scripts/setup-worktree.ts` with
  `--file-changed` (manifest watch) & `--cwd-changed` (move into another checkout). The Claude-only
  events remain specific to Claude Code.
- **Codex checks synchronously at tool boundaries.** Its `PreToolUse` handler repairs the target
  before a shell command. Its `PostToolUse` handler repairs before formatting, so a manifest patch
  or completed merge cannot start the formatter with stale dependencies.
- **Setup & formatting share one handler.** Matching command hooks run concurrently; list order
  cannot establish the required sequence.
- **Directories must be explicit.** Validate the payload directory against the script’s Git common
  directory. Support literal leading `cd` & pnpm directory options; reject dynamic paths & combined
  pnpm commands instead of guessing or rewriting the authorized command.
- **Failures reach the agent.** Codex exits 2 with diagnostics. Claude events retain their advisory
  exit 0 & `systemMessage` behavior. Both stop automatic installation attempts after a failure.
- **Setups serialize** on a lock directory in the checkout’s git directory. A successful manual
  `--repair` forces install & `prepare` before clearing the failure marker, including in the main
  checkout. This avoids treating an install that succeeded before a failed `prepare` as repaired.

## Alternatives

- **Codex post-tool repair alone:** cannot repair a pnpm command that already failed.
- **Background setup:** cannot hold a command or formatter until dependencies are ready.
- **HEAD-only caching:** misses uncommitted manifest changes. Probe on each call first.
- **Automatic approval hooks:** do not repair dependencies; approval policy remains separate.
- **Claude `PreToolUse` check on every shell call:** pays a pnpm probe per command to cover what the
  file watcher already catches.

## Revisit if

- Codex ships file-change or directory-change events.
- An installed Codex client still omits per-call directories. CLI 0.165.0 omits them; the supported
  fallback is a literal command directory, & newer upstream code supplies the resolved `cwd`.
- Agents repeatedly hit stale-dependency errors despite the hooks, which would favor a synchronous
  pre-command check in both clients.
