# Unified sources & rows implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy source type system, migrate all consumers to `AcquisitionSource`, rename
`acquisitionSources` to `sources`, rewrite `availability.ts` to use `AvailabilityCondition`, unify
row components into `TrackerRow`, and extend source display to all entity types.

**Architecture:** Four sequential phases, each producing a green build. Phase 1 handles pipeline &
type system cleanup. Phase 2 rewrites the availability engine. Phase 3 extends source display (icons
& segments) to all `AcquisitionSource` types. Phase 4 unifies the five row patterns into
`TrackerRow`.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes), TypeScript (strict), Vitest, Lucide icons,
shadcn-svelte, pnpm

**Spec:**
[docs/superpowers/specs/2026-08-16-unified-sources-and-rows-design.md](../specs/2026-08-16-unified-sources-and-rows-design.md)

## Global constraints

- Node >= 26, pnpm only (no npm/npx/yarn)
- `strict: true` tsconfig, `strictTypeChecked` ESLint
- Prettier: double quotes, no tabs, trailing commas, 100 char width, semicolons
- `type` imports (`consistent-type-imports`)
- `$props()` destructured with `let`, not `const`
- Svelte 5 runes (`$state`, `$derived`, `$effect`), no legacy stores
- `camelCase` vars/functions, `PascalCase` types/components, `kebab-case` files
- Generated data in `src/lib/data/tracker-data.json` is never hand-edited
- `src/lib/components/ui/` is vendored shadcn-svelte; do not modify
- Build must pass after every commit (`pnpm run check && pnpm run lint && pnpm run test`)
- Run `pnpm run pipeline -- pipeline/input/assets` to regenerate `tracker-data.json` after pipeline
  changes
- Transfer encoding is out of scope (it does not reference source data)

---

### Task 1: Pipeline & type system — rename field, remove legacy recipe sources, remove top-level sources map

This task performs the mechanical type system cleanup: renames `acquisitionSources` to `sources` on
all entity types, extracts `TrackerEntity`/`Item`/`Cosmetic`/`Recipe` interfaces, removes
`LegacyItemSource`/`LegacyRecipeSource`/`Source` alias/`SourceType`/`Restriction`/`RestrictionType`,
removes the legacy `recipe.sources` field, removes `convertLegacyRecipeSource` from the pipeline,
rewrites `pipeline/src/extractors/recipes.ts` to emit `AcquisitionSource[]` directly, removes
`extractSources()` and the top-level `trackerData.sources` map, and mechanically updates every
consumer to keep the build green.

**Files:**

- Modify: `src/lib/types/tracker-data.ts` — extract base interfaces, remove legacy types, rename
  field
- Modify: `pipeline/src/main.ts:247-304` — remove `convertLegacyRecipeSource`, update recipe source
  attachment, remove `extractSources` import & call, remove `sources` from `TrackerData` assembly
- Modify: `pipeline/src/extractors/recipes.ts` — rewrite all ~30 functions that build
  `RecipeSource[]` to build `AcquisitionSource[]` instead (1040-line file; this is the largest
  single change in this task)
- Delete: `pipeline/src/extractors/sources.ts` — entire legacy extractor
- Delete: `pipeline/src/extractors/sources.test.ts` — tests for the deleted extractor
- Delete: `pipeline/src/acquisition/legacy-recipe-adapter.ts` — `AcquisitionSource` →
  `LegacyRecipeSource` converter (no longer needed without legacy types)
- Delete: `pipeline/src/acquisition/legacy-recipe-adapter.test.ts` — tests for the deleted adapter
- Modify: `pipeline/src/acquisition/validate-sources.ts:813,925` — remove dual-field fallback logic
  (`entity.acquisitionSources ?? entity.sources` → `entity.sources`;
  `recipe.acquisitionSources ?? recipe.sources ?? []` → `recipe.sources ?? []`)
- Modify: `src/lib/engine/availability.ts` — update `Source` → `AcquisitionSource` imports; stub
  restriction-based functions to return safe defaults (no `Restriction` import — that type is
  already deleted in Step 2)
- Modify: `src/lib/engine/search.ts:43` — `trackerData.sources` → `item.sources`
- Modify: `src/lib/engine/progress.ts:88,148,197-214` — remove `sourcesMap` parameter from
  `itemProgress`, resolve per-item sources from `trackerData.items`
- Modify: `src/lib/components/item-row.svelte:26` — `trackerData.sources[itemId]` →
  `trackerData.items[itemId]?.sources`
- Modify: `src/lib/components/cosmetic-row.svelte:4` — `Source` → `AcquisitionSource`
- Modify: `src/lib/components/cosmetics-content.svelte:40` — `trackerData.sources[id]` →
  `trackerData.cosmetics[id]?.sources`
- Modify: `src/lib/components/search-results.svelte:44` — `trackerData.sources[result.id]` →
  `trackerData.items[result.id]?.sources`
- Modify: `src/lib/components/almanac-content.svelte:106` — `trackerData.sources` → entity sources
- Modify: `src/lib/components/museum-content.svelte:60` — `trackerData.sources` → entity sources
- Modify: `src/lib/components/completion-row.svelte:8` — `Source` → `AcquisitionSource`; remove
  `Restriction` import and `restrictions` prop (replace with empty stub or remove badge logic
  temporarily — Task 2 rewrites badges properly)
- Modify: `src/lib/components/item-detail.svelte:7` — `Source` → `AcquisitionSource`
- Modify: `src/lib/stores/user-state.svelte.ts` — verify `recipe.sources` references; after rename,
  `recipe.sources` now holds `AcquisitionSource[]` (the `.some(s => s.type === "default")` check on
  line 124 remains valid since `"default"` is a valid `AcquisitionSource` type)
- Modify: `src/lib/utils/format.ts:6,38,231` — remove `SourceType` import, `SOURCE_TYPE_LABEL`,
  `sourceTypeLabel()`; remove `dragon_forge` and `store_with_perk` cases from `recipeSourceLabel`
  (these are legacy-only types not present in `AcquisitionSource`)
- Modify: `src/lib/utils/source-segments.ts` — `RecipeSource` → `AcquisitionSource`; remove
  `dragon_forge` and `store_with_perk` cases
- Modify: `src/lib/utils/source-segments.test.ts` — `RecipeSource` → `AcquisitionSource`; remove
  `dragon_forge` and `store_with_perk` test cases
- Modify: `src/lib/utils/format.test.ts` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/utils/format.ts:122` — `recipeSourceLabel` signature: `RecipeSource` →
  `AcquisitionSource`
- Modify: `src/lib/stores/toolbar-state.svelte.ts:5-10` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/components/icon/icon-source.svelte:7` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/components/icon/icon-maps.ts:52-56` — `RecipeSource` → `AcquisitionSource`;
  remove `dragon_forge` and `store_with_perk` entries from `SOURCE_ICON` and `SOURCE_FILTERS`
- Modify: `src/lib/components/recipe-source-list.svelte:6` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/components/recipe-source-list.test.ts` — `RecipeSource` → `AcquisitionSource`;
  remove `dragon_forge` test data (replace with a valid `AcquisitionSource` type)
