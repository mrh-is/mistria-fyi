---
id: 2026-10-13-agent-guidance-layers
status: amended
summary: >-
  Shared review finding IDs & resolution semantics now live in the repository verification guide.
evidence:
  - docs/decisions/2026-10-28-review-record-format.md
  - docs/agent-verification.md
relationships:
  - type: amended-by
    target: 2026-10-28-review-record-format
    scope: partial
    portion: >-
      Only the statement that review records leave the repository. Shared record semantics are now
      repository guidance; posting & routing stay personal.
    evidence:
      - docs/decisions/2026-10-28-review-record-format.md
      - docs/agent-verification.md
---

# Agent guidance layers

## Context

The repository went public on 2026-10-12 and has outside contributors who run their own agents. Its
agent guidance mixed MFG’s rules with the maintainer’s personal workflow: issue claiming labels,
cross-agent Codex review, mandatory worktrees, session-economy stops, and a delegation guide for the
maintainer’s own subscription agents. Meanwhile several MFG rules (pipeline throw-not-fallback, path
APIs, no-compatibility-shims, the visual direction) lived only in the maintainer’s Claude memory, so
Codex and contributors never saw them (#55).

## Decision

Agent guidance has four layers, placed by who would be wrong to follow a rule:

- **Repo** (anyone, any agent, this repo): `AGENTS.md`, `docs/`, and the shared `.claude/` &
  `.codex/` config. It holds MFG’s facts and hard rules.
- **Personal** (the maintainer, any agent, any repo) and **Harness** (the maintainer, one tool):
  outside this repo, in the maintainer’s dotfiles.
- **Overlay** (the maintainer, any agent, this repo): outside this repo; a user-level session-start
  hook injects it when the remote matches.

Maintainer process is split by enforcement. What CI checks (attribution trailers, the `Agent:` line,
the PR `agent:*` label, guarded paths) stays a repo rule. Unenforced process (issue claiming, the
cross-agent review requirement, mandatory worktrees, session economy, review records, handoffs,
model routing) leaves the repo. Stop & report on tooling failures stays repo-wide, per
[its record](2026-10-12-stop-on-local-tooling-failures.md). The repo no longer sets Codex’s
`approvals_reviewer`, so each contributor’s own preference applies, extending
[codex-model-preferences](2026-10-07-codex-model-preferences.md).

## Alternatives

- **Keep everything repo-wide:** rejected; contributors’ agents would follow labels they can’t
  apply, reviews that need the maintainer’s Codex subscription, and a fleet they don’t have.
- **`CLAUDE.local.md` for the maintainer layer:** rejected; it is Claude-only and exists only in the
  worktree where it was created.
- **`AGENTS.override.md`:** rejected; Codex uses it instead of `AGENTS.md`, not in addition to it.
- **Leave MFG rules in Claude memory:** rejected; memory is machine-local and Claude-only.

## Revisit if

A second maintainer joins and needs the same overlay (then it may belong in the repo as an opt-in
guide); contributors repeatedly miss a rule that now lives only in the overlay; or a harness gains a
native per-repo personal instruction layer that both Claude Code and Codex read.
