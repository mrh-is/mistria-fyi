---
id: 2026-10-29-mid-session-setup-hooks
status: current
summary: >-
  Both clients share synchronous setup & formatting for shell calls & root manifest edits. Claude
  Code also watches manifest & directory changes. Automatic setup failures require explicit repair.
evidence:
  - docs/agent-reference.md
  - scripts/agent-tool-hook.ts
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
unverified. The owner then requested the same tool handler for both clients, a smaller probe scope,
& support for ordinary compound pnpm commands. Those instructions replace the initial Codex-only
adapter & blanket compound-command restriction.

## Decision

- **Claude Code gets both hooks.** `.claude/settings.json` runs `scripts/setup-worktree.ts` with
  `--file-changed` (manifest watch) & `--cwd-changed` (move into another checkout). The Claude-only
  events remain specific to Claude Code.
- **Both clients share `agent-tool-hook.ts`.** It repairs setup before a shell command & before
  post-tool formatting. Claude’s shell-failure event & additional edit tools use the same handler.
  Matching command hooks run concurrently; list order cannot establish the required sequence.
- **Ordinary edits stay cheap.** Probe around shell calls & root manifest edits only. Formatting
  still runs after ordinary edits, without the additional freshness probe. A nested fixture manifest
  or a filename in patch content does not trigger setup.
- **Directories must be explicit.** Validate the payload directory against the script’s Git common
  directory. Support literal `cd` & pnpm directory options. Compound commands & pipes remain
  allowed; reject a later pnpm segment only after a Git operation that can replace manifests. An
  unresolved `cd` without a later pnpm segment stops directory resolution & preserves the last known
  formatter directory, so ordinary navigation stays available. Dynamic pnpm directory options remain
  unsupported. Each checkout in a compound call owns a separate formatter snapshot.
- **Failures reach the agent.** Tool handlers exit 2 with diagnostics in both clients. Claude’s
  native file & directory events retain their advisory exit 0 & `systemMessage` behavior. Both stop
  automatic installation attempts after a failure.
- **Setups serialize** on a lock directory in the checkout’s git directory. A successful manual
  `--repair` forces install & `prepare` before clearing the failure marker, including in the main
  checkout. This avoids treating an install that succeeded before a failed `prepare` as repaired.

## Alternatives

- **Codex post-tool repair alone:** cannot repair a pnpm command that already failed.
- **Background setup:** cannot hold a command or formatter until dependencies are ready.
- **HEAD-only caching:** misses uncommitted manifest changes. Probe on each call first.
- **Automatic approval hooks:** do not repair dependencies; approval policy remains separate.
- **Probe after every edit:** adds about 0.65 seconds per call even when dependency manifests did
  not change. Restrict the extra probe to shell calls & manifest targets instead.
- **Reject every compound pnpm command:** breaks the documented lint chain & output pipes without
  protecting against an earlier manifest change.

## Revisit if

- Codex ships file-change or directory-change events.
- An installed Codex client still omits per-call directories. CLI 0.165.0 omits them; the supported
  fallback is a literal command directory, & newer upstream code supplies the resolved `cwd`.
- Ordinary source edits still reach stale dependencies often enough to justify an additional probe
  or a validated manifest-content cache.
