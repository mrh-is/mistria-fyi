# No migration for pre-rename progress

## Context

[The canonical domain terms decision](2026-10-06-canonical-domain-terms.md) renamed persisted keys
(`completed.mines` → `completed.mineFloor` & `completed.spells`, `completed.villagerLevels` →
`completed.heartLevels`) without a compatibility layer, on the premise that there were no users.
Issue #643 found that premise false: #351 came from a returning player with real progress, and
production quarantines any blob written before the rename. That record's “Revisit if” condition (the
app gains users with saved state) now holds.

## Decision

- **Accept a one-time break.** Progress saved before the rename is not migrated; it fails strict
  validation and is quarantined, as it is today.
- **Recovery is a save re-import.** The affected players (the maintainer & one tester) re-import
  their game save files, which rebuilds the tracked progress in a few seconds. Like a reset or
  backup restore, a save import unblocks persistence once the unreadable blob is safely in the
  quarantine key, so the rebuilt progress survives a reload.
- **Quarantine stays retrievable.** “Download unreadable data” on the Backup & Restore card exposes
  the quarantined blob, so any future format break or corruption leaves players a copy of their
  data.

## Alternatives

- Migrate the three renamed keys in `deserialize`: rejected. It's roughly 15 lines, but with two
  affected players who can re-import their saves, a legacy reader isn't worth carrying and later
  deleting.

## Revisit if

A future format break affects players who can't rebuild their progress from a save file (for
example, progress the save import doesn't cover), or the player count grows past what direct contact
can reach. Either case calls for a versioned migration instead.
