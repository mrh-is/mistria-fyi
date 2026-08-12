# Progressive disclosure (spoiler system)

Supersedes the partial quest-gate spec at `2026-08-10-quest-gate-improvements.md` and subsumes
issues #56 (quest gating), #13 (quest-locked item obfuscation), and #6 (spoiler UI revisit).

## Guiding principle

Everything is redacted by default. Each piece of content in the tracker has an explicit visibility
condition that must be satisfied before its details are revealed. Items are never removed from the
list; they appear as redacted rows whose names and details are obscured until the player's tracked
progression unlocks them. The intent is preventing casual spoilers during normal usage, not
hack-proofing the data.

"Redacted" is the project term for this state. Not "hidden" (the row is still present) and not
"locked" (the player can override if they choose).

## Architecture: pipeline-computed visibility conditions

The pipeline resolves all data relationships at build time and emits a `visibility` field on every
content entity in `tracker-data.json`. The app has a small, pure evaluator function that takes a
condition + user state and returns a boolean. No game-data joining happens at runtime.

This keeps the app thin and the conditions inspectable (they're plain JSON in the tracker data).

---

## 1. Visibility condition model

A visibility condition is a small, serializable expression tree.

### Condition type

```typescript
type VisibilityCondition =
  | { type: "always" }
  | { type: "never" }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "npcKnown"; npcId: NpcId }
  | { type: "skillLevel"; skillId: SkillId; level: number }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "minesLevel"; floor: number }
  | { type: "heartLevel"; npcId: NpcId; level: number }
  | { type: "renownLevel"; level: number }
  | { type: "and"; conditions: VisibilityCondition[] }
  | { type: "or"; conditions: VisibilityCondition[] }
```

`renownLevel` uses the raw renown level (0-100) stored in `CompletedState.renown`, not a derived
rank index. The existing app stores renown as a raw level; town ranks (Wood, Stone, Copper, etc.)
are display labels derived from `trackerData.renown.levelsPerRank` (currently 10). Issue #60
renames the UI label to "Town Rank" but the underlying data remains a level.

### How conditions attach to content

Every content entity gets a top-level `visibility: VisibilityCondition`. Recipe sources get an
optional `visibility: VisibilityCondition` for partial disclosure.

When the source's visibility is met but the entity's is not, the source text is partially revealed
(store name, perk tier hint) while the entity name stays redacted. When neither is met, both name
and source details are redacted.

### Partial disclosure example

"Spring Crop Sign Scroll Bundle" at the General Store:

```json
{
  "name": "Spring Crop Sign Scroll Bundle",
  "visibility": { "type": "questCompleted", "questId": "repair_the_general_store" },
  "sources": [{
    "type": "scroll_bundle",
    "storeId": "general_store",
    "visibility": { "type": "questAvailable", "questId": "repair_the_general_store" }
  }]
}
```

Three phases:

1. **Quest not yet available**: row shows redacted name, source shows "Purchase from the General
   Store (after redacted)"
2. **Quest available but not complete**: row shows redacted name, source shows "Purchase from the
   General Store (after repairing)"
3. **Quest complete**: row shows "Spring Crop Sign Scroll Bundle", source fully visible

### Perk-gated item example

"Giant Essence Stone" recipe, gated behind the Farming tier 4 perk "Magic Design":

- Item `visibility`: `{ "type": "perkUnlocked", "perkId": "magic_design" }`
- Source `visibility`: `{ "type": "skillLevel", "skillId": "farming", "level": 45 }`

Three phases:

1. **Farming < 45**: source shows "Unlock the redacted perk (Farming tier 4)", item name redacted
2. **Farming >= 45, perk not purchased**: source shows "Unlock the Magic Design perk (Farming
   tier 4)", item name still redacted
3. **Perk purchased**: item name and full source visible

### Additional vendor example

