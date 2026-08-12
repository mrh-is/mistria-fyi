# Recipe source enrichment implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Recipe.defaultUnlocked` with a `{ type: "default" }` source, enrich all
`RecipeSource` variants with display-ready data, reshape hardcoded sources, reduce extractor
repetition, and enforce lint/format before commits.

**Architecture:** The `RecipeSource` union gains a `"default"` variant so every recipe's provenance
is fully described by its `sources` array. Existing source variants gain contextual fields (bead
tier, biome info, renown level, museum set count, ticket tier, bundle/upgrade/item names) so the UI
can render descriptive labels without ad-hoc lookups. Three hardcoded recipes (water sprite,
stairs/bridge, engagement ring) get dedicated source types instead of being shoehorned into
`treasure_chest`, `store`, or `cutscene`. Extractor helper functions replace the repeated
`items.subCategories[].categoryItems[].item[]` traversal pattern. All changed files are linted and
formatted before committing.

**Tech Stack:** TypeScript pipeline extractor, Vitest, Svelte 5 (runes), Tailwind 4

## Global constraints

- Use **pnpm** for all commands (never npm/npx).
- **Strict TypeScript** with `strictTypeChecked` ESLint. Use `type` imports.
- **Formatting:** Prettier with double quotes, no tabs, trailing commas, 100-char width, semicolons.
- **Naming:** `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- Run `pnpm run lint:fix` before committing. All commits must type-check independently.
- Run `pnpm exec vitest run pipeline/` for pipeline tests.
- Sort all output arrays deterministically (by ID or name) so output is stable across runs.

## File structure

| File                                        | Action              | Responsibility                                                                                                                                                                                                       |
| ------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/types/tracker-data.ts`             | Modify (Task 1)     | Reshape `RecipeSource` union: add `"default"` variant, add enrichment fields to existing variants, add new source types `"beach_cave_chest"`, `"upgrade"`, `"relationship"`. Remove `defaultUnlocked` from `Recipe`. |
| `pipeline/src/extractors/recipes.ts`        | Modify (Tasks 2, 3) | Task 2: extract helpers for item traversal, DRY up extractors. Task 3: emit `{ type: "default" }` sources, enrich source data, reshape hardcoded items.                                                              |
| `pipeline/src/extractors/recipes.test.ts`   | Modify (Tasks 2, 3) | Update tests for new source shapes and `defaultUnlocked` removal.                                                                                                                                                    |
| `src/lib/utils/format.ts`                   | Modify (Task 4)     | Update `recipeSourceLabel` for enriched source types and new display format strings.                                                                                                                                 |
| `src/lib/stores/user-state.svelte.ts`       | Modify (Task 5)     | Replace `recipe.defaultUnlocked` check with `recipe.sources.some(s => s.type === "default")`.                                                                                                                        |
| `src/lib/components/recipes-content.svelte` | Modify (Task 5)     | Remove `defaultUnlocked` branching, simplify source label generation.                                                                                                                                                |
| `src/lib/engine/transfer.ts`                | Audit (Task 5)      | Verify no `recipe.defaultUnlocked` references remain (animals/cosmetics have their own `defaultUnlocked` — those are unrelated and stay).                                                                            |
| `AGENTS.md`                                 | Modify (Task 6)     | Note lint/format requirement explicitly.                                                                                                                                                                             |

## Source type enrichment summary

