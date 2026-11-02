---
id: 2026-11-02-friction-log
status: current
summary:
  Agents log small workarounds as comments on a monthly friction-log issue; only product bugs,
  blockers, & deferred review findings get their own issues.
evidence:
  - AGENTS.md
  - docs/agent-workflow.md#friction-log
  - https://github.com/mrh-is/mistria-fyi/issues/420
relationships: []
---

# Log small frictions in one issue

## Context

[File issues by default](2026-11-01-file-issues-by-default.md) fixed one problem: findings mentioned
only in a session got lost. It created another. Agents filed 84 issues from Oct 25 to Nov 1, and
about half were about guards, hooks, & CI edge cases rather than the product. Triage became a real
cost, which is that record’s “Revisit if” condition.

The owner still wants the small frictions collected. A friction that one agent works around in
silence may be one that every agent works around, and that pattern only shows up when the
workarounds sit side by side.

## Decision

- Agents still file their own issues for product bugs, blockers, & deferred review findings.
- Every other workaround becomes one comment on the pinned “Agent friction log” issue, which covers
  a month. Repeats are logged again, because the count is the signal.
- At the end of the month, the owner (or an agent the owner asks) tallies the comments. Anything
  logged about three times becomes an issue, and a new log replaces the old one.

## Alternatives

- **Keep filing everything.** Rejected: the volume buried the product work & made the issue list
  hard to read.
- **Mention frictions only in the final report.** Rejected: that’s the lost-in-a-session problem the
  earlier record fixed.
- **One log issue forever.** Rejected: GitHub collapses the middle of long threads, so old entries
  would disappear from view.

## Revisit if

A monthly tally finds a friction that blocked real work but wasn’t promoted in time, or the owner
stops running the tallies.
