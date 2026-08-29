# Progression predicates design

## Problem

Issue #97 preserved native acquisition availability predicates that the app cannot yet evaluate.
These 97 records across five predicate families currently fall through to `gamePredicate` in the
pipeline, producing opaque availability conditions the engine treats as `"unknown"`. The generated
data diagnostic in `source-rendering.invariants.test.ts` pins this count.

This design resolves all five families so the engine can evaluate them, the UI can track them, and
save import can extract them.

## Predicate resolutions

### Resolved to existing condition types (no new state)

**`seen_cutscene("destroy_vines_eastern_road")`** (5 items: thorn_vine, spirit_mushroom,
temple_flower, walnut, bell_berry)

Maps to `questCompleted("breaking_the_fire_seal")`. Add an explicit override in
`buildCutsceneQuestMap` for this cutscene ID, since it lacks the `quest_to_start` /
`quest_to_progress` fields and doesn't match the naming-convention heuristic.

**`seen_cutscene("elsie_dating_tutorial")`** (1 item: bath_soap)

Maps to the new `isDating` condition (see below). Handle in `projectPredicate`: when `seen_cutscene`
value is `"elsie_dating_tutorial"`, emit `{ type: "isDating" }` instead of falling through to
`gamePredicate`.

**`unlocked_animal(X)`** (24 records: 6 heart treats + 18 animal cosmetics across 6 animal types)

All six gated animal types (duck, horse, rabbit, sheep, capybara, alpaca) share the same visibility
gate: `questCompleted("repair_haydens_barn")`. The `unlocked_animal` predicate is equivalent to that
quest gate. Handle in `projectPredicate`: map `unlocked_animal` with any string value to
`{ type: "quest", questId: "repair_haydens_barn", state: "completed" }`.

### New condition types

**`reached_date`** (63 items)

Values are season strings (`"summer"`, `"fall"`, `"winter"`). This gates store inventory on whether
the player has lived through a season. It is a permanent unlock, distinct from `is_season` (which
gates on the current season for foraging/availability).

New availability condition: `{ type: "reachedSeason", season: Season }`. New visibility condition:
`{ type: "reachedSeason", season: Season }`.

Reveal is cumulative. Season ordering: spring < summer < fall < winter. A `reachedSeason` of
`"fall"` means spring, summer, and fall items are all visible.

**`has_upper_floor`** (3 items: ladder, stairs, teleportation_pad)

Binary flag: player has built the house upper floor.

New availability condition: `{ type: "hasUpperFloor" }`. New visibility condition:
`{ type: "hasUpperFloor" }`.

**`is_dating_someone`** (1 item: bath_soap, which also requires
`seen_cutscene("elsie_dating_tutorial")`)

Player is dating at least one NPC. Players can date multiple NPCs simultaneously before marriage.

New availability condition: `{ type: "isDating" }`. New visibility condition:
`{ type: "isDating" }`.

## State changes

### `CompletedState`

Add three fields:

```typescript
reachedSeason: Season; // default: "spring"
hasUpperFloor: boolean; // default: false
romanticNpcs: Set<NpcId>; // default: empty
```

`romanticNpcs` tracks NPCs the player has chosen the romantic path with. Invariants enforced at
mutation boundaries (setters), not by the type system:

- Only dateable NPCs (those with `dateable: true` in tracker data) can be added.
- Getting married auto-removes all NPCs from `romanticNpcs` (married NPC is tracked separately via
  `marriedNpc`).
- Error correction is allowed: players can toggle NPCs back from romantic to platonic.

### `UserProgressionState`

Add three fields:

```typescript
reachedSeason: Season;
hasUpperFloor: boolean;
isDating: boolean; // derived: romanticNpcs.size > 0 || marriedNpc !== null
```

### `deriveProgressionState`

Pass `reachedSeason` and `hasUpperFloor` through from `CompletedState`. Derive `isDating` from
`romanticNpcs.size > 0 || marriedNpc !== null`.

## Pipeline changes

### `projectPredicate` (pipeline/src/acquisition/availability.ts)