- Modify: `src/lib/components/redacted-row.svelte:8` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/components/recipes-content.svelte` — `RecipeSource` → `AcquisitionSource`
- Modify: `src/lib/engine/__tests__/availability.test.ts` — `Source` → `AcquisitionSource`, update
  factory helpers
- Modify: `pipeline/src/acquisition/reviewed-overrides.test.ts` — imports `Source` from
  `acquisition.ts` (this is the canonical type, not the legacy alias — verify import path is correct
  after removals)
- Test: All existing tests, pipeline regeneration

**Interfaces:**

- Consumes: Current `acquisitionSources` field on entities, `trackerData.sources` map,
  `LegacyRecipeSource`/`convertLegacyRecipeSource` bridge
- Produces: `TrackerEntity` base interface with `sources?: AcquisitionSource[]`; `Item`, `Cosmetic`,
  `Recipe` as standalone exported interfaces; no legacy types; no top-level `sources` map

- [ ] **Step 1: Extract `TrackerEntity`, `Item`, `Cosmetic`, `Recipe` interfaces**

  In `src/lib/types/tracker-data.ts`, add before the `TrackerData` interface:

  ```typescript
  export interface TrackerEntity {
    sources?: AcquisitionSource[];
    visibility?: VisibilityCondition;
  }

  export interface Item extends TrackerEntity {
    category: string;
    name: string;
    questGate?: QuestId[];
    recipeId?: RecipeId;
  }

  export interface Cosmetic extends TrackerEntity {
    defaultUnlocked: boolean;
    name: string;
    slot: CosmeticSlot;
    subCategory?: string;
  }

  export interface Recipe extends TrackerEntity {
    memberItemIds: ItemId[];
    presentations: RecipePresentation[];
  }
  ```

  Update `TrackerData` to use these interfaces:

  ```typescript
  items: Record<ItemId, Item>;
  cosmetics: Record<CosmeticId, Cosmetic>;
  recipes: Record<RecipeId, Recipe>;
  ```

  Remove the `acquisitionSources` field from the inline record types (it's now on `TrackerEntity` as
  `sources`).

- [ ] **Step 2: Remove legacy types from `tracker-data.ts`**

  Delete these type definitions:

  - `LegacyItemSource` interface (lines 55-59)
  - `LegacyRecipeSource` type (lines 60-109)
  - `Source` alias (`export type Source = LegacyItemSource;`, line 169)
  - `RecipeSource` alias (`export type RecipeSource = LegacyRecipeSource;`, line 131)
  - `SourceType` union (lines 171-187)
  - `Restriction` interface (lines 132-146)
  - `RestrictionType` union (lines 150-164)

  Keep the `Season`, `Weather`, and branded ID types.

  Remove the `sources: Record<ItemId, Source[]>` field from `TrackerData` (line 308).

  Remove the old `Recipe` interface (lines 119-125) with its `sources: LegacyRecipeSource[]` field;
  the new `Recipe` (from Step 1) has only `sources?: AcquisitionSource[]` inherited from
  `TrackerEntity`.

- [ ] **Step 3: Rewrite `pipeline/src/extractors/recipes.ts` to emit `AcquisitionSource[]`**

  This is the largest single change in this task. The 1040-line file currently builds
  `Map<string, RecipeSource[]>` using ~20 `collect*` functions that each return
  `Map<string, RecipeSource[]>`. Every function must be rewritten to emit `AcquisitionSource[]`
  instead.

  **Key structural changes:**

  - Import `Source as AcquisitionSource` from `$lib/types/acquisition.js` instead of `RecipeSource`
    from `$lib/types/tracker-data.js`.
  - Change all `Map<string, RecipeSource[]>` to `Map<string, AcquisitionSource[]>`.
  - Each `collect*` function builds `AcquisitionSource` objects directly. The shapes are mostly
    identical to `LegacyRecipeSource` with a few differences:
    - `dragon_forge` type → `{ type: "default" }` (dragon forge is a `ProductionMethod`, not a
      source type; the recipe already has `method: "dragon_forge"` via its `recipe` source)
    - `store_with_perk` type → `{ type: "store", storeId }` (perk info is on the
      `AcquisitionSource.availability` condition, not a separate type)
    - `cost` fields change shape: `{ cost: number }` → `{ cost: { amount: number, currency } }` for
      `chicken_statue` and `wishing_well`
    - `quest` sources gain a `trigger: "completion"` field
  - The `buildQuestRecipeSource` function must emit `trigger: "completion"` on quest sources.
  - `Restriction[]` on sources is replaced by `availability?: AvailabilityCondition` — each
    `collect*` function that attaches restrictions should instead build the equivalent
    `AvailabilityCondition` tree (season/weather/time nodes composed with `all`/`any`).
  - The `Recipe` interface's `sources` field now holds `AcquisitionSource[]` (inherited from
    `TrackerEntity`), so the extractor output type aligns automatically.

  Run `pnpm run test:pipeline` after to catch any breakage.

- [ ] **Step 3b: Update pipeline main & delete legacy files**

  In `pipeline/src/main.ts`:

  - Remove the `import { extractSources }` line and the `const sources = extractSources(fiddle);`
    call.
  - Remove the `convertLegacyRecipeSource` function (lines 247-304).
  - The recipe source attachment block (lines 450-455) that calls `convertLegacyRecipeSource` is now
    dead code — recipes already have `sources: AcquisitionSource[]` from the extractor. Replace with
    a default-source fallback:

    ```typescript
    for (const recipe of Object.values(recipes)) {
      if (!recipe.sources || recipe.sources.length === 0) {
        recipe.sources = [{ type: "default" as const }];
      }
    }
    ```

  - Remove `sources` from the `TrackerData` assembly object (line 520).
  - Update the `import type` to remove `LegacyRecipeSource`.

  Delete these files entirely:

  - `pipeline/src/extractors/sources.ts` — legacy item source extractor
  - `pipeline/src/extractors/sources.test.ts` — its tests
  - `pipeline/src/acquisition/legacy-recipe-adapter.ts` — `AcquisitionSource` → `LegacyRecipeSource`
    converter (no longer needed)
  - `pipeline/src/acquisition/legacy-recipe-adapter.test.ts` — its tests

- [ ] **Step 4: Rename `acquisitionSources` → `sources` in pipeline source attachment**

  In `pipeline/src/main.ts`, update the item and cosmetic source attachment blocks (lines 434-447):

  ```typescript
  for (const [itemId, sources] of itemSources.entries()) {
    const item = items[itemId];
    if (item) {
      item.sources = sources;
    }
  }

  for (const [cosmeticId, sources] of cosmeticSources.entries()) {
    const cosmetic = cosmetics[cosmeticId];
    if (cosmetic) {
      cosmetic.sources = sources;
    }
  }
  ```

  Update `pipeline/src/acquisition/validate-sources.ts`:

  - Line 38: remove `acquisitionSources?: readonly unknown[]` field if it's a local interface (check
    context).
  - Line 813: `entity.acquisitionSources ?? entity.sources` → `entity.sources` (the fallback is dead
    code after rename; `entity.sources` is now the only field).
  - Line 925: `recipe.acquisitionSources ?? recipe.sources ?? []` → `recipe.sources ?? []`.
  - Line 174: verify `recipes.${recipeId}.sources` fieldPath still makes sense (it references the
    new `sources` field, which is correct).
  - Any other `acquisitionSources` references → `sources`.

  In `collectNativeIdsFromSources` (main.ts line 157), update `recipe.acquisitionSources` →
  `recipe.sources`.

- [ ] **Step 5: Mechanical find-replace across app consumers**

  Update every file that references `trackerData.sources` (the top-level map) or imports legacy
  types. For each file, run the type checker after editing to verify correctness.

  **Engine files:**

  - `src/lib/engine/availability.ts`: Change `import type { ... Source ... }` to import
    `AcquisitionSource` from `tracker-data.js`. **Do not import `Restriction`** — it was deleted in
    Step 2. Update all function signatures:

    - `isItemAvailable`: change from `(itemId, sourcesMap, worldState, mode)` to
      `(sources: AcquisitionSource[], worldState, mode)`.
    - `isItemDimmed`: change from `(itemId, isCompleted, sourcesMap, worldState, mode)` to
      `(sources: AcquisitionSource[], isCompleted, worldState, mode)`.
    - `shouldShowItem`, `shouldCountItem`: same pattern — drop `itemId` and `sourcesMap`, accept
      `sources: AcquisitionSource[]`.
    - `filterAvailableItems`: change from `(itemIds, sourcesMap, worldState, mode)` to
      `(itemIds, sourceLookup: (id: ItemId) => AcquisitionSource[], worldState, mode)`. The lookup
      function lets callers resolve sources per-item without a pre-built map.
    - `isSourceAvailable(source, worldState, mode)`: stub to return `mode !== "timely"` (safe
      default: everything is available except in timely mode). Task 2 rewrites this fully.
    - `hasSelectiveSeasonRestriction(source)`: stub to return `false`.
    - `hasTimelyRestriction(source)`: stub to return `false`.
    - `getItemRestrictions(sources)`: stub to return `[]` (empty array). Task 2 replaces with
      `getDisplayBadges`.

    These stubs break timely/seasonal filtering temporarily, but the build stays green. Task 2
    restores full functionality.

  - `src/lib/engine/search.ts:43`: Change
    `isItemAvailable(id as never, trackerData.sources, worldState, "available")` to
    `isItemAvailable(item.sources ?? [], worldState, "available")`.

  - `src/lib/engine/progress.ts`: Update `itemProgress` to use the new `filterAvailableItems`
    signature. Callers (`getAlmanacProgress` line 88, `getMuseumProgress` line 148) stop passing
    `trackerData.sources`. Inside `itemProgress`, pass a lookup function:

    ```typescript
    function itemProgress(
      allIds: ItemId[],
      completedSet: Set<ItemId>,
      ctx: ProgressContext,
    ): CategoryProgress {
      const incompleteIds = allIds.filter((id) => !completedSet.has(id));
      const filtered = filterAvailableItems(
        incompleteIds,
        (id) => trackerData.items[id]?.sources ?? [],
        ctx.worldState,
        ctx.availabilityMode,
      );
      return {
        completed: allIds.length - incompleteIds.length,
        filtered: filtered.length,
        total: allIds.length,
      };
    }
    ```

    Note: `AlmanacCategory.items` does not have `sources` — only `TrackerData.items` does. The
    lookup correctly resolves from `trackerData.items`, not from the almanac category entries.

  **Component files:**

  - `src/lib/components/item-row.svelte:26`: Change `trackerData.sources[itemId] ?? []` to
    `trackerData.items[itemId]?.sources ?? []`.
  - `src/lib/components/cosmetic-row.svelte:4`: `Source` → `AcquisitionSource`.
  - `src/lib/components/cosmetics-content.svelte:40`: `trackerData.sources[id]` →
    `trackerData.cosmetics[id]?.sources ?? []`.
  - `src/lib/components/search-results.svelte:44`: `trackerData.sources[result.id]` →
    `trackerData.items[result.id as ItemId]?.sources ?? []`.
  - `src/lib/components/almanac-content.svelte:106`: Replace `trackerData.sources` argument in
    `shouldCountItem` and `isItemDimmed` calls with `item.sources ?? []`.
  - `src/lib/components/museum-content.svelte:60`: Same pattern as almanac.
  - `src/lib/components/completion-row.svelte:8`: `Source` → `AcquisitionSource`. Remove
    `Restriction` import and `restrictions` prop. Remove the `RestrictionBadges` usage (or pass an
    empty badges object). Task 2 adds `DisplayBadges` back properly.
  - `src/lib/components/item-detail.svelte:7`: `Source` → `AcquisitionSource`.
  - `src/lib/components/redacted-row.svelte:8`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/components/recipe-source-list.svelte:6`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/components/recipes-content.svelte`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/components/icon/icon-source.svelte:7`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/components/icon/icon-maps.ts:52,56`: `RecipeSource` → `AcquisitionSource`.

  **Store & util files:**

  - `src/lib/stores/toolbar-state.svelte.ts:5,10`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/utils/format.ts`: Remove `SourceType` import, `SOURCE_TYPE_LABEL`, `sourceTypeLabel()`.
    Update `recipeSourceLabel` to accept `AcquisitionSource`. Update `RecipeSourceLookups` — keep it
    for now, rename in a later task.
  - `src/lib/utils/source-segments.ts:10,87`: `RecipeSource` → `AcquisitionSource`.

  **Test files:**

  - `src/lib/engine/__tests__/availability.test.ts`: `Source` → `AcquisitionSource`. The `src()`
    factory currently produces `{ restrictions, type: "store" }` — update to produce a valid
    `AcquisitionSource` (e.g., `{ type: "store", storeId: "test" as StoreId }`). The restriction
    test data will be rewritten in Task 2.
  - `src/lib/utils/source-segments.test.ts`: `RecipeSource` → `AcquisitionSource`.
  - `src/lib/utils/format.test.ts`: `RecipeSource` → `AcquisitionSource`.

