# Canonical domain terms

## Context

Issue #633 (part of #373) found three concepts with several names each. Spoiler state read as
`spoilered`, `hidden`, `redacted`, `known`, `revealed`, & `nameVisible`. Mine progress read as
`minesLevel` (a generated condition type), `mines.floor`, `minesFloor`, & `mineFloor`. A villager's
relationship level was `villagerLevels` in persisted state but `heartLevel` / `heartLevels` in
conditions & contexts.

## Decision

- **Spoiler state is "spoilered"** (opposite "unspoilered") wherever a name denotes the spoiler
  state: identifiers, props, CSS hooks, message keys, & tests. Booleans that were phrased positively
  (`nameVisible`, `revealed`, `known`) are inverted to `spoilered`. "Reveal" stays as the user
  action (`onReveal`, "Reveal spoiler"); the DOM `hidden` attribute & "completed rows hidden" are
  unrelated.
- **Mine progress is "mine floor"** (`mineFloor` / `MineFloor`) everywhere, including the persisted
  key (`completed.mineFloor`) & the generated condition type, which the pipeline now emits as
  `mineFloor`; `tracker-data.json` was regenerated.
- **Relationship level is "heart level"** (`heartLevel` / `heartLevels`, `MAX_HEART_LEVEL`,
  `completed.heartLevels`), since villagers don't level up; the relationship does.
- **Spells are a player-level field.** Flattening `completed.mines = { floor, spells }` leaves
  `completed.spells`, not `mineSpells`: spells are attached to the player & usable anywhere, even
  though mine progression unlocks them.
- **No compatibility layer.** There are no users, so old saves & backups aren't migrated. The
  persisted blob keeps serialization version 2; one written by an older build lacks the new keys &
  fails strict validation or loads with defaults. The transfer wire format is positional &
  unchanged, so it needs no version bump.
- **`villagerKnown` stays.** It names the discovery fact that drives a villager's spoilering (a
  condition in generated data), not the spoiler state itself, so `knownVillagers` &
  `isVillagerKnown` keep their names & the villager record maps them to `spoilered`.

## Alternatives

- Keep `minesLevel` as the condition type & rename only app-local names: rejected, because the
  maintainer wants complete consistency before launch & the pipeline regeneration is cheap.
- Rename the spoiler booleans without inverting them (`unspoilered`, `isNameShown`): rejected, since
  one canonical term per concept is the point.
- Name the flattened spells field `mineSpells`: rejected, since spells aren't mine-scoped once
  unlocked.
- Migrate old persisted keys: rejected as unnecessary with no users.

## Revisit if

The app gains users with saved state (add a versioned migration for `mines`, `villagerLevels`, & the
old condition type), or the game ships a first-party term that conflicts with one of these.
