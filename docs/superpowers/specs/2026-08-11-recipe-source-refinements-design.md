# Recipe source refinements

**Goal:** Clean up recipe source display labels, enrich the `RecipeSource` type union with richer data, add a top-level `perks` and `stores` lookup to `TrackerData`, and show source-type icons next to recipe source labels.

**Tech stack:** TypeScript pipeline extractors, Svelte 5, Lucide icons, Tailwind 4

## Data model changes

### New branded types

```typescript
export type PerkId = string & { readonly __brand: "PerkId" };
export type StoreId = string & { readonly __brand: "StoreId" };
```

### New top-level lookups in `TrackerData`

**Perks** — extracted from `ui/skill_menu/*.toml`, cross-referenced with `perks.toml` for display names:

```typescript
perks: Record<PerkId, {
  name: string;       // e.g., "Dungeon Delicacies"
  skillId: SkillId;   // e.g., "combat"
  skillLevel: number; // unlock level: 1, 15, 30, 45, or 60
  tier: number;       // 1–5
}>;
```

Tier-to-skill-level mapping is fixed: tier 1 → level 1, tier 2 → level 15, tier 3 → level 30, tier 4 → level 45, tier 5 → level 60.

**Stores** — extracted from `stores.toml`, top-level `name` field per store:

```typescript
stores: Record<StoreId, {
  article?: "the";  // present when the store name takes a definite article
  name: string;     // e.g., "General Store", "Merri's Stall"
}>;
```

The `article` field is `"the"` for stores whose names read naturally with a definite article ("the General Store", "the Sleeping Dragon Inn", "the Carpenter's Shop", "the Tackle Shop", "the Blacksmith's Shop"). Possessive names ("Merri's Stall", "Balor's Wagon", "Darcy's Stall") and short names ("Food Stall", "Souvenir Stall") omit the field.

### Reshaped `RecipeSource` union

All variants place `type` first for scanability. Uses `PerkId` and `StoreId` branded types. Letter date variant gains `triggerDate`. Store variant gains optional `requiresUpgrade` and `requiresPerkId`. "Dungeon" renamed to "mines" throughout.

```typescript
export type RecipeSource =
  | { type: "beach_cave_chest" }
  | { type: "chicken_statue"; tier: "large" | "small" }
  | { type: "default" }
  | { type: "dragon_forge" }
  | { type: "festival"; festivalId: string; storeId: StoreId }
  | { type: "letter"; trigger: "donated_item"; triggerItemId: ItemId }
  | { type: "letter"; trigger: "reached_date"; triggerDate: { day: number; season: Season } }
  | { type: "letter"; trigger: "shipped_item"; triggerItemId: ItemId }
  | { type: "mines_chest"; biomeId: BiomeId; perkId: PerkId }
  | { type: "mines_dig_site"; biomeId: BiomeId; perkId: PerkId }
  | { type: "museum_donation"; setCount: number; wingId: WingId }
  | { type: "perk"; perkId: PerkId }
  | { type: "quest"; questId: QuestId; questType: string }
  | { type: "relationship" }
  | { type: "renown"; level: number }
  | { type: "scroll_bundle"; bundleName: string; storeId: StoreId }
  | { type: "store"; requiresPerkId?: PerkId; requiresUpgrade?: string; storeId: StoreId }
  | { type: "treasure_chest"; chestTier: string }
  | { type: "upgrade"; storeId: StoreId; upgradeName: string }
  | { type: "wishing_well"; tier: "large" | "small" };
```

Key changes from the current type:
- `dungeon_chest` → split into `mines_chest` and `mines_dig_site` (cooking recipes drop from treasure chests; furniture recipes drop from dig sites)
- `perk` field (string) → `perkId` field (`PerkId`) throughout
- `storeId` fields typed as `StoreId`
- `letter` with `reached_date` gains `triggerDate: { day: number; season: Season }`
- `store` gains optional `requiresUpgrade` (e.g., `"repaired_inn"`) and `requiresPerkId` (e.g., `"espresso_yourself"`)
- `upgrade` gains `storeId` instead of hardcoding "the carpenter"

## Display label formats

All labels start with a verb. The `withIndefiniteArticle(name)` helper prepends "a" or "an" based on leading vowel sound. Store names are formatted via `formatStoreName(storeId, stores)` which prepends the store's article when present.

| Source type | Label format | Example |
|---|---|---|
| `beach_cave_chest` | "Find in the Gold Treasure Chest in the Beach Cave" | — |
| `chicken_statue` | "Obtain from the Chicken Statue ({n} beads)" | "Obtain from the Chicken Statue (10 beads)" |
| `default` | "Available from the start" | — |
| `dragon_forge` | "Craft at the Dragon Forge (Mines level 90)" | — |
| `festival` | "Purchase from {store} at the {festival} festival" | "Purchase from Souvenir Stall at the Harvest festival" |
| `letter` (ship) | "Receive in a letter after shipping {article} {item}" | "Receive in a letter after shipping an Apple" |
| `letter` (donate) | "Receive in a letter after donating {article} {item}" | "Receive in a letter after donating a Sweetroot" |
| `letter` (date) | "Receive in a letter after reaching {season} {day}" | "Receive in a letter after reaching Summer 28" |
| `mines_chest` | "Find in a treasure chest with the {perk} perk ({skill} tier {n})" | "Find in a treasure chest with the Dungeon Delicacies perk (Combat tier 2)" |
| `mines_dig_site` | "Find in a dig site with the {perk} perk ({skill} tier {n})" | "Find in a dig site with the Natural Beauty perk (Archaeology tier 2)" |
| `museum_donation` | "Complete {n} set(s) in the {wing} wing" | "Complete 1 set in the Archaeology wing" |
| `perk` | "Unlock the {perk} perk ({skill} tier {n})" | "Unlock the Ornamental perk (Farming tier 3)" |
| `quest` | "Complete the {quest} quest" | "Complete the Fried Earthshroom Challenge quest" |
| `relationship` | "Receive from Elsie after getting to 10 hearts with a dateable character" | — |
| `renown` | "Get the town rank to level {n}" | "Get the town rank to level 52" |
| `scroll_bundle` | "Purchase the {bundle} from {store}" | "Purchase the Chess Piece Scroll Bundle from Balor's Wagon" |
| `store` | "Purchase from {store}" | "Purchase from the General Store" |
| `store` (upgrade) | "Purchase from {store} (after upgrade)" | "Purchase from the Sleeping Dragon Inn (after upgrade)" |
| `store` (perk) | "Purchase from {store} (requires {perk} perk)" | "Purchase from Darcy's Stall (requires Espresso Yourself perk)" |
| `treasure_chest` | "Fish up a {tier} Treasure Box" | "Fish up a Gold Treasure Box" |
| `upgrade` | "Purchase {name} from {store}" | "Purchase House Stairs from the Carpenter's Shop" |
| `wishing_well` | "Obtain from the Wishing Well ({n}t)" | "Obtain from the Wishing Well (100t)" |