- [ ] **Step 6: Regenerate tracker data & verify**

  Run: `pnpm run pipeline -- pipeline/input/assets`

  Verify the output `tracker-data.json` no longer has a top-level `sources` key, and that entities
  have `sources` (not `acquisitionSources`).

- [ ] **Step 7: Run full verification matrix**

  Run: `pnpm run check && pnpm run lint && pnpm run test`

  Expected: All pass. If lint errors from unused imports or type mismatches, fix them.

- [ ] **Step 8: Commit**

  ```bash
  git add -A
  git commit -m "refactor: remove legacy source types, rename acquisitionSources to sources"
  ```

---

### Task 2: Availability engine migration

Rewrite `availability.ts` to consume `AcquisitionSource.availability` via
`evaluateAvailabilityCondition()` instead of the legacy `Restriction` system. Update
`RestrictionBadges` to extract displayable conditions from `AvailabilityCondition` trees.

**Files:**

- Modify: `src/lib/engine/availability.ts` — full rewrite of internal logic
- Modify: `src/lib/engine/availability-condition.ts` — add `hasTimelyCondition()` and
  `extractDisplayBadges()` helpers
- Modify: `src/lib/components/restriction-badges.svelte` — accept `AvailabilityCondition` instead of
  `Restriction[]`
- Modify: `src/lib/components/completion-row.svelte:8,18,93-95` — pass `AvailabilityCondition`
  instead of `Restriction[]` to badges
