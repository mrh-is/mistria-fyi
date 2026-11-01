---
id: 2026-11-01-real-save-observations
status: current
summary: Pin private snapshots & record player-confirmed expectations independently of the importer.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/333
  - src/lib/engine/import-save.assets.test.ts
  - src/lib/engine/import-save.observations.ts
  - docs/save-import-verification.md
relationships: []
---

# Pin real-save observations

## Context

The independent save-import checks (#333) need expectations a player confirms in the game. An
autosave filename identifies a farm, but its bytes change as the player continues. The tracker’s
current game version also changes independently of those observations.

## Decision

Keep explicit observation records beside the existing real-save tests. Each record names a private
snapshot, its writing game version, & its SHA-256 digest. Each confirmed fact supplies its expected
value & the player’s verification source. Pending facts have no expected value & appear as skipped
tests.

The tests fail on changed snapshot bytes. They read the recorded version’s directory, independently
of the tracker’s current version. Raw saves remain private; permission to test them does not
authorize publication.

## Alternatives

Importer-generated snapshots would repeat the implementation’s assumptions, so they cannot serve as
independent observations. Using only a filename would let a later autosave inherit an older
observation silently. Requiring every fact before running any check would discard useful partial
verification, such as one confirmed spouse.

## Revisit if

Revisit the storage layout if contributors supply enough independently checked snapshots that
managing private version directories & observation records becomes cumbersome. A new fixture service
must preserve snapshot identity, independent evidence, & separate publication permission.
