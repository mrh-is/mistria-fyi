---
id: 2026-10-31-issue-blocker-relationships
status: current
summary: >-
  Issue-to-issue dependencies use GitHub “blocked by” relationships; `status: blocked` covers only
  blockers outside the tracker.
evidence:
  - docs/agent-workflow.md#blockers
relationships: []
---

# Issue blocker relationships

## Context

`status: blocked` covered every kind of blocker. When the blocker was another issue, the label
didn’t say which one, and nothing removed it when that issue closed. GitHub’s issue dependencies,
which `gh` 2.103 reads & writes (`--add-blocked-by`, `--json blockedBy`), record the blocker itself.

## Decision

Record a dependency on another issue as a “blocked by” relationship. An issue is blocked while any
issue blocking it is open. Keep `status: blocked` for blockers outside the tracker, such as time,
hardware, or a third party, with the blocker named in a comment.

## Alternatives

Keeping the label for everything leaves dependencies implicit & stale. Retiring the label entirely
leaves no marker for external blockers, which have no issue to link.

## Revisit if

GitHub drops issue dependencies or `gh` stops exposing them, or a later tool needs blocker state
that relationships can’t express.