- Modify: `src/lib/components/item-row.svelte:4,27` — remove `getItemRestrictions`, derive
  availability condition
- Modify: `src/lib/components/item-detail.svelte:3,14` — update `isSourceAvailable` call for new
  signature
- Modify: `src/lib/components/search-results.svelte:7,44-45` — remove `getItemRestrictions`
- Modify: `src/lib/engine/__tests__/availability.test.ts` — full rewrite with
  `AvailabilityCondition`-based test data
- Test: `src/lib/engine/__tests__/availability.test.ts`

**Interfaces:**

- Consumes: `AcquisitionSource` with `.availability?: AvailabilityCondition` from Task 1
- Produces: Updated availability functions accepting `AcquisitionSource[]` directly; badge
  extraction from `AvailabilityCondition` trees; `hasTimelyCondition()` in
  `availability-condition.ts`

- [ ] **Step 1: Add helpers to `availability-condition.ts`**

  Add `hasTimelyCondition(condition)` that walks the `AvailabilityCondition` tree checking for
  `season`/`weather`/`time` nodes:

  ```typescript
  export function hasTimelyCondition(condition: AvailabilityCondition): boolean {
    switch (condition.type) {
      case "all":
      case "any":
        return condition.conditions.some(hasTimelyCondition);
      case "not":
        return hasTimelyCondition(condition.condition);
      case "season":
      case "time":
      case "weather":
        return true;
      default:
        return false;
    }
  }
  ```

  Add `extractDisplayBadges(condition)` that returns
  `{ seasons?: Season[]; weathers?: Weather[]; timeRange?: [number, number] }` by walking the tree
  and collecting season/weather/time nodes for badge display:

  ```typescript
  export interface DisplayBadges {
    seasons?: Season[];
    timeRange?: [number, number];
    weathers?: Weather[];
  }

  export function extractDisplayBadges(condition: AvailabilityCondition): DisplayBadges {
    const badges: DisplayBadges = {};
    collectBadges(condition, badges);
    return badges;
  }

  function collectBadges(condition: AvailabilityCondition, badges: DisplayBadges): void {
    switch (condition.type) {
      case "all":
      case "any":
        for (const child of condition.conditions) {
          collectBadges(child, badges);
        }
        break;
      case "not":
        collectBadges(condition.condition, badges);
        break;
      case "season":
        if (!badges.seasons) badges.seasons = condition.seasons;
        break;
      case "time":
        if (!badges.timeRange) badges.timeRange = [condition.start, condition.end];
        break;
      case "weather":
        if (!badges.weathers) badges.weathers = condition.weathers;
        break;
      default:
        break;
    }
  }
  ```

- [ ] **Step 2: Write failing tests for new availability functions**

  Rewrite `src/lib/engine/__tests__/availability.test.ts` to use `AcquisitionSource` with
  `.availability` conditions instead of `.restrictions`:

  ```typescript
  import type { AcquisitionSource, StoreId } from "$lib/types/tracker-data.js";
  import type { AvailabilityCondition } from "$lib/types/acquisition.js";

  function src(availability?: AvailabilityCondition): AcquisitionSource {
    return { ...(availability ? { availability } : {}), storeId: "test" as StoreId, type: "store" };
  }

  const seasonCondition = (seasons: Season[]): AvailabilityCondition => ({
    seasons: seasons as Season[],
    type: "season",
  });
  const weatherCondition = (weathers: Weather[]): AvailabilityCondition => ({
    type: "weather",
    weathers: weathers as Weather[],
  });
  ```

  Keep the same test structure (describe blocks for `hasSelectiveSeasonRestriction` →
  `hasSelectiveSeasonCondition`, `isSourceAvailable`, `isItemAvailable`, `filterAvailableItems`,
  etc.) but with `AvailabilityCondition` data.

  Run: `pnpm run test:app -- --run src/lib/engine/__tests__/availability.test.ts` Expected: FAIL
  (functions still stubbed from Task 1)

- [ ] **Step 3: Rewrite `availability.ts` internals**

  Replace the entire implementation. Key changes:

  - `isSourceAvailable(source, worldState, mode)`: Evaluate `source.availability` using
    `evaluateAvailabilityCondition(source.availability, { season: worldState.season, weather: worldState.weather })`.
    For timely mode, check `hasSelectiveSeasonCondition` (already exists in
    `availability-condition.ts`). For available mode, check that timely conditions pass.
  - `hasSelectiveSeasonRestriction(source)` → rename to accept `AcquisitionSource`, delegate to
    `hasSelectiveSeasonCondition(source.availability)`. Sources with no `.availability` return
    false.
  - `hasTimelyRestriction(source)` → delegate to `hasTimelyCondition(source.availability)`.
  - `getItemRestrictions(sources)` → replace with `getDisplayBadges(sources)` returning a merged
    `DisplayBadges` object from all source availability conditions using `extractDisplayBadges`.
  - Remove: `isTimelyRestriction`, `seasonMatches`, `weatherMatches` private helpers.
  - Remove: `Restriction` and `RestrictionType` imports (already deleted from types in Task 1).

  ```typescript
  import {
    evaluateAvailabilityCondition,
    extractDisplayBadges,
    hasSelectiveSeasonCondition,
    hasTimelyCondition,
  } from "./availability-condition.js";
  import type { DisplayBadges } from "./availability-condition.js";
  import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
  import type { AcquisitionSource, ItemId, Season, Weather } from "$lib/types/tracker-data.js";

  interface WorldState {
    season: Season;
    weather: Weather;
  }

  export function isSourceAvailable(
    source: AcquisitionSource,
    worldState: WorldState,
    mode: AvailabilityMode,
  ): boolean {
    if (mode === "everything") return true;
    if (!source.availability) return mode === "available";

    if (mode === "timely") {
      if (!hasSelectiveSeasonCondition(source.availability)) return false;
    }

    const result = evaluateAvailabilityCondition(source.availability, {
      season: worldState.season,
      weather: worldState.weather,
    });
    return result !== false;
  }

  export function isItemAvailable(
    sources: AcquisitionSource[],
    worldState: WorldState,
    mode: AvailabilityMode,
  ): boolean {
    if (mode === "everything") return true;
    if (sources.length === 0) return mode === "available";
    return sources.some((source) => isSourceAvailable(source, worldState, mode));
  }

  export function getDisplayBadges(sources: AcquisitionSource[]): DisplayBadges {
    const merged: DisplayBadges = {};
    for (const source of sources) {
      if (!source.availability) continue;
      const badges = extractDisplayBadges(source.availability);
      if (badges.seasons && !merged.seasons) merged.seasons = badges.seasons;
      if (badges.weathers && !merged.weathers) merged.weathers = badges.weathers;
      if (badges.timeRange && !merged.timeRange) merged.timeRange = badges.timeRange;
    }
    return merged;
  }
  ```

  Update remaining public functions (`shouldShowItem`, `shouldCountItem`, `isItemDimmed`,
  `filterAvailableItems`, `isRowVisible`) — they keep the same semantics but accept
  `sources: AcquisitionSource[]` instead of `sourcesMap`. `isRowVisible` is unchanged (it doesn't
  use sources).

