---
id: 2026-10-29-household-save-facts
status: current
summary: >-
  Explicit relationship statuses & the Mistmare reveal fact support complete extraction; household
  sync decisions preserve dependent facts together.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/277
  - src/lib/engine/import-save.assets.test.ts
  - src/lib/engine/sync-apply.test.ts
  - src/lib/stores/sync-household-storage.test.ts
relationships: []
---

# Household save facts

## Context

The relationship-facts revisit condition in
[save extraction completeness](2026-10-20-save-extraction-completeness.md#revisit-if) & the
household-extraction condition in [sync apply rules](2026-10-21-sync-apply-rules.md#revisit-if) now
hold. Both full v1.0.8 saves have an explicit status for every dateable villager & an explicit
Mistmare reveal fact. The [save format reference](../save-file-format.md#household-fields) records
the source evidence & the remaining child-choice limit.

## Decision

Read explicit statuses, including null, as complete only when every dateable villager is accounted
for. Read the explicit Mistmare reveal fact with the existing appearance lists, avoiding a new scene
catalog or generated-data contract. Retain partial positive scene & legacy flag evidence for older
or damaged inputs.

Compare household facts & pregnancy quests through the existing policy table. Settle their
differences together under the strictest dependent policy, preserving manual facts without
constructing competing partners or applying an unreported engagement cascade. A kept household
difference reopens when any dependent save value changes.

A childless save cannot declare a permanent refusal. Only readable positive evidence makes child
choice complete. Manual import remains additive, and backup restore remains replacement. Keep
serialization version five because all progress fields, provenance keys, & resolution values already
exist in that format; compatibility tests round-trip synced facts & kept resolutions from every
historical fixture.

## Alternatives

An entire scene catalog would add pipeline & shared-contract scope without improving the explicit
reveal fact. Independent household answers could combine incompatible spouses or apply a child
choice to the wrong household. Running the additive import merge during sync would bypass
provenance, removals, & kept resolutions.

## Revisit if

A new game version changes the status or reveal-fact schema, adds divorce or a durable refusal, or
requires per-villager completeness so unaffected relationships can change while one status is
unreadable.