| Source type                   | Current label            | Target label                                             | New fields                                                             |
| ----------------------------- | ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `default` (NEW)               | "Default recipe"         | "Default recipe"                                         | —                                                                      |
| `chicken_statue`              | "Chicken statue"         | "Chicken Statue ({tier} beads)"                          | `tier: "small" \| "medium" \| "large"`                                 |
| `cutscene`                    | titleCase(cutscene)      | "Cutscene — {title}"                                     | `title: string` (human-readable)                                       |
| `letter` (no trigger)         | "Letter"                 | "Letter — {letterId}"                                    | `letterId` already extractable; label uses it                          |
| `mine_zone` → `dungeon_chest` | "Mine zone discovery"    | "Treasure chest in {zone} (floors X–Y) with {perk} perk" | rename type to `dungeon_chest`, add `biomeId: BiomeId`, `perk: string` |
| `museum_donation`             | "{wing} wing donations"  | "Complete {count} sets in the {wing} wing"               | `setCount: number`                                                     |
| `perk`                        | titleCase(perk)          | "{Perk Name} perk"                                       | — (label change only)                                                  |
| `renown`                      | "Renown reward"          | "Town rank level {level}"                                | `level: number`                                                        |
| `quest`                       | questName                | "Quest — {name}"                                         | — (label change only)                                                  |
| `scroll_bundle`               | "{store} scroll bundle"  | "Purchase {bundleName} from {store}"                     | `bundleName: string`                                                   |
| `store`                       | titleCase(storeId)       | "Purchase from {store}"                                  | — (label change only)                                                  |
| `wishing_well`                | "Wishing well"           | "Wishing Well ({tier} toss)"                             | `tier: "small" \| "medium" \| "large"`                                 |
| `treasure_chest`              | "Fishing treasure chest" | "Fishing treasure chest"                                 | — (unchanged)                                                          |
| `beach_cave_chest` (NEW)      | n/a                      | "Treasure chest in the Beach Cave"                       | —                                                                      |
| `upgrade` (NEW)               | n/a                      | "Purchase {upgradeName} from the carpenter"              | `upgradeName: string`                                                  |
| `relationship` (NEW)          | n/a                      | "Get to 10 hearts with a dateable character"             | —                                                                      |

---

### Task 1: Types — reshape RecipeSource & Recipe

**Files:**

- Modify: `src/lib/types/tracker-data.ts`

**Interfaces:**

- Consumes: existing branded types `ItemId`, `QuestId`, `WingId`, `BiomeId`
- Produces: Updated `RecipeSource` union (adds `"default"`, `"beach_cave_chest"`, `"upgrade"`,
  `"relationship"` variants; enriches existing variants), `Recipe` without `defaultUnlocked`

- [ ] **Step 1: Update RecipeSource union**

Replace the current `RecipeSource` type in `src/lib/types/tracker-data.ts` with:

```typescript
export type RecipeSource =
  | { type: "default" }
  | { type: "beach_cave_chest" }
  | { biomeId: BiomeId; perk: string; type: "dungeon_chest" }
  | { tier: "large" | "medium" | "small"; type: "chicken_statue" }
  | { festivalId: string; storeId: string; type: "festival" }
  | { perk: string; type: "perk" }
  | { questId: QuestId; questType: string; type: "quest" }
  | { level: number; type: "renown" }
  | { bundleName: string; storeId: string; type: "scroll_bundle" }
  | { setCount: number; type: "museum_donation"; wingId: WingId }
  | { storeId: string; type: "store" }
  | { tier: "large" | "medium" | "small"; type: "wishing_well" }
  | { trigger?: "donated_item" | "shipped_item"; triggerItemId?: ItemId; type: "letter" }
  | { type: "dragon_forge" }
  | { type: "relationship" }
  | { type: "treasure_chest" }
  | { upgradeName: string; type: "upgrade" };
```

- [ ] **Step 2: Remove `defaultUnlocked` from `Recipe`**

Change the `Recipe` interface to:

```typescript
export interface Recipe {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: RecipeSource[];
}
```

- [ ] **Step 3: Remove `"cutscene"` from RecipeSource**

The only cutscene was the engagement ring, which is now `"relationship"`. Remove
`{ cutscene: string; type: "cutscene" }` from the union. Also remove `"mine_zone"` since it's
renamed to `"dungeon_chest"`.

- [ ] **Step 4: Verify type-check fails**