- [ ] **Step 4: Run availability tests**

  Run: `pnpm run test:app -- --run src/lib/engine/__tests__/availability.test.ts` Expected: PASS

- [ ] **Step 5: Update `RestrictionBadges` to accept `DisplayBadges`**

  Rewrite `src/lib/components/restriction-badges.svelte` to accept `DisplayBadges` instead of
  `Restriction[]`:

  ```svelte
  <script lang="ts">
    import { restrictionWeatherIcon } from "$lib/components/icon/icon-maps.js";
    import { Icon } from "$lib/components/icon/index.js";
    import { timeRangeLabel } from "$lib/utils/format.js";

    import type { DisplayBadges } from "$lib/engine/availability-condition.js";
    import type { Season, Weather } from "$lib/types/tracker-data.js";

    let {
      badges,
    }: {
      badges: DisplayBadges;
    } = $props();

    const ALL_SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
    const ALL_WEATHERS: Weather[] = ["calm", "inclement", "heavy_inclement", "special"];

    function isAllSeasons(seasons: Season[]): boolean {
      return ALL_SEASONS.every((s) => seasons.includes(s));
    }

    function isAllWeathers(weathers: Weather[]): boolean {
      return ALL_WEATHERS.every((w) => weathers.includes(w));
    }
  </script>

  <span class="inline-flex flex-wrap items-center gap-1">
    {#if badges.seasons && !isAllSeasons(badges.seasons)}
      <span
        class="inline-flex gap-0.5 rounded bg-amber-100 px-0.5 py-px text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      >
        {#each badges.seasons as s (s)}
          <Icon.Season
            season={s}
            class="size-3 {s === 'fall' ? '-scale-y-100 rotate-90' : ''}"
            strokeWidth={s === "summer" ? 2.5 : undefined}
          />
        {/each}
      </span>
    {/if}

    {#if badges.weathers && !isAllWeathers(badges.weathers)}
      <span
        class="inline-flex gap-0.5 rounded bg-sky-100 px-0.5 py-px text-sky-700 dark:bg-sky-950 dark:text-sky-300"
      >
        {#each ALL_WEATHERS.filter((w) => (badges.weathers ?? []).includes(w)) as w (w)}
          {@const WeatherComp = restrictionWeatherIcon(w, badges.seasons ?? ALL_SEASONS)}
          <WeatherComp class="size-3" />
        {/each}
      </span>
    {/if}

    {#if badges.timeRange}
      <span
        class="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px text-sm text-muted-foreground"
      >
        <Icon.Restriction type="clock" class="size-2.5" />
        {timeRangeLabel(badges.timeRange)}
      </span>
    {/if}
  </span>
  ```

  **Retired props:**

  - `hideFishSize` is dropped. The old `Restriction`-based badges displayed fish size from
    `Restriction.type === "fishSize"`. `AcquisitionSource` has no fish-size condition — it's a
    display attribute, not an availability constraint. `almanac-content.svelte` currently passes
    `hideFishSize={!isFishCategory(cat.id)}` to `CompletionRow`; this prop chain is removed
    entirely.
  - `compact` is dropped. It suppressed building/perk lock icons on the old badges. These are not
    `AvailabilityCondition` nodes and are not carried forward.
  - `restrictions` (the old `Restriction[]` prop) is replaced by `badges: DisplayBadges`.

- [ ] **Step 6: Update badge consumers**

  - `completion-row.svelte`: Replace `restrictions` prop with `badges: DisplayBadges`. Update the
    caller to pass `getDisplayBadges(sources)` from `availability.ts`.
  - `item-row.svelte`: Replace `getItemRestrictions` import with `getDisplayBadges`. Compute
    `let badges = $derived(getDisplayBadges(sources))`.
  - `item-detail.svelte`: Update `isSourceAvailable` call — it now takes
    `(source, worldState, mode)` where source is `AcquisitionSource`. The availability dot logic is
    being retired per spec, but keep it functional for now (Task 4 removes `ItemDetail` entirely).
  - `search-results.svelte`: Replace `getItemRestrictions` with `getDisplayBadges`. Pass `badges` to
    `RestrictionBadges`.
  - `almanac-content.svelte`: Remove `hideFishSize` prop (passed as
    `hideFishSize={!isFishCategory(cat.id)}` on line ~155). The fish-size badge is retired.
  - `museum-content.svelte`: Remove `hideFishSize` prop if present.

- [ ] **Step 7: Run full verification matrix**

  Run: `pnpm run check && pnpm run lint && pnpm run test` Expected: All pass.

- [ ] **Step 8: Commit**

  ```bash
  git add -A
  git commit -m "refactor: rewrite availability engine to use AvailabilityCondition"
  ```

---

### Task 3: Source display expansion — icons & segments for all `AcquisitionSource` types

Extend `SOURCE_ICON` map and `buildSourceSegments` to cover every `AcquisitionSource` type
discriminant. Update `format.ts` to remove legacy helpers.

**Files:**

- Modify: `src/lib/components/icon/icon-maps.ts:56-76` — expand `SOURCE_ICON` to all
  `AcquisitionSource` types, update `SOURCE_FILTERS`
- Modify: `src/lib/components/icon/icon-source.svelte:7` — type already updated in Task 1
- Modify: `src/lib/utils/source-segments.ts:86-199` — add cases for new `AcquisitionSource` types
- Modify: `src/lib/utils/source-segments.ts:18-27` — expand `SegmentLookups` interface
- Modify: `src/lib/utils/format.ts` — remove `recipeSourceLabel()` (superseded by
  `buildSourceSegments`) and `RecipeSourceLookups` if no longer used
- Test: `src/lib/utils/source-segments.test.ts` — add tests for new source types

**Interfaces:**

- Consumes: `AcquisitionSource` union type from `acquisition.ts`
- Produces: Complete `SOURCE_ICON` mapping (icon for every source type); `buildSourceSegments`
  handling every type; expanded `SegmentLookups`

