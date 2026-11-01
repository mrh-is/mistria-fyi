---
id: 2026-11-01-unordered-save-flag
status: current
summary: >-
  Progress history records when the last applied save's playtime couldn't be read, so edits made
  after it record no playtime & a disagreeing save asks.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/362
  - src/lib/engine/sync-apply.test.ts
  - src/lib/stores/user-state-provenance.test.ts
  - src/lib/stores/progress-storage.test.ts
relationships: []
---

# Record an unordered last save

## Context

A save whose playtime can’t be read leaves `lastSavePlaytime` at the previous save’s value, because
that value is the ordering baseline for the next save (`docs/sync.md` § Ordering without clocks).
Manual edits were stamped with the same value, so an edit made after the unordered save looked older
than it was. A later save at a higher playtime then removed it with “apply & tell” instead of asking
(#362).

## Decision

Progress history gains `lastSaveUnordered`, stored as `true` or left out, in storage version 7.
Applying a save with no readable playtime sets it; applying one with a readable playtime clears it.
While it’s set, edits & transfers record no playtime (`editPlaytime` in
`src/lib/engine/provenance.ts`), so a disagreeing save asks. The baseline itself is unchanged.

## Alternatives

- Clear `lastSavePlaytime` after an unordered save. Rejected: it would also drop the baseline that
  orders the next save, so an older save would no longer ask.
- Store a separate “edit stamp” playtime. Rejected: it duplicates the baseline for one boolean’s
  worth of information.
- Keep the flag in memory only. Rejected: the issue requires the state to survive a reload.

## Revisit if

- Saves gain a second ordering signal (a counter or timestamp) that makes playtime-less saves
  orderable.
- History grows other per-save metadata, which would justify grouping it into one “last save”
  record.
