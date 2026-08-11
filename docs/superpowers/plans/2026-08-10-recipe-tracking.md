# Recipe tracking implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract recipe identity & acquisition sources from all extractable game data locations, expose them in `TrackerData`, and display recipe provenance on collapsed almanac rows.

**Architecture:** A new `extractRecipes` extractor scans all items for `recipe_key` and `recipe_is_default`, groups items into recipe identities (`recipe_key ?? itemId`), then scans eleven data locations (quests, letters, stores, museum wings, chicken statue, fishing chests, wishing well, festivals, dungeon delicacies, and default flags) to build acquisition sources. The recipe registry becomes a new `recipes` field on `TrackerData`. Items gain a back-link `recipeId` for cheap two-way traversal. The almanac UI adds a subtitle line to collapsed colorway rows showing color count and recipe source.

**Tech Stack:** TypeScript pipeline extractor, Vitest, Svelte 5 (runes), Tailwind 4

## Global constraints

- Use **pnpm** for all commands (never npm/npx).
- **Strict TypeScript** with `strictTypeChecked` ESLint. Use `type` imports.
- **Formatting:** Prettier with double quotes, no tabs, trailing commas, 100-char width, semicolons.
- **Naming:** `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files. Branded IDs for type safety.
- Run `pnpm run check` and `pnpm run lint` before committing.
- Run `pnpm exec vitest run pipeline/` for pipeline tests.
- Sort all output arrays deterministically (by ID or name) so output is stable across runs.

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types/tracker-data.ts` | Modify | Add `RecipeId` branded type, `RecipeSource` union (10 variants), `Recipe` interface, `TrackerData.recipes` field, `recipeId` on items, `colorCount` + `recipeId` on `AlmanacCategory` items |
| `pipeline/src/extractors/recipes.ts` | Create | New extractor: builds recipe registry from items + all extractable scroll/recipe sources |
| `pipeline/src/extractors/recipes.test.ts` | Create | Unit tests for the recipe extractor using synthetic fixtures, plus one real-data integration test |
| `pipeline/src/main.ts` | Modify | Wire `extractRecipes` into pipeline step 3, add `recipes` to assembled `TrackerData` |
| `pipeline/src/extractors/almanac.ts` | Modify | Extend `collapseFurnitureColorways` to emit `colorCount` and pass `recipeKey` through to almanac items |
| `src/lib/utils/format.ts` | Modify | Add `recipeSourceLabel` helper |
| `src/lib/components/almanac-content.svelte` | Modify | Pass recipe data to `ItemRow` for collapsed colorway rows |
| `src/lib/components/item-row.svelte` | Modify | Accept optional `recipeInfo` prop, render subtitle line with color count and recipe source |

## Recipe source locations

Every file containing `recipe_scroll` or `crafting_scroll` has been audited. The plan extracts sources from all locations listed below. Sources marked "not extractable" are documented but out of scope.

| Source type | Data location | Pattern | Approx. count |
|-------------|---------------|---------|---------------|
| `default` | Items with `recipe_is_default = true` | Flag on item | ~78 |
| `quest` | `quests/{fetch_quests,stillwell_challenges,story_quests,tali_challenges}` | `rewards[].recipe_scroll` or `crafting_scroll` | ~60 |
| `letter` | `letters` | `items[].recipe_scroll` with `requirements.shipped_item` (~35) or `donated_item` (3) | ~38 |
| `store` | `stores` | Stock arrays with `recipe_scroll` or `crafting_scroll` | ~47 |
| `museum_donation` | `museum_wings/{archaeology,fish,flora,insect}` | `rewards[].entries[].crafting_scroll` | ~50 |
| `chicken_statue` | `chicken_statue` | `common.small_roll[].recipe_scroll` | 5 |
| `treasure_chest` | `fishing` | `chest_tables.{tier}.items[]` with `kind = "recipe"` and `value` as target | 12 |
| `wishing_well` | `wishing_well` | `common.large_roll[].recipe_scroll` | 3 |
| `festival` | `festivals` | Stock arrays with `recipe_scroll` and `tier_required` | 5 |
| `mine_zone` | `dungeons/dungeons` | `biomes[].dungeon_delicacies` and `taste_maker` item ID lists | varies |

### Not extractable (game knowledge, no scroll data)

- **Skill unlocks** (e.g., big bell): no scroll data in skill files
- **House upgrades** (e.g., stairs): sold in store with `has_upper_floor` requirement, not a scroll
- **Ornamental farming skill** (faux crops): linked via `faux_crop` in `object_prototypes/crop.toml` but no scroll
- **Renown crafting scroll rewards**: renown.toml gives items, not crafting scrolls
- **Cottage garden planter**: town rank item reward, not a scroll

### Special cases (excluded)

- `cutscenes.toml` line 1398: `engagement_ring_recipe_scroll` is an item ID (the scroll itself), not a `recipe_scroll` field
- `misc.toml`: commented-out chess piece `crafting_scroll`
- `chicken_statue.toml` legendary/rare tiers: commented-out `crafting_scroll` entries

---

### Task 1: Types — recipe registry & sources

**Files:**
- Modify: `src/lib/types/tracker-data.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `RecipeId` branded type, `RecipeSource` union type, `Recipe` interface, `TrackerData["recipes"]` shape, `recipeId` on items, `colorCount` + `recipeId` on `AlmanacCategory` items

These types define the contract between the pipeline extractor (task 2) and the UI (task 4). Get them right first.

- [ ] **Step 1: Add `RecipeId` branded type**

Add alongside the other branded types in `src/lib/types/tracker-data.ts`, alphabetically between `QuestId` and `RestrictionType`:

```typescript
export type RecipeId = string & { readonly __brand: "RecipeId" };
```

- [ ] **Step 2: Add `RecipeSource` discriminated union**

Add after the `RecipeId` type. This union models every extractable recipe acquisition channel.

```typescript
export type RecipeSource =
  | { type: "chicken_statue" }
  | { type: "default" }
  | { festivalId: string; type: "festival" }
  | { trigger: "donated_item" | "shipped_item"; triggerItemId: string; type: "letter" }
  | { type: "mine_zone" }
  | { type: "museum_donation"; wingId: string }
  | { questId: QuestId; questType: string; type: "quest" }
  | { storeId: string; type: "store" }
  | { type: "treasure_chest" }
  | { type: "wishing_well" };
