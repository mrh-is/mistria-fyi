# Complete acquisition sources

**Issue:** #78

**Goal:** Every emitted item, cosmetic, & recipe has at least one truthful, structured acquisition
source, with complete availability conditions and enough detail for spoiler-safe source display.

## Context

The current generated contract has two incompatible source models. `TrackerData.sources` is a global
`Record<ItemId, Source[]>` used by items and cosmetics; its permissive shape overloads `location`
and stores availability as a lossy flat `Restriction[]`. Recipes instead own a richer inline
`RecipeSource[]` discriminated union with per-source spoiler visibility.

The committed v1.0.2 output contains 635 items without a global source, one recipe with no inline
source, and 171 locked cosmetics without a global source. The gaps span unparsed domains including
treasure loot, mine-biome loot, artifact digging and replication, quest cosmetic rewards, museum
rewards, relationship items, festival random rewards, dates, perk rewards, area gates, & defaults.
Issue #78 is therefore a contract migration and extraction audit, not merely a final assertion.

## Inline ownership

Items, cosmetics, & recipes each own a nonempty `sources` array. The top-level `TrackerData.sources`
index is removed. Inline ownership makes completeness structural, removes the false `ItemId` typing
used for cosmetic targets, and prevents collisions among entity namespaces.

```typescript
interface Item {
  category: string;
  name: string;
  recipeId?: RecipeId;
  sources: [Source, ...Source[]];
  visibility?: VisibilityCondition;
}

interface Cosmetic {
  defaultUnlocked: boolean;
  name: string;
  slot: CosmeticSlot;
  sources: [Source, ...Source[]];
  subCategory?: string;
  visibility?: VisibilityCondition;
}

interface Recipe {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: [Source, ...Source[]];
  visibility?: VisibilityCondition;
}
```

Extractors may collect ordinary arrays; the final validator narrows them only after proving
nonemptiness.

## Shared source union

`RecipeSource` becomes the shared `Source` discriminated union. Every variant uses explicit branded
identifiers instead of a type-dependent `location` string. Common optional fields have identical
semantics:

```typescript
interface SourceDetails {
  availability?: AvailabilityCondition;
  chance?: number;
  cost?: { amount: number; currency: "beads" | "tesserae" | "tickets" };
  visibility?: VisibilityCondition;
  weight?: number;
}
```

The final union is closed. Discovering an acquisition family outside this list requires a deliberate
spec amendment rather than an ad hoc string variant:

```typescript
export type JsonValue =
  boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ProductionMethod = "cook" | "craft" | "dragon_forge" | "mill" | "smith";

export type Source =
  | { type: "default" }
  | (SourceDetails &
      (
        | { method: ProductionMethod; recipeId: RecipeId; type: "recipe" }
        | { stationId: StationId; type: "station" }
        | { storeId: StoreId; type: "store" }
        | { bundleName: string; storeId: StoreId; type: "scroll_bundle" }
        | { festivalId: FestivalId; storeId?: StoreId; type: "festival" }
        | {
            activityId: ActivityId;
            festivalId: FestivalId;
            type: "festival_activity";
          }
        | {
            challengeRecipeId?: RecipeId;
            choiceId?: DialogueChoiceId;
            questId: QuestId;
            questType?: QuestType;
            requestedItemId?: ItemId;
            trigger: "completion" | "dialogue_choice";
            type: "quest";
          }
        | { npcId: NpcId; type: "proposal" }
        | { dateId: DateId; type: "date" }
        | { type: "engagement" }
        | { type: "wedding" }
        | { trigger: "donated_item"; triggerItemId: ItemId; type: "letter" }
        | { trigger: "shipped_item"; triggerItemId: ItemId; type: "letter" }
        | {
            trigger: "reached_date";
            triggerDate: { day: number; season: Season; year?: number };
            type: "letter";
          }
        | { locationIds?: LocationId[]; type: "forage" }
        | { locationIds?: LocationId[]; type: "artifact_dig" }
        | { locationIds?: LocationId[]; type: "bug_catch" }
        | { type: "dive"; waterTypes?: WaterType[] }
        | { type: "fish"; waterTypes?: WaterType[] }
        | { type: "fish_trap" }
        | { monsterId: MonsterId; type: "monster" }
        | { monsterId: MonsterId; type: "monster_feed" }
        | { biomeId: BiomeId; type: "mine" }
        | { biomeId: BiomeId; lootGroup?: DungeonLootGroup; perkId?: PerkId; type: "mines_chest" }
        | { biomeId: BiomeId; perkId: PerkId; type: "mines_dig_site" }
        | { perkId: PerkId; type: "ritual_chamber" }
        | { tier: TreasureChestTier; type: "treasure_chest" }
        | { type: "beach_cave_chest" }
        | { originalItemId: ItemId; requiredSetCount: number; type: "artifact_replicator" }
        | { animalId: AnimalId; type: "animal_product" }
        | { seedItemId: ItemId; type: "crop" }
        | { saplingItemId: ItemId; type: "tree" }
        | { perkId: PerkId; type: "perk" }
        | { activity: "crop_harvest"; perkId: PerkId; type: "perk_drop" }
        | { setCount: number; type: "museum_donation"; wingId: WingId }
        | { level: number; type: "renown" }
        | { cost: { amount: number; currency: "beads" }; type: "chicken_statue" }
        | { cost: { amount: number; currency: "tesserae" }; type: "wishing_well" }
        | { storeId: StoreId; type: "upgrade"; upgradeName: string }
      ));
```