- [ ] **Step 1: Expand `SOURCE_ICON` in `icon-maps.ts`**

  Add Lucide icon imports for new source types and expand the map. The map type changes from
  `Record<RecipeSource["type"], LucideIcon>` to `Record<AcquisitionSource["type"], LucideIcon>`. New
  entries (Lucide icon choices are suggestions — verify they exist in the package):

  ```typescript
  import {
    // ... existing imports ...
    Bug,
    Droplets,
    Egg,
    Fish,
    Gem,
    HandPlatter,
    Salad,
    Shell,
    Shovel,
    Skull,
    Sword,
    TreePine,
    Wheat,
  } from "@lucide/svelte";

  export const SOURCE_ICON: Record<AcquisitionSource["type"], LucideIcon> = {
    // Shared types (present in both old recipe sources and item/cosmetic sources)
    beach_cave_chest: Archive,
    chicken_statue: Coins,
    default: CircleCheck,
    engagement: Heart,
    festival: PartyPopper,
    letter: Mail,
    mines_chest: Pickaxe,
    mines_dig_site: Pickaxe,
    museum_donation: Landmark,
    perk: Sparkles,
    quest: Scroll,
    renown: Crown,
    scroll_bundle: ShoppingCart,
    store: ShoppingCart,
    treasure_chest: FishingRod,
    upgrade: HardHat,
    wishing_well: Coins,
    // Types from item/cosmetic acquisition sources only
    animal_product: Egg,
    artifact_dig: Shovel,
    artifact_replicator: Gem,
    bug_catch: Bug,
    crop: Wheat,
    date: Heart,
    dive: Shell,
    equipment: Sword,
    festival_activity: PartyPopper,
    fish: Fish,
    fish_trap: FishingRod,
    forage: Salad,
    mine: Pickaxe,
    monster: Skull,
    monster_feed: HandPlatter,
    perk_drop: Sparkles,
    proposal: Heart,
    recipe: CookingPot,
    ritual_chamber: Sparkles,
    station: HardHat,
    tree: TreePine,
    wedding: Heart,
  };
  ```

  **Removed legacy-only types** (not in `AcquisitionSource` union):
  - `dragon_forge` — was a `ProductionMethod`, not a source type. Recipes crafted at the Dragon
    Forge have `{ type: "recipe", method: "dragon_forge" }` instead.
  - `store_with_perk` — folded into `{ type: "store" }` with perk info on the availability
    condition.

  These were already removed from the map and segment/format code in Task 1. Verify no references
  remain:

  ```bash
  grep -rn "dragon_forge\|store_with_perk" src/ --include="*.ts" --include="*.svelte" | grep -v acquisition.ts | grep -v ProductionMethod
  ```

  Note: Verify which Lucide icons are actually available in the `@lucide/svelte` package. Adjust
  imports and icon choices to match what exists. Some icons listed above may need different names.

  Update `SOURCE_FILTERS` to include the new types in appropriate filter groups. For example, add
  `"bug_catch"` to a "Gathering" filter, `"fish"` to "Fishing", etc. The exact grouping should be
  determined during implementation by examining the existing filter UX.

- [ ] **Step 2: Write failing tests for new `buildSourceSegments` cases**

  In `src/lib/utils/source-segments.test.ts`, add test cases for each new `AcquisitionSource` type.
  Example tests:

  ```typescript
  it("bug_catch with locations", () => {
    const source: AcquisitionSource = {
      locationIds: ["narrows" as LocationId, "eastern_road" as LocationId],
      type: "bug_catch",
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual(["Catch at Narrows, Eastern Road"]);
  });

  it("crop from seed", () => {
    const source: AcquisitionSource = {
      seedItemId: "turnip_seeds" as ItemId,
      type: "crop",
    };
    const result = buildSourceSegments(source, lookups);
    // Exact text TBD during implementation
    expect(result[0]).toContain("Grow");
  });

  it("fish with water types", () => {
    const source: AcquisitionSource = {
      type: "fish",
      waterTypes: ["river" as WaterType],
    };
    const result = buildSourceSegments(source, lookups);
    expect(result[0]).toContain("Catch");
  });
  ```

  Run: `pnpm run test:app -- --run src/lib/utils/source-segments.test.ts` Expected: FAIL (new cases
  not handled)

- [ ] **Step 3: Implement new `buildSourceSegments` cases**

  Add `switch` cases in `buildSourceSegments` for each new type. Expand the `SegmentLookups`
  interface with:

  ```typescript
  export interface SegmentLookups extends RecipeSourceLookups {
    // ... existing fields ...
    animalNames: Partial<Record<string, string>>;
    locationNames: Partial<Record<string, string>>;
    monsterNames: Partial<Record<string, string>>;
    stationNames: Partial<Record<string, string>>;
  }
  ```

  Example implementations for the new source types:

  ```typescript
  case "animal_product": {
    const name = lookups.animalNames[source.animalId] ?? titleCase(source.animalId);
    return [`Collect from ${name}`];
  }
  case "artifact_dig": {
    const locations = (source.locationIds ?? [])
      .map((id) => lookups.locationNames[id] ?? titleCase(id))
      .join(", ");
    return [locations ? `Dig up at ${locations}` : "Dig up"];
  }
  case "bug_catch": {
    const locations = (source.locationIds ?? [])
      .map((id) => lookups.locationNames[id] ?? titleCase(id))
      .join(", ");
    return [locations ? `Catch at ${locations}` : "Catch"];
  }
  case "crop": {
    const seedName = lookups.itemNames[source.seedItemId as string] ?? titleCase(source.seedItemId);
    return [`Grow from ${seedName}`];
  }
  case "date": {
    return ["Receive on a date"];
  }
  case "dive": {
    const waters = (source.waterTypes ?? []).map((w) => titleCase(w)).join(", ");
    return [waters ? `Dive in ${waters}` : "Dive"];
  }
  case "equipment": {
    const itemName = lookups.itemNames[source.itemId as string] ?? titleCase(source.itemId);
    return [`Use ${itemName}`];
  }
  case "festival_activity": {
    const festivalName = lookups.festivals[source.festivalId as string]?.name ?? titleCase(source.festivalId);
    return [`Participate in an activity at the ${festivalName}`];
  }
  case "fish": {
    const waters = (source.waterTypes ?? []).map((w) => titleCase(w)).join(", ");
    return [waters ? `Catch in ${waters}` : "Catch"];
  }
  case "fish_trap":
    return ["Catch in a fish trap"];
  case "forage": {
    const locations = (source.locationIds ?? [])
      .map((id) => lookups.locationNames[id] ?? titleCase(id))
      .join(", ");
    return [locations ? `Forage at ${locations}` : "Forage"];
  }
  case "mine": {
    const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
    return joinSegments("Mine in ", biomeLabel);
  }
  case "monster": {
    const name = lookups.monsterNames[source.monsterId as string] ?? titleCase(source.monsterId);
    return [`Dropped by ${name}`];
  }
  case "monster_feed": {
    const name = lookups.monsterNames[source.monsterId as string] ?? titleCase(source.monsterId);
    return [`Feed ${name}`];
  }
  case "perk_drop": {
    const perkLabel = buildPerkLabel(source.perkId, lookups);
    return joinSegments("Random drop with ", perkLabel);
  }
  case "proposal": {
    const npcName = lookups.npcNames[source.npcId as string] ?? titleCase(source.npcId);
    return [`Propose to ${npcName}`];
  }
  case "artifact_replicator": {
    const itemName = lookups.itemNames[source.originalItemId as string] ?? titleCase(source.originalItemId);
    return [`Replicate from ${itemName} (${String(source.requiredSetCount)} museum sets)`];
  }
  case "recipe": {
    const recipeName = lookups.recipeNames[source.recipeId] ?? titleCase(source.recipeId);
    const methodLabel = titleCase(source.method);
    return [`${methodLabel} via ${recipeName}`];
  }
  case "ritual_chamber": {
    const perkLabel = buildPerkLabel(source.perkId, lookups);
    return joinSegments("Craft at the Ritual Chamber with ", perkLabel);
  }
  case "station": {
    const stationName = lookups.stationNames[source.stationId as string] ?? titleCase(source.stationId);
    return [`Process at ${stationName}`];
  }
  case "tree": {
    const saplingName = lookups.itemNames[source.saplingItemId as string] ?? titleCase(source.saplingItemId);
    return [`Harvest from ${saplingName}`];
  }
  case "wedding":
    return ["Receive at a wedding"];
  ```

  Exact copy for each source type should be refined with representative items during implementation
  and presented for user review.