Run: `pnpm run check` Expected: Type errors in recipes.ts, format.ts, user-state.svelte.ts,
recipes-content.svelte (the files we'll fix in later tasks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/tracker-data.ts
git commit -m "refactor: reshape RecipeSource union, remove Recipe.defaultUnlocked"
```

---

### Task 2: Extractor helpers & DRY refactor

**Files:**

- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/recipes.test.ts`

**Interfaces:**

- Consumes: `ParsedGameData` from `parse-fiddle.ts`, updated `RecipeSource` from Task 1
- Produces: Helper functions `forEachItem`, `forEachItemInSubCategory` for traversing the `items`
  tree; refactored extractors using them

The pipeline has multiple extractors that iterate `items[category][subCategory][itemId]` with
identical guard checks. This task extracts that into shared helpers.

- [ ] **Step 1: Add `forEachItem` helper**

Add at the bottom of `pipeline/src/extractors/recipes.ts`:

```typescript
function forEachItem(
  fiddle: ParsedGameData,
  callback: (itemId: string, item: Record<string, unknown>, subCategoryKey: string) => void,
): void {
  const items = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!items) return;

  for (const subCategories of Object.values(items)) {
    if (typeof subCategories !== "object" || subCategories === null) continue;
    for (const [subCatKey, categoryItems] of Object.entries(subCategories)) {
      if (typeof categoryItems !== "object" || categoryItems === null) continue;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default" || typeof item !== "object" || item === null) continue;
        callback(itemId, item, subCatKey);
      }
    }
  }
}
```

- [ ] **Step 2: Refactor `collectPerkSources` to use `forEachItem`**

Replace the triple-nested loop in `collectPerkSources` with:

```typescript
function collectPerkSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const result = new Map<string, RecipeSource[]>();

  const perkBySubCategory: Record<string, string> = {
    faux_plant_set: "ornamental",
    void_set: "void_crafting",
  };

  const perkByItemId: Record<string, string> = {
    big_bell: "the_bell_tolls",
    essence_stone_giant: "magic_design",
    ocarina_sprite_statue: "the_bell_tolls",
    water_sprite_statue_large_v1: "big_water_sprites",
  };

  forEachItem(fiddle, (itemId, _item, subCatKey) => {
    const perk = perkByItemId[itemId] ?? perkBySubCategory[subCatKey];
    if (!perk) return;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [{ perk, type: "perk" }]);
    }
  });

  return result;
}
```

- [ ] **Step 3: Refactor `collectScrollBundleSources` to use `forEachItem`**

Replace the two separate triple-nested loops in `collectScrollBundleSources` with `forEachItem`.
First loop builds `bundleIdToSetTag`, second resolves tagged items to recipe sources:

```typescript
function collectScrollBundleSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const result = new Map<string, RecipeSource[]>();

  const bundleIdToSetTag = new Map<string, string>();
  const bundleIdToName = new Map<string, string>();
  forEachItem(fiddle, (itemId, item) => {
    const setUnlock = item.set_unlock as string | undefined;
    if (setUnlock) {
      bundleIdToSetTag.set(itemId, setUnlock);
      bundleIdToName.set(itemId, (item.name as string | undefined) ?? itemId);
    }
  });

  if (bundleIdToSetTag.size === 0) return result;

  const setTagToStore = new Map<string, { bundleName: string; storeId: string }>();
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (stores) {
    for (const [storeId, store] of Object.entries(stores)) {
      if (storeId === "default" || typeof store !== "object" || store === null) continue;
      const categories = Array.isArray(store.categories) ? store.categories : [];

      for (const category of categories) {
        if (typeof category !== "object" || category === null) continue;
        const cat = category as Record<string, unknown>;

        const allStock: unknown[] = [];
        if (Array.isArray(cat.constant_stock)) allStock.push(...cat.constant_stock);
        if (Array.isArray(cat.random_stock)) allStock.push(...cat.random_stock);
        const seasonal = cat.seasonal as Record<string, unknown> | undefined;
        if (seasonal) {
          for (const val of Object.values(seasonal)) {
            if (Array.isArray(val)) allStock.push(...val);
          }
        }

        for (const entry of allStock) {
          let itemId: string | undefined;
          if (typeof entry === "string") {
            itemId = entry;
          } else if (typeof entry === "object" && entry !== null) {
            itemId = (entry as Record<string, unknown>).item as string | undefined;
          }
          if (!itemId) continue;
          const setTag = bundleIdToSetTag.get(itemId);
          if (setTag) {
            const bundleName = bundleIdToName.get(itemId) ?? itemId;
            setTagToStore.set(setTag, { bundleName, storeId });
          }
        }
      }
    }
  }

  forEachItem(fiddle, (itemId, item) => {
    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];

    for (const [setTag, info] of setTagToStore) {
      if (tags.includes(setTag)) {
        const recipeId = itemIdToRecipeId.get(itemId);
        if (recipeId && !result.has(recipeId)) {
          result.set(recipeId, [
            { bundleName: info.bundleName, storeId: info.storeId, type: "scroll_bundle" },
          ]);
        }
      }
    }
  });

  return result;
}
```

- [ ] **Step 4: Refactor `collectRecipeEntries` to use `forEachItem`**

Replace the triple-nested loop:

```typescript
function collectRecipeEntries(fiddle: ParsedGameData): RawRecipeEntry[] {
  const entries: RawRecipeEntry[] = [];

  forEachItem(fiddle, (itemId, item, subCatKey) => {
    if (subCatKey === "unreviewed_new_items") return;

    const hasRecipe = Array.isArray(item.recipe) || typeof item.recipe_key === "string";
    const isDefault = item.recipe_is_default === true;

    if (!hasRecipe && isDefault) {
      console.log(
        `  Diagnostic: "${itemId}" has recipe_is_default but no recipe array or recipe_key — skipped`,
      );
      return;
    }

    if (!hasRecipe) return;

    const recipeKey = item.recipe_key as string | undefined;
    const recipeId = recipeKey ?? itemId;
    const name = (item.name as string | undefined) ?? itemId;

    entries.push({ defaultUnlocked: isDefault, itemId, name, recipeId });
  });

  return entries;
}
```

- [ ] **Step 5: Refactor `collectDragonForgeSources`**

Currently accesses `items.other.blacksmithing` directly — refactor to use `forEachItem` with a
filter:

```typescript
function collectDragonForgeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const result = new Map<string, RecipeSource[]>();

  forEachItem(fiddle, (itemId, item) => {
    if (item.recipe_is_default) return;

    const tags = Array.isArray(item.tags) ? (item.tags as string[]) : [];
    if (!tags.includes("blacksmithing")) return;
    if (!itemId.startsWith("dragon_forged_")) return;

    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [{ type: "dragon_forge" }]);
    }
  });

  return result;
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm exec vitest run pipeline/` Expected: Tests pass (helper refactor preserves behavior —
source shapes change in Task 3).

- [ ] **Step 7: Commit**

```bash
git add pipeline/src/extractors/recipes.ts
git commit -m "refactor: extract forEachItem helper, DRY up recipe extractors"
```

---

### Task 3: Enrich source data & reshape hardcoded sources

**Files:**

- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/recipes.test.ts`

**Interfaces:**

- Consumes: Updated `RecipeSource` from Task 1, `forEachItem` from Task 2
- Produces: Enriched recipe sources in pipeline output

This is the core data enrichment task. Each source collector gains the additional fields defined in
the enrichment summary.

- [ ] **Step 1: Emit `{ type: "default" }` instead of `defaultUnlocked` flag**

In `extractRecipes`, after building the recipe object, replace:

```typescript
recipes[recipeId as RecipeId] = {
  defaultUnlocked: allDefault,
  memberItemIds,
  presentations,
  sources,
};
```

with:

```typescript
const allSrc = allDefault ? [{ type: "default" as const }, ...sources] : sources;

recipes[recipeId as RecipeId] = {
  memberItemIds,
  presentations,
  sources: allSrc,
};
```

Update the summary log to count `"default"` sources instead of `defaultUnlocked`.

- [ ] **Step 2: Enrich `chicken_statue` with tier**

In `collectChickenStatueSources`, change the roll loop to capture the tier:

```typescript
const rollTiers: [string, "small" | "medium" | "large"][] = [
  ["small_roll", "small"],
  ["medium_roll", "medium"],
  ["large_roll", "large"],
];
for (const [rollKey, tier] of rollTiers) {
  // ... existing scroll resolution ...
  sources.push({ tier, type: "chicken_statue" });
}
```

- [ ] **Step 3: Rename `mine_zone` → `dungeon_chest` and enrich with biome & perk**

In `collectDungeonDelicacySources`, capture the biome ID and emit `dungeon_chest`:

```typescript
function collectDungeonDelicacySources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes) ? (dungeonsData.biomes as unknown[]) : [];

  for (const biome of biomes) {
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;
    const biomeId = (biomeObj.id as string | undefined) ?? "unknown";

    const perkArrays: [string, string][] = [
      ["dungeon_delicacies", "dungeon_delicacies"],
      ["taste_maker", "taste_maker"],
    ];
    for (const [arrayKey, perk] of perkArrays) {
      const items = Array.isArray(biomeObj[arrayKey]) ? (biomeObj[arrayKey] as unknown[]) : [];

      for (const itemId of items) {
        if (typeof itemId !== "string") continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ biomeId: biomeId as BiomeId, perk, type: "dungeon_chest" });
        result.set(recipeId, sources);
      }
    }
  }

  return result;
}
```

Add `BiomeId` to the imports from `$lib/types/tracker-data.js`.

- [ ] **Step 4: Enrich `museum_donation` with `setCount`**

In `collectMuseumScrollSources`, the `reward` object in the `rewards` array likely has a numeric
threshold or index. Capture it:

```typescript
for (let rewardIdx = 0; rewardIdx < rewards.length; rewardIdx++) {
  const reward = rewards[rewardIdx];
  if (typeof reward !== "object" || reward === null) continue;
  const rewardObj = reward as Record<string, unknown>;
  const setCount = (rewardObj.sets_needed as number | undefined) ?? rewardIdx + 1;
  const entries = Array.isArray(rewardObj.entries) ? rewardObj.entries : [];

  for (const entry of entries) {
    // ... existing scroll resolution ...
    sources.push({ setCount, type: "museum_donation", wingId: wingId as WingId });
  }
}
```

- [ ] **Step 5: Enrich `renown` with level**

In `collectRenownRecipeSources`, capture the reward index as level:

```typescript
for (let i = 0; i < rewards.length; i++) {
  const reward = rewards[i];
  if (typeof reward !== "object" || reward === null) continue;
  const itemId = (reward as Record<string, unknown>).item as string | undefined;
  if (!itemId) continue;

  const recipeId = itemIdToRecipeId.get(itemId);
  if (!recipeId || result.has(recipeId)) continue;

  result.set(recipeId, [{ level: i + 1, type: "renown" }]);
}
```

- [ ] **Step 6: Enrich `wishing_well` with tier**

In `collectWishingWellSources`, parallel to chicken_statue:

```typescript
const rollTiers: [string, "small" | "medium" | "large"][] = [
  ["small_roll", "small"],
  ["medium_roll", "medium"],
  ["large_roll", "large"],
];
for (const [rollKey, tier] of rollTiers) {
  // ... existing scroll resolution ...
  sources.push({ tier, type: "wishing_well" });
}
```

- [ ] **Step 7: Reshape hardcoded sources**

Replace the `collectHardcodedSources` function:

```typescript
function collectHardcodedSources(
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const result = new Map<string, RecipeSource[]>();

  const hardcoded: [string, RecipeSource][] = [
    ["water_sprite_statue_v1", { type: "beach_cave_chest" }],
    ["stairs", { type: "upgrade", upgradeName: "House Stairs" }],
    ["farm_bridge", { type: "upgrade", upgradeName: "Starter Farm Bridge" }],
    ["engagement_ring", { type: "relationship" }],
  ];

  for (const [itemId, source] of hardcoded) {
    const recipeId = itemIdToRecipeId.get(itemId);
    if (recipeId && !result.has(recipeId)) {
      result.set(recipeId, [source]);
    }
  }

  return result;
}
```

- [ ] **Step 8: Update tests for new source shapes**

Update all test assertions that check source objects. Key changes:

- Tests checking `recipe.defaultUnlocked` → check `recipe.sources` includes `{ type: "default" }`
- `mine_zone` tests → `dungeon_chest` with `biomeId` and `perk`
- `chicken_statue` tests → include `tier`
- `wishing_well` tests → include `tier`
- Add test for `{ type: "default" }` source on default recipes
- Remove `defaultUnlocked` property assertions from recipe objects
- Update real-data test to count `"default"` sources instead of `defaultUnlocked` filter

Example test update for the default recipe test:

```typescript
it("emits default source when all members have recipe_is_default", () => {
  // ... existing fixture ...
  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["basic_table" as RecipeId];
  expect(recipe.sources).toEqual([{ type: "default" }]);
  expect(recipe).not.toHaveProperty("defaultUnlocked");
});
```

Example test update for dungeon_chest:

```typescript
it("maps dungeon_delicacies items to dungeon_chest source with biome info", () => {
  const fiddle = makeFiddle({
    dungeons: {
      dungeons: {
        biomes: [
          {
            dungeon_delicacies: ["cave_stew"],
            id: "biome_0",
            taste_maker: [],
          },
        ],
      },
    },
    items: {
      other: {
        cooked_dishes: {
          cave_stew: {
            name: "Cave Stew",
            recipe: [{ count: 2, item: "mushroom" }],
          },
          default: {},
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["cave_stew" as RecipeId];
  expect(recipe.sources).toEqual([
    { biomeId: "biome_0", perk: "dungeon_delicacies", type: "dungeon_chest" },
  ]);
});
```

- [ ] **Step 9: Run tests**

Run: `pnpm exec vitest run pipeline/` Expected: All tests pass with updated assertions.

- [ ] **Step 10: Commit**

```bash
git add pipeline/src/extractors/recipes.ts pipeline/src/extractors/recipes.test.ts
git commit -m "feat: enrich RecipeSource data, reshape hardcoded sources"
```

---

### Task 4: Update display labels

**Files:**

- Modify: `src/lib/utils/format.ts`

**Interfaces:**

- Consumes: Updated `RecipeSource` from Task 1, `TrackerData` biome/museum data for lookups
- Produces: `recipeSourceLabel` that renders enriched labels per the target format

- [ ] **Step 1: Update `recipeSourceLabel` function signature**

The function currently takes `(recipe, questNames, itemNames)`. Change the signature to take a
single `RecipeSource` plus lookup maps, since the component already calls it per-source:

```typescript
export function recipeSourceLabel(
  source: RecipeSource,
  lookups: {
    biomeNames: Record<string, string>;
    itemNames: Record<string, string>;
    questNames: Record<string, string>;
    storeNames: Record<string, string>;
  },
): string {
```

Build `biomeNames` and `storeNames` lookups in `recipes-content.svelte` alongside the existing
`questNames` and `itemNames`.

- [ ] **Step 2: Implement all label cases**

```typescript
export function recipeSourceLabel(
  source: RecipeSource,
  lookups: {
    biomeNames: Record<string, string>;
    itemNames: Record<string, string>;
    questNames: Record<string, string>;
    storeNames: Record<string, string>;
  },
): string {
  switch (source.type) {
    case "beach_cave_chest":
      return "Treasure chest in the Beach Cave";
    case "chicken_statue": {
      const beadLabel: Record<string, string> = { large: "30", medium: "15", small: "5" };
      return `Chicken Statue (${beadLabel[source.tier]} beads)`;
    }
    case "default":
      return "Default recipe";
    case "dragon_forge":
      return "Dragon forge";
    case "dungeon_chest": {
      const biomeName = lookups.biomeNames[source.biomeId] ?? titleCase(source.biomeId);
      const perkName = titleCase(source.perk);
      return `Treasure chest in ${biomeName} with ${perkName} perk`;
    }
    case "festival":
      return `${titleCase(source.festivalId)} festival — ${titleCase(source.storeId)}`;
    case "letter":
      if (source.trigger === "shipped_item" && source.triggerItemId) {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Ship ${name}`;
      }
      if (source.trigger === "donated_item" && source.triggerItemId) {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Donate ${name}`;
      }
      return "Letter";
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      return `Complete ${String(source.setCount)} sets in the ${wingName} wing`;
    }
    case "perk":
      return `${titleCase(source.perk)} perk`;
    case "quest": {
      const name = lookups.questNames[source.questId] ?? titleCase(source.questId);
      return `Quest — ${name}`;
    }
    case "relationship":
      return "Get to 10 hearts with a dateable character";
    case "renown":
      return `Town rank level ${String(source.level)}`;
    case "scroll_bundle":
      return `Purchase ${source.bundleName} from ${titleCase(source.storeId)}`;
    case "store":
      return `Purchase from ${titleCase(source.storeId)}`;
    case "treasure_chest":
      return "Fishing treasure chest";
    case "upgrade":
      return `Purchase ${source.upgradeName} from the carpenter`;
    case "wishing_well": {
      const ticketLabel: Record<string, string> = { large: "30", medium: "15", small: "5" };
      return `Wishing Well (${ticketLabel[source.tier]}t)`;
    }
  }
}
```

Note: The bead/ticket costs (5/15/30) are approximate — verify against game data and adjust if
wrong.

- [ ] **Step 3: Run type-check**

Run: `pnpm run check` Expected: `format.ts` passes. Other files still have errors (fixed in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/lib/utils/format.ts
git commit -m "feat: update recipeSourceLabel for enriched source types"
```

---

### Task 5: Update app code for new Recipe shape

**Files:**

- Modify: `src/lib/stores/user-state.svelte.ts`
- Modify: `src/lib/components/recipes-content.svelte`
- Audit: `src/lib/engine/transfer.ts` (animals/cosmetics `defaultUnlocked` stays)

**Interfaces:**

- Consumes: `Recipe` without `defaultUnlocked`, updated `recipeSourceLabel` from Task 4

- [ ] **Step 1: Update `user-state.svelte.ts`**

Replace the default-recipe detection at ~line 112–117:

```typescript
const defaultRecipes = new SvelteSet<RecipeId>();
for (const [id, recipe] of Object.entries(trackerData.recipes)) {
  if (recipe.sources.some((s) => s.type === "default")) {
    defaultRecipes.add(id as RecipeId);
  }
}
```

- [ ] **Step 2: Update `recipes-content.svelte`**

Replace the `sourceLabels` computation (~lines 53–60):

```typescript
const sourceLabels = recipe.sources.map((s) =>
  recipeSourceLabel(s, { biomeNames, itemNames, questNames, storeNames }),
);
```

Add `biomeNames` and `storeNames` derived values alongside `questNames` and `itemNames`:

```typescript
let biomeNames = $derived(Object.fromEntries(trackerData.mines.biomes.map((b) => [b.id, b.name])));

let storeNames = $derived(
  Object.fromEntries(
    Object.entries(trackerData.sources)
      .flatMap(([, sources]) => sources)
      .filter((s) => s.type === "store" && s.location)
      .map((s) => [s.location!, titleCase(s.location!)]),
  ),
);
```

Actually, `storeNames` aren't stored in `TrackerData` as a top-level map. The `titleCase` function
handles store ID → display name. So `storeNames` can be omitted, and `recipeSourceLabel` can use
`titleCase` directly (which it already does in the implementation above). Remove `storeNames` from
the lookups type and simplify accordingly.

- [ ] **Step 3: Verify no other `recipe.defaultUnlocked` references exist**

Run:
`grep -rn "recipe\.defaultUnlocked\|recipe\[.*\]\.defaultUnlocked" --include="*.ts" --include="*.svelte" src/ pipeline/`

The only `defaultUnlocked` references remaining should be in `animals` and `cosmetics` contexts
(those are unrelated fields on different types).

- [ ] **Step 4: Run full checks**

Run: `pnpm run check && pnpm exec vitest run pipeline/` Expected: All type-checks pass, all tests
pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/user-state.svelte.ts src/lib/components/recipes-content.svelte
git commit -m "refactor: update app code for RecipeSource-based default detection"
```

---

### Task 6: Lint, format & AGENTS.md

**Files:**

- All modified files
- Modify: `AGENTS.md`

- [ ] **Step 1: Run lint:fix**

Run: `pnpm run lint:fix` Expected: Prettier and ESLint fix any formatting/import ordering issues.

- [ ] **Step 2: Run full validation**

Run: `pnpm run check && pnpm run lint && pnpm exec vitest run pipeline/` Expected: All pass clean.

- [ ] **Step 3: Update AGENTS.md**

Add a note under the Commands section or Code Style section:

```markdown
- **Pre-commit:** Always run `pnpm run lint:fix` before committing. The `perfectionist` ESLint
  plugin enforces import and property ordering — files must pass `pnpm run lint` to be committed.
```

- [ ] **Step 4: Regenerate tracker-data.json if assets are available**

If `pipeline/input/assets/fiddle/` exists, run: `pnpm run pipeline -- pipeline/input/assets`

If assets are not available, note that `tracker-data.json` will need regeneration on the next
pipeline run.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: lint, format & note lint requirement in AGENTS.md"
```
