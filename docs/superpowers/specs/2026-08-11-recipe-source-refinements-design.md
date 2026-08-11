# Recipe source refinements

**Goal:** Clean up recipe source display labels, enrich the `RecipeSource` type union with richer data, add top-level `perks` and `stores` lookups to `TrackerData`, and show source-type icons next to recipe source labels.

**Tech stack:** TypeScript pipeline extractors, Svelte 5, Lucide icons, Tailwind 4

## Data model changes

### New branded types

```typescript
export type FestivalId = string & { readonly __brand: "FestivalId" };
export type PerkId = string & { readonly __brand: "PerkId" };
export type QuestType = string & { readonly __brand: "QuestType" };
export type StoreId = string & { readonly __brand: "StoreId" };
export type TreasureChestTier = string & { readonly __brand: "TreasureChestTier" };
```

### New top-level lookups in `TrackerData`

**Perks** — extracted from `ui/skill_menu/*.toml`, cross-referenced with `perks.toml` for display names:

```typescript
perks: Record<PerkId, {
  name: string;       // e.g., "Dungeon Delicacies"
  skillId: SkillId;   // e.g., "combat"
  tier: number;       // 1–5
}>;
```

Tier-to-skill-level mapping is a global constant from `ui/skill_menu/defaults.toml` (`category.level_requirements = [1, 15, 30, 45, 60]`), stored once on TrackerData (not per-perk):

```typescript
perkTierLevels: number[];  // [1, 15, 30, 45, 60]
```

The extractor reads all `ui/skill_menu/*.toml` files except `defaults.toml`. `mount.toml` is included (it defines three real perks: `horsepower`, `harvest_horse`, `nice_ride` under the "Mistmare" skill). No filtering by skill; every perk defined in any skill menu is extracted.

**Stores** — extracted from `stores.toml`, top-level `name` field per store:

```typescript
stores: Record<StoreId, {
  article?: "the";  // present when the store name takes a definite article
  name: string;     // e.g., "General Store", "Merri's Stall"
}>;
```

The `article` field is `"the"` for stores whose names take a definite article in context. Classification rule: possessive names (containing `'s` or ending in `'`) and bare-noun stall names omit the article; the rest get `"the"`.

- **"the"**: General Store, Carpenter's Shop, Tackle Shop, Blacksmith's Shop, Sleeping Dragon Inn
- **No article**: Merri's Stall, Balor's Wagon, Darcy's Stall, Louis' Stall, Vera's Stall, Zorel's Stall, Wheedle's Stall, Hayden's Shop, Valen's Clinic, Food Stall, Souvenir Stall, Clothing Stall

Note: "Hayden's Shop" and "Valen's Clinic" are possessives and do *not* get "the" (unlike "the Carpenter's Shop", which is a common-noun establishment name that happens to contain a possessive).

**Festivals** — extracted from `festivals.toml`, top-level `name` field per festival:

```typescript
festivals: Record<FestivalId, {
  name: string;  // e.g., "Harvest Festival", "Spring Festival"
}>;
```

Used by `recipeSourceLabel` to produce correct festival names without doubling the word "festival". The label template uses the canonical name directly: "Purchase from {store} at the {festivalName}".

**Treasure chest tiers** — extracted from `items/fish/misc.toml` treasure box names, matched with `fishing.chest_tables` keys:

```typescript
treasureChestTiers: Record<TreasureChestTier, {
  name: string;  // e.g., "Wooden Treasure Box", "Golden Treasure Box"
}>;
```

### Reshaped `RecipeSource` union

All variants place `type` first for scanability. Uses branded types throughout. "Dungeon" renamed to "mines". Chicken statue and wishing well costs baked in from `fiddle.misc`.