Add three new cases before the `gamePredicate` fallback:

- `reached_date`: if value is a valid season string, emit `{ type: "reachedSeason", season }`. If
  value is an object (day-level granularity), throw — the pipeline should fail loudly rather than
  falling back to `gamePredicate`, so future game data changes surface explicitly.
- `has_upper_floor`: if value is `true`, emit `{ type: "hasUpperFloor" }`.
- `is_dating_someone`: if value is `true`, emit `{ type: "isDating" }`.
- `unlocked_animal`: if value is a string, emit
  `{ type: "quest", questId: "repair_haydens_barn", state: "completed" }`.
- `seen_cutscene`: add `"elsie_dating_tutorial"` as a special case emitting `{ type: "isDating" }`.

### `buildCutsceneQuestMap` (pipeline/src/extractors/visibility/cutscene-quest-map.ts)

Add explicit override: map `"destroy_vines_eastern_road"` to
`{ questId: "breaking_the_fire_seal", phase: "completed" }`.

### `availabilityToVisibility` (pipeline/src/extractors/visibility/availability-projection.ts)

Add cases for the three new availability condition types, mapping each 1:1 to the corresponding
visibility condition type.

## Type changes

### `AvailabilityCondition` (src/lib/types/acquisition.ts)

Add three variants:

```typescript
| { type: "hasUpperFloor" }
| { type: "isDating" }
| { type: "reachedSeason"; season: Season }
```

### `VisibilityCondition` (src/lib/types/visibility.ts)

Add three variants:

```typescript
| { type: "hasUpperFloor" }
| { type: "isDating" }
| { type: "reachedSeason"; season: Season }
```

## Engine evaluator changes

### `isVisible` (src/lib/engine/visibility.ts)

Add cases:

- `reachedSeason`: compare using season ordering (spring=0, summer=1, fall=2, winter=3).
  `state.reachedSeason >= condition.season` in ordinal terms.
- `hasUpperFloor`: return `state.hasUpperFloor`.
- `isDating`: return `state.isDating`.

### `isConditionInvertible`

All three new conditions are invertible (they can be satisfied programmatically).

### `satisfyCondition`

- `reachedSeason`: advance `completed.reachedSeason` to at least the required season.
- `hasUpperFloor`: set `completed.hasUpperFloor = true`.
- `isDating`: no-op. Dating requires a player choice (which NPC); can't be auto-satisfied.

### `evaluateAvailabilityCondition` (src/lib/engine/availability-condition.ts)

