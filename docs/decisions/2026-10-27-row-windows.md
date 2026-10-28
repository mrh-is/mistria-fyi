---
id: 2026-10-27-row-windows
status: needs-review
summary: >-
  A source is “Later” while it or its row is a spoiler, while a progress gate the app already
  records is unmet (`reachedSeason`, `quest`, `heartLevel`, `skillLevel`, `mineFloor`,
  `perkUnlocked`, `hasUpperFloor`, `isDating`), or while it is out of season or weather. Otherwise
  it is “Now” when a season or weather restriction holds today, & “Whenever” when nothing restricts
  it. A row takes its best source: Now, then Whenever, then Later.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-27-row-windows.md#decision
relationships: []
---

# Row windows follow progress & spoilers

## Context

The “When to find” filter sorted each incomplete row into Now, Anytime, or Later by season & weather
alone. A row the player couldn't act on yet, such as Balor's Tomato before the first summer or
anything behind an uncompleted quest, counted as Anytime, which misled a player asking “what can I
do right now?”. The source grouping on `/everything` (#145) rolls these row states up per source, so
it needed the windows to mean something first (#230).

## Decision

A source is “Later” while it or its row is a spoiler, while a progress gate the app already records
is unmet (`reachedSeason`, `quest`, `heartLevel`, `skillLevel`, `mineFloor`, `perkUnlocked`,
`hasUpperFloor`, `isDating`), or while it is out of season or weather. Otherwise it is “Now” when a
season or weather restriction holds today, & “Whenever” when nothing restricts it. A row takes its
best source: Now, then Whenever, then Later.

- Gates the app can't evaluate (`gamePredicate`, `dateUnlocked`) count as met. Time of day is never
  filtered on; it stays a badge.
- An unrecorded skill or heart level counts as zero, and a quest the player hasn't reached counts as
  not completed, so neither reads as an unknown, met gate.
- With spoilers shown, the spoiler step no longer applies; an unmet gate still makes the row Later.
- `ProgressContext` carries `progressionState`, so every projection, the filter, & dimming read the
  same rule.
- The UI reads “Whenever”, but the stored preference keeps its `anytime` value, so saved filter
  choices need no migration.

## Alternatives

- **Rename the stored value to `whenever`.** Clearer internally, but it changes a persisted
  preference, which needs a version bump, a migration, & compatibility tests for no player-visible
  gain.
- **Evaluate gates only for display, leaving counts season-based.** Counts would disagree with the
  filter on every page.
- **Treat unrecorded levels as unknown, & therefore met.** Players who never entered a skill level
  would see its gated rows as Whenever, which contradicts the spoiler rules that already read the
  same recorded progress.

## Revisit if

- The app starts tracking date unlocks, game predicates, or the in-game time, which would make more
  gates evaluable.
- Crop sources gain a growing season in the pipeline; until then a crop source reads as Whenever.
