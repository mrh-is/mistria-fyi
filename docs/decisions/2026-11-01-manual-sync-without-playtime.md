---
id: 2026-11-01-manual-sync-without-playtime
status: current
summary: >-
  Saves advance manual facts without playtime with a notice; backward changes still ask.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/310
  - src/lib/engine/sync-apply.test.ts
relationships: []
---

# Manual facts without playtime

## Context

The [sync apply rules](2026-10-21-sync-apply-rules.md) ask about every disagreement with a manual
edit that has no playtime. That includes a save finishing a quest the player obtained by hand,
although finishing it only adds progress. Issue
[#310](https://github.com/mrh-is/mistria-fyi/issues/310) explicitly authorizes advancing these facts
without a question. This is new maintainer direction; none of the earlier record’s listed revisit
conditions covers this change.

## Decision

A manual fact without playtime uses direction: forward progress applies & tells; backward progress
asks. “Apply & tell” matches the notice used when a newer save supersedes a stamped manual edit. The
rule applies even when the incoming save has no readable playtime, because forward progress doesn’t
undo the manual fact.

An applied difference records `save` as usual. A quest moving from obtained to completed retains
`obtainedSource: "manual"`. Manual facts with playtime keep their existing ordering, including
asking when the incoming save has no playtime. Farm, rollback, level-decrease, & dependent household
guardrails still apply. The storage format stays unchanged.

## Alternatives

Asking about every forward change adds questions that preserve no progress. Applying silently would
omit the notice used for other changes to manual facts. Reusing `add-if-default` would still ask
when a save finishes an obtained quest or raises a nonzero level. Storing a sentinel playtime would
also let saves lower manual facts without asking; a negative sentinel fails validation.

## Revisit if

A field’s forward ordering stops meaning more progress, or players need to distinguish automatic
advances from newer saves in sync notices.