Add cases for all three new types. `AvailabilityContext` is used for source-level filtering
(season/time/weather), not progression state, so the new types evaluate to `"unknown"` here — same
as `gamePredicate` did. The visibility evaluator in `isVisible` is where they are actually resolved.
The new types are non-timely (they don't change within a day), so `hasTimelyCondition` returns
`false` for all three.

### Exhaustiveness

Every `switch` statement over `AvailabilityCondition` or `VisibilityCondition` needs updated cases:

- `evaluateAvailabilityCondition`, `hasTimelyCondition`, `simplifyAvailabilityCondition`,
  `collectBadges`, `extractDisplayBadges` (availability-condition.ts)
- `isVisible`, `isConditionInvertible`, `satisfyCondition`, `isBaseConditionMet` (visibility.ts)
- `availabilityToVisibility`, `toAvailableVisibility` (availability-projection.ts)
- `collectGamePredicates` (source-rendering.invariants.test.ts)
- `validateSourceFields` switch (validate-sources.ts)
- `buildSourceSegments` / source-segments rendering (source-segments.ts)

## Serialization

### localStorage (user-state.svelte.ts)

`SerializedState.completed` adds:

```typescript
reachedSeason?: Season;        // omitted means "spring" (backward compat)
hasUpperFloor?: boolean;       // omitted means false
romanticNpcs?: string[];       // omitted means empty
```

Deserializer fills defaults for missing fields. No version bump needed for localStorage — the
optional fields provide backward compatibility.

### World-state integration

Setting `worldState.season` should also advance `reachedSeason` to at least that season. If the user
sets current season to fall, `reachedSeason` advances to fall (but not back if they switch to spring
later). `reachedSeason` can also be set independently via a dedicated control.

## Save import

### `buildImportState` (src/lib/engine/import-save.ts)

Extract from `t2_world_facts`:

- `reachedSeason`: look for a `current_season` or similar key. If the save records the current
  in-game season, use it. Falls back to `"spring"`.
- `hasUpperFloor`: check for `has_upper_floor` key (boolean `true`).
- `romanticNpcs`: check for `{npc}_is_dating` keys (boolean `true`) across all dateable NPC IDs.

Add corresponding fields to `MergeCounts`:

```typescript
reachedSeason: number; // 1 if season was extracted, 0 otherwise
hasUpperFloor: number; // 1 if flag was extracted, 0 otherwise
romanticNpcs: number; // count of dating NPCs extracted
```

### `GamedataSave` interface

No changes needed — `t2_world_facts` is already typed as `Record<string, unknown>`.

### Merge logic

- `reachedSeason`: take the later season (max ordinal).
- `hasUpperFloor`: logical OR.
- `romanticNpcs`: set union.

## Transfer encoding

### Version

Bump `TRANSFER_VERSION` from 4 to 5.

### New fields (v5, appended after date bitfield)

1. **Progression byte** (1 byte):
   - Bits 7–6: `reachedSeason` (0=spring, 1=summer, 2=fall, 3=winter)
   - Bit 5: `hasUpperFloor`
   - Bits 4–0: reserved (zero)

2. **Romantic NPCs bitfield**: bitfield over dateable NPCs in deterministic sorted order (adeline,
   balor, caldarus, celine, eiland, hayden, juniper, march, reina, ryis, seridia, valen). 12 NPCs =
   2 bytes.

### Decoder

Versions 1–4 fill defaults: `reachedSeason = "spring"`, `hasUpperFloor = false`,
`romanticNpcs = empty set`.

## UI

### NPC page

Dateable NPCs display a relationship status indicator. The toggle is contextual:

- Below 8 hearts: no toggle shown (relationship not yet established).
- At 8+ hearts (not married): romantic / platonic toggle.
- Married NPC: shown as married (existing `marriedNpc` control).
- Other dateable NPCs when one is married: shown as platonic (auto-set by marriage).

Setting an NPC to romantic adds them to `romanticNpcs`. Setting to platonic removes them. Setting
`marriedNpc` clears `romanticNpcs` entirely.

### World-state popup

Add a collapsible "progression" section with:

- **Season reached**: selector showing spring / summer / fall / winter. Defaults to current
  world-state season. Can be set independently.
- **House upper floor**: checkbox.

These controls are rarely updated, so the collapsible section keeps them out of the way.

### Source rendering

The three new condition types need display text in `source-segments.ts`:

- `reachedSeason`: "Available after reaching {season}".
- `hasUpperFloor`: "Requires house upper floor".
- `isDating`: "Requires dating someone".

## Diagnostic update

After resolving all five families, the unsupported predicate count drops from 97 to 0. Update the
invariant test in `source-rendering.invariants.test.ts` to assert an empty diagnostics array and
remove the predicate-family assertion.

## Testing

### Pipeline

- `projectPredicate` unit tests for each new predicate mapping.
- `buildCutsceneQuestMap` test for the `destroy_vines_eastern_road` override.
- `availabilityToVisibility` tests for the three new condition types.
- Verify regenerated `tracker-data.json` has zero `gamePredicate` entries.

### Engine

- `isVisible` tests for `reachedSeason` (cumulative reveal), `hasUpperFloor`, `isDating`.
- `satisfyCondition` tests for the new types.
- `isConditionInvertible` tests.

### Compatibility

- Save-import tests: extract `reachedSeason`, `hasUpperFloor`, `romanticNpcs` from mock save data.
- Transfer encoding round-trip tests for v5 payload.
- Transfer decoding tests for v1–v4 payloads (defaults filled).
- Backup/restore round-trip for the new `CompletedState` fields.
- localStorage serialization round-trip with and without the new optional fields.
