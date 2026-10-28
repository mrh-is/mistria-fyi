---
id: 2026-10-21-progress-provenance
status: needs-review
summary: >-
  Historical scope: Progress provenance. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-21-progress-provenance.md#decision
relationships: []
---

# Progress provenance

## Context

Applying a synced save (#129) must tell a fact the player set by hand from one a save or the app
set, and order a manual edit against a save without trusting device clocks. Stored progress recorded
only values, so every existing fact's origin was lost, an untick left no trace at all, and a
declined save diff would be asked again on every sync. Real players hold saved progress, so the
change has to migrate it forward without guessing.

## Decision

- **Per-fact provenance in `progress`.** Each fact, keyed by its field & locating IDs
  (`almanac/turnip`, `animals/chicken/red`, `mineFloor`), records a source (`manual`, `inferred`,
  `save`, `unknown`) & the `playtime` of the last applied save. Living in `progress`, the history
  travels with backups; a restore replaces it and both resets clear it.
- **Recorded by diff, at the store boundary.** Each mutation snapshots the facts before & after and
  records every key that changed, ticks & unticks alike, so a new mutator can't forget to record.
  The outermost call decides the source; a manual edit that names its own fact records the facts it
  changes besides (a marriage cascade, a quest's recipe rewards) as `inferred`.
- **Storage version 3.** `MIGRATIONS[3]` marks every fact an older blob holds `unknown` and adds no
  resolutions. It reads the facts through hydration's own schema & normalization, so a key exists
  exactly for each fact hydration stores.
- **Hydration keeps history aligned with facts.** Each load rekeys a historical almanac ID's history
  under its canonical entry, as it does the fact, and records a relationship the marriage cascade
  sets as `inferred`. A malformed history container is dropped rather than quarantining progress.
- **A transfer is `unknown`.** Its payload carries no provenance, and crediting it to a save would
  let it outrank the player's own edits on the next sync.
- **Resolutions remember the declined value.** A “keep mine” stores the save value the player
  declined and holds while a save reports that value; a manual edit of the fact clears it.
- **A locked merge rebases history.** A save import merges its captured history three ways, against
  what the capture builds on (the stored value the importing tab last read, or its own explicit
  write still waiting for the lock), so another tab's provenance survives, as its progress already
  does. A save or transfer agreeing with a fact already stored keeps that fact's stored provenance.

## Alternatives

- **Add the fields in place, without a version bump.** Rejected: an older build would strip them on
  its next rewrite. With the bump it sees “newer data” and leaves them alone.
- **Migrate existing facts as `manual` or `save`.** Rejected: neither is known, and sync treats
  `unknown` like manual while letting an agreeing save promote it.
- **Record explicitly in each mutator.** Rejected: every mutator, cascade, & future field would have
  to remember to record, and unticks would be easy to miss.
- **Wall-clock timestamps.** Rejected: device clocks disagree, while a save's playtime only grows as
  it's played.
- **Adopt the importing tab's history wholesale in a locked merge.** Rejected: it drops provenance
  another tab stored meanwhile.

## Revisit if

- Snapshotting every fact per mutation shows up in profiles, for example on a bulk action.
- Sync apply needs history beyond one record per fact, such as a per-category resolution.
- A migration renames IDs, which must move their provenance keys too.
