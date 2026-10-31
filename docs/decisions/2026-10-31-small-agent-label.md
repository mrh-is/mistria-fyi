---
id: 2026-10-31-small-agent-label
status: current
summary: >-
  Claude & Codex label small, fully specified issues `delegate: small agent` so the owner can assign
  them to Antigravity or Copilot.
evidence:
  - docs/agent-workflow.md#small-agent-tasks
relationships: []
---

# Small-agent label

## Context

The owner assigns some work to Antigravity & Copilot, which handle narrow, explicit tasks well but
shouldn’t make judgment calls. Nothing marked which issues fit, so finding them meant rereading the
backlog.

## Decision

Claude & Codex add `delegate: small agent` to issues they file or triage that name their files, give
a verifying command, say when to stop, & avoid high-risk surfaces. A delegable piece of a larger
issue becomes a labeled sub-issue. The label describes fit; `agent:*` still marks ownership.

## Alternatives

Labeling the parent issue doesn’t tell a small agent which part to do or where to stop. Reusing an
`agent:*` label would conflate fit with active ownership, which those labels already mean.

## Revisit if

The small agents start failing labeled tasks often enough that the conditions need tightening, or
the owner stops delegating to them.
