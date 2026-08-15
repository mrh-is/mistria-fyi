# Partial source redaction

Extends the spoiler system spec (`2026-08-12-spoiler-system-design.md`) with per-fragment redaction
of source text. Instead of hiding or showing entire source strings, each source is composed of
segments that independently redact based on the player's progression.

Related issues: #88 (spoiler system PR), #78 (ensure all items have sources), #97 (audit
sources against wiki), #6 (spoiler UI redesign).

## Core principle

Every item and recipe shows a source, even when redacted. The source text preserves its structural
skeleton (verb + preposition + shape) while replacing specific nouns and details with redaction
indicators. The UI decides what redaction looks like (blur, black box, click-to-reveal, etc.); the
data model provides the boundary between "visible" and "redacted" at the fragment level.

Two things redact independently:

1. **Item/recipe name**: follows `recipe.visibility` or `item.visibility`, as today.
2. **Source text fragments**: each noun or detail within the source maps to a visibility condition
   drawn from existing data lookups (store visibility, perk visibility, biome floor ranges, etc.).

---

## 1. Segment tree data model

A source's display form is a recursive tree of segments, computed at render time by the frontend from
the existing `RecipeSource` data and tracker-data lookup tables.

### Types

```typescript
type SourceSegment =
  | string
  | { redacted: true }
  | {
      condition: VisibilityCondition;
      revealed: [SourceSegment, ...SourceSegment[]];
      redacted?: [SourceSegment, ...SourceSegment[]];
    };
```

Three node types:

- **`string`**: literal text, always visible (within its parent's scope).
- **`{ redacted: true }`**: a redaction marker. The UI renders this however it chooses.
- **conditional node**: the UI evaluates `isVisible(condition, state)`. If true, recurse into
  `revealed`. If false, recurse into `redacted`. When `redacted` is omitted, it defaults to
  `[{ redacted: true }]`.

Both `revealed` and `redacted` are non-empty tuple arrays.

### Builder function

```typescript
function buildSourceSegments(
  source: RecipeSource,
  lookups: RecipeSourceLookups,
): [SourceSegment, ...SourceSegment[]]
```

This replaces `recipeSourceLabel()` for redaction-aware contexts. The flat-string function can remain
for contexts that need plain text (search indexing, accessibility labels, etc.).

The function reads `source.visibility` (the existing `VisibilityCondition` on each `RecipeSource`) to
determine conditions for qualifier fragments like "(after upgrading)". It uses `lookups` to resolve
store visibility, perk skill levels, biome floor ranges, and other fragment conditions. The
`source.visibility` field is preserved in the data; it is not removed by this spec.

### UI rendering contract

1. Walk the tree depth-first.
2. For `string` nodes, render as literal text.
3. For `{ redacted: true }` nodes, render the UI's redaction indicator.
4. For conditional nodes, call `isVisible(node.condition, state)` and recurse into the appropriate
   branch.

The existing `redactionState()` function (`"redacted" | "source-only" | "visible"`) is replaced by
the segment tree, which encodes all granularity directly.

---

## 2. Fragment redaction rules

Each source type maps to a segment tree with specific redactable fragments. The condition for each
fragment comes from existing visibility lookups in tracker data, not from a separate redaction-
specific field.

### Shared grammar segments

These reusable patterns appear across multiple source types. Each defines its revealed and redacted
forms.

**Perk label** — condition: `perk.visibility` (the `skillLevel` threshold for the perk's tier)

- Revealed: `the Taste Maker perk (Cooking tier 1)`
- Redacted: `the ███ perk (Cooking tier 1)`

The skill name and tier number are always visible (they come from the perk record's `skillId` and
`tier` fields). Only the perk's proper name redacts.

**Biome label** — condition: `minesLevel(biome.startFloor)`

- Revealed: `the Tide Caverns (Mines floors 20–39)`
- Redacted: `███ (Mines floors ███–███)`

**Store qualifier** — condition: `source.visibility` (typically a `questAvailable` condition). Only
appears when the source has a non-always `source.visibility` condition (i.e. the item or bundle
requires an upgrade/repair to purchase). This is a per-item gate, not a store-level gate.

- Revealed: ` (after upgrading)` or ` (after repairing)`
- Redacted: ` (after ███)`

The action verb ("upgrading" / "repairing") comes from an `upgradeAction` field on the store record
in `TrackerData.stores`. Defaults to `"upgrading"` when absent; the General Store overrides to
`"repairing"`.

**Date label** — always visible, no condition.

Format: `{Season} {day}` (e.g. "Winter 3", "Fall 10"). Used in letter (reached date) and festival
sources for consistency.

### Store name visibility

Store names in source text redact based on `storeVisibility[storeId]`.

**Starter stores** have `storeVisibility: { type: "always" }` because these stores are operational
from the start of the game. Upgrade/repair quests expand their stock but do not unlock the store
itself. Individual item availability within these stores is gated by per-item requirements in
`stores.toml` (e.g. `repaired_inn = true`), which the pipeline must use to derive per-recipe
visibility conditions rather than inheriting the store-level gate.

| Store ID | Name |
|---|---|
| `balor` | Balor's Wagon |
| `blacksmith` | Blacksmith's Shop |
| `carpenter` | Carpenter's Shop |
| `general` | General Store |
| `hayden` | Hayden's Shop |
| `inn` | Sleeping Dragon Inn |
| `terithia` | Tackle Shop |
| `valens_clinic` | Valen's Clinic |

Currently `carpenter`, `general`, `hayden`, and `inn` have `storeVisibility` gated by quest
completion. This is wrong: it causes the pipeline to over-gate all recipes from these stores (e.g.
Lemon Pie is currently redacted until the inn is upgraded, but it's purchasable from day one). Fixing
`storeVisibility` to `always` for these stores is a prerequisite for this spec, paired with a
pipeline fix to derive recipe visibility from per-item requirements.

**Festival stalls** (also always visible): `elsie_spring_festival`, `maple_spring_festival`,
`nora_souvenir_stall`.

**NPC market stalls** (name redacted until quest completion reveals the NPC):

| Store ID | Revealed by |
|---|---|
| `darcy`, `louis`, `merri`, `vera` | `questCompleted(repair_the_bridge)` |
| `wheedle` | `questCompleted(upgrade_the_saturday_market)` |
| `zorel` | `questCompleted(upgrade_the_saturday_market_plaza)` |

### Perk name visibility

Perk names (and their skill/tier label) redact based on `perk.visibility`, which is a `skillLevel`
condition for the tier's threshold. The perk name is revealed when the player reaches the skill level
where the perk appears in the skill tree, not when the perk is unlocked.

### Biome name & floor range visibility

Biome names and floor ranges redact based on `minesLevel(biome.startFloor)`. The redacted form
preserves structural text with "Mines floors" as a generic label:

- Revealed: `the Tide Caverns (Mines floors 20–39)`
- Redacted: `███ (Mines floors ███–███)` (each `███` is a `{ redacted: true }` node)

### Quest name visibility

Quest names redact until the quest is `available` or `completed` per `questVisibility`. See
section 3.1 for per-quest-type formatting.

### Item name visibility (in trigger contexts)

When an item name appears in a source (e.g. letter triggers, scroll bundle names), it redacts based
on that item's own `item.visibility` condition.

---

## 3. Per-source-type segment rules

Each source type below shows its format, which fragments redact, and examples of the redacted and
revealed states.

### `store`

Format: `Purchase from <storeName> [<storeQualifier>]`

The store qualifier "(after upgrading/repairing)" appears only when the source has `upgraded: true`.
The qualifier's condition comes from `source.visibility` on the `RecipeSource`. Store name follows
`storeVisibility`.

**Example — Beet Soup** (`store(inn, upgraded)`):

- Redacted: `Purchase from the Sleeping Dragon Inn (after ███)`
- Qualifier revealed: `Purchase from the Sleeping Dragon Inn (after upgrading)`

**Example — Cherry Cobbler** (`store(darcy)`):

- Redacted: `Purchase from ███`
- Revealed: `Purchase from Darcy's Stall`

### `store_with_perk`

Format: `Purchase from <storeName>, with <perkLabel>`

Store name and perk name redact independently. Store name follows `storeVisibility`. Note: this
changes the existing format from "Purchase from X (requires Y perk)" to "Purchase from X, with Y"
for consistency with the `mines_chest` format.

**Example — Espresso Machine** (`store_with_perk(darcy, espresso_yourself)`):

- Fully redacted: `Purchase from ███, with the ███ perk (Cooking tier 5)`
- Store revealed: `Purchase from Darcy's Stall, with the ███ perk (Cooking tier 5)`
- Perk revealed: `Purchase from ███, with the Espresso Yourself perk (Cooking tier 5)`
- Fully revealed: `Purchase from Darcy's Stall, with the Espresso Yourself perk (Cooking tier 5)`

### `scroll_bundle`

Format: `Purchase <bundleName> from <storeName> [<storeQualifier>]`

Bundle name redacts with `recipe.visibility` (the recipe's own visibility condition, which for
upgrade-gated bundles will typically be the same quest as the store qualifier). Store name follows
`storeVisibility`. The store qualifier only appears when `source.visibility` is non-always (i.e. the
bundle requires an upgrade/repair to purchase); bundles without such a gate (e.g. from Balor's
Wagon) produce no qualifier.

**Example — Apple Sign** (`scroll_bundle(general, "Fall Crop Sign Scroll Bundle")`):

- Fully redacted: `Purchase ███ from the General Store (after ███)`
- Qualifier revealed: `Purchase ███ from the General Store (after repairing)`
- Fully revealed: `Purchase the Fall Crop Sign Scroll Bundle from the General Store (after repairing)`

**Example — Chess Pawn Piece** (`scroll_bundle(balor, "Chess Piece Scroll Bundle")`):

- Redacted: `Purchase ███ from Balor's Wagon`
- Revealed: `Purchase the Chess Piece Scroll Bundle from Balor's Wagon`

### `mines_chest`

Format: `Find in a Treasure Chest in <biomeLabel>, with <perkLabel>`

Structure is always visible (treasure chests are not a mechanic surprise). Biome label and perk label
redact independently per the shared grammar segments.

**Example — Chickpea Curry** (`mines_chest(biome_1, taste_maker)`):

- Fully redacted: `Find in a Treasure Chest in ███ (Mines floors ███–███), with the ███ perk (Cooking tier 1)`
- Biome redacted, perk revealed: `Find in a Treasure Chest in ███ (Mines floors ███–███), with the Taste Maker perk (Cooking tier 1)`
- Fully revealed: `Find in a Treasure Chest in the Tide Caverns (Mines floors 20–39), with the Taste Maker perk (Cooking tier 1)`

### `mines_dig_site`

Format: `Dig up in <biomeLabel>, with <perkLabel>`

**Entire source is gated** behind `perkUnlocked(perkId)` as a top-level conditional node. Dig sites
are a mechanic surprise; knowing they exist is itself a spoiler. Once the perk is unlocked, the biome
label redacts on `minesLevel` as a nested conditional.

**Example — Stalactite Arch** (`mines_dig_site(biome_2, natural_beauty)`):

- Mechanic hidden: `███`
- Perk unlocked, biome redacted: `Dig up in ███ (Mines floors ███–███), with the Natural Beauty perk (Archaeology tier 3)`
- Fully revealed: `Dig up in the Deep Earth (Mines floors 40–59), with the Natural Beauty perk (Archaeology tier 3)`

### `perk`

Format: `Unlock <perkLabel>`

Perk label redacts per the shared grammar segment.

**Example — Giant Essence Stone** (`perk(magic_design)`):

- Redacted: `Unlock the ███ perk (Farming tier 4)`
- Revealed: `Unlock the Magic Design perk (Farming tier 4)`

### `quest`

Format varies by quest type. See section 3.1 below.

### `letter` (shipped item)

Format: `Receive in a letter after shipping {article} <itemName>`

Item name (with its indefinite article) redacts on `item.visibility`.

**Example — Crystal Berry Pie** (`letter(shipped, crystal_berries)`):

- Redacted: `Receive in a letter after shipping ███`
- Revealed: `Receive in a letter after shipping a Crystal Berries`

### `letter` (donated item)

Format: `Receive in a letter after donating {article} <itemName>`

Same rules as shipped item.

**Example — Deep Sea Soup** (`letter(donated, cave_kelp)`):

- Redacted: `Receive in a letter after donating ███`
- Revealed: `Receive in a letter after donating a Cave Kelp`

### `letter` (reached date)

Format: `Receive in a letter after reaching <dateLabel>`

Uses the date label grammar segment. No redactable fragments. Always fully visible.

**Example** (`letter(reached_date, { season: "winter", day: 3 })`):

- Always: `Receive in a letter after reaching Winter 3`

### `festival`

Format: `Purchase from <storeName> at the <festivalName> (<dateLabel>)`

Festival dates are extracted from `fiddle/festivals.toml` (the `date` field on each festival). Uses
the date label grammar segment. Festival stalls and festival names are always visible. No redactable
fragments in practice.

**Example — Apple Honey Curry** (`festival(harvest, nora_souvenir_stall)`):

- Always: `Purchase from the Souvenir Stall at the Harvest Festival (Fall 10)`

### `engagement`

Format: `Receive from Elsie after getting to 10 hearts with a dateable character`

No redactable fragments. Always fully visible.

Note: this source type is renamed from `relationship` to `engagement` in the pipeline extractor and
all downstream types.

### `dragon_forge`

Format: `Craft at <dragonForge>`

The Dragon Forge location name is gated behind `minesLevel(90)`. The structural text "Craft at" is
always visible; only the location name redacts.

**Example — Dragon-Forged Fang** (`dragon_forge`):

- Redacted: `Craft at ███`
- Revealed: `Craft at the Dragon Forge (Mines level 90)`

### `upgrade`

Special-cased source text per item. These are not store purchases; the recipe is a side effect of a
larger farm/house upgrade. No redactable fragments; the text is intentionally cryptic enough that the
player will puzzle it out.

| Item | Source text |
|---|---|
| House Stairs | Upgrade your home a fourth time |
| Starter Farm Bridge | Expand your farm |

### `museum_donation`

Format: `Complete {N} sets in the {wingName} wing`

No redactable fragments. Always fully visible.

### `renown`

Format: `Get the town's renown rank to level {N}`

No redactable fragments. Always fully visible.

### `chicken_statue`

Format: `Obtain from the Chicken Statue ({N} beads)`

No redactable fragments.

### `wishing_well`

Format: `Obtain from the Wishing Well ({N}t)`

No redactable fragments.

### `treasure_chest`

Format: `Fish up a {tierName}`

No redactable fragments.

### `beach_cave_chest`

Format: `Find in the Gold Treasure Chest in the Beach Cave`

No redactable fragments.

### `default`

Format: `Available from the start`

No redactable fragments.

### 3.1 Quest source formatting

Quest sources format differently per quest type. Each format has its own redactable fragments. The
`quest` source on `RecipeSource` includes `questId` and `questType`.

**Story quests:**

Format: `Complete the <questName> quest`

Quest name redacts until quest is available. Handle quest names that start with "The" (e.g. "The
Unusual Seed") to avoid "the The".

- Redacted: `Complete the ███ quest`
- Revealed: `Complete the Unusual Seed quest`

**Heart quests:**

Format: `Complete <npcName>'s <questName> quest`

NPC name follows `npcVisibility`. Quest name redacts until quest is available. These redact
independently.

- Fully redacted: `Complete ███'s ███ quest`
- NPC revealed: `Complete Balor's ███ quest`
- Fully revealed: `Complete Balor's Tall, Dark and Mysterious quest`

**Fetch quests:**

Format: `Complete <npcName>'s request for <requestedItemName>`

NPC name follows `npcVisibility`. The requested item name comes from the `requestedItemId` field on
the quest source (see section 5, pipeline additions), looked up via `items[requestedItemId].name`.
NPC name and quest details redact independently; the quest details (including item name) redact until
the quest is available.

- Fully redacted: `Complete ███'s request for ███`
- NPC revealed: `Complete Eiland's request for ███`
- Fully revealed: `Complete Eiland's request for Wild Berries`

**Crown quests:**

Format: `Complete the Crown Request for <subject>`

The subject is extracted from the quest name (strip "Crown Request: " prefix). The entire source is
gated behind `renownLevel(20)` (the crown quest category visibility), since crown requests are
themselves a progression-gated mechanic.

- Mechanic hidden: `███`
- Subject redacted: `Complete the Crown Request for ███`
- Fully revealed: `Complete the Crown Request for Crops`

**Cooking challenges** (in-game name: "Cooking Challenges", from
`fiddle.misc_local.cooking_challenges`):

Format: `Complete the <challengeRecipeName> cooking challenge`

The challenge recipe name comes from the `challengeRecipeId` field on the quest source (see
section 5, pipeline additions), looked up via `items[challengeRecipeId].name` or the recipe's
presentation name. The entire source is gated behind `npcKnown(taliferro)`, since knowing Taliferro
is what unlocks the category.

The quest type key is `tali_challenges` internally but should display as "Cooking Challenges" per
the game's localization.

- Mechanic hidden: `███`
- Recipe redacted: `Complete the ███ cooking challenge`
- Fully revealed: `Complete the Crispy Fried Earthshroom cooking challenge`

**Mission quests** (in-game name: "Mission Quests", from `fiddle.misc_local.mission_quests`):

Format: `Complete the <missionName> mission`

The entire source is gated behind `npcKnown(stillwell)`, since knowing Stillwell is what unlocks the
category.

The quest type key is `stillwell_challenges` internally but should display as "Mission Quests" per
the game's localization.

Note: mission quests do not yet exist in the pipeline data. This format is defined for when they are
added.

- Mechanic hidden: `███`
- Name redacted: `Complete the ███ mission`

---

## 4. Worked examples

Using `███` as a stand-in for `{ redacted: true }` markers.

### Beet Soup — `store(inn, upgraded)`

Segment tree:

```json
[
  "Purchase from the Sleeping Dragon Inn",
  {
    "condition": { "questId": "repair_the_inn", "type": "questAvailable" },
    "revealed": [" (after upgrading)"],
    "redacted": [" (after ", { "redacted": true }, ")"]
  }
]
```

| State | Name | Source |
|---|---|---|
| Fresh save | ███ | Purchase from the Sleeping Dragon Inn (after ███) |
| "Upgrade the Inn" quest available | ███ | Purchase from the Sleeping Dragon Inn (after upgrading) |
| Quest completed | Beet Soup | Purchase from the Sleeping Dragon Inn (after upgrading) |

### Chickpea Curry — `mines_chest(biome_1, taste_maker)`

Segment tree:

```json
[
  "Find in a Treasure Chest in ",
  {
    "condition": { "floor": 20, "type": "minesLevel" },
    "revealed": ["the Tide Caverns (Mines floors 20–39)"],
    "redacted": [
      { "redacted": true },
      " (Mines floors ",
      { "redacted": true },
      "–",
      { "redacted": true },
      ")"
    ]
  },
  ", with ",
  {
    "condition": { "level": 1, "skillId": "cooking", "type": "skillLevel" },
    "revealed": ["the Taste Maker perk (Cooking tier 1)"],
    "redacted": ["the ", { "redacted": true }, " perk (Cooking tier 1)"]
  }
]
```

| State | Name | Source |
|---|---|---|
| Fresh save (cooking < 1) | ███ | Find in a Treasure Chest in ███ (Mines floors ███–███), with the ███ perk (Cooking tier 1) |
| Cooking ≥ 1, mines < 20 | ███ | Find in a Treasure Chest in ███ (Mines floors ███–███), with the Taste Maker perk (Cooking tier 1) |
| Mines ≥ 20 + perk unlocked | Chickpea Curry | Find in a Treasure Chest in the Tide Caverns (Mines floors 20–39), with the Taste Maker perk (Cooking tier 1) |

### Stalactite Arch — `mines_dig_site(biome_2, natural_beauty)`

Segment tree:

```json
[
  {
    "condition": { "perkId": "natural_beauty", "type": "perkUnlocked" },
    "revealed": [
      "Dig up in ",
      {
        "condition": { "floor": 40, "type": "minesLevel" },
        "revealed": ["the Deep Earth (Mines floors 40–59)"],
        "redacted": [
          { "redacted": true },
          " (Mines floors ",
          { "redacted": true },
          "–",
          { "redacted": true },
          ")"
        ]
      },
      ", with the Natural Beauty perk (Archaeology tier 3)"
    ]
  }
]
```

| State | Name | Source |
|---|---|---|
| Fresh save | ███ | ███ |
| Perk unlocked, mines < 40 | ███ | Dig up in ███ (Mines floors ███–███), with the Natural Beauty perk (Archaeology tier 3) |
| Perk unlocked + mines ≥ 40 | Stalactite Arch | Dig up in the Deep Earth (Mines floors 40–59), with the Natural Beauty perk (Archaeology tier 3) |

### Apple Sign — `scroll_bundle(general, "Fall Crop Sign Scroll Bundle")`

Bundle name condition comes from `recipe.visibility`, which for this item is
`questCompleted(repair_the_general_store)`. The qualifier condition comes from `source.visibility`.

Segment tree:

```json
[
  "Purchase ",
  {
    "condition": { "questId": "repair_the_general_store", "type": "questCompleted" },
    "revealed": ["the Fall Crop Sign Scroll Bundle"]
  },
  " from the General Store",
  {
    "condition": { "questId": "repair_the_general_store", "type": "questAvailable" },
    "revealed": [" (after repairing)"],
    "redacted": [" (after ", { "redacted": true }, ")"]
  }
]
```

| State | Name | Source |
|---|---|---|
| Fresh save | ███ | Purchase ███ from the General Store (after ███) |
| Quest available | ███ | Purchase ███ from the General Store (after repairing) |
| Quest completed | Apple Sign | Purchase the Fall Crop Sign Scroll Bundle from the General Store (after repairing) |

### Cherry Cobbler — `store(darcy)`

Segment tree:

```json
[
  "Purchase from ",
  {
    "condition": { "questId": "repair_the_bridge", "type": "questCompleted" },
    "revealed": ["Darcy's Stall"]
  }
]
```

| State | Name | Source |
|---|---|---|
| Fresh save | ███ | Purchase from ███ |
| Bridge repaired | Cherry Cobbler | Purchase from Darcy's Stall |

### Dragon Forge — `dragon_forge`

Segment tree:

```json
[
  "Craft at ",
  {
    "condition": { "floor": 90, "type": "minesLevel" },
    "revealed": ["the Dragon Forge (Mines level 90)"]
  }
]
```

| State | Name | Source |
|---|---|---|
| Mines < 90 | Dragon-Forged Fang | Craft at ███ |
| Mines ≥ 90 | Dragon-Forged Fang | Craft at the Dragon Forge (Mines level 90) |

(Dragon-forged items have `visibility: always`, so the name is never redacted.)

---

## 5. Implementation scope

### Data & pipeline corrections (prerequisite)

- Set `storeVisibility` to `{ type: "always" }` for starter stores: `carpenter`, `general`,
  `hayden`, `inn`. (The others are already `always`.)
- Fix the pipeline to derive recipe/item visibility from per-item requirements in `stores.toml`
  (e.g. `repaired_inn = true`, `reached_date = "summer"`, `unlocked_deep_woods = true`) rather than
  inheriting the store-level `storeVisibility` gate. Currently the pipeline over-gates: all inn
  recipes are redacted until the inn is upgraded, but recipes without the `repaired_inn` requirement
  (e.g. Lemon Pie) are purchasable from day one. The per-item requirements are the correct source
  of truth for recipe visibility.
- Rename source type `relationship` → `engagement` in the pipeline extractor and all downstream
  types (`RecipeSource`, format functions, etc.).
- Fix item visibility for items whose conditions are currently wrong (e.g. `crystal_berries` should
  be gated by `minesLevel`). Tracked in #78.

### Pipeline data additions

- Add `upgradeAction?: string` to store records in `TrackerData.stores`. Set to `"repairing"` for
  the General Store; omit for others (defaults to `"upgrading"`).
- Add `date: { season: Season; day: number }` to festival records in `TrackerData.festivals`.
  Extracted from `fiddle/festivals.toml`.
- Add `requestedItemId?: ItemId` to the `quest` variant of `RecipeSource` as an optional field.
  Present for fetch quests, absent for other quest types. Extracted from the quest's
  `stages[].requirements.has_item` in `fiddle/quests/fetch_quests.toml`.
- Add `challengeRecipeId?: RecipeId` to the `quest` variant of `RecipeSource` as an optional field.
  Present for cooking challenges, absent for other quest types. Extracted from the quest's
  `stages[].requirements.has_item` in `fiddle/quests/tali_challenges.toml`.

### Frontend changes

- Add `SourceSegment` type (in `visibility.ts` or a new file). Use non-empty tuple arrays
  (`[SourceSegment, ...SourceSegment[]]`).
- Add `buildSourceSegments()` function alongside `recipeSourceLabel()` in `format.ts` (or a new
  `source-segments.ts`).
- Extend `RecipeSourceLookups` (or define a new lookups type) to include `storeVisibility`,
  `npcVisibility`, `questVisibility`, and `categoryVisibility` maps, which `buildSourceSegments()`
  needs for fragment conditions.
- Update UI components to render segment trees instead of flat strings. The existing
  `recipeSourceLabel()` can remain for flat-string contexts (search, accessibility).
- Remove `redactionState()` and the `"redacted" | "source-only" | "visible"` trichotomy; the
  segment tree encodes this granularity directly.

### Deferred

- Click-to-reveal UX for individual redacted segments (issue #6).
- Non-recipe item sources use a different `Source` type with `location`/`restrictions`; extending
  the segment model to those is tracked in #78.
- Source audit against wiki data (issue #97).