`ActivityId`, `DateId`, `DialogueChoiceId`, `DungeonLootGroup`, `LocationId`, `MonsterId`,
`StationId`, & `WaterType` are new branded string IDs validated against sets built from parsed
native data. The closed union replaces `store_with_perk` by expressing its perk in `availability`;
recipe production is always the `recipe` variant, avoiding a collision with station-based
acquisition.

## Recipe-backed products

Every item belonging to a tracked recipe receives a production source referencing that recipe, even
when it has direct acquisition paths:

```typescript
{ method: "cook", recipeId, type: "recipe" }
{ method: "craft", recipeId, type: "recipe" }
{ method: "mill", recipeId, type: "recipe" }
{ method: "smith", recipeId, type: "recipe" }
```

The item’s effective availability and spoiler gate recursively include the referenced recipe’s
acquisition sources; the item does not copy them. For example, the gold Champion’s Shield has a
smithing source referencing its recipe, whose source is town rank 91. A Pine Sapling has a milling
source referencing a default recipe; the sapling itself is not `default`.

Recipe references must resolve, and recursive evaluation rejects cycles while printing the full
reference path.

Production method derivation is ordered: `other/cooked_dishes` means `cook`; the `milling` tag means
`mill`; the `blacksmithing` tag means `smith`; a recipe acquired from the Dragon Forge means
`dragon_forge`; all remaining furniture recipes mean `craft`. Every member of a recipe group must
derive the same method or extraction fails with the conflicting item IDs.

A recipe production path evaluates as the production source’s own availability AND the OR of the
referenced recipe’s acquisition-source availability. Other direct item sources remain alternatives
to the complete production path.

## Default semantics

`default` means “available from the start”. It is never a fallback for unexplained content.

- Recipe defaults come from `recipe_is_default` after the existing consistency check.
- Cosmetic defaults come from `player_assets.default_unlocked`.
- Item defaults require a native starting-state marker or reviewed explicit override.
- A produced item does not inherit `default` because its recipe is default.

There is no `unknown` or `unobtainable` source used to satisfy validation.

The audited set is exactly the canonical `TrackerData.items`, `TrackerData.cosmetics`, &
`TrackerData.recipes` registries. Almanac and museum entries reference canonical item IDs and are
not validated as duplicate entities. Debug, deprecated, internal, or otherwise non-player-obtainable
native records may be omitted before registry construction through a reviewed exclusion table with
the native ID, reason, & evidence. Validation rejects any excluded ID still referenced by an almanac
category, museum set, recipe member, or source.