- [ ] **Step 4: Run source segment tests**

  Run: `pnpm run test:app -- --run src/lib/utils/source-segments.test.ts` Expected: PASS

- [ ] **Step 5: Clean up `format.ts`**

  Remove `recipeSourceLabel()` function and `RecipeSourceLookups` interface if nothing else imports
  them. Check with
  `grep -rn "recipeSourceLabel\|RecipeSourceLookups" --include="*.ts" --include="*.svelte" src/`.
  Remove `SOURCE_TYPE_LABEL` and `sourceTypeLabel` (already removed in Task 1; verify). Remove
  `locationLabel` if no longer used by any component.

- [ ] **Step 6: Run full verification matrix**

  Run: `pnpm run check && pnpm run lint && pnpm run test` Expected: All pass.

- [ ] **Step 7: Commit**

  ```bash
  git add -A
  git commit -m "feat: extend source icons and segments to all AcquisitionSource types"
  ```

---

### Task 4: Component unification — `TrackerRow` replaces five row patterns

Build the unified `TrackerRow` component, migrate all category pages, retire old components.

**Files:**

- Create: `src/lib/components/tracker-row.svelte` — unified row component
- Rename: `src/lib/components/recipe-source-list.svelte` → `src/lib/components/source-list.svelte`
- Delete: `src/lib/components/completion-row.svelte`
- Delete: `src/lib/components/redacted-row.svelte`
- Delete: `src/lib/components/cosmetic-row.svelte`
- Delete: `src/lib/components/item-row.svelte`
- Delete: `src/lib/components/item-detail.svelte`
- Modify: `src/lib/components/almanac-content.svelte` — switch to `TrackerRow`
- Modify: `src/lib/components/museum-content.svelte` — switch to `TrackerRow`
- Modify: `src/lib/components/cosmetics-content.svelte` — switch to `TrackerRow`
- Modify: `src/lib/components/mines-content.svelte` — switch to `TrackerRow`
- Modify: `src/lib/components/quests-content.svelte` — switch to `TrackerRow`
- Modify: `src/lib/components/recipes-content.svelte` — switch to `TrackerRow`, remove inline row
  markup
- Modify: `src/lib/components/search-results.svelte` — switch to `TrackerRow`

**Interfaces:**

- Consumes: `TrackerEntity` base type, `AcquisitionSource`, `DisplayBadges` from
  `availability-condition.ts`, `SourceSegment` from `source-segments.ts`
- Produces: `TrackerRow` component with `TrackerRowDisplay` discriminated union, `SourceList`
  component (renamed from `RecipeSourceList`)

- [ ] **Step 1: Create `TrackerRow` component**

  Create `src/lib/components/tracker-row.svelte`:

  ```svelte
  <script lang="ts">
    import { slide } from "svelte/transition";

    import { Icon } from "$lib/components/icon/index.js";
    import RestrictionBadges from "$lib/components/restriction-badges.svelte";
    import SourceList from "$lib/components/source-list.svelte";
    import { getDisplayBadges } from "$lib/engine/availability.js";
    import { buildSourceSegments } from "$lib/utils/source-segments.js";

    import type { DisplayBadges } from "$lib/engine/availability-condition.js";
    import type { AcquisitionSource } from "$lib/types/tracker-data.js";
    import type { SegmentLookups, SourceSegment } from "$lib/utils/source-segments.js";

    type TrackerRowDisplay =
      | { mode: "completed"; leaving?: boolean }
      | { mode: "redacted" }
      | { mode: "visible"; dimmed?: boolean };

    let {
      display,
      lookups,
      name,
      onToggle,
      sources = [],
    }: {
      display: TrackerRowDisplay;
      lookups?: SegmentLookups;
      name: string;
      onToggle: () => void;
      sources?: AcquisitionSource[];
    } = $props();

    let uniqueSourceTypes = $derived([...new Set(sources.map((s) => s.type))]);
    let badges: DisplayBadges = $derived(getDisplayBadges(sources));
    let sourceSegments: SourceSegment[][] = $derived(
      lookups ? sources.map((s) => buildSourceSegments(s, lookups)) : [],
    );

    let expanded = $state(false);

    let isCompleted = $derived(display.mode === "completed");
    let isRedacted = $derived(display.mode === "redacted");
    let isLeaving = $derived(display.mode === "completed" && (display.leaving ?? false));
    let isDimmed = $derived(display.mode === "visible" && (display.dimmed ?? false));

    function completeOut(node: Element) {
      if (node.getAttribute("data-leaving") !== "true") return { duration: 0 };
      return {
        css: (t: number) => `opacity: ${t}; pointer-events: none;`,
        delay: 800,
        duration: 200,
        tick: (t: number) => {
          if (t === 0) {
            (node as HTMLElement).style.height = "0";
            (node as HTMLElement).style.overflow = "hidden";
          }
        },
      };
    }
  </script>

  <div out:completeOut data-leaving={isLeaving}>
    <div
      class="flex items-center gap-0 rounded-md pr-2 transition-opacity duration-200
        {isDimmed ? 'opacity-50' : ''}
        {isCompleted || isLeaving ? 'line-through opacity-40' : ''}"
    >
      <button
        class="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
        type="button"
        aria-label={isCompleted
          ? `Uncheck ${name}`
          : isRedacted
            ? "Check redacted item"
            : `Check ${name}`}
        onclick={onToggle}
      >
        <Icon.Completion
          state={isCompleted ? "completed" : "none"}
          class="size-5 {isCompleted
            ? 'text-green-600 dark:text-green-400'
            : 'text-muted-foreground/50'}"
        />
      </button>

      {#if isRedacted}
        <span class="min-w-0 flex-1 text-base text-muted-foreground italic">Redacted</span>
      {:else}
        <span class="min-w-0 flex-1 text-base">{name}</span>
      {/if}

      {#if uniqueSourceTypes.length > 0}
        <button
          class="group flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted"
          type="button"
          aria-expanded={expanded}
          aria-label="{isRedacted ? 'Redacted item' : name} sources"
          onclick={() => {
            expanded = !expanded;
          }}
        >
          {#each uniqueSourceTypes as sourceType (sourceType)}
            <Icon.Source type={sourceType} class="size-3.5 shrink-0" />
          {/each}
          <Icon.UI
            type="disclosure"
            class="size-3 shrink-0 opacity-40 transition-transform {expanded ? 'rotate-90' : ''}"
          />
        </button>
      {/if}

      {#if (badges.seasons || badges.weathers || badges.timeRange) && !isRedacted}
        <RestrictionBadges {badges} />
      {/if}
    </div>

    {#if expanded && sources.length > 0}
      <div class="flex flex-col gap-1 py-1 pr-2 pl-8" transition:slide={{ duration: 150 }}>
        <SourceList {sources} {sourceSegments} />
      </div>
    {/if}
  </div>
  ```

  Also export `TrackerRowDisplay` type from a barrel or from the component file itself.

