---
id: 2026-10-31-post-reviews-on-github
status: current
summary: >-
  A request to review is a request to post; every review is posted to its PR or issue by the agent
  that requested it.
evidence:
  - docs/agent-verification.md#review-records
relationships: []
---

# Post reviews on GitHub

## Context

Several agents asked to review a PR replied only in their session, leaving no record on GitHub. The
rule to post unprompted lived only in the owner’s personal overlay, which the
[review record format](2026-10-28-review-record-format.md) deliberately kept out of the repository.
Agents without the overlay, & review subagents, never saw it.

## Decision

Repository guidance now says a request to review is a request to post, in AGENTS.md &
agent-verification.md. The agent that requested a review posts it, including reviews from subagents,
other models, & review commands, and including reviews with no findings. Reviewer routing stays in
the personal overlay.

## Alternatives

Keeping the rule in the overlay alone already failed in practice. A hook that detects an unposted
review has no reliable signal for when a review has finished.

## Revisit if

A harness gains a reliable review-finished event that a hook could enforce, at which point the prose
can shrink to a pointer.