Items sold exclusively by gated vendors (e.g., Taliferro, who is unlocked by "Upgrade the Saturday
Market"):

- Item `visibility`: `{ "type": "questCompleted", "questId": "upgrade_the_saturday_market" }`
- Source `visibility`: same condition (no intermediate phase; the vendor and their inventory appear
  together)

Before the quest: row shows redacted name, source shows "Purchase from redacted (after redacted)".
After the quest: both vendor name and item name are revealed.

---

## 2. User state

### Progression state

The spoiler system evaluates visibility conditions against a `UserProgressionState` derived from
the existing `CompletedState`. Most fields already exist in the app's state model; new fields are
marked.

```typescript
interface UserProgressionState {
  // Passed through from CompletedState (using existing field names)
  skillLevels: Record<SkillId, number>;
  npcLevels: Record<NpcId, number>;
  minesFloor: number;
  renown: number;
  unlockedPerks: Set<PerkId>;

  // From UserState (not CompletedState)
  showSpoilers: boolean;

  // Derived from CompletedState + tracker data (see below)
  questVisibility: Record<QuestId, QuestVisibility>;
  knownNpcs: Set<NpcId>;
}
```

Note: the existing `CompletedState` uses `npcLevels` (not `heartLevels`). The spec preserves
this name. `showSpoilers` lives on `UserState`, not `CompletedState`; `deriveProgressionState`
takes both `completed` and `showSpoilers` as inputs (or the full `UserState`).

`unlockedPerks` is a new field on `CompletedState` (stored, imported from save file or manually
tracked); it passes through to `UserProgressionState` for use by the evaluator. `knownNpcs` and
`questVisibility` are derived — they live only on `UserProgressionState`, never persisted.

New `CompletedState` field:

```typescript
interface CompletedState {
  // ... existing fields ...
  unlockedPerks: Set<PerkId>; // New
}

type QuestVisibility = "unavailable" | "available" | "completed";
```

**localStorage migration**: existing saved state has no `unlockedPerks` field. On load, treat a
missing field as an empty set. The existing localStorage serializer already handles partial
`CompletedState` (optional fields with defaults); `unlockedPerks` follows the same pattern.

Note: `QuestVisibility` is distinct from the existing `QuestState` type (`"none" | "obtained" |
"completed"`) used in `CompletedState`. `QuestState` tracks what the user has done (manual or
imported); `QuestVisibility` is a derived value computed from `QuestState` + chain ordering that the
visibility engine uses. A quest with `QuestState = "none"` may be `QuestVisibility = "available"`
(first incomplete in chain) or `"unavailable"` (blocked by earlier chain quest).

### Deriving progression state

`deriveProgressionState(completed, trackerData)` is a pure function that resolves the full
`UserProgressionState` from the user's raw completed state and the tracker data's chain/ordering
information:

- **`questVisibility`**: computed per-quest, respecting actual user state first:
  1. `QuestState = "completed"` -> `QuestVisibility = "completed"`
  2. `QuestState = "obtained"` -> `QuestVisibility = "available"` (unconditionally — the player
     has demonstrably reached this quest, so prerequisite reconstruction is irrelevant)
  3. `QuestState = "none"` -> evaluate prerequisites: "available" when all prerequisites are
     satisfied, "unavailable" otherwise

  Prerequisites are per-quest, not from a linear walk. Two quests with independent prerequisites
  can both be "available" even if they appear adjacent in the data. For strictly linear registries
  (crown, stillwell, tali), this reduces to sequential availability since each quest's only
  prerequisite is the previous one. Heart quests use per-NPC chains gated on heart level +
  previous quest completion. Fetch quests use request board requirements resolved against the rest
  of the progression state.
- **`knownNpcs`**: an NPC is known if their visibility condition (from tracker data) evaluates to
  true against the current quest/progression state. For NPCs without an explicit unlock gate (i.e.,
  visibility is `always`), heart level > 0 also marks them known. NPCs with explicit unlock gates
  (Caldarus, Seridia, Saturday Market vendors) are known only when their gate quest is completed,
  regardless of heart level — this prevents story-granted heart levels from revealing them early.
- **`npcLevels`**: two-step computation for NPCs with explicit unlock gates (Caldarus, Seridia):
  1. **Stored level** (in `CompletedState.npcLevels`): `max(manuallyTracked, questDerived)` using
     `heartLevelChanges` data. This is the persisted value.
  2. **Effective level** (in `UserProgressionState.npcLevels`): if `knownNpcs` does not include
     this NPC, effective level is **0** regardless of stored value. Once the NPC becomes known
     (their unlock quest is completed), the effective level equals the stored level.

  This prevents story-granted heart levels from satisfying `heartLevel` conditions before the NPC
  is interactable. For NPCs without explicit unlock gates (visibility = `always`), the effective
  level equals the stored level directly (no masking).
- **`unlockedPerks`**, **`skillLevels`**, **`minesFloor`**, **`renown`**: pass through from
  `CompletedState` directly.

### State population

Three paths populate `CompletedState`:

1. **Manual tracking**: the user ticks things off in the UI. Skill levels, mines floor, town rank,
   and heart levels use stepper/input controls (existing pattern for skills; new controls for the
   others). Perks get checkboxes. Quest completion is tracked per-quest.
2. **Save file import**: the existing `buildImportState` in `import-save.ts` already imports quest
   states, heart levels, skill levels, renown, mines floor, and spells. Enhancements needed:
   - Import `perks` from `player.perks` (field exists in save, not currently read)
   - Derive `knownNpcs` from quest completion cascades (heart level alone is not sufficient for
     gated NPCs like Caldarus/Seridia; see `knownNpcs` derivation rules above)
3. **QR transfer**: the existing transfer codec (`src/lib/engine/transfer.ts`) is a versioned
   binary format (`TRANSFER_VERSION = 1`). Adding `unlockedPerks` to `CompletedState` requires
   bumping to version 2 with perk bitfield serialization. The decoder must remain
   backward-compatible with version 1 payloads (which have no perk data — treat as empty set).
   Include perk round-trip tests for both v1 and v2 payloads.
4. **Future continuous sync** (#73): watch the save file and auto-update. Out of scope for this
   spec.

### Quest chain state management

The pipeline emits quest ordering per category. The app derives `questStates` from the user's
completed quest set + chain ordering:

- **Story quests**: chain derived from `letters.toml` dependencies (explicit `completed_quest` +
  `days_after` fields). Where the chain is not perfectly linear (parallel availability), the
  pipeline emits the letter-based prerequisite rather than forcing linearity. Needs validation
  during implementation.
- **Crown quests**: explicit `order` array from `crown_registry.toml`.
- **Stillwell challenges**: explicit `order` array from `stillwell_registry.toml`.
- **Tali challenges**: explicit `order` array from `tali_registry.toml`.
- **Heart quests**: per-NPC chains from `letters.toml` `reached_heart_level` requirements. Chain
  at levels 2 / 4 / 6 / 8, each requiring the prior heart quest completed.
- **Fetch quests**: no chain ordering; visibility from request board requirements.

### Heart level auto-updates from cutscenes

The pipeline emits `heartLevelChanges` data mapping story quests to heart level changes for
Caldarus and Seridia (from `cutscenes.toml` `heart_level_changes` fields). When the user completes
those quests, heart levels update using `max(current, questLevel)`.

Full mapping from cutscene data:

| Quest | Caldarus | Seridia |
|---|---|---|
| Breaking the Water Seal | 2 | 1 |
| Breaking the Earth Seal | 3 | 2 |
| Breaking the Fire Seal | 4 | 4 |
| Breaking the Ruins Seal | — | — |
| Breaking the Final Seal | 6 | 6 |

Note: Caldarus becomes interactable (known NPC) at "Breaking the Fire Seal"; Seridia at "Breaking
the Final Seal". Heart levels before those points are story-granted but the characters are not
giftable/datable, so the tracker shows them at 0 hearts until their unlock quest.

### "Complete redacted item" confirmation

Redacted rows keep their checkbox **enabled but intercepted**: tapping the checkbox on a redacted
row opens a confirmation dialog instead of toggling completion. (A fully disabled control would
prevent the override flow entirely.)

- **"Yes, just this item"**: marks the item completed; progression state unchanged. The item appears
  completed within a redacted section.
- **"Yes, and update my progress"**: marks the item completed AND satisfies the visibility
  condition by updating the user's tracked progression. Only offered when the condition is
  safely invertible. Invertible primitives and their mutations:
  - `questCompleted(id)` -> mark quest completed (+ all prerequisite quests in chain)
  - `questAvailable(id)` -> mark prerequisite quests completed (quest itself becomes available)
  - `skillLevel(id, n)` -> set skill to `max(current, n)`
  - `minesLevel(n)` -> set mines floor to `max(current, n)`
  - `renownLevel(n)` -> set renown to `max(current, n)`
  - `heartLevel(npcId, n)` -> set NPC level to `max(current, n)`
  - `perkUnlocked(id)` -> mark perk as unlocked
  - `and` -> satisfy all sub-conditions (recursively)
  - `or` -> present branches, user picks which to satisfy

  **Not invertible** (suppress "update my progress"):
  - `never` -> no possible mutation
  - `npcKnown` -> derived from quest completion; would require recursing into the NPC's own
    visibility condition, which may itself involve non-invertible gates. Too complex for v1.
  - Any tree containing a `never` or `npcKnown` leaf
- **"Cancel"**: no change.

Uses the existing `AlertDialog` component pattern.

---

## 3. Pipeline changes

Each subsection is an independent extraction step. All are testable in isolation via vitest.

### 3a. Quest chain ordering

New extraction from `letters.toml` and quest registry files. For each quest category, emit
ordering data:

- **Story quests**: extract `completed_quest` dependencies from letters that start story quests.
  Build a dependency graph; emit prerequisite quest IDs per quest. For quests without an explicit
  letter trigger or `completed_quest` dependency, emit **no prerequisite** — TOML file position
  is used only for display sorting, never as a prerequisite edge. (Inventing dependencies from
  file order would contradict the out-of-scope rule against fabricating quest links, and could
  cause the "update my progress" cascade to mark unrelated quests completed.)
- **Crown / Stillwell / Tali**: use the explicit `order` arrays from registry files.
- **Heart quests**: extract `reached_heart_level` requirements from letters. Emit per-NPC ordered
  lists with heart level thresholds and `completed_quest` prerequisites.

Cross-NPC dependency: Landen's "Bird Song" is gated on `reached_heart_level = { ryis = 2 }` (from
Ryis's heart level, not Landen's). Use the letter's `reached_heart_level` NPC, not the quest's
`npc_for_icon`.

### 3b. Cutscene-to-quest mapping

Build a bidirectional index between cutscenes and quests using three sources in priority order:

1. Explicit `quest_to_start` / `quest_to_progress` on cutscene entries
2. Quest stage `queries[].cutscene` references
3. Naming convention: strip `_pt_N` suffix, match against quest IDs

Validated mapping (from investigation):

- 10 of 16 `_pt` pairs match quest IDs cleanly (all repair/upgrade quests)
- 3 families need explicit field override: `priestess_quarters` -> `find_the_magic_key`,
  `dragon_tablet` -> `the_dragonsworn_tablet`, `break_ruins_seal` -> split across
  `creating_the_void_mass` + `breaking_the_ruins_seal`
- 1 unmappable: `the_unusual_tree` (dragon shrine feature unlock, not a quest)

### 3c. Requirement-to-visibility resolution

Extend the existing `requirements.ts` to produce `VisibilityCondition` trees. The resolver walks
each named requirement:

- `seen_cutscene = "X"` -> look up cutscene-to-quest mapping. The phase depends on how the
  cutscene relates to its quest: completion cutscenes (from `_pt_2` naming convention or explicit
  `quest_to_progress` that advances to the final stage) -> `questCompleted`; start cutscenes
  (from `quest_to_start`) -> `questAvailable`. In practice, nearly all requirement predicates
  reference completion cutscenes (`_pt_2`); start cutscenes as requirements are rare. When in
  doubt, use `questAvailable` (the less restrictive option — content is shown once the quest
  becomes active, not only after completion).
- `reached_skill_level = { farming = 30 }` -> `skillLevel`
- `reached_mines_level = 41` -> `minesLevel`
- Boolean named requirement references (e.g., `repaired_general_store = true`) -> resolve
  recursively
- `or` arrays -> `{ type: "or", conditions: [...] }`
- `invert` -> project to `{ type: "always" }` (inverted conditions represent time-limited states,
  not spoiler gates; treating them as always-satisfied preserves boolean semantics)
- `met_npc` -> `npcKnown`
- `completed_quest` -> `questCompleted`
- `is_season` / `is_day_type` / `reached_date` / `acquired_item` -> project to
  `{ type: "always" }` (not spoiler gates; availability restrictions only)

**Compositional projection**: non-spoiler predicates are projected to `{ type: "always" }`, not
dropped. This preserves boolean semantics: `or(acquired_item, completed_quest)` projects to
`or(always, questCompleted)` which simplifies to `always`, correctly reflecting that the item is
obtainable without quest completion. After projection, simplify using boolean identities:
`and(..., always)` drops the `always`; `or(..., always)` collapses to `always`; `and()` (empty) =
`always`; `or()` (empty) = `never`.

The existing `Restriction[]` flattening (which silently drops `any`/`not` branches) is preserved
for backward compatibility but the new `VisibilityCondition` path is the primary output.

### 3d. Store-level visibility

Map each store to its unlock condition. Emit `storeVisibility: Record<StoreId, VisibilityCondition>`
in tracker data.

Store unlock mapping (from investigation):

| Store | Unlock quest | Source |
|---|---|---|
| General Store (upgrade) | `repair_the_general_store` | `repaired_general_store` requirement |
| Carpenter (upgrade) | `upgrade_the_carpenters_shop` | `repaired_carpenters_shop` requirement |
| Inn (upgrade) | `repair_the_inn` | `repaired_inn` requirement |
| Hayden's (upgrade) | `repair_haydens_barn` | `repaired_haydens_farm` requirement |
| Taliferro | `upgrade_the_saturday_market` | User confirmed |
| Wheedle | `upgrade_the_saturday_market` | User confirmed |
| Stillwell | `upgrade_the_saturday_market_plaza` | `meet_the_new_vendors` quest |
| Zorel | `upgrade_the_saturday_market_plaza` | `meet_the_new_vendors` quest |
| Merri | `repair_the_bridge` | `saturday_market_unlocked` requirement |
| Darcy | `repair_the_bridge` | `saturday_market_unlocked` requirement |
| Vera | `repair_the_bridge` | `saturday_market_unlocked` requirement |
| Louis | `repair_the_bridge` | `saturday_market_unlocked` requirement |
| Balor, Blacksmith, Carpenter (base), Clinic, General Store (base), Hayden (base), Inn (base), Tackle Shop | Always | No gate |

Per-store-item visibility composes the store-level gate with any item-specific requirements from
`stores.toml` (e.g., `reached_mines_level`, `is_season`, `reached_skill_level`). Seasonal and
day-type requirements are not spoiler gates and are filtered out of visibility conditions (they
remain as availability restrictions in the existing system).

### 3e. NPC unlock conditions

Emit `visibility` on each NPC entry:

| NPC(s) | Visibility condition | Data source |
|---|---|---|
| Caldarus | `questCompleted("breaking_the_fire_seal")` | Hardcoded (not derivable) |
| Seridia | `questCompleted("breaking_the_final_seal")` | `seridia_transformed` requirement |
| Merri, Darcy, Vera, Louis | `questCompleted("repair_the_bridge")` | `saturday_market_unlocked` |
| Taliferro, Wheedle | `questCompleted("upgrade_the_saturday_market")` | User confirmed |
| Stillwell, Zorel | `questCompleted("upgrade_the_saturday_market_plaza")` | `meet_the_new_vendors` |
| All other NPCs (28) | `always` | N/A |

Also emit `heartLevelChanges: Record<QuestId, Array<{ npcId, level }>>` for Caldarus/Seridia
auto-updates.

### 3f. Request board requirements

Import `request_board.toml` and resolve each entry's requirements into a `VisibilityCondition` for
the corresponding fetch quest. Requirement types to resolve:

| Requirement key | Resolution | Count |
|---|---|---|
| `completed_quest` | `questCompleted` | 49 |
| `seridia_house_open` | `questCompleted("breaking_the_final_seal")` | 14 |
| `opened_mines` | `questCompleted("unlocking_the_mines_pt_2")` | 14 |
| `unlocked_deep_woods` | `questCompleted("breaking_the_fire_seal")` | 9 |
| `broke_ruins_seal` | `questCompleted("breaking_the_ruins_seal")` | 9 |
| `broke_earth_seal` | `questCompleted("the_earth_tablet")` | 9 |
| `broke_water_seal` | `questCompleted("the_water_tablet")` | 8 |
| `repaired_haydens_farm` | `questCompleted("repair_haydens_barn")` | 5 |
| `reached_skill_level` | `skillLevel` | 13 |
| `reached_heart_level` | `heartLevel` | 3 |
| `has_barn` / `has_coop` / `has_any_animal` | `questCompleted("repair_haydens_barn")` | 8 |
| `acquired_item` | Project to `always` (not a spoiler gate) | 19 |
| `is_season` / `is_day_type` / `reached_date` | Project to `always` (not spoiler gates) | 126 |

Self-referential chains (e.g., `common_bait -> uncommon_bait -> rare_bait`) become
`questCompleted` conditions on the previous tier.

### 3g. Heart quest visibility

From `letters.toml`, emit visibility conditions on each heart quest:

```json
{ "type": "and", "conditions": [
  { "type": "npcKnown", "npcId": "ryis" },
  { "type": "heartLevel", "npcId": "ryis", "level": 4 }
]}
```

For level 4+ heart quests, also include `questCompleted` of the previous heart quest in the
chain.

Pregnancy quests require marriage + child state that does not exist in `UserProgressionState`. Until
marriage tracking is added, pregnancy quests use `{ type: "never" }` — unconditionally redacted,
visible only when `showSpoilers` is enabled. When marriage tracking is added in a future spec,
these get proper condition primitives. Wedding cosmetics likewise use `{ type: "never" }` until
then.

Some 2-heart quests have no letter (Balor, Juniper, Valen) and trigger via world-location
cutscenes. These still get `heartLevel` visibility conditions; the letter is just the in-game
delivery mechanism, not the spoiler gate.

### 3h. Cosmetic sources

1. Wire `extractCosmetics` to look up `sources[id]` from the existing sources map (covers 127 of
   298 locked cosmetics immediately).
2. Extend `extractQuestRewards` to read `reward.player_cosmetic` (+2 cosmetics).
3. Add `chest_tables` extraction from `fishing.toml` and `dungeons.toml` — parse chest loot
   pools, map `kind = "cosmetic"` entries, tag with chest tier as source.
4. Wedding cosmetics use `{ type: "never" }` until marriage tracking is added (see Section 3g).

Cosmetic visibility derives from the source: store-bought cosmetics inherit their store's
visibility, quest-reward cosmetics inherit the quest's visibility, treasure-chest cosmetics inherit
their mines biome/floor gate, etc. `defaultUnlocked: true` cosmetics get `{ type: "always" }`.

**Completeness validation**: after all source-wiring steps, the pipeline must assert that every
non-`defaultUnlocked` cosmetic has at least one source. Any unsourced cosmetics fail the pipeline
build with their IDs listed. This is the enforcement side of issue #78 (source coverage). The same
validation applies to all entity types: items, recipes, and cosmetics must each have an explicit
`visibility` derivation or the pipeline errors. Intentional exceptions (wedding cosmetics) are
documented with `{ type: "never" }` and a comment in the pipeline code.

### 3i. Perk visibility

Emit visibility on each perk based on its tier's skill level threshold from `perkTierLevels`:

```json
{ "type": "skillLevel", "skillId": "farming", "level": 45 }
```

Tier-to-level mapping: tier 1 = level 1, tier 2 = level 15, tier 3 = level 30, tier 4 = level 45,
tier 5 = level 60.

### 3j. Category-level visibility

Emit visibility conditions for quest categories that are themselves spoilers:

| Category | Visibility condition |
|---|---|
| `crown_quests` | `{ type: "renownLevel", level: N }` (**pre-implementation research required**: determine exact renown level at which the crown request board unlocks, from wiki or in-game testing. This must be resolved to a concrete number before implementation begins — `never` is not acceptable as a production value for this category since it would permanently redact content for normal users.) |
| `stillwell_challenges` | `{ type: "npcKnown", npcId: "stillwell" }` |
| `tali_challenges` | `{ type: "npcKnown", npcId: "taliferro" }` |
| `story_quests` | `{ type: "always" }` (first quest is always visible) |
| `heart_quests` | `{ type: "always" }` (per-quest conditions handle gating) |
| `fetch_quests` | `{ type: "always" }` (per-quest conditions handle gating) |

### 3k. Map section and content-source unlock gates

Emit visibility conditions for content gated behind map section unlocks and content sources:

| Gate | Visibility condition | Currently in pipeline? |
|---|---|---|
| Deep Woods | `questCompleted("breaking_the_fire_seal")` | Yes (cutscene restriction) |
| Summit | `questCompleted("repair_the_summit_stairs")` | No |
| Western Ruins upper | `questCompleted("breaking_the_final_seal")` | No |
| Beach Cave | `questCompleted("breaking_the_fire_seal")` | No |
| Fish Trap | `questCompleted("repair_the_beach_bridge")` | No |

Items sourced from these areas inherit the area's visibility condition composed with any other
conditions (e.g., a mines dig site item in Deep Woods gets both the Deep Woods gate and the perk
gate).

---

## 4. Visibility engine

Pure functions in `src/lib/engine/visibility.ts`.

### Core evaluator

```typescript
function isVisible(
  condition: VisibilityCondition,
  state: UserProgressionState,
): boolean
```

Recursively evaluates the condition tree. Each primitive is a direct lookup:

- `always` -> `true`
- `never` -> `false` (only visible when `showSpoilers` override is active)
- `questCompleted` -> `state.questVisibility[questId] === "completed"`
- `questAvailable` -> `state.questVisibility[questId]` is `"available"` or `"completed"`
- `npcKnown` -> `state.knownNpcs.has(npcId)`
- `skillLevel` -> `state.skillLevels[skillId] >= level`
- `perkUnlocked` -> `state.unlockedPerks.has(perkId)`
- `minesLevel` -> `state.minesFloor >= floor`
- `heartLevel` -> `state.npcLevels[npcId] >= level`
- `renownLevel` -> `state.renown >= level`
- `and` -> every sub-condition is visible
- `or` -> any sub-condition is visible

When `state.showSpoilers` is true, the evaluator returns `true` for all conditions (global
override).

### Visibility helpers

Two independent checks, not a single combined state:

```typescript
function isEntityNameVisible(
  entityVisibility: VisibilityCondition,
  state: UserProgressionState,
): boolean

function isSourceDetailVisible(
  sourceVisibility: VisibilityCondition | undefined,
  state: UserProgressionState,
): boolean
```

- **Entity name**: shown when `isEntityNameVisible` returns true; otherwise redacted. This
  controls the item/recipe/quest name display only.
- **Source detail**: each source is evaluated independently via `isSourceDetailVisible`. A source
  whose condition is not met shows redacted details (store name hidden, perk name hidden) even
  when the entity name is visible. A source with no `visibility` field inherits the entity's
  condition.

This separation prevents an ungated source from revealing the details of a still-gated source on
the same entity (e.g., `void_bonsai` visible via museum donation doesn't reveal the perk source
details until the perk tier is unlocked).

Components render each source row by checking both: entity name for the row's label, source
detail for the acquisition text. The three visual states per-source-row are:

- **Fully visible**: entity name visible AND source detail visible
- **Source-only**: entity name redacted, source detail visible (partial disclosure phase)
- **Fully redacted**: both redacted

### Reactive integration

`UserProgressionState` is a `$derived` rune computed from `userState`. Visibility updates
reactively when the user checks off a quest, imports a save, or adjusts a skill level.

---

## 5. UI changes

### Redacted row rendering

Every item/quest/NPC row calls `redactionState()` and renders accordingly:

- **`"redacted"`**: name replaced with a redaction indicator, source text shows a hint about what's
  needed. The row remains present in the list, never removed. Checkbox is enabled but intercepted:
  tapping it opens the "complete redacted item" confirmation dialog (see Section 2).
- **`"source-only"`**: source text partially revealed (store name, perk tier), entity name still
  redacted. This is the middle phase of layered gating.
- **`"visible"`**: everything shown normally.

The exact visual treatment (blur, "???", locked icon, etc.) is deferred to issue #6. The existing
animal-tier blur approach serves as the starting point and is folded into this unified system.

### Redaction in non-category surfaces

Redaction applies everywhere entity names appear, not just category pages:

- **Global search** (`searchItems` in `search.ts`, rendered by `search-results.svelte`): redacted
  entities are excluded from search results entirely. Searching for a redacted item name returns
  no match. This prevents name leaks through the search index.
- **`/all` aggregate page** (`NpcsSection.svelte`, etc.): same redaction rules as category pages.
  All component sections must check visibility before rendering names.
- **Undo toasts**: if a completion undo toast would show a redacted item name, show the redaction
  placeholder instead.
- **Accessible labels / aria attributes**: redacted names must not appear in `aria-label` or
  `title` attributes.

Implementation must audit every code path that renders `entity.name` and route it through the
visibility check. A fresh-state test (no save imported, no manual progress) should verify that no
redacted names appear anywhere in the rendered DOM.

### Heart quest display

For a known NPC, all heart quest slots are visible as rows. Quests at heart levels the player has
reached show names; quests at levels not yet reached show "Reach N hearts with [NPC name]". This
means a player at 5 hearts with Ryis sees:

- "Bird Song" (2h, completed) -- full name
- "A Sapling" (4h, accepted) -- full name
- "Reach 6 hearts with Ryis" -- redacted name, source visible
- "Reach 8 hearts with Ryis" -- redacted name, source visible

### Category-level redaction

Quest categories that are spoilers (crown, stillwell, tali) are collapsed/redacted when their
category visibility condition is not met. Exact visual treatment is a UI decision for
implementation.

### "Complete redacted item" confirmation

See Section 2 for full semantics. Summary: intercepted checkbox opens `AlertDialog` with "Yes, just
this item" / "Yes, and update my progress" / "Cancel". For `or` conditions the user picks a branch;
for `never` conditions only "just this item" is available.

### Save importer enhancements

Extend the save import pipeline end-to-end:

1. **`buildImportState`** (`import-save.ts`): add `perks` field to `PlayerSave` interface. Parse
   `player.perks` (string array) into `Set<PerkId>`, validating against `trackerData.perks`. Add
   perk count to `ImportResult.counts`.
2. **`mergeFromSave`** (`user-state.svelte.ts`): add a perk merge branch that unions the imported
   `unlockedPerks` with the existing set (same pattern as other fields). Extend `MergeCounts` with
   a `perks` field.
3. **Integration test**: verify `buildImportState` -> `mergeFromSave` -> persisted state round-trip
   for perks, including that perk-gated recipes unredact after import.

Note: `knownNpcs` is not imported directly — it is derived at runtime by `deriveProgressionState`
from quest completion state and NPC levels (with gated-NPC exceptions). The importer only needs to
supply the raw `CompletedState` fields (`questStates`, `npcLevels`, `unlockedPerks`, etc.).

The importer already handles quest states, heart levels, skill levels, renown, and mines floor.

### "Show all spoilers" toggle

The existing `showSpoilers` toggle in settings remains as a global override. When enabled, all
visibility evaluation returns `true` and all content is fully visible. A follow-up issue can add
per-category granular controls.

---

## 6. Content visibility summary

Comprehensive mapping of every content type to its visibility condition source:

| Content type | Visibility source | Condition examples |
|---|---|---|
| Story quests | Chain ordering from letters | `questCompleted(previousQuest)` |
| Heart quests | Letter `reached_heart_level` + NPC known | `and(npcKnown, heartLevel)` |
| Fetch quests | Request board requirements | `questCompleted`, area flags, skill levels |
| Crown quests | Renown level + chain ordering | `renownLevel(N)`, `questCompleted(prev)` (exact level TBD; see 3j) |
| Stillwell challenges | NPC known + chain ordering | `npcKnown("stillwell")` |
| Tali challenges | NPC known + chain ordering | `npcKnown("taliferro")` |
| NPCs | Unlock quest or always | `questCompleted` or `always` |
| Store items | Store unlock + item requirements | `and(questCompleted, minesLevel)` |
| Animals | Species requirements | `questCompleted("repair_haydens_barn")` |
| Animal variants | Tier progression (existing) | Computed from completed state |
| Perks | Skill level for tier | `skillLevel("farming", 45)` |
| Recipes (perk-sourced) | Perk unlocked | `perkUnlocked("magic_design")` |
| Recipes (store-sourced) | Store visibility | Inherits store gate |
| Recipes (quest-sourced) | Quest visibility | `questCompleted(questId)` |
| Recipes (mines) | Mines floor + perk | `and(minesLevel, perkUnlocked)` |
| Recipes (museum) | Always (museum is day-1) | `always` |
| Recipes (renown) | Renown level | `renownLevel(level)` |
| Recipes (letter) | Always (temporal trigger, not a spoiler gate) | `always` |
| Recipes (default) | Always | `always` |
| Recipes (treasure chest) | Mines floor from chest tier | `minesLevel(tierStartFloor)` (**implementation task**: map `treasureChestTiers` to floor ranges) |
| Recipes (festival) | Always | `always` |
| Recipes (chicken statue) | Always | `always` |
| Recipes (wishing well) | Always | `always` |
| Recipes (beach cave) | Breaking the Fire Seal | `questCompleted` |
| Recipes (dragon forge) | Dragonsworn quest chain | `questCompleted` |
| Recipes (fish trap) | Beach bridge repair | `questCompleted` |
| Cosmetics | Source-dependent | Inherits source gate |
| Museum items | Area gate from acquisition source | `questCompleted` or `always` (see below) |
| Mines biomes | Mines floor | `minesLevel(startFloor)` |
| Spells | Quest gate | `questCompleted` (tablet quests) |
| Renown rewards | Renown level | `renownLevel(level)` |

**Museum item visibility**: museum items are not uniformly `always`. Items sourced exclusively from
gated areas (Deep Woods, Summit, Western Ruins upper, Beach Cave) inherit the area's visibility
condition as their entity-level visibility. Items obtainable from multiple areas (e.g., forageable
in both a gated and ungated area) use `or` across the area conditions. Items with no area gate
(town forageables, mines drops from early floors, fishing) remain `always`. The pipeline derives
this from the item's source locations cross-referenced with the area gates in Section 3k.

---

## 7. Data not derivable from TOML

Some visibility conditions cannot be inferred from the game's TOML data files and must be
hardcoded in the pipeline or annotated manually:

| Entity | Condition | Why not derivable |
|---|---|---|
| Caldarus NPC unlock | `questCompleted("breaking_the_fire_seal")` | No explicit flag; inferred from cutscene `heart_level_changes` |
| Taliferro store unlock | `questCompleted("upgrade_the_saturday_market")` | No requirement on store/NPC; user confirmed |
| Wheedle store unlock | `questCompleted("upgrade_the_saturday_market")` | Same |
| Pregnancy quest gating | `never` (until marriage tracking added) | Marriage tracking not in current user state |
| Wedding cosmetics | `never` (until marriage tracking added) | Source not found in TOML data |

These are documented here so that future game data updates can be checked against them.

---

## 8. Testing

### Automated tests (vitest)

**Visibility engine (`src/lib/engine/visibility.ts`)**:
- Every condition primitive evaluates correctly against matching/non-matching state
- `and` / `or` composition with 2+ conditions
- Nested conditions (and-of-or, or-of-and)
- `showSpoilers` override bypasses all conditions
- `redactionState` returns correct state for all three phases
- `deriveProgressionState` correctly resolves quest chains, heart level cascading with `max()`,
  NPC known derivation, perk pass-through

**Pipeline extractions** (one test file per extraction step):
- Quest chain ordering: story quest chain from letters, crown/stillwell/tali from registries
- Cutscene-to-quest mapping: explicit fields, naming convention, edge cases (dragon_tablet,
  break_ruins_seal, the_unusual_tree)
- Requirement-to-visibility resolution: each requirement type, boolean composition, recursive
  named requirements
- Store visibility: each store's unlock condition, per-item composition
- NPC unlock conditions: each gated NPC, always-visible NPCs
- Request board: each requirement type, seasonal filtering, self-referential chains
- Heart quest chain: per-NPC ordering, cross-NPC dependency (Landen/Ryis), level thresholds
- Cosmetic source attachment: store, renown, festival, quest, chest table sources
- Perk visibility: tier-to-level mapping for each skill
- Category visibility: crown/stillwell/tali conditions

**Save importer**:
- Perk import from `player.perks`
- Known NPC derivation from heart levels + quest cascades
- `max(current, imported)` for heart level changes

### Agent browser testing

After starting the dev server, the implementing agent should verify:

- Import a save file -> progression state populates, content unredacts appropriately
- Check each category page for correct redaction with no save imported (most content redacted)
- Complete a story quest manually -> next quest becomes available, downstream content unredacts
- Toggle "Show all spoilers" on -> everything visible; off -> redaction returns
- Trigger the "complete redacted item" confirmation dialog, test all three options
- Verify no console errors or layout breakage on redacted rows
- Check mobile viewport for responsive redacted row rendering

### Human testing checklist (for PR review)

- [ ] Fresh state (no save import): most content redacted, only early-game items visible
- [ ] Import an early-game save: appropriate content revealed for that progression point
- [ ] Import a late-game save: most content visible
- [ ] Spot-check each category page: animals, quests, NPCs, skills/perks, mines, almanac,
      cosmetics, museum, renown
- [ ] Caldarus redacted until Breaking the Fire Seal completed
- [ ] Seridia redacted until Breaking the Final Seal completed
- [ ] Saturday Market vendors appear in correct waves (bridge -> market upgrade -> market expansion)
- [ ] Heart quests cascade correctly (complete 2h -> 4h name appears; higher levels show as
      "Reach N hearts")
- [ ] Perk tiers redact/reveal at correct skill levels (tier 2 at level 15, etc.)
- [ ] Store upgrade items have three-phase reveal (redacted -> source-only -> visible)
- [ ] Crown/Stillwell/Tali quest categories redacted until unlock condition met
- [ ] "Complete redacted item" dialog works; "update my progress" cascades correctly
- [ ] "Show all spoilers" toggle reveals everything; re-toggling restores redaction
- [ ] Mobile layout: redacted rows render correctly, no horizontal overflow

---

## 9. Related issues

| Issue | Relationship |
|---|---|
| #56 Quest gating | Primary issue; this spec addresses it |
| #13 Quest-locked item obfuscation | Subsumed by this spec |
| #6 Spoiler UI: revisit design | Visual treatment of redacted rows; complements this spec |
| #73 Auto-sync from game save | Future enhancement; this spec prepares the state model |
| #74 Supabase & Dexie investigation | Data storage; may affect how progression state is persisted |
| #75 Data versioning strategy | Relevant if visibility conditions change between versions |
| #76 Dates & inspirations | Spin-off; dates should integrate with visibility when added |
| #78 Source coverage | Prerequisite; every item needs a source for visibility derivation |

---

## 10. Out of scope

- Per-category spoiler toggle granularity (follow-up issue)
- Recipe-scroll tracking (covered by recipe-tracking spec)
- Inventing quest edges where the data provides no direct link
- Real-time save file watching (#73)
- Visual design of redacted rows (#6)
- Date types and inspirations (#76)