- [ ] **Step 2: Rename `recipe-source-list.svelte` → `source-list.svelte`**

  ```bash
  git mv src/lib/components/recipe-source-list.svelte src/lib/components/source-list.svelte
  ```

  Update all imports referencing the old name. The component's internal logic stays the same (it
  already renders `Icon.Source` + `SourceSegmentText` for each source).

- [ ] **Step 3: Migrate `almanac-content.svelte`**

  Replace `ItemRow` and `RedactedRow` imports with `TrackerRow`. For each item in the rendering
  loop:

  - Derive `display` from completion state + spoiler engine output:
    - If recently completed (leaving): `{ mode: "completed", leaving: true }`
    - If completed: `{ mode: "completed" }`
    - If redacted: `{ mode: "redacted" }`
    - If visible but dimmed: `{ mode: "visible", dimmed: true }`
    - Otherwise: `{ mode: "visible" }`
  - Pass `sources={trackerData.items[itemId]?.sources ?? []}`
  - Pass `name={item.name}`
  - Pass lookups derived from `trackerData`
  - Pass sources to redacted rows (they now get source icons too)

  Remove `ItemRow` and `RedactedRow` imports.

- [ ] **Step 4: Migrate `museum-content.svelte`**

  Same pattern as almanac. Replace `ItemRow` + `RedactedRow` with `TrackerRow`. Pass sources to
  redacted rows.

- [ ] **Step 5: Migrate `cosmetics-content.svelte`**

  Replace `CosmeticRow` + `RedactedRow` with `TrackerRow`. Sources come from
  `trackerData.cosmetics[id]?.sources ?? []`. Pass sources to redacted rows.

- [ ] **Step 6: Migrate `recipes-content.svelte`**

  This is the largest migration. Remove the inline visible-recipe row markup and replace with
  `TrackerRow`. The recipe page already computes source segments and has the lookups object; pass
  those through. Replace `RedactedRow` usage too.

  Key changes:
  - Remove the inline `<div class="flex items-center gap-0 ...">` visible row markup
  - Replace with `<TrackerRow {display} {name} {sources} {lookups} {onToggle} />`
  - The source filtering toolbar continues to work by filtering which recipes to show, not by
    modifying `TrackerRow` behavior

- [ ] **Step 7: Migrate `mines-content.svelte` & `quests-content.svelte`**

  These pages use `RedactedRow` (plus custom visible row markup for mines floors/spells and quest
  entries). Replace `RedactedRow` with `TrackerRow` in redacted mode. For visible rows, use
  `TrackerRow` where the row structure matches (quests with completion tracking). Mines floor
  tracking is a stepper, not a row — leave it as-is.

- [ ] **Step 8: Migrate `search-results.svelte`**

  Replace the inline result rendering with `TrackerRow`. The search result row should show source
  icons and badges from the item's sources.

- [ ] **Step 9: Delete retired components**

  ```bash
  git rm src/lib/components/completion-row.svelte
  git rm src/lib/components/redacted-row.svelte
  git rm src/lib/components/cosmetic-row.svelte
  git rm src/lib/components/item-row.svelte
  git rm src/lib/components/item-detail.svelte
  ```

  Verify no remaining imports reference these files:
  `grep -rn "completion-row\|redacted-row\|cosmetic-row\|item-row\|item-detail" --include="*.ts" --include="*.svelte" src/`

- [ ] **Step 10: Run full verification matrix**

  Run: `pnpm run check && pnpm run lint && pnpm run test` Expected: All pass.

- [ ] **Step 11: Visual verification in browser**

  Run: `pnpm run dev`

  Check each category page in the browser:
  - Almanac: visible items show source icons on the right, expand to source detail. Redacted items
    show source icons too. Badges display for seasonal items. Completion toggle works.
  - Museum: same checks as almanac.
  - Cosmetics: source icons display, expand works.
  - Recipes: recipe rows use the unified component, source filtering still works, source detail
    expands correctly.
  - Mines: redacted spells show source icons. Floor stepper is unchanged.
  - Quests: redacted quests show source icons.
  - Search: results show source icons and badges.

- [ ] **Step 12: Commit**

  ```bash
  git add -A
  git commit -m "feat: unify row components into TrackerRow, extend source display to all pages"
  ```

---

### Task 5: Final cleanup & PR

Polish pass, push, and open the PR.

**Files:**

- Potentially modify: any files with stale comments, unused imports, or TODO markers from earlier
  tasks

**Interfaces:**

- Consumes: Clean build from Tasks 1-4
- Produces: PR referencing issues #91 and #101

- [ ] **Step 1: Remove stale references**

  Search for any remaining references to removed types or components:

  ```bash
  grep -rn "LegacyItemSource\|LegacyRecipeSource\|SourceType\|RestrictionType\|Restriction\b\|trackerData\.sources\b\|getItemRestrictions\|sourceTypeLabel\|SOURCE_TYPE_LABEL\|RecipeSourceLookups\|recipeSourceLabel\|CompletionRow\|RedactedRow\|CosmeticRow\|ItemRow\|ItemDetail\|item-detail\|completion-row\|redacted-row\|cosmetic-row\|item-row\|convertLegacyRecipeSource\|extractSources" --include="*.ts" --include="*.svelte" src/ pipeline/src/
  ```

  Fix any hits.

- [ ] **Step 2: Run full verification matrix one final time**

  Run: `pnpm run check && pnpm run lint && pnpm run test && pnpm run build` Expected: All pass,
  including production build.

- [ ] **Step 3: Push & open PR**

  ```bash
  git push -u origin 91-101-unified-sources-and-rows
  gh pr create --title "Unify source types & row components" --body "$(cat <<'EOF'
  ## Summary

  - Removes legacy source type system (`LegacyItemSource`, `LegacyRecipeSource`, `Restriction`,
    `SourceType`, top-level `trackerData.sources` map)
  - Extracts `TrackerEntity` base interface; renames `acquisitionSources` → `sources` on all
    entities
  - Rewrites `availability.ts` to use `AvailabilityCondition` trees instead of flat `Restriction`
    arrays
  - Extends source icons & descriptive text to all `AcquisitionSource` types
  - Unifies five row patterns (`CompletionRow`, `RedactedRow`, `CosmeticRow`, `ItemRow`, inline
    recipe rows) into `TrackerRow`
  - All category pages now show source icons on redacted rows

  Closes #91
  Closes #101

  ## Test plan

  - [ ] Full verification matrix passes (`check`, `lint`, `test`, `build`)
  - [ ] Pipeline regeneration produces valid data without legacy `sources` map
  - [ ] Each category page renders correctly in the browser
  - [ ] Source expansion shows descriptive text for all source types
  - [ ] Availability filtering (timely/available/everything) works correctly
  - [ ] Season/weather badges display on appropriate items
  - [ ] Recipe source filtering toolbar still functions

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

- [ ] **Step 4: Commit**

  Only if cleanup in Step 1 produced changes:

  ```bash
  git add -A
  git commit -m "chore: final cleanup of stale references"
  git push
  ```