```

- [ ] **Step 3: Add `Recipe` interface**

Add after `RecipeSource`:

```typescript
export interface Recipe {
  memberItemIds: ItemId[];
  sources: RecipeSource[];
}
```

`memberItemIds`: all item IDs sharing this recipe identity, sorted alphabetically. `sources`: how to acquire the recipe; empty when unknown; `{ type: "default" }` means available from game start. Sorted by `type` then by detail fields for deterministic output.

- [ ] **Step 4: Add `recipes` to `TrackerData`**

Insert into the `TrackerData` interface, alphabetically between `quests` and `renown`:

```typescript
recipes: Record<RecipeId, Recipe>;
```

- [ ] **Step 5: Add `recipeId` to `TrackerData.items`**

Change the items type to include an optional recipe back-link:

```typescript
items: Record<ItemId, { category: string; name: string; questGate?: QuestId[]; recipeId?: RecipeId }>;
```

- [ ] **Step 6: Add `colorCount` and `recipeId` to `AlmanacCategory` items**

Change the `AlmanacCategory` interface:

```typescript
export interface AlmanacCategory {
  id: string;
  items: Record<ItemId, { colorCount?: number; name: string; recipeId?: RecipeId }>;
  name: string;
}
```

- [ ] **Step 7: Run type-check**

Run: `pnpm run check`
Expected: Fail — `main.ts` assembles `TrackerData` without `recipes`. That is expected; task 3 fixes it.

- [ ] **Step 8: Commit**

```bash
git add src/lib/types/tracker-data.ts
git commit -m "feat(types): add Recipe, RecipeId, and RecipeSource types"
```

---

### Task 2: Pipeline extractor — `extractRecipes`

**Files:**
- Create: `pipeline/src/extractors/recipes.ts`
- Create: `pipeline/src/extractors/recipes.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` from `parse-fiddle.ts`, `TrackerData["recipes"]` shape from task 1
- Produces: `extractRecipes(fiddle: ParsedGameData): { recipes: TrackerData["recipes"]; recipeIdByItemId: Map<string, RecipeId> }`

The extractor has two phases:

1. **Collect recipe entries** — scan all items for `recipe_key` and `recipe_is_default`, grouping items by recipe identity (`recipe_key ?? itemId`). Only items with a `recipe` array (crafting recipe) or `recipe_key` are included. Items with `recipe_is_default` but no `recipe` array and no `recipe_key` (e.g., `ore_gold`) are excluded with a diagnostic log.
2. **Collect sources** — scan ten data locations for scroll/recipe references, map them to recipe IDs via an item-to-recipe index. Each data location has a dedicated helper function.

The function also returns a `recipeIdByItemId` map so the caller can stamp `recipeId` onto the item registry without re-scanning.

- [ ] **Step 1: Write test — groups items by recipe identity**

Create `pipeline/src/extractors/recipes.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

import type { RecipeId } from "$lib/types/tracker-data.js";

import { extractRecipes } from "./recipes.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    chicken_statue: {},
    dungeons: {},
    festivals: {},
    fishing: {},
    items: {},
    letters: {},
    museum_wings: {},
    quests: {},
    stores: {},
    wishing_well: {},
    ...overrides,
  } as ParsedGameData;
}

describe("extractRecipes", () => {
  it("groups colorway items by recipe_key into a single recipe", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            chair_blue: {
              name: "Sapling Chair",
              recipe: [{ item: "wood", count: 5 }],
              recipe_key: "sapling_chair",
            },
            chair_green: {
              name: "Sapling Chair",
              recipe: [{ item: "wood", count: 5 }],
              recipe_key: "sapling_chair",
            },
            chair_purple: {
              name: "Sapling Chair",
              recipe: [{ item: "wood", count: 5 }],
              recipe_key: "sapling_chair",
            },
          },
        },
      },
    });

    const { recipes, recipeIdByItemId } = extractRecipes(fiddle);
    const recipe = recipes["sapling_chair" as RecipeId];
    expect(recipe).toBeDefined();
    expect(recipe.memberItemIds).toEqual(["chair_blue", "chair_green", "chair_purple"]);
    expect(recipe.sources).toEqual([]);
    expect(recipeIdByItemId.get("chair_blue")).toBe("sapling_chair");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: FAIL — module `./recipes.js` not found.

- [ ] **Step 3: Implement `extractRecipes` — entry collection and main function**

Create `pipeline/src/extractors/recipes.ts`:

```typescript
import type {
  ItemId,
  QuestId,
  Recipe,
  RecipeId,
  RecipeSource,
  TrackerData,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

const QUEST_TYPES_WITH_SCROLLS = [
  "fetch_quests",
  "stillwell_challenges",
  "story_quests",
  "tali_challenges",
];

interface RawRecipeEntry {
  defaultUnlocked: boolean;
  itemId: string;
  recipeId: string;
}

export function extractRecipes(fiddle: ParsedGameData): {
  recipeIdByItemId: Map<string, RecipeId>;
  recipes: TrackerData["recipes"];
} {
  const entries = collectRecipeEntries(fiddle);
  const itemIdToRecipeId = new Map<string, string>();
  const grouped = new Map<string, RawRecipeEntry[]>();

  for (const entry of entries) {
    itemIdToRecipeId.set(entry.itemId, entry.recipeId);
    const group = grouped.get(entry.recipeId) ?? [];
    group.push(entry);
    grouped.set(entry.recipeId, group);
  }

  const allSources = new Map<string, RecipeSource[]>();

  function mergeSources(incoming: Map<string, RecipeSource[]>): void {
    for (const [recipeId, sources] of incoming) {
      const existing = allSources.get(recipeId) ?? [];
      existing.push(...sources);
      allSources.set(recipeId, existing);
    }
  }

  for (const [recipeId, group] of grouped) {
    if (group.some((e) => e.defaultUnlocked)) {
      const existing = allSources.get(recipeId) ?? [];
      existing.push({ type: "default" });
      allSources.set(recipeId, existing);
    }
  }

  mergeSources(collectQuestScrollSources(fiddle, itemIdToRecipeId));
  mergeSources(collectLetterScrollSources(fiddle, itemIdToRecipeId));
  mergeSources(collectStoreScrollSources(fiddle, itemIdToRecipeId));
  mergeSources(collectMuseumScrollSources(fiddle, itemIdToRecipeId));
  mergeSources(collectChickenStatueSources(fiddle, itemIdToRecipeId));
  mergeSources(collectFishingChestSources(fiddle, itemIdToRecipeId));
  mergeSources(collectWishingWellSources(fiddle, itemIdToRecipeId));
  mergeSources(collectFestivalScrollSources(fiddle, itemIdToRecipeId));
  mergeSources(collectDungeonDelicacySources(fiddle, itemIdToRecipeId));

  const recipes: Record<RecipeId, Recipe> = {};

  for (const [recipeId, group] of grouped) {
    const memberItemIds = group
      .map((e) => e.itemId as ItemId)
      .sort((a, b) => a.localeCompare(b));

    const sources = (allSources.get(recipeId) ?? []).sort(compareRecipeSources);

    recipes[recipeId as RecipeId] = { memberItemIds, sources };
  }

  const recipeIdByItemId = new Map<string, RecipeId>();
  for (const [itemId, rid] of itemIdToRecipeId) {
    recipeIdByItemId.set(itemId, rid as RecipeId);
  }

  const totalRecipes = Object.keys(recipes).length;
  const withSources = Object.values(recipes).filter((r) => r.sources.length > 0).length;
  const sourceTypeCounts = new Map<string, number>();
  for (const recipe of Object.values(recipes)) {
    const seenTypes = new Set(recipe.sources.map((s) => s.type));
    for (const t of seenTypes) {
      sourceTypeCounts.set(t, (sourceTypeCounts.get(t) ?? 0) + 1);
    }
  }
  const countParts = [...sourceTypeCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, count]) => `${count} ${type}`);
  console.log(
    `  Recipes: ${totalRecipes} total, ${withSources} with sources (${countParts.join(", ")})`,
  );

  return { recipeIdByItemId, recipes };
}

function compareRecipeSources(a: RecipeSource, b: RecipeSource): number {
  const cmp = a.type.localeCompare(b.type);
  if (cmp !== 0) return cmp;
  return JSON.stringify(a).localeCompare(JSON.stringify(b));
}

function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return [];

  const entries: RawRecipeEntry[] = [];

  for (const subCategories of Object.values(itemsRoot)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const categoryItems of Object.values(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;

        const itemObj = item as Record<string, unknown>;
        const hasRecipe =
          Array.isArray(itemObj.recipe) || typeof itemObj.recipe_key === "string";
        const isDefault = itemObj.recipe_is_default === true;

        if (!hasRecipe && isDefault) {
          console.log(
            `  Diagnostic: "${itemId}" has recipe_is_default but no recipe array or recipe_key — skipped`,
          );
          continue;
        }

        if (!hasRecipe) continue;

        const recipeKey = itemObj.recipe_key as string | undefined;
        const recipeId = recipeKey ?? itemId;

        entries.push({ defaultUnlocked: isDefault, itemId, recipeId });
      }
    }
  }

  return entries;
}

function resolveScrollTarget(
  scrollTarget: string,
  itemIdToRecipeId: Map<string, string>,
  context: string,
): string | undefined {
  const recipeId = itemIdToRecipeId.get(scrollTarget);
  if (recipeId) return recipeId;
  if ([...itemIdToRecipeId.values()].includes(scrollTarget)) return scrollTarget;
  console.warn(`  Warning: scroll target "${scrollTarget}" in ${context} has no matching item`);
  return undefined;
}

function collectQuestScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const quests = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  if (!quests) return new Map();

  const result = new Map<string, RecipeSource[]>();
  const seen = new Set<string>();

  for (const questType of QUEST_TYPES_WITH_SCROLLS) {
    const questGroup = quests[questType];
    if (!questGroup) continue;

    for (const [questId, quest] of Object.entries(questGroup)) {
      if (questId === "default" || typeof quest !== "object" || quest === null) continue;

      const questObj = quest as Record<string, unknown>;
      const rewards = Array.isArray(questObj.rewards) ? questObj.rewards : [];
      for (const reward of rewards) {
        if (typeof reward !== "object" || reward === null) continue;
        const obj = reward as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ??
          (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          `${questType}/${questId}`,
        );
        if (!recipeId) continue;

        const dedupeKey = `quest::${recipeId}::${questId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const sources = result.get(recipeId) ?? [];
        sources.push({
          questId: questId as QuestId,
          questType,
          type: "quest",
        });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectLetterScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const letters = fiddle.letters as Record<string, Record<string, unknown>> | undefined;
  if (!letters) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [letterId, letter] of Object.entries(letters)) {
    if (letterId === "default" || typeof letter !== "object" || letter === null) continue;

    const letterObj = letter as Record<string, unknown>;
    const requirements = letterObj.requirements as Record<string, unknown> | undefined;
    const items = Array.isArray(letterObj.items) ? letterObj.items : [];

    for (const item of items) {
      if (typeof item !== "object" || item === null) continue;
      const obj = item as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ??
        (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        `letters/${letterId}`,
      );
      if (!recipeId) continue;

      let trigger: "donated_item" | "shipped_item" | undefined;
      let triggerItemId: string | undefined;

      if (requirements) {
        if (typeof requirements.shipped_item === "string") {
          trigger = "shipped_item";
          triggerItemId = requirements.shipped_item;
        } else if (typeof requirements.donated_item === "string") {
          trigger = "donated_item";
          triggerItemId = requirements.donated_item;
        }
      }

      if (trigger && triggerItemId) {
        const sources = result.get(recipeId) ?? [];
        sources.push({ trigger, triggerItemId, type: "letter" });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectStoreScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return new Map();

  const result = new Map<string, RecipeSource[]>();
  const seen = new Set<string>();

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default" || typeof store !== "object" || store === null) continue;

    const storeObj = store as Record<string, unknown>;
    const stockArrays = ["constant_stock", "seasonal", "random_stock"];
    for (const stockKey of stockArrays) {
      const stockSection = storeObj[stockKey];
      if (!stockSection) continue;

      const arrays: unknown[][] = [];
      if (Array.isArray(stockSection)) {
        arrays.push(stockSection);
      } else if (typeof stockSection === "object" && stockSection !== null) {
        for (const val of Object.values(stockSection as Record<string, unknown>)) {
          if (Array.isArray(val)) arrays.push(val);
        }
      }

      for (const arr of arrays) {
        for (const entry of arr) {
          if (typeof entry !== "object" || entry === null) continue;
          const obj = entry as Record<string, unknown>;

          const scrollTarget =
            (obj.recipe_scroll as string | undefined) ??
            (obj.crafting_scroll as string | undefined);
          if (!scrollTarget) continue;

          const recipeId = resolveScrollTarget(
            scrollTarget,
            itemIdToRecipeId,
            `stores/${storeId}`,
          );
          if (!recipeId) continue;

          const dedupeKey = `store::${recipeId}::${storeId}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          const sources = result.get(recipeId) ?? [];
          sources.push({ storeId, type: "store" });
          result.set(recipeId, sources);
        }
      }
    }
  }

  return result;
}

function collectMuseumScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const museumWings = fiddle.museum_wings as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!museumWings) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [wingId, wing] of Object.entries(museumWings)) {
    if (wingId === "default" || typeof wing !== "object" || wing === null) continue;

    const wingObj = wing as Record<string, unknown>;
    const rewards = Array.isArray(wingObj.rewards) ? wingObj.rewards : [];
    for (const reward of rewards) {
      if (typeof reward !== "object" || reward === null) continue;
      const rewardObj = reward as Record<string, unknown>;
      const entries = Array.isArray(rewardObj.entries) ? rewardObj.entries : [];

      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ??
          (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          `museum_wings/${wingId}`,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "museum_donation", wingId });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectChickenStatueSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const chickenStatue = fiddle.chicken_statue as Record<string, unknown> | undefined;
  if (!chickenStatue) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const common = chickenStatue.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const rolls = ["small_roll", "medium_roll", "large_roll"];
  for (const rollKey of rolls) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ??
        (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        "chicken_statue",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "chicken_statue" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectFishingChestSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return result;

  for (const [, tierData] of Object.entries(chestTables)) {
    if (typeof tierData !== "object" || tierData === null) continue;
    const tierObj = tierData as Record<string, unknown>;
    const items = Array.isArray(tierObj.items) ? tierObj.items : [];

    for (const entry of items) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      if (obj.kind !== "recipe") continue;
      const scrollTarget = obj.value as string | undefined;
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        "fishing/chest_tables",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "treasure_chest" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectWishingWellSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const wishingWell = fiddle.wishing_well as Record<string, unknown> | undefined;
  if (!wishingWell) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const common = wishingWell.common as Record<string, unknown> | undefined;
  if (!common) return result;

  const rolls = ["small_roll", "medium_roll", "large_roll"];
  for (const rollKey of rolls) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ??
        (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        "wishing_well",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ type: "wishing_well" });
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectFestivalScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const festivals = fiddle.festivals as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!festivals) return new Map();

  const result = new Map<string, RecipeSource[]>();
  const seen = new Set<string>();

  for (const [festivalId, festival] of Object.entries(festivals)) {
    if (festivalId === "default" || typeof festival !== "object" || festival === null)
      continue;

    const festivalObj = festival as Record<string, unknown>;
    const arraysToScan: unknown[][] = [];
    for (const val of Object.values(festivalObj)) {
      if (Array.isArray(val)) {
        arraysToScan.push(val);
      } else if (typeof val === "object" && val !== null) {
        for (const innerVal of Object.values(val as Record<string, unknown>)) {
          if (Array.isArray(innerVal)) arraysToScan.push(innerVal);
        }
      }
    }

    for (const arr of arraysToScan) {
      for (const entry of arr) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ??
          (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          `festivals/${festivalId}`,
        );
        if (!recipeId) continue;

        const dedupeKey = `festival::${recipeId}::${festivalId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const sources = result.get(recipeId) ?? [];
        sources.push({ festivalId, type: "festival" });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectDungeonDelicacySources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const dungeons = fiddle.dungeons as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, RecipeSource[]>();
  const seen = new Set<string>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes)
    ? (dungeonsData.biomes as unknown[])
    : [];

  for (const biome of biomes) {
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;

    const delicacyArrays = ["dungeon_delicacies", "taste_maker"];
    for (const arrayKey of delicacyArrays) {
      const items = Array.isArray(biomeObj[arrayKey])
        ? (biomeObj[arrayKey] as unknown[])
        : [];

      for (const itemId of items) {
        if (typeof itemId !== "string") continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (!recipeId) continue;

        const dedupeKey = `mine_zone::${recipeId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "mine_zone" });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 5: Write test — default-unlocked recipe has `{ type: "default" }` source**

Add to `recipes.test.ts`:

```typescript
it("adds a default source when any member has recipe_is_default", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          basic_table: {
            name: "Basic Table",
            recipe: [{ item: "wood", count: 3 }],
            recipe_is_default: true,
            recipe_key: "basic_table",
          },
          basic_table_oak: {
            name: "Basic Table",
            recipe: [{ item: "wood", count: 3 }],
            recipe_key: "basic_table",
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["basic_table" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "default" }]);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 7: Write test — quest scroll rewards map to recipe IDs**

Add to `recipes.test.ts`:

```typescript
it("maps quest crafting_scroll rewards to recipe sources", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          chair_green: {
            name: "Sapling Chair",
            recipe: [{ item: "wood", count: 5 }],
            recipe_key: "sapling_chair",
          },
        },
      },
    },
    quests: {
      stillwell_challenges: {
        green_sapling_surprise: {
          name: "Green Sapling Surprise",
          rewards: [{ renown: 100 }, { crafting_scroll: "chair_green" }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["sapling_chair" as RecipeId];
  expect(recipe.sources).toEqual([
    {
      questId: "green_sapling_surprise",
      questType: "stillwell_challenges",
      type: "quest",
    },
  ]);
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 9: Write test — recipe_scroll (cooking) maps correctly**

Add to `recipes.test.ts`:

```typescript
it("maps recipe_scroll rewards for cooked dishes", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          vegetable_soup: {
            name: "Vegetable Soup",
            recipe: [{ item: "potato", count: 1 }],
          },
        },
      },
    },
    quests: {
      story_quests: {
        cooking_101: {
          name: "Cooking 101",
          rewards: [{ recipe_scroll: "vegetable_soup" }, { renown: 20 }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["vegetable_soup" as RecipeId];
  expect(recipe).toBeDefined();
  expect(recipe.sources).toEqual([
    { questId: "cooking_101", questType: "story_quests", type: "quest" },
  ]);
});
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 11: Write test — items without recipe array or recipe_key are excluded**

Add to `recipes.test.ts`:

```typescript
it("excludes items without a recipe array or recipe_key", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        crops_and_forage: {
          default: {},
          potato: { name: "Potato", tags: ["crop"] },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  expect(Object.keys(recipes)).toEqual([]);
});
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 13: Write test — memberItemIds are sorted alphabetically**

Add to `recipes.test.ts`:

```typescript
it("sorts memberItemIds alphabetically", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          zzz_last: {
            name: "Widget",
            recipe: [{ item: "wood", count: 1 }],
            recipe_key: "widget",
          },
          aaa_first: {
            name: "Widget",
            recipe: [{ item: "wood", count: 1 }],
            recipe_key: "widget",
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  expect(recipes["widget" as RecipeId].memberItemIds).toEqual(["aaa_first", "zzz_last"]);
});
```

- [ ] **Step 14: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 15: Write test — unresolved scroll target warns and is skipped**

Add to `recipes.test.ts`:

```typescript
it("warns on unresolved scroll targets and skips them", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  const fiddle = makeFiddle({
    quests: {
      fetch_quests: {
        some_quest: {
          name: "Some Quest",
          rewards: [{ recipe_scroll: "unknown_dish" }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  expect(recipes["unknown_dish" as RecipeId]).toBeUndefined();
  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining("unknown_dish"),
  );

  warnSpy.mockRestore();
});
```

- [ ] **Step 16: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 17: Write test — letter with shipped_item requirement**

Add to `recipes.test.ts`:

```typescript
it("maps letter recipe_scroll with shipped_item requirement", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          tomato_soup: {
            name: "Tomato Soup",
            recipe: [{ item: "tomato", count: 2 }],
          },
        },
      },
    },
    letters: {
      tomato_letter: {
        requirements: { shipped_item: "tomato" },
        items: [{ recipe_scroll: "tomato_soup" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["tomato_soup" as RecipeId];
  expect(recipe.sources).toEqual([
    { trigger: "shipped_item", triggerItemId: "tomato", type: "letter" },
  ]);
});
```

- [ ] **Step 18: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 19: Write test — letter with donated_item requirement**

Add to `recipes.test.ts`:

```typescript
it("maps letter recipe_scroll with donated_item requirement", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          rare_stew: {
            name: "Rare Stew",
            recipe: [{ item: "rare_mushroom", count: 1 }],
          },
        },
      },
    },
    letters: {
      museum_reward_letter: {
        requirements: { donated_item: "ancient_fossil" },
        items: [{ recipe_scroll: "rare_stew" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["rare_stew" as RecipeId];
  expect(recipe.sources).toEqual([
    { trigger: "donated_item", triggerItemId: "ancient_fossil", type: "letter" },
  ]);
});
```

- [ ] **Step 20: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 21: Write test — store recipe_scroll creates store source**

Add to `recipes.test.ts`:

```typescript
it("maps store recipe_scroll to store source", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          fancy_lamp: {
            name: "Fancy Lamp",
            recipe: [{ item: "glass", count: 2 }],
          },
        },
      },
    },
    stores: {
      furniture_store: {
        constant_stock: [{ recipe_scroll: "fancy_lamp" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["fancy_lamp" as RecipeId];
  expect(recipe.sources).toEqual([
    { storeId: "furniture_store", type: "store" },
  ]);
});
```

- [ ] **Step 22: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 23: Write test — museum wing crafting_scroll creates museum_donation source**

Add to `recipes.test.ts`:

```typescript
it("maps museum wing crafting_scroll to museum_donation source", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          fossil_table: {
            name: "Fossil Table",
            recipe: [{ item: "stone", count: 5 }],
          },
        },
      },
    },
    museum_wings: {
      archaeology: {
        rewards: [{ entries: [{ crafting_scroll: "fossil_table" }] }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["fossil_table" as RecipeId];
  expect(recipe.sources).toEqual([
    { type: "museum_donation", wingId: "archaeology" },
  ]);
});
```

- [ ] **Step 24: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 25: Write test — chicken statue recipe_scroll**

Add to `recipes.test.ts`:

```typescript
it("maps chicken statue recipe_scroll to chicken_statue source", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          egg_dish: {
            name: "Egg Dish",
            recipe: [{ item: "egg", count: 1 }],
          },
        },
      },
    },
    chicken_statue: {
      common: {
        small_roll: [{ recipe_scroll: "egg_dish" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["egg_dish" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "chicken_statue" }]);
});
```

- [ ] **Step 26: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 27: Write test — fishing chest with kind="recipe"**

Add to `recipes.test.ts`:

```typescript
it("maps fishing chest entries with kind=recipe to treasure_chest source", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          fish_stew: {
            name: "Fish Stew",
            recipe: [{ item: "fish", count: 1 }],
          },
        },
      },
    },
    fishing: {
      chest_tables: {
        bronze: {
          items: [{ value: "fish_stew", kind: "recipe" }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["fish_stew" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "treasure_chest" }]);
});
```

- [ ] **Step 28: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 29: Write test — wishing well recipe_scroll**

Add to `recipes.test.ts`:

```typescript
it("maps wishing well recipe_scroll to wishing_well source", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          wish_cake: {
            name: "Wish Cake",
            recipe: [{ item: "flour", count: 1 }],
          },
        },
      },
    },
    wishing_well: {
      common: {
        large_roll: [{ recipe_scroll: "wish_cake" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["wish_cake" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "wishing_well" }]);
});
```

- [ ] **Step 30: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 31: Write test — festival recipe_scroll**

Add to `recipes.test.ts`:

```typescript
it("maps festival recipe_scroll to festival source", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          festival_treat: {
            name: "Festival Treat",
            recipe: [{ item: "sugar", count: 1 }],
          },
        },
      },
    },
    festivals: {
      harvest_festival: {
        vendor_stock: [{ recipe_scroll: "festival_treat", tier_required: 2 }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["festival_treat" as RecipeId];
  expect(recipe.sources).toEqual([
    { festivalId: "harvest_festival", type: "festival" },
  ]);
});
```

- [ ] **Step 32: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 33: Write test — dungeon delicacies**

Add to `recipes.test.ts`:

```typescript
it("maps dungeon_delicacies items to mine_zone source", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          cave_stew: {
            name: "Cave Stew",
            recipe: [{ item: "mushroom", count: 2 }],
          },
        },
      },
    },
    dungeons: {
      dungeons: {
        biomes: [
          {
            dungeon_delicacies: ["cave_stew"],
            taste_maker: [],
          },
        ],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["cave_stew" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "mine_zone" }]);
});
```

- [ ] **Step 34: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 35: Write test — recipe_is_default without recipe array logs diagnostic**

Add to `recipes.test.ts`:

```typescript
it("logs diagnostic for items with recipe_is_default but no recipe array or recipe_key", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  const fiddle = makeFiddle({
    items: {
      other: {
        materials: {
          default: {},
          ore_gold: {
            name: "Gold Ore",
            recipe_is_default: true,
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  expect(recipes["ore_gold" as RecipeId]).toBeUndefined();
  expect(logSpy).toHaveBeenCalledWith(
    expect.stringContaining("ore_gold"),
  );

  logSpy.mockRestore();
});
```

- [ ] **Step 36: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 37: Write test — sources are sorted by type then by detail fields**

Add to `recipes.test.ts`:

```typescript
it("sorts sources by type then by detail fields", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          multi_source_item: {
            name: "Multi Source",
            recipe: [{ item: "wood", count: 1 }],
            recipe_is_default: true,
          },
        },
      },
    },
    stores: {
      zzz_store: {
        constant_stock: [{ recipe_scroll: "multi_source_item" }],
      },
      aaa_store: {
        constant_stock: [{ recipe_scroll: "multi_source_item" }],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["multi_source_item" as RecipeId];
  expect(recipe.sources[0]).toEqual({ type: "default" });
  expect(recipe.sources[1]).toEqual({ storeId: "aaa_store", type: "store" });
  expect(recipe.sources[2]).toEqual({ storeId: "zzz_store", type: "store" });
});
```

- [ ] **Step 38: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 39: Write integration test — real pipeline output assertion**

Add a second describe block at the end of `recipes.test.ts`. Add the required imports at the top of the file alongside the existing imports:

```typescript
import { existsSync } from "node:fs";

import { evaluateExpressions } from "../evaluate.js";
import { parseFiddle } from "../parse-fiddle.js";
```

Then add:

```typescript
const ASSETS_DIR = process.env.MISTRIA_ASSETS ?? "pipeline/input/assets";
const HAS_ASSETS = existsSync(`${ASSETS_DIR}/fiddle`);

describe.skipIf(!HAS_ASSETS)("extractRecipes — real data", () => {
  it("produces recipes with expected source type counts", () => {
    const { data: fiddle } = parseFiddle(ASSETS_DIR);
    evaluateExpressions(fiddle);

    const { recipes, recipeIdByItemId } = extractRecipes(fiddle);

    const totalRecipes = Object.keys(recipes).length;
    expect(totalRecipes).toBeGreaterThan(100);

    const withDefault = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "default"),
    ).length;
    expect(withDefault).toBeGreaterThan(50);

    const withQuest = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "quest"),
    ).length;
    expect(withQuest).toBeGreaterThan(10);

    const withLetter = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "letter"),
    ).length;
    expect(withLetter).toBeGreaterThan(10);

    const withStore = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "store"),
    ).length;
    expect(withStore).toBeGreaterThan(10);

    for (const [, recipeId] of recipeIdByItemId) {
      expect(recipes[recipeId]).toBeDefined();
    }
  });
});
```

- [ ] **Step 40: Run all tests and lint**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts && pnpm run lint`
Expected: PASS. Fix any lint issues (unused imports, formatting).