## Availability conditions

The current flat `Restriction[]` conversion discards `any` and `not`, loses unsupported predicates,
and truncates reached dates. It also cannot faithfully represent mixed permanent and seasonal stock,
such as Louis’s year-round inventory alongside seasonal entries.

Sources instead carry an app-facing Boolean tree:

```typescript
export type AvailabilityCondition =
  | { conditions: AvailabilityCondition[]; type: "all" }
  | { conditions: AvailabilityCondition[]; type: "any" }
  | { condition: AvailabilityCondition; type: "not" }
  | { type: "always" }
  | { seasons: Season[]; type: "season" }
  | { weathers: Weather[]; type: "weather" }
  | { end: number; start: number; type: "time" }
  | { floor: number; type: "minesLevel" }
  | { perkId: PerkId; type: "perkUnlocked" }
  | { questId: QuestId; state: "available" | "completed"; type: "quest" }
  | { level: number; skillId: SkillId; type: "skillLevel" }
  | { level: number; npcId: NpcId; type: "heartLevel" }
  | { predicate: string; type: "gamePredicate"; value: JsonValue };
```

Supported predicates become typed leaves. Unknown predicates remain losslessly serializable as
`gamePredicate`, rather than becoming `always`. Store constant, seasonal, & random stock each
produce independent paths. A seasonal path combines its season leaf with the entry's full parsed
requirements; year-round stock stays `always` unless its own requirements say otherwise.

Availability determines whether an acquisition path is currently usable. Spoiler visibility
determines whether its details may be disclosed. Both project from the same native evidence but are
stored separately and never mutate one another. Source alternatives use OR; conditions inside one
source preserve their explicit Boolean structure.

Condition evaluation is three-valued: `true`, `false`, or `unknown`. Boolean nodes use Kleene logic,
so unknown never silently becomes true. “Everything” ignores availability; “Available” includes an
entity only when at least one complete source path evaluates true; & “Timely” additionally requires
that passing path to contain a selective season condition. An unknown-only entity is unavailable in
both filtered modes and remains visible in “Everything”.

Conditions are simplified before storage. `any(always, summer)` becomes `always`; `not winter`
remains season-selective. After simplification, season selectivity recurses through `all`, `any`, &
`not` and is true when a reachable season leaf excludes at least one of the four seasons.

## Extraction architecture

Pipeline extraction uses separate internal namespaces for `Map<ItemId, Source[]>` and
`Map<CosmeticId, Source[]>`. Recipes continue collecting their own sources, but use the same append,
condition, sorting, & deduplication helpers. After registries and recipes exist, a dedicated phase:

1. Attaches accumulated item and cosmetic sources inline.
2. Adds default cosmetic sources.
3. Adds recipe-production sources to every recipe member item.
4. Validates references and nonempty arrays.
5. Computes entity and source visibility without a global index.

Structural deduplication remains deterministic and preserves the first identical source.

### Native collectors

The audit covers, at minimum:

- stores, including constant, seasonal, random, requirement-gated, item, & cosmetic stock;
- fishing and dungeon `chest_tables`;
- all relevant `dungeons.dungeons.biomes[]` loot keys, rather than one hardcoded key;
- `quests.*.rewards[].item` and `player_cosmetic`;
- museum item, cosmetic, & recipe rewards;
- monster drops and distinct feeding rewards such as Mimic Hat;
- `artifacts.loot` and the artifact-to-replica naming relationship;
- `misc.pumpkin_patch_options`, `misc.earthly_essence`, & seasonal alternatives;
- renown item, cosmetic, & recipe rewards with exact levels;
- `items.other.dating[].date_unlock` joined to `dates[].photo_item`;
- `items.other.10_heart_special_items` proposal rewards;
- letters, festivals, wedding assets, fish traps, forageables, crops, trees, animals, dives, & all
  existing recipe-source domains;
- explicit area gates for the Summit, Beach Cave, Western Ruins, Deep Woods, & repaired beach
  bridge.