```typescript
export type RecipeSource =
  | { type: "beach_cave_chest" }
  | { type: "chicken_statue"; cost: number }
  | { type: "default" }
  | { type: "dragon_forge" }
  | { type: "festival"; festivalId: FestivalId; storeId: StoreId }
  | { type: "letter"; trigger: "donated_item"; triggerItemId: ItemId }
  | { type: "letter"; trigger: "reached_date"; triggerDate: { day: number; season: Season; year?: number } }
  | { type: "letter"; trigger: "shipped_item"; triggerItemId: ItemId }
  | { type: "mines_chest"; biomeId: BiomeId; perkId: PerkId }
  | { type: "mines_dig_site"; biomeId: BiomeId; perkId: PerkId }
  | { type: "museum_donation"; setCount: number; wingId: WingId }
  | { type: "perk"; perkId: PerkId }
  | { type: "quest"; questId: QuestId; questType: QuestType }
  | { type: "relationship" }
  | { type: "renown"; level: number }
  | { type: "scroll_bundle"; bundleName: string; storeId: StoreId }
  | { type: "store"; requiresPerkId?: PerkId; storeId: StoreId; upgraded?: true }
  | { type: "treasure_chest"; tier: TreasureChestTier }
  | { type: "upgrade"; storeId: StoreId; upgradeName: string }
  | { type: "wishing_well"; cost: number };
```

