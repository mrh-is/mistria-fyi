---
id: 2026-11-01-file-issues-by-default
status: current
summary:
  Agents file an issue for anything they find & don't fix, without asking, instead of offering to.
evidence:
  - AGENTS.md
  - https://github.com/mrh-is/mistria-fyi/issues/390
relationships: []
---

# File issues by default

## Context

The agent guide told agents to “offer to file” an issue for a repository bug they hit. In practice,
an agent that reran a flaky PWA test past a CI failure (#390) mentioned the flake only in its
session & asked whether to file it. The owner doesn’t read every session closely, so problems raised
only there get lost.

## Decision

Agents file an issue, without asking, for anything they find & don’t fix in the current change. That
covers a bug or stale doc noticed in passing, a flaky test or CI failure rerun past, & a deferred
review finding or follow-up. They search open issues first & add evidence to a match, and they name
each issue in their final report. A suggested session or task card doesn’t replace the issue.

## Alternatives

- **Keep offering to file.** Rejected: an offer only works if the owner reads it, which is the gap.
- **Collect findings in the PR body.** Rejected: PR bodies aren’t tracked work, & a closed PR hides
  them.

## Revisit if

Triage of agent-filed issues becomes a real cost: for example, most of them close as duplicates or
not planned.