Collectors preserve relevant chance, cost, tier, biome, season, & gate details when present. A
collector does not silently skip malformed entries in a claimed domain; it throws with target ID,
field path, & source-file provenance.

### Reviewed overrides

Mechanics absent from Fiddle live in small typed override tables adjacent to the relevant collector.
Each override contains the exact target ID, complete structured source, and a comment naming the
researched behavior and wiki page or other evidence. Tests assert that override targets still exist
and make obsolete overrides visible if later assets expose the mechanic natively.

Initial expected overrides include the Void Cake dialogue outcome in “The Dragonsworn Tablet” and
the Dragon Cleric set’s Lost to History ritual-chamber acquisition.

Each override is keyed by target namespace, target ID, & the canonical JSON of every source field
except derived `visibility`. Identity includes `availability`, cost, chance, & weight, so permanent
and seasonal paths remain distinct. The collector applies an override only when its identity is
absent. If native data produces the same identity, extraction fails with an “obsolete override”
diagnostic until the override is removed. A distinct native path and a distinct override may coexist
because both are truthful acquisition alternatives.

Artifact replica overrides are not acceptable when the naming rule can be proved. For each item
tagged `replica`, the extractor strips `artifact_replica_`, resolves the corresponding artifact, and
throws on a missing or ambiguous match.

## Research ledger

Unresolved records are documented in `docs/superpowers/notes/2026-08-15-issue-78-source-audit.md`.
Each entry records the target, native paths and wiki pages already checked, and the remaining
question. The ledger is a handoff aid, not a validation bypass; an unresolved emitted record
continues to fail the pipeline.

## Validation

`validateAcquisitionSources(trackerData, references)` runs after attachment and before visibility
assignment or file writes. `references` is an `AcquisitionReferenceIndex` built from parsed native
tables and extracted registries; it contains the valid values for every branded ID, including IDs
not emitted as top-level app registries. The validator aggregates deterministic failures by kind:

- items, cosmetics, & recipes with no sources;
- unresolved target IDs and every branded reference carried by a source, including recipe, quest,
  store, perk, biome, NPC, festival, item, animal, date, activity, station, monster, museum wing,
  skill, & treasure-tier IDs;
- malformed source payloads or non-JSON availability values;
- recursive recipe-source cycles.

Diagnostics include counts and every target ID. Source-count logs run only after validation passes.

## Application migration

All consumers move from global lookups to entity-owned arrays: availability, progress, search,
almanac, museum, item, & cosmetic components; source labels, icons, segment trees, recipe filters, &
redacted rows; save import; quest reward lookup; & visibility assignment.

`recipeSourceLabel` and `buildSourceSegments` become shared-source helpers. Every union switch is
exhaustive. Recipe-production sources display their method and recursively render or link the
referenced recipe’s acquisition detail without duplicating generated data.

`src/lib/data/tracker-data.json` is regenerated only through the pipeline.

## Testing strategy

Unit tests cover every native collector and override; mixed permanent and seasonal Louis stock;
nested `all`, `any`, & `not`; complete dates; typed and unknown predicates; recipe-production
propagation; evidence-backed defaults; validator aggregation and cycles; source availability; &
display and redaction for every new variant.

Integration tests run the complete asset pipeline and assert zero missing sources, valid typed
references, exact artifact-replica resolution, and reviewed source-type counts and representative
records in the generated diff.

Before each commit, run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`,
`pnpm run build`, `pnpm run pipeline -- pipeline/input/assets`, and `git diff --check` directly.

## Delivery boundaries

Issue #78 includes the shared contract, complete extraction for emitted items, cosmetics, & recipes,
the availability-condition projection needed to preserve source restrictions, app migration,
validation, generated data, documentation, & tests.

It does not add user-state fields for every possible game predicate. Predicates the app cannot yet
evaluate remain losslessly represented and evaluate `unknown`, which is conservatively unavailable
in filtered modes until relevant state exists. It also does not redesign source UI beyond changes
required to consume the shared union.