## `withIndefiniteArticle` helper

```typescript
function withIndefiniteArticle(name: string): string {
  const firstChar = name.charAt(0).toLowerCase();
  const article = "aeiou".includes(firstChar) ? "an" : "a";
  return `${article} ${name}`;
}
```

This covers the vast majority of cases. Edge cases (e.g., "an hour", "a unicorn") don't appear in the game's item names.

## `formatStoreName` helper

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

## Source type icons

Each source label line gets a Lucide icon replacing the current green dot. The `recipeSourceLabel` function's lookup table also returns an icon component reference.

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

## Pipeline changes

### New extractor: `extractPerks`

Source: `ui/skill_menu/*.toml` + `perks.toml`

For each skill menu file (one per skill), iterate `tier_1` through `tier_5` arrays. Each entry has a `perk` field (the perk ID). Look up the perk's `name` in `perks.toml`. Emit:

```typescript
{
  name: perks[perkId].name,
  skillId,
  skillLevel: TIER_TO_LEVEL[tierNumber],  // {1:1, 2:15, 3:30, 4:45, 5:60}
  tier: tierNumber,
}
```

### New extractor: `extractStores`

Source: `stores.toml`

For each top-level key, read the `name` field. Determine `article` based on a hardcoded set (stores whose names naturally take "the": General Store, Carpenter's Shop, Tackle Shop, Blacksmith's Shop, Sleeping Dragon Inn, Valen's Clinic, Hayden's Shop). The rest (possessives, festival stalls) omit the article.

### Modified extractor: `extractRecipes`

- **`collectStoreScrollSources`**: When a `recipe_scroll` entry has `requirements`, check for `repaired_inn`, `repaired_general_store`, etc. (named requirements that resolve to `seen_cutscene` predicates) and set `requiresUpgrade` on the source. Check for `has_perk` and set `requiresPerkId`.
- **`collectDungeonDelicacySources`** → rename to `collectMinesRecipeSources`: Split logic based on perk type. `dungeon_delicacies` and `taste_maker` produce `mines_chest` sources. `natural_beauty` (from `collectBiomeFurnitureSources`) produces `mines_dig_site` sources.
- **`collectBiomeFurnitureSources`**: Merge into the renamed mines extractor, emitting `mines_dig_site` sources.
- **`collectLetterScrollSources`**: When trigger is `reached_date`, extract the `{ season, day }` from `requirements.reached_date` and include as `triggerDate`.
- **`collectPerkSources`**: Use `PerkId` instead of raw string. Reference the perks lookup for validation.
- **`collectHardcodedSources`**: `upgrade` sources gain `storeId: "carpenter" as StoreId`.
- All `storeId` fields cast to `StoreId`.

## GH issues to file

1. **Centralized icon component** — create a semantic `<SourceIcon type={...} />` component that maps internal source type semantics to icons, instead of importing Lucide icons directly throughout the codebase.
2. **Auto-complete recipe from quest reward** — when a quest is completed and its reward includes a recipe, auto-mark the recipe as complete. Show a toast notification. Check for prior completion to avoid double-toggling.
3. **Custom icons for chest types** — the `Archive` icon for treasure chests is a placeholder; design or source a better chest icon.

## Files touched

| File | Action |
|---|---|
| `src/lib/types/tracker-data.ts` | Add `PerkId`, `StoreId`, `Perk` interface; reshape `RecipeSource`; add `perks` and `stores` to `TrackerData` |
| `pipeline/src/extractors/perks.ts` | New: `extractPerks` |
| `pipeline/src/extractors/stores.ts` | New: `extractStores` (recipe-source-relevant store metadata) |
| `pipeline/src/extractors/recipes.ts` | Modify: rename dungeon→mines, split chest/dig-site, enrich sources, use branded types |
| `pipeline/src/extractors/recipes.test.ts` | Modify: update for new source shapes |
| `pipeline/src/main.ts` | Wire up `extractPerks`, `extractStores` |
| `src/lib/utils/format.ts` | Update `recipeSourceLabel`, add `withIndefiniteArticle`, `formatStoreName` |
| `src/lib/components/recipes-content.svelte` | Replace green dot with Lucide icons, pass store/perk lookups |

## Out of scope

- Skills page integration for perks (future work, but the data model supports it)
- Store upgrade tracking on non-recipe item sources
- Perk descriptions or essence costs in the perks lookup
