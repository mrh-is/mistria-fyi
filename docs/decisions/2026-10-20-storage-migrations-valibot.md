---
id: 2026-10-20-storage-migrations-valibot
status: needs-review
summary: >-
  Historical scope: Storage migrations on Valibot. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-20-storage-migrations-valibot.md#decision
relationships: []
---

# Storage migrations on Valibot

## Context

The store accepted exactly one blob version. Any other value, older or newer, was quarantined, so a
format change would block every player's progress until an explicit replace, and a stale tab or old
build would treat a newer build's data as corrupt. Validation was a hand-rolled set of type guards
with two modes threaded through every check, and hydration silently dropped every ID that tracker
data no longer listed, so a game update renaming an ID erased that progress on the next write.
Players exist, so stored progress & backups must keep loading across every later build.

## Decision

- **A migration dispatcher.** `src/lib/stores/progress-storage.ts` owns `MIGRATIONS`, keyed by the
  version each step produces. Version 1, the launch format, is the identity step & the chain's base.
  Hydration & backup restore both parse the envelope, dispatch on `version`, and run every step
  after the stored version. A fixture per version lives in `progress-storage-fixtures/`, and a test
  requires the table, the fixtures, & `CURRENT_SERIALIZATION_VERSION` to agree.
- **A “newer data” state.** A version above this build's blocks writes, quarantines nothing, and
  asks the player to update. An explicit replace doesn't lift it, since nothing holds a copy of the
  newer data; another tab clearing or rewriting the stored value does. Exporting a backup in this
  state returns the stored blob verbatim, so the export can't carry defaults that would overwrite
  real progress on restore. A newer backup is refused with `newer-version`. Quarantine is only for
  unreadable data.
- **Valibot validates the blob.** A strict schema (backup restore) and a repair schema (hydration,
  with per-field fallbacks & per-entry filtering) share their list fields. Save import & transfer
  keep their own layers, since neither reads this blob.
- **Unknown IDs are retained, never dropped.** They stay out of `ProgressState`, so counts ignore
  them, and the serializer writes them back. Reset clears them; restore replaces them. An unknown
  ID's level is kept as stored, and strict restore accepts any finite non-negative level for one
  (known IDs keep their integer domain), so everything hydration writes restores.
- **ID brands are Valibot's.** `ItemId` & its siblings are `string & v.Brand<"ItemId">`, so a
  schema's `v.brand("ItemId")` output is the same type the rest of the app uses.

Valibot was already in the dependency tree through Paraglide, at the same version, so adding it
directly brings in no new packages.

## Alternatives

- **Zod.** Rejected: it would add a package, while Valibot was already installed, and Valibot's
  function-per-validator API tree-shakes to the validators the blob uses.
- **Keep the hand-rolled guards & add migrations.** Rejected: the two-mode guard functions already
  obscured which policy applied where, and every new field would add another pair of branches.
- **Quarantine newer data.** Rejected: it mislabels valid data as corrupt, writes a copy the player
  doesn't need, and lets an explicit replace in the old build overwrite the newer progress.
- **Drop unknown IDs with a diagnostic.** Rejected: a drop that's reported is still a loss once the
  next write lands, and the ID may return in a later game update or be mapped by a migration.
- **Key `MIGRATIONS` by source version.** Rejected: keying by the version a step produces makes the
  table's keys exactly `1…CURRENT_SERIALIZATION_VERSION`, which a test can check in one line.

## Revisit if

- A migration needs tracker data from the build that wrote the blob (a renamed ID's old name), at
  which point steps may need a lookup table beside them.
- Retained unknown entries grow large enough to matter for storage quota, for example after a game
  update renames a whole category.
- Valibot's bundle cost or API stability changes, or the app adopts another schema library
  elsewhere.