- [ ] **Step 41: Commit**

```bash
git add pipeline/src/extractors/recipes.ts pipeline/src/extractors/recipes.test.ts
git commit -m "feat(pipeline): add recipe extractor with all source collectors"
```

---

### Task 3: Wire extractor into the pipeline & regenerate data

**Files:**
- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/extractors/almanac.ts`
- Regenerate: `src/lib/data/tracker-data.json`

**Interfaces:**
- Consumes: `extractRecipes` from task 2, `ItemMetadataIndex` from almanac extractor
- Produces: `TrackerData` now includes `recipes` field, items have `recipeId`, almanac items have `colorCount` and `recipeId`

This task wires the extractor, stamps `recipeId` onto the item registry, updates almanac collapsing to emit `colorCount` and `recipeId`, regenerates `tracker-data.json`, and verifies the pipeline output. Regeneration happens here (before the UI task) so that task 4 can test against real data in the browser.

- [ ] **Step 1: Add import to `main.ts`**

Add to the import block in `pipeline/src/main.ts`, after the existing extractor imports (after the `extractQuests` import):

```typescript
import { extractRecipes } from "./extractors/recipes.js";
```

- [ ] **Step 2: Call `extractRecipes` in step 3**

In the step 3 extraction block (after `const sources = extractSources(fiddle);` on line 101), add:

```typescript
const { recipes, recipeIdByItemId } = extractRecipes(fiddle);
```

- [ ] **Step 3: Stamp `recipeId` onto items**

After `extractRecipes` and before `applyItemQuestGates` (line 104), add:

```typescript
for (const [itemId, recipeId] of recipeIdByItemId) {
  const item = items[itemId];
  if (item) {
    items[itemId] = { ...item, recipeId };
  }
}
```

- [ ] **Step 4: Add `recipes` to the assembled `TrackerData` object**

In the `trackerData` object literal (line 110-125), add `recipes` between `quests` and `renown`:

```typescript
recipes,
```

- [ ] **Step 5: Update `collapseFurnitureColorways` in `almanac.ts`**

Replace the current `collapseFurnitureColorways` function (lines 181-200) with a version that tracks color counts and preserves `recipeKey`:

```typescript
function collapseFurnitureColorways(
  bucket: Map<string, { id: string; name: string; recipeKey?: string }>,
): Map<string, { colorCount?: number; name: string; recipeKey?: string }> {
  const result = new Map<string, { colorCount?: number; name: string; recipeKey?: string }>();
  const seenRecipeGroups = new Map<string, { count: number; representativeId: string }>();

  for (const [id, entry] of bucket) {
    if (entry.recipeKey) {
      const groupKey = `${entry.recipeKey}::${entry.name}`;
      const existing = seenRecipeGroups.get(groupKey);
      if (existing) {
        existing.count++;
        continue;
      }
      seenRecipeGroups.set(groupKey, { count: 1, representativeId: id });
      result.set(id, { colorCount: 1, name: entry.name, recipeKey: entry.recipeKey });
    } else {
      result.set(id, { name: entry.name });
    }
  }

  for (const [, { count, representativeId }] of seenRecipeGroups) {
    const entry = result.get(representativeId)!;
    entry.colorCount = count > 1 ? count : undefined;
  }

  return result;
}
```

- [ ] **Step 6: Update almanac assembly to include `colorCount` and `recipeId`**

In `extractAlmanac`, update the type import to include `RecipeId`:

```typescript
import type { AlmanacCategory, ItemId, RecipeId, TrackerData } from "$lib/types/tracker-data.js";
```

Replace the `categoryItems` construction (lines 141-144) with:

```typescript
const categoryItems: AlmanacCategory["items"] = {};
for (const [id, entry] of sortedEntries) {
  categoryItems[id as ItemId] = {
    ...(entry.colorCount ? { colorCount: entry.colorCount } : {}),
    name: entry.name,
    ...(entry.recipeKey ? { recipeId: entry.recipeKey as RecipeId } : {}),
  };
}
```

- [ ] **Step 7: Run type-check and pipeline tests**

Run: `pnpm run check && pnpm exec vitest run pipeline/`
Expected: PASS

- [ ] **Step 8: Run the pipeline against real assets**

Run: `pnpm run pipeline -- /path/to/assets` (or use `MISTRIA_ASSETS` env var)
Expected: Pipeline completes successfully. Look for the new `Recipes:` log line showing total count and per-source-type counts.

- [ ] **Step 9: Inspect the output**

Open `pipeline/output/tracker-data-readable.json` and search for `"recipes"`. Verify:
- Multiple recipe entries exist
- Colorway recipes (e.g., `sapling_beanbag_chair`) have multiple `memberItemIds`
- Sources include `quest`, `default`, `letter`, `store`, `museum_donation`, and other types
- Items in `"items"` section have `"recipeId"` where expected
- Almanac items have `"colorCount"` and `"recipeId"` where expected

- [ ] **Step 10: Build the app**

Run: `pnpm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 11: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add pipeline/src/main.ts pipeline/src/extractors/almanac.ts src/lib/data/tracker-data.json
git commit -m "feat(pipeline): wire recipe extractor, update almanac collapsing, regenerate data"
```

---

### Task 4: Almanac UI — display color count & recipe source on collapsed rows

**Files:**
- Modify: `src/lib/utils/format.ts`
- Modify: `src/lib/components/item-row.svelte`
- Modify: `src/lib/components/almanac-content.svelte`

**Interfaces:**
- Consumes: `TrackerData["recipes"]` from tasks 1-3, `trackerData` from `$lib/data/index.js`, `RecipeSource` from task 1
- Produces: UI rendering of color count and recipe source on collapsed almanac rows

This task adds the `recipeSourceLabel` helper, then renders recipe info inline on collapsed rows. The spec says recipe info is display-only context, not a separate tracking concern.

- [ ] **Step 1: Create the `recipeSourceLabel` helper**

In `src/lib/utils/format.ts`, update the type import to include `RecipeSource`:

```typescript
import type { RecipeSource, Season, SourceType, Weather } from "$lib/types/tracker-data.js";
```

Add the helper function after the `weathersForSeason` function (line 102) and before `titleCase`:

```typescript
export function recipeSourceLabel(
  sources: RecipeSource[],
  questNames: Record<string, string>,
  itemNames: Record<string, string>,
): string {
  const nonDefault = sources.find((s) => s.type !== "default");
  const source = nonDefault ?? sources[0];
  if (!source) return "";

  switch (source.type) {
    case "chicken_statue":
      return "Chicken statue";
    case "default":
      return "Default recipe";
    case "festival":
      return titleCase(source.festivalId);
    case "letter":
      if (source.trigger === "shipped_item") {
        const name = itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Ship ${name}`;
      }
      if (source.trigger === "donated_item") {
        const name = itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Donate ${name}`;
      }
      return "Letter";
    case "mine_zone":
      return "Mine zone discovery";
    case "museum_donation":
      return `${titleCase(source.wingId)} wing donations`;
    case "quest":
      return questNames[source.questId] ?? titleCase(source.questId);
    case "store":
      return titleCase(source.storeId);
    case "treasure_chest":
      return "Fishing treasure chest";
    case "wishing_well":
      return "Wishing well";
  }
}
```

Note: `titleCase` is already defined as a private function in `format.ts` (line 104). It works for this usage.

- [ ] **Step 2: Run type-check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Update `item-row.svelte` to accept and display recipe info**

In `src/lib/components/item-row.svelte`, update the props destructuring (lines 13-29) to add `recipeInfo`:

```typescript
let {
  completed,
  dimmed = false,
  hideFishSize = false,
  itemId,
  leaving = false,
  name,
  onToggle,
  recipeInfo,
}: {
  completed: boolean;
  dimmed?: boolean;
  hideFishSize?: boolean;
  itemId: ItemId;
  leaving?: boolean;
  name: string;
  onToggle: () => void;
  recipeInfo?: { colorCount?: number; sourceLabel?: string };
} = $props();
```

Replace the expandable name section (lines 71-90) with a version that stacks a subtitle:

```svelte
{#if sources.length > 0}
  <button
    class="group inline-flex min-w-0 flex-1 items-center gap-0.5 text-left"
    type="button"
    aria-expanded={expanded}
    aria-label="{name} details"
    onclick={() => {
      expanded = !expanded;
    }}
  >
    <span class="flex min-w-0 flex-col">
      <span class="text-base group-hover:underline">{name}</span>
      {#if recipeInfo && (recipeInfo.colorCount || recipeInfo.sourceLabel)}
        <span class="text-xs text-muted-foreground">
          {[
            recipeInfo.colorCount ? `${recipeInfo.colorCount} colors` : "",
            recipeInfo.sourceLabel ?? "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      {/if}
    </span>
    <ChevronRight
      class="size-3 shrink-0 text-muted-foreground opacity-40 transition-all group-hover:opacity-60 {expanded
        ? 'rotate-90'
        : ''}"
    />
  </button>
{:else}
  <span class="flex min-w-0 flex-1 flex-col text-left">
    <span class="text-base">{name}</span>
    {#if recipeInfo && (recipeInfo.colorCount || recipeInfo.sourceLabel)}
      <span class="text-xs text-muted-foreground">
        {[
          recipeInfo.colorCount ? `${recipeInfo.colorCount} colors` : "",
          recipeInfo.sourceLabel ?? "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    {/if}
  </span>
{/if}
```

- [ ] **Step 4: Update `almanac-content.svelte` to pass recipe info**

Add the import at the top of the script in `src/lib/components/almanac-content.svelte`:

```typescript
import { recipeSourceLabel } from "$lib/utils/format.js";
```

Add derived lookup indexes after the existing `let recentlyCompleted` line (line 16):

```typescript
let questNames = $derived(
  Object.fromEntries(
    Object.values(trackerData.quests).flatMap((group) =>
      Object.entries(group).map(([id, q]) => [id, q.name]),
    ),
  ),
);

let itemNames = $derived(
  Object.fromEntries(
    Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
  ),
);
```

In the `{#each displayItems ...}` block (line 80), add computed recipe info and pass it to `ItemRow`. Replace the `{#each displayItems ...}` through the closing `{/each}` (lines 80-106):

```svelte
{#each displayItems as [itemId, item] (itemId)}
  {@const recipe = item.recipeId ? trackerData.recipes[item.recipeId] : undefined}
  {@const sourceLabel = recipe
    ? recipeSourceLabel(recipe.sources, questNames, itemNames)
    : ""}
  <ItemRow
    completed={userState.state.completed.almanac.has(itemId as ItemId)}
    dimmed={isItemDimmed(
      itemId as ItemId,
      userState.state.completed.almanac.has(itemId as ItemId),
      trackerData.sources,
      userState.state.worldState,
      userState.state.availabilityMode,
    )}
    hideFishSize={!isFishCategory(cat.id)}
    itemId={itemId as ItemId}
    leaving={recentlyCompleted.has(itemId as ItemId)}
    name={item.name}
    recipeInfo={recipe && (item.colorCount || sourceLabel)
      ? {
          colorCount: item.colorCount,
          sourceLabel: sourceLabel || undefined,
        }
      : undefined}
    onToggle={() => {
      userState.toggleAlmanacItem(itemId as ItemId);
      const completed = userState.state.completed.almanac.has(itemId as ItemId);
      showUndoToast(item.name, completed, () => {
        userState.toggleAlmanacItem(itemId as ItemId);
      });
      if (completed) {
        if (!userState.state.showCompleted) markLeaving(itemId as ItemId);
        checkCelebration(catItemIds);
      }
    }}
  />
{/each}
```

The guard `recipe && (item.colorCount || sourceLabel)` ensures no empty subtitle rows appear. Single-colorway items with no known source will not render a blank subtitle.

- [ ] **Step 5: Run type-check and lint**

Run: `pnpm run check && pnpm run lint`
Expected: PASS. Fix any issues.

- [ ] **Step 6: Build and start dev server**

Run: `pnpm run build && pnpm run dev`

Open the almanac page in a browser. Verify:
- Collapsed colorway rows show "N colors" with a dot separator and source label where applicable
- Default recipes show "Default recipe" as the source label
- Quest sources show the quest name
- Letter sources show "Ship {item name}" or "Donate {item name}"
- Store sources show the store name (title-cased)
- Museum sources show "{wing name} wing donations"
- Single-color items with no known recipe source show no subtitle
- Items without recipes (crops, minerals, etc.) show no subtitle
- Existing item rows without recipes are unchanged
- Item row click-to-expand behavior still works

- [ ] **Step 7: Commit**

```bash
git add src/lib/utils/format.ts src/lib/components/item-row.svelte src/lib/components/almanac-content.svelte
git commit -m "feat(almanac): display color count and recipe source on collapsed rows"
```

---

### Task 5: Documentation & final verification

**Files:**
- Modify: `pipeline/README.md`

**Interfaces:**
- Consumes: everything from tasks 1-4
- Produces: updated pipeline documentation

- [ ] **Step 1: Add recipe extractor to the processor map table**

Add a row to the processor map table in `pipeline/README.md`, after the `extractors/quest-gates.ts` row:

```markdown
| `extractors/recipes.ts`  | Items (all categories), quests, letters, stores, museum wings, chicken statue, fishing chests, wishing well, festivals, dungeons | Recipe registry and item back-links | Groups items by `recipe_key ?? itemId`; only items with `recipe` array or `recipe_key` are included; items with `recipe_is_default` but no recipe/key are logged and skipped; collects scroll sources from quests, letters (shipped_item/donated_item), stores, museum wings, chicken statue, fishing chests (kind=recipe), wishing well, festivals, and dungeon delicacies; deduplicates sources per recipe; warns on unresolved scroll targets; sorts memberItemIds and sources deterministically. |
```

- [ ] **Step 2: Add recipes section to README**

Add a section after "Quest gates" (line 116) called "Recipes":

```markdown
### Recipes

`extractRecipes` builds a recipe registry in two phases. The first phase scans all items for `recipe_key` and `recipe_is_default`, grouping items into recipe identities using `recipe_key ?? itemId`. Only items with a `recipe` array or a `recipe_key` field are included; items with `recipe_is_default` but no recipe or key (e.g., `ore_gold`) are excluded with a diagnostic log. The second phase collects recipe acquisition sources from ten data locations:

| Source type | Data location | Pattern |
|-------------|---------------|---------|
| `default` | Items | `recipe_is_default = true` |
| `quest` | `quests/{fetch_quests,stillwell_challenges,story_quests,tali_challenges}` | `rewards[].recipe_scroll` or `crafting_scroll` |
| `letter` | `letters` | `items[].recipe_scroll` with `requirements.shipped_item` or `donated_item` |
| `store` | `stores` | `constant_stock`, `seasonal`, `random_stock` arrays with `recipe_scroll` or `crafting_scroll` |
| `museum_donation` | `museum_wings/{archaeology,fish,flora,insect}` | `rewards[].entries[].crafting_scroll` |
| `chicken_statue` | `chicken_statue` | `common.{small,medium,large}_roll[].recipe_scroll` |
| `treasure_chest` | `fishing` | `chest_tables.{tier}.items[]` with `kind = "recipe"` and `value` as target |
| `wishing_well` | `wishing_well` | `common.{small,medium,large}_roll[].recipe_scroll` |
| `festival` | `festivals` | Stock arrays with `recipe_scroll` or `crafting_scroll` |
| `mine_zone` | `dungeons` | `biomes[].dungeon_delicacies` and `taste_maker` item ID lists |

Unresolved scroll targets produce a warning. Member item IDs and sources are sorted deterministically: memberItemIds alphabetically, sources by type then by JSON-serialized detail fields.

The extractor also returns a `recipeIdByItemId` map that the main program uses to stamp `recipeId` onto the item registry for cheap two-way traversal between items and their recipe identity.
```

- [ ] **Step 3: Update the source rules section**

In the "Source rules" section (line 97-98), update the sentence about scroll entries to clarify that recipe scrolls are now handled by the recipe extractor:

Change:
> Store processing accepts constant, seasonal, and random stock. It counts and discards `recipe_scroll` and `crafting_scroll` entries.

To:
> Store processing accepts constant, seasonal, and random stock. It counts and discards `recipe_scroll` and `crafting_scroll` entries; these are handled by the recipe extractor (`extractors/recipes.ts`) instead.

- [ ] **Step 4: Run final checks**

Run: `pnpm run check && pnpm exec vitest run pipeline/ && pnpm run lint && pnpm run build`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add pipeline/README.md
git commit -m "docs: add recipe extractor to pipeline README"
```
