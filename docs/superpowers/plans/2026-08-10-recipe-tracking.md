# Recipe tracking implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract recipe identity & acquisition sources from all extractable game data locations, expose them in `TrackerData`, and display recipe provenance on collapsed almanac rows.

**Architecture:** A new `extractRecipes` extractor scans all items for `recipe_key` and `recipe_is_default`, groups items into recipe identities (`recipe_key ?? itemId`), then scans nine data locations (quests, letters, stores, museum wings, chicken statue, fishing chests, wishing well, festivals, and dungeon delicacies) to build acquisition sources. A `defaultUnlocked` boolean flag is stored directly on each recipe rather than modeled as a source type. Items within a recipe are grouped into presentations by display name so that recipe keys containing multiple distinct designs (e.g., single and double beds) are correctly separated. The recipe registry becomes a new `recipes` field on `TrackerData`. Items gain a back-link `recipeId` for cheap two-way traversal. The almanac UI adds a subtitle line to collapsed colorway rows showing color count and recipe source.

**Tech Stack:** TypeScript pipeline extractor, Vitest, Svelte 5 (runes), Tailwind 4

## Global constraints

- Use **pnpm** for all commands (never npm/npx).
- **Strict TypeScript** with `strictTypeChecked` ESLint. Use `type` imports.
- **Formatting:** Prettier with double quotes, no tabs, trailing commas, 100-char width, semicolons.
- **Naming:** `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files. Branded IDs for type safety.
- Run `pnpm run check` and `pnpm run lint` before committing. All commits must type-check independently.
- Run `pnpm exec vitest run pipeline/` for pipeline tests.
- Sort all output arrays deterministically (by ID or name) so output is stable across runs.

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types/tracker-data.ts` | Modify (Task 1, Task 3) | Task 1: Add `RecipeId` branded type, `RecipeSource` union (9 acquired variants), `RecipePresentation`, `Recipe` interface as standalone exports. Task 3: Add `TrackerData.recipes` field, `recipeId` on items, `colorCount` + `recipeId` on `AlmanacCategory` items. |
| `pipeline/src/extractors/recipes.ts` | Create (Task 2) | New extractor: builds recipe registry from items + all extractable scroll/recipe sources |
| `pipeline/src/extractors/recipes.test.ts` | Create (Task 2) | Unit tests for the recipe extractor using synthetic fixtures, plus one real-data integration test |
| `pipeline/src/main.ts` | Modify (Task 3) | Wire `extractRecipes` into pipeline step 3, add `recipes` to assembled `TrackerData` |
| `pipeline/src/extractors/almanac.ts` | Modify (Task 3) | Extend `collapseFurnitureColorways` to emit `colorCount`; stamp `recipeId` on almanac items from `recipeIdByItemId` |
| `src/lib/utils/format.ts` | Modify (Task 4) | Add `recipeSourceLabel` helper |
| `src/lib/components/almanac-content.svelte` | Modify (Task 4) | Pass recipe data to `ItemRow` for collapsed colorway rows |
| `src/lib/components/item-row.svelte` | Modify (Task 4) | Accept optional `recipeInfo` prop, render subtitle line with color count and recipe source |

## Recipe source locations

Every file containing `recipe_scroll` or `crafting_scroll` has been audited. The plan extracts sources from ten acquisition channels: nine acquired source types plus a `defaultUnlocked` flag. Sources marked "not extractable" are documented but out of scope.

| Source type | Data location | Pattern | Approx. count |
|-------------|---------------|---------|---------------|
| `defaultUnlocked` flag | Items with `recipe_is_default = true` | Flag on item; all members must agree | ~78 |
| `quest` | `quests/{fetch_quests,stillwell_challenges,story_quests,tali_challenges}` | `rewards[].recipe_scroll` or `crafting_scroll` | ~60 |
| `letter` | `letters` | `items[].recipe_scroll` with `requirements.shipped_item` (~35), `donated_item` (3), or other triggers (generic letter source) | ~38+ |
| `store` | `stores[storeId].categories[].{constant_stock,seasonal,random_stock}` | Entries with `recipe_scroll`, `crafting_scroll`, or `include_recipe = true` | ~289 (47 scrolls + 242 include_recipe) |
| `museum_donation` | `museum_wings/{archaeology,fish,flora,insect}` | `rewards[].entries[].crafting_scroll` | ~50 |
| `chicken_statue` | `chicken_statue` | `common.small_roll[].recipe_scroll` | 5 |
| `treasure_chest` | `fishing` | `chest_tables.{tier}.items[]` with `kind = "recipe"` and `value` as target | 12 |
| `wishing_well` | `wishing_well` | `common.large_roll[].recipe_scroll` | 3 |
| `festival` | `festivals[festivalId].stocks[storeId]` | Stock entries with `recipe_scroll` or `crafting_scroll` | 5 |
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
- Consumes: existing branded types `ItemId`, `QuestId`, `WingId`
- Produces: `RecipeId` branded type, `RecipeSource` union type (9 variants), `RecipePresentation` interface, `Recipe` interface. These are standalone exports; `TrackerData` is not modified yet.

These types define the contract between the pipeline extractor (Task 2) and the UI (Task 4). `TrackerData` changes are deferred to Task 3 so every commit independently type-checks.

- [ ] **Step 1: Add `RecipeId` branded type**

Add alongside the other branded types in `src/lib/types/tracker-data.ts`, after `QuestId`:

```typescript
export type RecipeId = string & { readonly __brand: "RecipeId" };
```

- [ ] **Step 2: Add `RecipeSource` discriminated union**