The `store` variant uses optional fields (`upgraded?: true`, `requiresPerkId?: PerkId`) rather than separate union members. No items in the game data require both simultaneously, but the type permits it to avoid a discriminated-union problem (three members sharing `type: "store"` can't be narrowed by TypeScript). Runtime label logic checks `upgraded` first, then `requiresPerkId`, then falls through to the base case.

Key changes from the current type:
- `dungeon_chest` → split into `mines_chest` and `mines_dig_site` (cooking recipes drop from treasure chests; furniture recipes drop from dig sites)
- `perk` field (string) → `perkId` field (`PerkId`) throughout
- `storeId` fields typed as `StoreId`
- `festivalId` typed as `FestivalId`
- `questType` typed as `QuestType`
- `chestTier` (string) → `tier` (`TreasureChestTier`)
- `letter` with `reached_date` gains `triggerDate: { day, season, year? }` — `year` is optional; year 1 is omitted from display
- `store` gains optional `upgraded` and `requiresPerkId`
- `upgrade` gains `storeId: StoreId` instead of hardcoding "the carpenter"
- `chicken_statue` and `wishing_well` replace tier labels with actual `cost` (number of beads/tickets), extracted from `fiddle.misc.chicken_statue.{high,low}_price` and `fiddle.misc.wishing_well.{high,low}_price`

### Biome ID derivation

The mines extractor (`extractMines`) currently synthesizes biome IDs as `biome_${index}` (e.g., `biome_0`, `biome_1`). The recipe extractor must use the same derivation: biomes in `dungeons.toml` are an ordered array with no `id` field, so the biome ID is its zero-based array index formatted as `biome_${i}`. Both extractors must share this convention.

The recipe extractor currently reads a nonexistent `biomeObj.id` and falls back to `"unknown"`. This must be fixed to use the array index, matching `extractMines`.

## Display label formats

All labels start with a verb. The `withIndefiniteArticle(name)` helper prepends "a" or "an" based on leading vowel sound. Store names are formatted via `formatStoreName(storeId, stores)` which prepends the store's article when present. Biome names are formatted via `formatBiomeName(biomeId, biomes)` which handles leading "The" in source data (e.g., "The Tide Caverns" → "the Tide Caverns" when mid-sentence).

| Source type | Label format | Example |
|---|---|---|
| `beach_cave_chest` | "Find in the Gold Treasure Chest in the Beach Cave" | — |
| `chicken_statue` | "Obtain from the Chicken Statue ({cost} beads)" | "Obtain from the Chicken Statue (10 beads)" |
| `default` | "Available from the start" | — |
| `dragon_forge` | "Craft at the Dragon Forge (Mines level 90)" | — |
| `festival` | "Purchase from {store} at the {festivalName}" | "Purchase from Souvenir Stall at the Harvest Festival" |
| `letter` (ship) | "Receive in a letter after shipping {a/an} {item}" | "Receive in a letter after shipping an Apple" |
| `letter` (donate) | "Receive in a letter after donating {a/an} {item}" | "Receive in a letter after donating a Sweetroot" |
| `letter` (date) | "Receive in a letter after reaching {season} {day}" | "Receive in a letter after reaching Summer 28" |
| `letter` (date, year>1) | "Receive in a letter after reaching {season} {day}, Year {year}" | — (not yet in game data) |
| `mines_chest` | "Find in a Treasure Chest in {biome} (floors {start}–{end}), with the {perk} perk ({skill} tier {n})" | "Find in a Treasure Chest in the Deep Earth (floors 40–59), with the Taste Maker perk (Cooking tier 1)" |
| `mines_dig_site` | "Dig up in {biome} (floors {start}–{end}), with the {perk} perk ({skill} tier {n})" | "Dig up in the Lava Caves (floors 60–79), with the Natural Beauty perk (Archaeology tier 3)" |
| `museum_donation` | "Complete {n} set/sets in the {wing} wing" | "Complete 1 set in the Archaeology wing" |
| `perk` | "Unlock the {perk} perk ({skill} tier {n})" | "Unlock the Ornamental perk (Farming tier 4)" |
| `quest` | "Complete the {quest} quest" | "Complete the Fried Earthshroom Challenge quest" |
| `relationship` | "Receive from Elsie after getting to 10 hearts with a dateable character" | — |
| `renown` | "Get the town rank to level {n}" | "Get the town rank to level 52" |
| `scroll_bundle` | "Purchase the {bundle} from {store}" | "Purchase the Chess Piece Scroll Bundle from Balor's Wagon" |
| `store` | "Purchase from {store}" | "Purchase from the General Store" |
| `store` (upgraded) | "Purchase from {store} (after upgrade)" | "Purchase from the Sleeping Dragon Inn (after upgrade)" |
| `store` (perk) | "Purchase from {store} (requires {perk} perk)" | "Purchase from Darcy's Stall (requires Espresso Yourself perk)" |
| `treasure_chest` | "Fish up {a/an} {name}" | "Fish up a Golden Treasure Box" |
| `upgrade` | "Purchase {name} from {store}" | "Purchase House Stairs from the Carpenter's Shop" |
| `wishing_well` | "Obtain from the Wishing Well ({cost}t)" | "Obtain from the Wishing Well (100t)" |

## Helpers

### `withIndefiniteArticle`

```typescript
function withIndefiniteArticle(name: string): string {
  const firstChar = name.charAt(0).toLowerCase();
  const article = "aeiou".includes(firstChar) ? "an" : "a";
  return `${article} ${name}`;
}
```

### `formatStoreName`

```typescript
function formatStoreName(
  storeId: StoreId,
  stores: Record<StoreId, { article?: "the"; name: string }>,
): string {
  const store = stores[storeId];
  if (!store) return titleCase(storeId);
  return store.article ? `${store.article} ${store.name}` : store.name;
}
```

### `formatBiomeName`

Biome names from the game data may start with "The" (e.g., "The Tide Caverns", "The Lava Caves") or not (e.g., "Upper Mines", "Deep Earth"). When used mid-sentence, leading "The" is lowercased to "the"; names without a leading article get "the" prepended.

```typescript
function formatBiomeName(biomeId: BiomeId, biomes: TrackerData["mines"]["biomes"]): string {
  const biome = biomes.find((b) => b.id === biomeId);
  if (!biome) return titleCase(biomeId);
  if (biome.name.startsWith("The ")) return `the ${biome.name.slice(4)}`;
  return `the ${biome.name}`;
}
```

## Source type icons

Each source label gets a Lucide icon replacing the current green dot. The `recipeSourceLabel` return type changes from `string` to `{ icon: ComponentType; label: string }` (or the component passes source objects directly to the renderer instead of pre-mapping to strings — see "Presentation model" below).

| Source type | Lucide icon |
|---|---|
| `default` | `CircleCheck` |
| `store` / `scroll_bundle` | `ShoppingCart` |
| `upgrade` | `Forklift` |
| `quest` | `Scroll` |
| `perk` | `Sparkles` |
| `mines_chest` / `mines_dig_site` | `Pickaxe` |
| `letter` | `Mail` |
| `festival` | `PartyPopper` |
| `museum_donation` | `Landmark` |
| `chicken_statue` / `wishing_well` | `Coins` |
| `dragon_forge` | `Flame` |
| `beach_cave_chest` / `treasure_chest` | `Archive` |
| `renown` | `Crown` |
| `relationship` | `Heart` |

### Presentation model change

The current `RecipeEntry` in `recipes-content.svelte` stores `sourceLabels: string[]`, which discards type information needed for icons. Two options:

**Option A (recommended):** Change `RecipeEntry` to carry `sources: RecipeSource[]` alongside (or instead of) `sourceLabels`. The template calls `recipeSourceLabel` and `recipeSourceIcon` at render time. This preserves type info for icon selection.

**Option B:** Change `recipeSourceLabel` to return `{ icon: ComponentType; label: string }` and store that array on `RecipeEntry`.

Either works; Option A is simpler and avoids importing Lucide components into the format utility.

## Pipeline changes

### New extractor: `extractPerks`

Source: `ui/skill_menu/*.toml` (for perk→skill→tier mapping) + `perks.toml` (for display names) + `ui/skill_menu/defaults.toml` (for `category.level_requirements`)

For each skill menu file (one per skill, including `mount.toml` but excluding `defaults.toml`), iterate `tier_1` through `tier_5` arrays. Each entry has a `perk` field (the perk ID). Look up the perk's `name` in `perks.toml`. Emit:

```typescript
perks[perkId] = { name, skillId, tier: tierNumber };
perkTierLevels = defaults.category.level_requirements;  // [1, 15, 30, 45, 60]
```

### New extractor: `extractStoresMeta`

Source: `stores.toml`

For each top-level key, read the `name` field. Determine `article` based on possessive heuristic: if the name contains `'s ` or ends with `'`, omit the article. If the name is a bare noun without an establishment qualifier (e.g., "Food Stall"), omit the article. Otherwise, set `article: "the"`.

### New extractor: `extractFestivals`

Source: `festivals.toml`

For each top-level key (excluding `default`), read the `name` field. Emit `festivals[festivalId] = { name }`.

### New extractor: `extractTreasureChestTiers`

Source: `items/fish/misc.toml` for canonical names (`treasure_box_{tier}.name`), matched with `fishing.chest_tables` keys for the tier IDs.

The matching rule: `chest_tables` keys are `wood`, `copper`, `silver`, `gold`, `abyss`. The item IDs are `treasure_box_wood`, `treasure_box_copper`, `treasure_box_silver`, `treasure_box_gold`. The tier key maps to item ID via `treasure_box_${tier}`.

### Modified extractor: `extractRecipes`

- **Biome ID fix**: `collectDungeonDelicacySources` (renamed below) must use the biome's array index to derive `biome_${i}` as BiomeId, matching `extractMines`. The current fallback to `biomeObj.id ?? "unknown"` is a bug.

- **`collectDungeonDelicacySources`** → rename to `collectMinesRecipeSources`: Both `dungeon_delicacies` and `taste_maker` arrays produce `mines_chest` sources (both mechanically drop recipe scrolls from treasure chests; the flavor text differs but the acquisition method is the same). Merge `collectBiomeFurnitureSources` into this function; the `furniture` array produces `mines_dig_site` sources with perkId `natural_beauty`.

- **`collectStoreScrollSources`**: When a `recipe_scroll` entry has `requirements`, check for named requirements that resolve to upgrade predicates (`repaired_inn`, `repaired_general_store`, `repaired_carpenters_shop`) and set `upgraded: true` on the source. Check for `has_perk` and set `requiresPerkId`. **Also handle `include_recipe` entries** — these can also carry requirements (e.g., Darcy's espresso machine with `has_perk = "espresso_yourself"`). The current extractor already processes `include_recipe` entries but discards their requirements.

- **`collectLetterScrollSources`**: When trigger is `reached_date`, extract `{ season, day, year? }` from `requirements.reached_date` and include as `triggerDate`.

- **`collectChickenStatueSources`** and **`collectWishingWellSources`**: Replace `tier: "small" | "large"` with `cost: number`, reading from `fiddle.misc.chicken_statue.{high,low}_price` and `fiddle.misc.wishing_well.{high,low}_price`. `small_roll` → `low_price`, `large_roll` → `high_price`.

- **`collectPerkSources`**: Use `PerkId` instead of raw string.

- **`collectHardcodedSources`**: `upgrade` sources gain `storeId: "carpenter" as StoreId`.

- **`collectFishingChestSources`**: Use `TreasureChestTier` for the tier field.

- All `storeId` fields cast to `StoreId`, `festivalId` to `FestivalId`, `questType` to `QuestType`.

### `recipeSourceLabel` lookups

The format function needs expanded lookups. Fields that are required for correct label rendering are **not optional** — the caller must provide them:

```typescript
interface RecipeSourceLookups {
  biomes: { endFloor: number; id: string; name: string; startFloor: number }[];
  festivals: Record<string, { name: string }>;
  itemNames: Record<string, string>;
  perks: Record<string, { name: string; skillId: string; tier: number }>;
  perkTierLevels: number[];
  questNames: Record<string, string>;
  skillNames: Record<string, string>;
  stores: Record<string, { article?: "the"; name: string }>;
  treasureChestTiers: Record<string, { name: string }>;
}
```

## GH issues to file

1. **Centralized icon component** — create a semantic `<SourceIcon type={...} />` component that maps internal source type semantics to icons, instead of importing Lucide icons directly throughout the codebase. Also revisit the `Archive` icon for treasure chests; design or source something better.
2. **Auto-complete recipe from quest reward** — when a quest is completed and its reward includes a recipe, auto-mark the recipe as complete. Show a toast notification. Check for prior completion to avoid double-toggling.

## Potential future types

These branded types may be useful for other parts of the codebase:

- `PlayerHomeUpgrade` — "Home Upgrade 1" through "Home Upgrade 4"
- `PlayerFarmExpansion` — "Farm Expansion 1" (currently only one, but numbered for future additions)

These are out of scope for this spec but worth considering when touching adjacent code.

## Files touched

| File | Action |
|---|---|
| `src/lib/types/tracker-data.ts` | Add `PerkId`, `StoreId`, `FestivalId`, `QuestType`, `TreasureChestTier`; reshape `RecipeSource`; add `perks`, `perkTierLevels`, `stores`, `festivals`, `treasureChestTiers` to `TrackerData` |
| `pipeline/src/extractors/perks.ts` | New: `extractPerks` |
| `pipeline/src/extractors/stores-meta.ts` | New: `extractStoresMeta` (store display names for recipe labels) |
| `pipeline/src/extractors/festivals.ts` | New: `extractFestivals` |
| `pipeline/src/extractors/treasure-chest-tiers.ts` | New: `extractTreasureChestTiers` |
| `pipeline/src/extractors/recipes.ts` | Modify: fix biome ID derivation, rename dungeon→mines, split chest/dig-site, enrich sources, handle `include_recipe` requirements, use branded types, bake in costs |
| `pipeline/src/extractors/recipes.test.ts` | Modify: update for new source shapes |
| `pipeline/src/main.ts` | Wire up new extractors |
| `src/lib/utils/format.ts` | Update `recipeSourceLabel`, add `withIndefiniteArticle`, `formatStoreName`, `formatBiomeName`, add `RecipeSourceLookups` interface |
| `src/lib/components/recipes-content.svelte` | Change `RecipeEntry` to carry source objects (not just strings), replace green dot with Lucide icons, pass expanded lookups |

## Out of scope

- Skills page integration for perks (future work, but the data model supports it)
- Store upgrade tracking on non-recipe item sources
- Perk descriptions or essence costs in the perks lookup
- `PlayerHomeUpgrade` and `PlayerFarmExpansion` types