Add after the `RecipeId` type. This union models every extractable acquired recipe channel. `defaultUnlocked` is a separate boolean on `Recipe`, not a source variant.

```typescript
export type RecipeSource =
  | { type: "chicken_statue" }
  | { festivalId: string; storeId: string; type: "festival" }
  | { trigger?: "donated_item" | "shipped_item"; triggerItemId?: ItemId; type: "letter" }
  | { type: "mine_zone" }
  | { type: "museum_donation"; wingId: WingId }
  | { questId: QuestId; questType: string; type: "quest" }
  | { storeId: string; type: "store" }
  | { type: "treasure_chest" }
  | { type: "wishing_well" };
```

- [ ] **Step 3: Add `RecipePresentation` interface**

Add after `RecipeSource`. A recipe key containing items with different display names (e.g., `mermaid_bed` covering "Mermaid Bed" and "Mermaid Double Bed") produces multiple presentations. Each almanac row maps to one presentation.

```typescript
export interface RecipePresentation {
  itemIds: ItemId[];
  name: string;
}
```

- [ ] **Step 4: Add `Recipe` interface**

Add after `RecipePresentation`:

```typescript
export interface Recipe {
  defaultUnlocked: boolean;
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: RecipeSource[];
}
```

`defaultUnlocked`: true when all members have `recipe_is_default = true`; false otherwise. `memberItemIds`: all item IDs in this recipe group, sorted alphabetically. `presentations`: items grouped by display name, sorted by name. `sources`: acquired sources; empty when unknown. Sorted by `type` then by detail fields for deterministic output.

- [ ] **Step 5: Run type-check**

Run: `pnpm run check`
Expected: PASS — no existing code depends on these new exports yet.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types/tracker-data.ts
git commit -m "feat(types): add Recipe, RecipeId, RecipeSource, and RecipePresentation types"
```

---

### Task 2: Pipeline extractor — `extractRecipes`

**Files:**
- Create: `pipeline/src/extractors/recipes.ts`
- Create: `pipeline/src/extractors/recipes.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` from `parse-fiddle.ts`, `Recipe`, `RecipeId`, `RecipeSource`, `RecipePresentation`, `ItemId`, `QuestId`, `WingId` from Task 1
- Produces: `extractRecipes(fiddle: ParsedGameData): { recipes: Record<RecipeId, Recipe>; recipeIdByItemId: Map<string, RecipeId> }`

The extractor has three phases:

1. **Collect recipe entries** — scan all items for `recipe_key` and `recipe_is_default`, grouping items by recipe identity (`recipe_key ?? itemId`). Only items with a `recipe` array (crafting recipe) or `recipe_key` are included. Items with `recipe_is_default` but no `recipe` array and no `recipe_key` (e.g., `ore_gold`) are excluded with a diagnostic log.
2. **Collect sources** — scan nine data locations for scroll/recipe references, map them to recipe IDs via an item-to-recipe index. Each data location has a dedicated helper function. After all collectors merge, sources are structurally deduplicated centrally.
3. **Build recipes** — assemble `Recipe` objects with `defaultUnlocked` (requires group-wide agreement), `presentations` (items grouped by display name), sorted `memberItemIds`, and sorted deduplicated `sources`.

The function also returns a `recipeIdByItemId` map so the caller can stamp `recipeId` onto the item registry and almanac without re-scanning.

#### Store traversal

Stores nest stock arrays inside `store.categories[]`, not at the top level. The collector must iterate each category's `constant_stock`, `seasonal.{season}`, and `random_stock` arrays. In addition to `recipe_scroll` and `crafting_scroll` entries, store items with `include_recipe = true` also grant the recipe for the referenced item.

#### Festival traversal

Festivals expose vendor stock via `fest.stocks[storeId]`, an object mapping vendor store IDs to stock arrays. The collector must traverse this structure (not scan arbitrary arrays), preserving both `festivalId` and `storeId`.

#### Source deduplication

Individual collectors do not maintain `seen` sets. Instead, after all collectors merge their sources into the central map, a single pass deduplicates each recipe's source array by stable JSON key. This prevents both intra-collector and cross-collector duplicates.

#### Recipe ID collision validation

After grouping items by `recipe_key ?? itemId`, the extractor validates that no item ID matches a recipe key from a different group. If a collision is detected, a warning is logged.

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
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    expect(recipe.defaultUnlocked).toBe(false);
    expect(recipe.presentations).toEqual([
      { itemIds: ["chair_blue", "chair_green", "chair_purple"], name: "Sapling Chair" },
    ]);
    expect(recipeIdByItemId.get("chair_blue")).toBe("sapling_chair");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: FAIL — module `./recipes.js` not found.

- [ ] **Step 3: Implement `extractRecipes` — full extractor**

Create `pipeline/src/extractors/recipes.ts`. The full implementation follows. Key differences from a naive approach:

- Store collector traverses `store.categories[]` and handles `include_recipe = true`
- Festival collector traverses `fest.stocks[storeId]`
- `defaultUnlocked` requires all members to agree; disagreements log a diagnostic
- Presentations group items by display name within each recipe
- Central deduplication after all collectors merge
- Collision validation for item IDs vs recipe keys

```typescript
import type {
  ItemId,
  QuestId,
  Recipe,
  RecipeId,
  RecipePresentation,
  RecipeSource,
  WingId,
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
  name: string;
  recipeId: string;
}

export function extractRecipes(fiddle: ParsedGameData): {
  recipeIdByItemId: Map<string, RecipeId>;
  recipes: Record<RecipeId, Recipe>;
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

  validateRecipeIdCollisions(itemIdToRecipeId, grouped);

  const knownRecipeIds = new Set(grouped.keys());
  const allSources = new Map<string, RecipeSource[]>();

  function mergeSources(incoming: Map<string, RecipeSource[]>): void {
    for (const [recipeId, sources] of incoming) {
      const existing = allSources.get(recipeId) ?? [];
      existing.push(...sources);
      allSources.set(recipeId, existing);
    }
  }

  mergeSources(collectQuestScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectLetterScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectStoreScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectMuseumScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectChickenStatueSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectFishingChestSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectWishingWellSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectFestivalScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds));
  mergeSources(collectDungeonDelicacySources(fiddle, itemIdToRecipeId));

  const recipes: Record<RecipeId, Recipe> = {};

  for (const [recipeId, group] of grouped) {
    const memberItemIds = group
      .map((e) => e.itemId as ItemId)
      .sort((a, b) => a.localeCompare(b));

    const defaultFlags = group.map((e) => e.defaultUnlocked);
    const allDefault = defaultFlags.every(Boolean);
    const anyDefault = defaultFlags.some(Boolean);
    if (anyDefault && !allDefault) {
      console.warn(
        `  Warning: recipe "${recipeId}" has mixed recipe_is_default flags — treating as not default`,
      );
    }

    const presentations = buildPresentations(group);
    const sources = deduplicateSources(allSources.get(recipeId) ?? []);

    recipes[recipeId as RecipeId] = {
      defaultUnlocked: allDefault,
      memberItemIds,
      presentations,
      sources,
    };
  }

  const recipeIdByItemId = new Map<string, RecipeId>();
  for (const [itemId, rid] of itemIdToRecipeId) {
    recipeIdByItemId.set(itemId, rid as RecipeId);
  }

  const totalRecipes = Object.keys(recipes).length;
  const withSources = Object.values(recipes).filter((r) => r.sources.length > 0).length;
  const withDefault = Object.values(recipes).filter((r) => r.defaultUnlocked).length;
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
    `  Recipes: ${totalRecipes} total, ${withDefault} default, ${withSources} with acquired sources (${countParts.join(", ")})`,
  );

  return { recipeIdByItemId, recipes };
}

function buildPresentations(group: RawRecipeEntry[]): RecipePresentation[] {
  const byName = new Map<string, string[]>();
  for (const entry of group) {
    const ids = byName.get(entry.name) ?? [];
    ids.push(entry.itemId);
    byName.set(entry.name, ids);
  }

  return [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, ids]) => ({
      itemIds: ids.sort((a, b) => a.localeCompare(b)) as ItemId[],
      name,
    }));
}

function sourceKey(s: RecipeSource): string {
  return JSON.stringify(s, Object.keys(s).sort());
}

function deduplicateSources(sources: RecipeSource[]): RecipeSource[] {
  const seen = new Set<string>();
  const result: RecipeSource[] = [];
  const sorted = [...sources].sort(compareRecipeSources);
  for (const s of sorted) {
    const key = sourceKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(s);
  }
  return result;
}

function compareRecipeSources(a: RecipeSource, b: RecipeSource): number {
  const cmp = a.type.localeCompare(b.type);
  if (cmp !== 0) return cmp;
  return sourceKey(a).localeCompare(sourceKey(b));
}

function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return [];

  const entries: RawRecipeEntry[] = [];

  for (const [topCategory, subCategories] of Object.entries(itemsRoot)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCategory, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      if (topCategory === "other" && subCategory === "unreviewed_new_items") continue;
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
        const name = (itemObj.name as string | undefined) ?? itemId;

        entries.push({ defaultUnlocked: isDefault, itemId, name, recipeId });
      }
    }
  }

  return entries;
}

function validateRecipeIdCollisions(
  itemIdToRecipeId: Map<string, string>,
  grouped: Map<string, RawRecipeEntry[]>,
): void {
  for (const [itemId, recipeId] of itemIdToRecipeId) {
    if (itemId === recipeId) continue;
    if (grouped.has(itemId) && itemId !== recipeId) {
      console.warn(
        `  Warning: item ID "${itemId}" is also a recipe key for a different group — potential collision`,
      );
    }
  }
}

function resolveScrollTarget(
  scrollTarget: string,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
  context: string,
): string | undefined {
  const recipeId = itemIdToRecipeId.get(scrollTarget);
  if (recipeId) return recipeId;
  if (knownRecipeIds.has(scrollTarget)) return scrollTarget;
  console.warn(`  Warning: scroll target "${scrollTarget}" in ${context} has no matching item`);
  return undefined;
}

function collectQuestScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const quests = fiddle.quests as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  if (!quests) return new Map();

  const result = new Map<string, RecipeSource[]>();

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
          knownRecipeIds,
          `${questType}/${questId}`,
        );
        if (!recipeId) continue;

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
  knownRecipeIds: Set<string>,
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
        knownRecipeIds,
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

      const sources = result.get(recipeId) ?? [];
      if (trigger && triggerItemId) {
        sources.push({ trigger, triggerItemId: triggerItemId as ItemId, type: "letter" });
      } else {
        console.warn(
          `  Warning: letter "${letterId}" has recipe_scroll but no recognized requirement trigger — adding generic letter source`,
        );
        sources.push({ type: "letter" });
      }
      result.set(recipeId, sources);
    }
  }

  return result;
}

function collectStoreScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [storeId, store] of Object.entries(stores)) {
    if (storeId === "default" || typeof store !== "object" || store === null) continue;
    const storeObj = store as Record<string, unknown>;
    const categories = Array.isArray(storeObj.categories) ? storeObj.categories : [];

    for (const category of categories) {
      if (typeof category !== "object" || category === null) continue;
      const cat = category as Record<string, unknown>;

      const stockArrays: unknown[][] = [];

      if (Array.isArray(cat.constant_stock)) stockArrays.push(cat.constant_stock);

      const seasonal = cat.seasonal as Record<string, unknown> | undefined;
      if (seasonal) {
        for (const val of Object.values(seasonal)) {
          if (Array.isArray(val)) stockArrays.push(val);
        }
      }

      if (Array.isArray(cat.random_stock)) stockArrays.push(cat.random_stock);

      for (const arr of stockArrays) {
        for (const entry of arr) {
          if (typeof entry !== "object" || entry === null) continue;
          const obj = entry as Record<string, unknown>;

          const scrollTarget =
            (obj.recipe_scroll as string | undefined) ??
            (obj.crafting_scroll as string | undefined);

          if (scrollTarget) {
            const recipeId = resolveScrollTarget(
              scrollTarget,
              itemIdToRecipeId,
              knownRecipeIds,
              `stores/${storeId}`,
            );
            if (recipeId) {
              const sources = result.get(recipeId) ?? [];
              sources.push({ storeId, type: "store" });
              result.set(recipeId, sources);
            }
            continue;
          }

          if (obj.include_recipe === true) {
            const itemId = obj.item as string | undefined;
            if (!itemId) continue;
            const recipeId = itemIdToRecipeId.get(itemId);
            if (!recipeId) continue;
            const sources = result.get(recipeId) ?? [];
            sources.push({ storeId, type: "store" });
            result.set(recipeId, sources);
          }
        }
      }
    }
  }

  return result;
}

function collectMuseumScrollSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
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
          knownRecipeIds,
          `museum_wings/${wingId}`,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ type: "museum_donation", wingId: wingId as WingId });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}

function collectChickenStatueSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
  knownRecipeIds: Set<string>,
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
        knownRecipeIds,
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
  knownRecipeIds: Set<string>,
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
        knownRecipeIds,
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
  knownRecipeIds: Set<string>,
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
        knownRecipeIds,
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
  knownRecipeIds: Set<string>,
): Map<string, RecipeSource[]> {
  const festivals = fiddle.festivals as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (!festivals) return new Map();

  const result = new Map<string, RecipeSource[]>();

  for (const [festivalId, festival] of Object.entries(festivals)) {
    if (festivalId === "default" || typeof festival !== "object" || festival === null)
      continue;

    const festivalObj = festival as Record<string, unknown>;
    const stocks = festivalObj.stocks as Record<string, unknown> | undefined;
    if (!stocks) continue;

    for (const [vendorStoreId, stockData] of Object.entries(stocks)) {
      if (vendorStoreId === "default") continue;
      if (!Array.isArray(stockData)) continue;

      for (const entry of stockData) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const scrollTarget =
          (obj.recipe_scroll as string | undefined) ??
          (obj.crafting_scroll as string | undefined);
        if (!scrollTarget) continue;

        const recipeId = resolveScrollTarget(
          scrollTarget,
          itemIdToRecipeId,
          knownRecipeIds,
          `festivals/${festivalId}/${vendorStoreId}`,
        );
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ festivalId, storeId: vendorStoreId, type: "festival" });
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

- [ ] **Step 5: Write test — default-unlocked recipe has `defaultUnlocked: true`**

Add to `recipes.test.ts`:

```typescript
it("sets defaultUnlocked when all members have recipe_is_default", () => {
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
            recipe_is_default: true,
            recipe_key: "basic_table",
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["basic_table" as RecipeId];
  expect(recipe.defaultUnlocked).toBe(true);
  expect(recipe.sources).toEqual([]);
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 7: Write test — mixed default flags warn and resolve to false**

Add to `recipes.test.ts`:

```typescript
it("warns and sets defaultUnlocked false when members disagree on recipe_is_default", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          mixed_a: {
            name: "Mixed Item",
            recipe: [{ item: "wood", count: 1 }],
            recipe_is_default: true,
            recipe_key: "mixed_group",
          },
          mixed_b: {
            name: "Mixed Item",
            recipe: [{ item: "wood", count: 1 }],
            recipe_key: "mixed_group",
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  expect(recipes["mixed_group" as RecipeId].defaultUnlocked).toBe(false);
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining("mixed_group"),
  );
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 9: Write test — quest scroll rewards map to recipe IDs**

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

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 11: Write test — recipe_scroll (cooking) maps correctly**

Add to `recipes.test.ts`:

```typescript
it("maps recipe_scroll rewards for cooked dishes without recipe_key", () => {
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
  expect(recipe.memberItemIds).toEqual(["vegetable_soup"]);
  expect(recipe.presentations).toEqual([
    { itemIds: ["vegetable_soup"], name: "Vegetable Soup" },
  ]);
});
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 13: Write test — items without recipe array or recipe_key are excluded**

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

- [ ] **Step 14: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 15: Write test — memberItemIds are sorted alphabetically**

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

- [ ] **Step 16: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 17: Write test — unresolved scroll target warns and is skipped**

Add to `recipes.test.ts`:

```typescript
it("warns on unresolved scroll targets and skips them", () => {
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
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining("unknown_dish"),
  );
});
```

- [ ] **Step 18: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 19: Write test — letter with shipped_item requirement**

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

- [ ] **Step 20: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 21: Write test — store recipe_scroll via categories[]**

This test uses the correct nested `categories[]` structure matching the real data shape.

Add to `recipes.test.ts`:

```typescript
it("maps store recipe_scroll via categories[] to store source", () => {
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
        categories: [
          { constant_stock: [{ recipe_scroll: "fancy_lamp" }] },
        ],
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

- [ ] **Step 23: Write test — store include_recipe grants recipe source**

Add to `recipes.test.ts`:

```typescript
it("maps store include_recipe=true to store source", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          bookshelf: {
            name: "Bookshelf",
            recipe: [{ item: "wood", count: 10 }],
          },
        },
      },
    },
    stores: {
      general_store: {
        categories: [
          { constant_stock: [{ item: "bookshelf", include_recipe: true }] },
        ],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["bookshelf" as RecipeId];
  expect(recipe.sources).toEqual([
    { storeId: "general_store", type: "store" },
  ]);
});
```

- [ ] **Step 24: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 25: Write test — store seasonal stock via categories[]**

Add to `recipes.test.ts`:

```typescript
it("maps store seasonal stock scrolls via categories[]", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          summer_chair: {
            name: "Summer Chair",
            recipe: [{ item: "wood", count: 3 }],
          },
        },
      },
    },
    stores: {
      seasonal_store: {
        categories: [
          { seasonal: { summer: [{ crafting_scroll: "summer_chair" }] } },
        ],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["summer_chair" as RecipeId];
  expect(recipe.sources).toEqual([
    { storeId: "seasonal_store", type: "store" },
  ]);
});
```

- [ ] **Step 26: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 27: Write test — museum wing crafting_scroll creates museum_donation source**

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

- [ ] **Step 28: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 29: Write test — chicken statue recipe_scroll**

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

- [ ] **Step 30: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 31: Write test — fishing chest with kind="recipe"**

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

- [ ] **Step 32: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 33: Write test — wishing well recipe_scroll**

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

- [ ] **Step 34: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 35: Write test — festival recipe_scroll via stocks[storeId]**

This test uses the correct `stocks[storeId]` structure matching the real data shape.

Add to `recipes.test.ts`:

```typescript
it("maps festival recipe_scroll via stocks[storeId] to festival source", () => {
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
      harvest: {
        stocks: {
          nora_souvenir_stall: [
            { recipe_scroll: "festival_treat", tier_required: 2 },
          ],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["festival_treat" as RecipeId];
  expect(recipe.sources).toEqual([
    { festivalId: "harvest", storeId: "nora_souvenir_stall", type: "festival" },
  ]);
});
```

- [ ] **Step 36: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 37: Write test — dungeon delicacies**

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

- [ ] **Step 38: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 39: Write test — recipe_is_default without recipe array logs diagnostic**

Add to `recipes.test.ts`:

```typescript
it("logs diagnostic for items with recipe_is_default but no recipe array or recipe_key", () => {
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
  expect(console.log).toHaveBeenCalledWith(
    expect.stringContaining("ore_gold"),
  );
});
```

- [ ] **Step 40: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 41: Write test — centralized deduplication removes duplicate sources**

Add to `recipes.test.ts`:

```typescript
it("deduplicates identical sources from different chest tiers", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          rare_fish: {
            name: "Rare Fish Dish",
            recipe: [{ item: "fish", count: 3 }],
          },
        },
      },
    },
    fishing: {
      chest_tables: {
        bronze: { items: [{ value: "rare_fish", kind: "recipe" }] },
        silver: { items: [{ value: "rare_fish", kind: "recipe" }] },
        gold: { items: [{ value: "rare_fish", kind: "recipe" }] },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["rare_fish" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "treasure_chest" }]);
});
```

- [ ] **Step 42: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 43: Write test — sources are sorted by type then by detail fields**

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
          },
        },
      },
    },
    stores: {
      zzz_store: {
        categories: [
          { constant_stock: [{ recipe_scroll: "multi_source_item" }] },
        ],
      },
      aaa_store: {
        categories: [
          { constant_stock: [{ recipe_scroll: "multi_source_item" }] },
        ],
      },
    },
    quests: {
      fetch_quests: {
        get_multi: {
          name: "Get Multi",
          rewards: [{ recipe_scroll: "multi_source_item" }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["multi_source_item" as RecipeId];
  expect(recipe.sources[0].type).toBe("quest");
  expect(recipe.sources[1]).toEqual({ storeId: "aaa_store", type: "store" });
  expect(recipe.sources[2]).toEqual({ storeId: "zzz_store", type: "store" });
});
```

- [ ] **Step 44: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 45: Write test — presentations separate items with different names**

Add to `recipes.test.ts`:

```typescript
it("creates separate presentations for items with different names under one recipe_key", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        beds: {
          default: {},
          mermaid_bed_single_blue: {
            name: "Mermaid Bed",
            recipe: [{ item: "wood", count: 5 }],
            recipe_key: "mermaid_bed",
          },
          mermaid_bed_single_green: {
            name: "Mermaid Bed",
            recipe: [{ item: "wood", count: 5 }],
            recipe_key: "mermaid_bed",
          },
          mermaid_bed_double_blue: {
            name: "Mermaid Double Bed",
            recipe: [{ item: "wood", count: 8 }],
            recipe_key: "mermaid_bed",
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["mermaid_bed" as RecipeId];
  expect(recipe.presentations).toEqual([
    {
      itemIds: ["mermaid_bed_single_blue", "mermaid_bed_single_green"],
      name: "Mermaid Bed",
    },
    {
      itemIds: ["mermaid_bed_double_blue"],
      name: "Mermaid Double Bed",
    },
  ]);
  expect(recipe.memberItemIds).toEqual([
    "mermaid_bed_double_blue",
    "mermaid_bed_single_blue",
    "mermaid_bed_single_green",
  ]);
});
```

- [ ] **Step 46: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 47: Write test — empty data produces empty results**

Add to `recipes.test.ts`:

```typescript
it("produces empty results for empty data", () => {
  const fiddle = makeFiddle();

  const { recipes, recipeIdByItemId } = extractRecipes(fiddle);
  expect(Object.keys(recipes)).toEqual([]);
  expect(recipeIdByItemId.size).toBe(0);
});
```

- [ ] **Step 48: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 49: Write test — resolveScrollTarget fallback to recipe key**

Add to `recipes.test.ts`:

```typescript
it("resolves scroll targets that are recipe keys directly", () => {
  const fiddle = makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          widget_blue: {
            name: "Widget",
            recipe: [{ item: "wood", count: 1 }],
            recipe_key: "widget",
          },
        },
      },
    },
    quests: {
      fetch_quests: {
        widget_quest: {
          name: "Widget Quest",
          rewards: [{ crafting_scroll: "widget" }],
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["widget" as RecipeId];
  expect(recipe.sources).toEqual([
    { questId: "widget_quest", questType: "fetch_quests", type: "quest" },
  ]);
});
```

- [ ] **Step 50: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 51: Write test — letter with donated_item requirement**

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

- [ ] **Step 52: Run test to verify it passes**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`
Expected: PASS

- [ ] **Step 53: Write integration test — real pipeline output assertion**

Add the required imports at the top of `recipes.test.ts` alongside the existing imports:

```typescript
import { existsSync } from "node:fs";

import { evaluateExpressions } from "../evaluate.js";
import { parseFiddle } from "../parse-fiddle.js";
```

Then add a second describe block at the end of the file:

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

    const withDefault = Object.values(recipes).filter((r) => r.defaultUnlocked).length;
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

    const multiPresentation = Object.values(recipes).filter(
      (r) => r.presentations.length > 1,
    );
    expect(multiPresentation.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 54: Run all tests and lint**

Run: `pnpm exec vitest run pipeline/src/extractors/recipes.test.ts && pnpm run lint`
Expected: PASS. Fix any lint issues (unused imports, formatting).

- [ ] **Step 55: Commit**

```bash
git add pipeline/src/extractors/recipes.ts pipeline/src/extractors/recipes.test.ts
git commit -m "feat(pipeline): add recipe extractor with all source collectors"
```

---

### Task 3: Wire extractor into the pipeline & regenerate data

**Files:**
- Modify: `src/lib/types/tracker-data.ts`
- Modify: `pipeline/src/extractors/almanac.ts`
- Modify: `pipeline/src/main.ts`
- Regenerate: `src/lib/data/tracker-data.json`

**Interfaces:**
- Consumes: `extractRecipes` from Task 2, `RecipeId`, `Recipe`, `RecipePresentation` from Task 1, `ItemMetadataIndex` from almanac extractor, `applyItemQuestGates` pattern from `quest-gates.ts`
- Produces: `TrackerData` now includes `recipes` field, items have `recipeId`, almanac items have `colorCount` and `recipeId`

This task updates `TrackerData` to include the recipe registry, stamps `recipeId` onto the item registry and almanac items using `recipeIdByItemId`, updates almanac collapsing to emit `colorCount`, regenerates `tracker-data.json`, and verifies the pipeline output.

Recipe back-links on almanac items come from `recipeIdByItemId`, not from the raw `recipe_key` field. This ensures that items without `recipe_key` (e.g., cooked dishes with only a `recipe` array) also receive their `recipeId`.

The `recipeId` stamping follows the existing `applyItemQuestGates` pattern: a function that accepts `TrackerData["items"]` as its parameter type, which allows the spread assignment to include the new field.

- [ ] **Step 1: Add `recipes` to `TrackerData`**

In `src/lib/types/tracker-data.ts`, insert into the `TrackerData` interface, alphabetically between `quests` and `renown`:

```typescript
recipes: Record<RecipeId, Recipe>;
```

- [ ] **Step 2: Add `recipeId` to `TrackerData.items`**

Change the items type to include an optional recipe back-link:

```typescript
items: Record<ItemId, { category: string; name: string; questGate?: QuestId[]; recipeId?: RecipeId }>;
```

- [ ] **Step 3: Add `colorCount` and `recipeId` to `AlmanacCategory` items**

Change the `AlmanacCategory` interface:

```typescript
export interface AlmanacCategory {
  id: string;
  items: Record<ItemId, { colorCount?: number; name: string; recipeId?: RecipeId }>;
  name: string;
}
```

- [ ] **Step 4: Add import to `main.ts`**

Add to the import block in `pipeline/src/main.ts`, after the existing extractor imports (after the `extractQuests` import):

```typescript
import { extractRecipes } from "./extractors/recipes.js";
```

- [ ] **Step 5: Stamp `recipeId` onto items**

After `applySpellQuestGates` and before the `console.log();` that ends step 3, add:

```typescript
for (const [itemId, recipeId] of recipeIdByItemId) {
  const typedId = itemId as ItemId;
  const item = items[typedId];
  if (item) {
    (items as TrackerData["items"])[typedId] = { ...item, recipeId };
  }
}
```

Note: `items` is declared as `ItemMetadataIndex` (returned from `extractAlmanac`), which doesn't include `recipeId`. The cast to `TrackerData["items"]` is needed for the spread assignment, following the same runtime mutation pattern used by `applyItemQuestGates`.

- [ ] **Step 6: Add `recipes` to the assembled `TrackerData` object**

In the `trackerData` object literal, add `recipes` between `quests` and `renown`:

```typescript
recipes,
```

- [ ] **Step 7: Update `collapseFurnitureColorways` in `almanac.ts`**

Replace the current `collapseFurnitureColorways` function with a version that tracks color counts:

```typescript
function collapseFurnitureColorways(
  bucket: Map<string, { id: string; name: string; recipeKey?: string }>,
): Map<string, { colorCount?: number; name: string }> {
  const result = new Map<string, { colorCount?: number; name: string }>();
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
      result.set(id, { colorCount: 1, name: entry.name });
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

- [ ] **Step 8: Update almanac assembly to stamp `recipeId` from `recipeIdByItemId`**

This is the key change from the original plan. Instead of deriving `recipeId` only from the raw `recipe_key` field (which misses items without `recipe_key`), the almanac receives `recipeIdByItemId` and stamps `recipeId` on every item that has a recipe.

First, update the `extractAlmanac` signature to accept the recipe map:

```typescript
import type { AlmanacCategory, ItemId, RecipeId, TrackerData } from "$lib/types/tracker-data.js";

export function extractAlmanac(
  fiddle: ParsedGameData,
  recipeIdByItemId?: Map<string, RecipeId>,
): {
  almanac: TrackerData["almanac"];
  items: ItemMetadataIndex;
} {
```

Then replace the `categoryItems` construction with:

```typescript
const categoryItems: AlmanacCategory["items"] = {};
for (const [id, entry] of sortedEntries) {
  const recipeId = recipeIdByItemId?.get(id);
  categoryItems[id as ItemId] = {
    ...(entry.colorCount ? { colorCount: entry.colorCount } : {}),
    name: entry.name,
    ...(recipeId ? { recipeId } : {}),
  };
}
```

- [ ] **Step 9: Wire `extractRecipes` into `main.ts` and pass `recipeIdByItemId` to `extractAlmanac`**

In `pipeline/src/main.ts`, add the `extractRecipes` call before `extractAlmanac` and pass `recipeIdByItemId` to it. The reordered step 3 extraction block should read:

```typescript
const { recipes, recipeIdByItemId } = extractRecipes(fiddle);
const { almanac, items } = extractAlmanac(fiddle, recipeIdByItemId);
const animals = extractAnimals(fiddle);
const npcs = extractNpcs(fiddle);
const cosmetics = extractCosmetics(fiddle);
const skills = extractSkills(fiddle);
const renown = extractRenown(fiddle);
const quests = extractQuests(fiddle);
const mines = extractMines(fiddle);
const sources = extractSources(fiddle);
const questGates = extractQuestGates(fiddle);
```

`extractRecipes` must run before `extractAlmanac` because it produces `recipeIdByItemId`. The other extractors have no ordering dependency and remain unchanged.

- [ ] **Step 10: Run type-check and pipeline tests**

Run: `pnpm run check && pnpm exec vitest run pipeline/`
Expected: PASS

- [ ] **Step 11: Run the pipeline against real assets**

Run: `pnpm run pipeline -- /path/to/assets` (or use `MISTRIA_ASSETS` env var)
Expected: Pipeline completes successfully. Look for the new `Recipes:` log line showing total count, default count, and per-source-type counts.

- [ ] **Step 12: Inspect the output**

Open `pipeline/output/tracker-data-readable.json` and search for `"recipes"`. Verify:
- Multiple recipe entries exist
- Colorway recipes (e.g., `sapling_beanbag_chair`) have multiple `memberItemIds`
- Multi-presentation recipes have `presentations` with different names
- Sources include `quest`, `letter`, `store`, `museum_donation`, and other types
- `defaultUnlocked` is true for expected recipes
- Items in `"items"` section have `"recipeId"` where expected (including cooked dishes without `recipe_key`)
- Almanac items have `"colorCount"` and `"recipeId"` where expected
- Store sources appear for both scroll entries and `include_recipe` entries

- [ ] **Step 13: Build the app**

Run: `pnpm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 14: Run lint**

Run: `pnpm run lint`
Expected: PASS

- [ ] **Step 15: Commit**

```bash
git add src/lib/types/tracker-data.ts pipeline/src/main.ts pipeline/src/extractors/almanac.ts src/lib/data/tracker-data.json
git commit -m "feat(pipeline): wire recipe extractor, update almanac collapsing, regenerate data"
```

---

### Task 4: Almanac UI — display color count & recipe source on collapsed rows

**Files:**
- Modify: `src/lib/utils/format.ts`
- Modify: `src/lib/components/item-row.svelte`
- Modify: `src/lib/components/almanac-content.svelte`

**Interfaces:**
- Consumes: `TrackerData["recipes"]` from Tasks 1–3, `trackerData` from `$lib/data/index.js`, `RecipeSource` from Task 1, `Recipe` from Task 1
- Produces: UI rendering of color count and recipe source on collapsed almanac rows

This task adds the `recipeSourceLabel` helper, then renders recipe info inline on collapsed rows. The spec says recipe info is display-only context, not a separate tracking concern.

The label logic prioritizes `defaultUnlocked`: if a recipe is default-unlocked, it always shows "Default recipe" regardless of other acquired sources, because the player already has the recipe and doesn't need to pursue acquisition. For non-default recipes with multiple sources, the initial implementation displays only the primary (first sorted) source. Showing multiple sources is a potential future enhancement.

- [ ] **Step 1: Create the `recipeSourceLabel` helper**

In `src/lib/utils/format.ts`, update the type import:

```typescript
import type { Recipe, RecipeSource, Season, SourceType, Weather } from "$lib/types/tracker-data.js";
```

Add the helper function after the `weathersForSeason` function (keeping exported functions grouped together):

```typescript
export function recipeSourceLabel(
  recipe: Recipe,
  questNames: Record<string, string>,
  itemNames: Record<string, string>,
): string {
  if (recipe.defaultUnlocked) return "Default recipe";

  const source = recipe.sources[0];
  if (!source) return "";

  switch (source.type) {
    case "chicken_statue":
      return "Chicken statue";
    case "festival":
      return `${titleCase(source.festivalId)} — ${titleCase(source.storeId)}`;
    case "letter":
      if (source.trigger === "shipped_item" && source.triggerItemId) {
        const name = itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Ship ${name}`;
      }
      if (source.trigger === "donated_item" && source.triggerItemId) {
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

- [ ] **Step 2: Run type-check**

Run: `pnpm run check`
Expected: PASS

- [ ] **Step 3: Update `item-row.svelte` to accept and display recipe info**

In `src/lib/components/item-row.svelte`, update the props destructuring to add `recipeInfo`:

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

Replace the expandable name section (the `{#if sources.length > 0}` block through its `{/if}`) with a version that stacks a subtitle:

```svelte
{#if sources.length > 0}
  <button
    class="group inline-flex min-w-0 flex-1 items-start gap-0.5 text-left"
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
      class="mt-1.5 size-3 shrink-0 text-muted-foreground opacity-40 transition-all group-hover:opacity-60 {expanded
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

Add derived lookup indexes after the existing `let recentlyCompleted` line:

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

In the `{#each displayItems ...}` block, add computed recipe info and pass it to `ItemRow`. Replace the `{#each displayItems ...}` through the closing `{/each}`:

```svelte
{#each displayItems as [itemId, item] (itemId)}
  {@const recipe = item.recipeId ? trackerData.recipes[item.recipeId] : undefined}
  {@const sourceLabel = recipe
    ? recipeSourceLabel(recipe, questNames, itemNames)
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
- Festival sources show "{festival name} — {vendor name}"
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
- Consumes: everything from Tasks 1–4
- Produces: updated pipeline documentation

- [ ] **Step 1: Add recipe extractor to the processor map table**

Add a row to the processor map table in `pipeline/README.md`, after the `extractors/quest-gates.ts` row:

```markdown
| `extractors/recipes.ts`  | Items (all categories), quests, letters, stores, museum wings, chicken statue, fishing chests, wishing well, festivals, dungeons | Recipe registry and item back-links | Groups items by `recipe_key ?? itemId`; builds presentations by name; collects scroll sources from quests, letters, stores (via `categories[]`, including `include_recipe`), museum wings, chicken statue, fishing chests, wishing well, festivals (via `stocks[storeId]`), dungeon delicacies; deduplicates sources centrally; validates recipe ID collisions; requires `recipe_is_default` agreement across groups. |
```

- [ ] **Step 2: Add recipes section to README**

Add a section after "Quest gates" called "Recipes":

```markdown
### Recipes

`extractRecipes` builds a recipe registry in three phases. The first phase scans all items for `recipe_key` and `recipe_is_default`, grouping items into recipe identities using `recipe_key ?? itemId`. Only items with a `recipe` array or a `recipe_key` field are included; items with `recipe_is_default` but no recipe or key (e.g., `ore_gold`) are excluded with a diagnostic log. Item IDs that collide with recipe keys from other groups produce a warning.

The second phase collects recipe acquisition sources from nine data locations:

| Source type | Data location | Pattern |
|-------------|---------------|---------|
| `quest` | `quests/{fetch_quests,stillwell_challenges,story_quests,tali_challenges}` | `rewards[].recipe_scroll` or `crafting_scroll` |
| `letter` | `letters` | `items[].recipe_scroll` with `requirements.shipped_item` or `donated_item` |
| `store` | `stores[storeId].categories[]` | `constant_stock`, `seasonal`, `random_stock` entries with `recipe_scroll`, `crafting_scroll`, or `include_recipe = true` |
| `museum_donation` | `museum_wings/{archaeology,fish,flora,insect}` | `rewards[].entries[].crafting_scroll` |
| `chicken_statue` | `chicken_statue` | `common.{small,medium,large}_roll[].recipe_scroll` |
| `treasure_chest` | `fishing` | `chest_tables.{tier}.items[]` with `kind = "recipe"` and `value` as target |
| `wishing_well` | `wishing_well` | `common.{small,medium,large}_roll[].recipe_scroll` |
| `festival` | `festivals[festivalId].stocks[storeId]` | Stock entries with `recipe_scroll` or `crafting_scroll` |
| `mine_zone` | `dungeons` | `biomes[].dungeon_delicacies` and `taste_maker` item ID lists |

After all collectors merge, sources are structurally deduplicated centrally, then sorted by type and detail fields. `defaultUnlocked` is a separate boolean flag requiring all group members to agree; mixed flags produce a warning and resolve to false.

The third phase builds `presentations` — items within each recipe grouped by display name — so that recipe keys containing multiple distinct designs (e.g., single and double beds) produce separate almanac rows.

The extractor also returns a `recipeIdByItemId` map that the main program passes to `extractAlmanac` for stamping `recipeId` onto almanac rows. This ensures all craftable items receive their recipe back-link, including items without `recipe_key` (e.g., cooked dishes identified by item ID).
```

- [ ] **Step 3: Update the source rules section**

In the "Source rules" section, update the sentence about scroll entries to clarify that recipe scrolls are now handled by the recipe extractor:

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
