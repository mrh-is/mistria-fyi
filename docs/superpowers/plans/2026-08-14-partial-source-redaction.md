# Partial source redaction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the binary redaction model (`"redacted" | "source-only" | "visible"`) with
per-fragment progressive redaction via a recursive `SourceSegment` tree, computed at render time
from existing `RecipeSource` data and tracker-data lookup tables.

**Architecture:** A new `buildSourceSegments()` function converts a `RecipeSource` + lookups into a
tree of `SourceSegment` nodes. Each conditional node carries a `VisibilityCondition` that the UI
evaluates at render time to decide which branch to render. Grammar segment helpers (perk label,
biome label, store qualifier, date label) are shared across source types. The existing
`recipeSourceLabel()` function remains for flat-string contexts (search, accessibility).

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest

**Spec:** `docs/superpowers/specs/2026-08-14-partial-source-redaction-design.md`

## Global constraints

- Node >= 26, pnpm exclusively
- TypeScript strict mode, `strictTypeChecked` ESLint
- `type` imports (`consistent-type-imports`)
- Prettier: double quotes, no tabs, trailing commas, 100 char width, semicolons
- Branded ID types for type safety (`StoreId`, `PerkId`, etc.)
- `src/lib/data/tracker-data.json` is pipeline-generated; never hand-edit
- `src/lib/components/ui/` is vendored shadcn-svelte; do not modify
- Before verifying the approved documentation, format only the two authored files with
  `pnpm exec prettier --write docs/superpowers/specs/2026-08-14-partial-source-redaction-design.md docs/superpowers/plans/2026-08-14-partial-source-redaction.md`,
  then run the complete verification matrix below. This removes the existing spec-only lint baseline
  failure without formatting unrelated files.
- Follow strict red-green-refactor order for every behavior in every task: write the focused test,
  run it and confirm the expected failure, implement only that behavior, then rerun the focused test
  and confirm it passes before proceeding. Code blocks under implementation steps describe the
  target green state; they must never be written before their corresponding test has failed.
- Immediately before every commit in this plan, including the documentation commit, run the full
  repository verification matrix directly: `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`,
  `pnpm run test`, `pnpm run build`, and `pnpm run pipeline -- pipeline/input/assets`. Confirm every
  command exits zero, confirm `git diff --check` exits zero, and inspect the generated-data diff.
  Focused checks earlier in a task are feedback loops, not substitutes for this pre-commit gate.
- Do not begin Task 1 until the approved spec and this plan are committed

---

### Task 1: Pipeline — Derive recipe visibility from stock requirements

**Files:**

- Modify: `pipeline/src/main.ts` (build the cutscene map before recipe extraction)
- Modify: `pipeline/src/extractors/recipes.ts` (resolve every stock-entry requirement)
- Modify: `pipeline/src/extractors/recipes.test.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts` (starter stores and two-phase
  gates)
- Modify: `pipeline/src/extractors/visibility/entity-visibility.test.ts`
- Regenerate: `src/lib/data/tracker-data.json`

**Interfaces:**

- Consumes: `buildRequirementDefinitions()`, `parseRequirements()`, `resolveToVisibility()`, the
  cutscene-to-quest map, recipe extraction, and `computeRecipeSourceConditions()`
- Produces: starter-store `storeVisibility: always`; extraction-time stock conditions on `store` and
  `scroll_bundle` sources; final `recipe.visibility` at the entity threshold and final
  `source.visibility` at the earlier disclosure threshold

**Context:** Currently, starter stores (carpenter, general, hayden, inn) have `storeVisibility`
gated by their upgrade/repair quest. This causes the pipeline to over-gate all recipes from these
stores. Lemon Pie (available from the inn from day one) is incorrectly redacted until the inn is
upgraded. The fix makes starter stores `always` visible at the store level and resolves every
individual stock entry's `requirements` through the existing requirement engine. During extraction,
`source.visibility` temporarily carries the entity condition (normally `questCompleted`).
`assignRecipeVisibility()` consumes it, computes `recipe.visibility`, and overwrites it with the
earlier source-detail condition (`questAvailable`). The generated contract does not gain a second
visibility field.

**TDD order for this task:** Complete Steps 1–3 as one red-green cycle. Before changing recipe
extraction in Steps 4–6, first author the exact Step 7 recipe, scroll-bundle, Espresso Machine, and
visibility-transformation cases, run them, and confirm they fail for the missing stock-condition
behavior. Implement Steps 4–6 one assertion group at a time, rerunning the focused test after each
minimal change. Step 7 catalogs those tests; it is a red-phase prerequisite, not a tests-after step.

- [ ] **Step 1: Update the existing starter-store visibility tests**

In the existing `extractStoreVisibility` suite in
`pipeline/src/extractors/visibility/entity-visibility.test.ts`, replace the General Store assertion
and add the other starter stores:

```typescript
describe("extractStoreVisibility", () => {
  it("returns always for starter stores", () => {
    const fiddle = makeFiddle({
      stores: { carpenter: {}, general: {}, hayden: {}, inn: {} },
    });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["carpenter" as StoreId]).toEqual({ type: "always" });
    expect(result["general" as StoreId]).toEqual({ type: "always" });
    expect(result["hayden" as StoreId]).toEqual({ type: "always" });
    expect(result["inn" as StoreId]).toEqual({ type: "always" });
  });

  it("returns questCompleted for NPC market stalls", () => {
    const fiddle = makeFiddle({ stores: { darcy: {}, wheedle: {} } });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["darcy" as StoreId]).toEqual({
      questId: "repair_the_bridge",
      type: "questCompleted",
    });
    expect(result["wheedle" as StoreId]).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test:pipeline -- entity-visibility` Expected: FAIL because the four starter stores
still return `questCompleted`.

- [ ] **Step 3: Fix STORE_UNLOCK_QUESTS**

In `entity-visibility.ts`, remove the four starter stores from `STORE_UNLOCK_QUESTS`:

```typescript
const STORE_UNLOCK_QUESTS: Partial<Record<string, QuestId>> = {
  darcy: "repair_the_bridge" as QuestId,
  louis: "repair_the_bridge" as QuestId,
  merri: "repair_the_bridge" as QuestId,
  vera: "repair_the_bridge" as QuestId,
  wheedle: "upgrade_the_saturday_market" as QuestId,
  zorel: "upgrade_the_saturday_market_plaza" as QuestId,
};
```

- [ ] **Step 4: Pass the cutscene map into recipe extraction**

In `pipeline/src/main.ts`, build `cutsceneQuestMap` before `extractRecipes()` and pass it in. Remove
the later duplicate declaration:

```typescript
const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
const { recipeIdByItemId, recipes } = extractRecipes(fiddle, cutsceneQuestMap);
```

- [ ] **Step 5: Resolve all stock requirements in recipe extraction**

In `recipes.ts`, import the existing requirement parser and resolver, change the public signature,
and build the parsing context once per extraction:

```typescript
import { buildRequirementDefinitions, parseRequirements } from "../requirements.js";
import { resolveToVisibility } from "./visibility/requirement-resolver.js";

import type { VisibilityCondition } from "$lib/types/visibility.js";
import type { CutsceneQuestMap } from "./visibility/cutscene-quest-map.js";

interface StockVisibilityContext {
  cutsceneMap: CutsceneQuestMap;
  namedRequirements: ReturnType<typeof buildRequirementDefinitions>["namedRequirements"];
  primitivePredicates: ReturnType<typeof buildRequirementDefinitions>["primitivePredicates"];
}

export function extractRecipes(
  fiddle: ParsedGameData,
  cutsceneMap: CutsceneQuestMap = {},
): { recipeIdByItemId: Map<string, RecipeId>; recipes: Record<RecipeId, Recipe> } {
  const definitions = buildRequirementDefinitions(
    (fiddle.requirements as Record<string, unknown> | undefined) ?? {},
  );
  const stockVisibilityContext: StockVisibilityContext = { cutsceneMap, ...definitions };

  mergeSources(
    collectStoreScrollSources(fiddle, itemIdToRecipeId, knownRecipeIds, stockVisibilityContext),
  );
  mergeSources(collectScrollBundleSources(fiddle, itemIdToRecipeId, stockVisibilityContext));
}

function resolveStockVisibility(
  requirements: unknown,
  entityId: string,
  ctx: StockVisibilityContext,
): VisibilityCondition {
  const expression = parseRequirements(
    requirements,
    ctx.namedRequirements,
    ctx.primitivePredicates,
    { entityId, fieldPath: "requirements", sourcePath: "fiddle/stores.toml" },
  );
  return resolveToVisibility(expression, ctx.cutsceneMap);
}
```

Add `ctx: StockVisibilityContext` as the final parameter of the existing
`collectStoreScrollSources()` and `collectScrollBundleSources()` definitions, matching the calls
above. Remove the old calls without the context argument.

Use the resolver for each object-form entry processed by `collectStoreScrollSources()`. `has_perk`
remains a distinct `store_with_perk` source and must not fall through to the generic `store`
construction. Upgrade classification controls the regular-store grammar; `visibility` carries the
complete resolved condition on either variant:

```typescript
const UPGRADE_PREDICATES = new Set([
  "repaired_carpenters_shop",
  "repaired_general_store",
  "repaired_inn",
]);

const visibility = resolveStockVisibility(obj.requirements, `${storeId}/${recipeId}`, ctx);
const requirements =
  typeof obj.requirements === "object" && obj.requirements !== null
    ? (obj.requirements as Record<string, unknown>)
    : undefined;
const upgraded = requirements
  ? Object.keys(requirements).some((key) => UPGRADE_PREDICATES.has(key))
  : false;
const hasPerk = typeof requirements?.has_perk === "string" ? requirements.has_perk : undefined;

if (hasPerk) {
  sources.push({
    perkId: hasPerk as PerkId,
    storeId: storeId as StoreId,
    type: "store_with_perk",
    ...(visibility.type === "always" ? {} : { visibility }),
  });
} else {
  sources.push({
    storeId: storeId as StoreId,
    type: "store",
    ...(upgraded ? { upgraded: true } : {}),
    ...(visibility.type === "always" ? {} : { visibility }),
  });
}
```

In `collectScrollBundleSources()`, replace the set-tag value and source construction with:

```typescript
const setTagToStore = new Map<
  string,
  { bundleName: string; storeId: string; visibility: VisibilityCondition }
>();

const entryObject =
  typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : undefined;
const visibility = resolveStockVisibility(entryObject?.requirements, `${storeId}/${itemId}`, ctx);
setTagToStore.set(setTag, { bundleName, storeId, visibility });

result.set(recipeId, [
  {
    bundleName: info.bundleName,
    storeId: info.storeId as StoreId,
    type: "scroll_bundle",
    ...(info.visibility.type === "always" ? {} : { visibility: info.visibility }),
  },
]);
```

This covers named repairs, `unlocked_deep_woods`, mine/skill gates, and non-spoiler predicates such
as `reached_date` through the shared resolver.

- [ ] **Step 6: Preserve separate entity and source thresholds**

In `entity-visibility.ts`, update the `store` and `scroll_bundle` cases to also consider
`source.visibility` (the per-item gate):

```typescript
case "scroll_bundle":
case "store": {
  const storeGate = storeGateCondition(source.storeId, ctx.storeVisibility);
  // At this point source.visibility carries the extraction-time stock entity gate.
  const stockGate = source.visibility ?? ALWAYS;
  return {
    entity: andSimplify([storeGate, stockGate]),
    source: andSimplify([toAvailable(storeGate), toAvailable(stockGate)]),
  };
}
case "store_with_perk": {
  const storeGate = storeGateCondition(source.storeId, ctx.storeVisibility);
  const stockGate = source.visibility ?? ALWAYS;
  const perkCondition: VisibilityCondition = { perkId: source.perkId, type: "perkUnlocked" };
  return {
    entity: andSimplify([storeGate, stockGate, perkCondition]),
    source: andSimplify([toAvailable(storeGate), toAvailable(stockGate), perkCondition]),
  };
}
```

The existing `toAvailable()` helper only converts a top-level `questCompleted` leaf. Stock
conditions can be composite, so replace it with a recursive conversion that preserves non-quest
leaves and simplifies nested `and` / `or` nodes:

```typescript
function toAvailable(condition: VisibilityCondition): VisibilityCondition {
  switch (condition.type) {
    case "and":
    case "or":
      return simplifyCondition({
        conditions: condition.conditions.map(toAvailable) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
        type: condition.type,
      });
    case "questCompleted":
      return { questId: condition.questId, type: "questAvailable" };
    default:
      return condition;
  }
}
```

Do not stamp `questAvailable` during extraction. `assignRecipeVisibility()` first uses the extracted
`questCompleted` condition for `recipe.visibility`, then overwrites `source.visibility` with the
computed disclosure threshold.

- [ ] **Step 7: Confirm the extraction and transformation tests authored before Steps 4–6**

In `recipes.test.ts`, add fixtures that assert:

- a `repaired_general_store` named requirement produces a store source with
  `visibility: questCompleted(repair_the_general_store)` and `upgraded: true`;
- `unlocked_deep_woods` resolves through a supplied cutscene map instead of becoming `always`;
- `reached_date` resolves to `always` because it is explicitly non-spoiler-sensitive;
- an upgrade-gated scroll bundle carries its resolved completion condition.
- the Espresso Machine fixture retains `type: "store_with_perk"` and `perkId: "espresso_yourself"`;
  it is never rewritten as a plain `store` source.

In the existing `assignEntityVisibility — recipes` suite, add a starter-store recipe whose source
enters with `questCompleted(repair_the_general_store)`. Assert that final `recipe.visibility`
remains `questCompleted` while final `source.visibility` becomes `questAvailable`. Add a
`store_with_perk` recipe with an extraction-time stock gate and assert that its entity condition
contains the store gate, stock gate, and `perkUnlocked`, while its disclosure condition contains the
available forms of both quest gates plus `perkUnlocked`. Add a stock gate shaped as
`and(questCompleted, skillLevel)` and one shaped as `or(questCompleted, minesLevel)`. Assert that
only the nested quest leaves become `questAvailable`, while the composite operators and non-quest
leaves are preserved.

- [ ] **Step 8: Run focused and full pipeline tests**

Run: `pnpm run test:pipeline -- recipes entity-visibility` Expected: all focused tests pass.

Run: `pnpm run test:pipeline` Expected: all pipeline tests pass.

- [ ] **Step 9: Verify with pipeline run**

Run: `pnpm run pipeline -- pipeline/input/assets` Expected: pipeline completes. In
`pipeline/output/tracker-data-readable.json`, verify Lemon Pie is always visible, an upgraded Inn
recipe has `recipe.visibility: questCompleted(repair_the_inn)` and
`source.visibility: questAvailable(repair_the_inn)`, and a General Store scroll bundle has the same
three-phase pairing.

- [ ] **Step 10: Commit**

Run the mandatory full pre-commit matrix from Global constraints now. Do not stage or commit until
all six commands and `git diff --check` exit zero.

```bash
git add pipeline/src/extractors/visibility/entity-visibility.ts \
       pipeline/src/extractors/visibility/entity-visibility.test.ts \
       pipeline/src/extractors/recipes.ts \
       pipeline/src/extractors/recipes.test.ts \
       pipeline/src/main.ts \
       src/lib/data/tracker-data.json
git commit -m "fix: derive recipe visibility from per-item requirements, not store-level gate

Starter stores (carpenter, general, hayden, inn) now have always-visible
storeVisibility. Individual stock requirements are resolved into entity
conditions, while source details retain their earlier disclosure threshold."
```

---

### Task 2: Pipeline — Data model updates

**Files:**

- Modify: `src/lib/types/tracker-data.ts:57-98` (RecipeSource union — rename, add quest fields)
- Modify: `src/lib/types/tracker-data.ts:163-283` (TrackerData — store and festival types)
- Modify: `pipeline/src/extractors/recipes.ts:314-341` (collectHardcodedSources — rename)
- Modify: `pipeline/src/extractors/recipes.ts:562-598` (collectQuestScrollSources — add sub-fields)
- Modify: `pipeline/src/extractors/stores-meta.ts` (add upgradeAction)
- Modify: `pipeline/src/extractors/festivals.ts` (add date)
- Modify: `src/lib/utils/format.ts:36-53,109-212` (SOURCE_TYPE_LABEL, recipeSourceLabel — rename)
- Modify: `src/lib/components/icon/icon-maps.ts` (source icon and filter rename)
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts:394-409`
  (computeRecipeSourceConditions — rename)
- Test: `pipeline/src/extractors/stores-meta.test.ts`
- Test: `pipeline/src/extractors/festivals.test.ts`
- Test: `pipeline/src/extractors/recipes.test.ts`
- Modify: `src/lib/components/recipes-content.svelte` (add `recipeNames: {}` to sourceLookups)
- Test: `src/lib/utils/format.test.ts`
- Regenerate: `src/lib/data/tracker-data.json`

**Interfaces:**

- Consumes: existing RecipeSource, TrackerData, extractors
- Produces:
  - `RecipeSource` with `"engagement"` type replacing `"relationship"`, `requestedItemId?: ItemId`
    and `challengeRecipeId?: RecipeId` on the `quest` variant
  - `TrackerData["stores"]` with `upgradeAction?: string` on store records
  - `TrackerData["festivals"]` with required `date: { day: number; season: Season }` records
  - `RecipeSourceLookups.perks` with `visibility?: VisibilityCondition`
  - `RecipeSourceLookups.recipeNames` keyed by `RecipeId`, so recipe IDs are never resolved through
    item-ID lookups
  - `RecipeSourceLookups.stores` with `upgradeAction?: string`

This task bundles the related contract changes: the `relationship` → `engagement` rename, adding
`upgradeAction` to stores, adding `date` to festivals, adding `requestedItemId` /
`challengeRecipeId` to quest sources, and adding the recipe-keyed presentation-name lookup consumed
by Task 4.

**TDD order for this task:** Before each implementation group, write its corresponding tests and
observe the expected failure: engagement rename tests before Steps 1–4, store metadata tests before
Step 7, the exact festival tests in Step 9 before Step 8, and quest-source extraction tests before
Step 10. Step 11 is the consolidated test catalog and coverage check; it must be populated during
the preceding red phases, not after the production changes.

- [ ] **Step 1: Rename `relationship` → `engagement` in RecipeSource type**

In `tracker-data.ts`, change the union member:

```typescript
// Before:
| { type: "relationship"; visibility?: VisibilityCondition }
// After:
| { type: "engagement"; visibility?: VisibilityCondition }
```

- [ ] **Step 2: Update collectHardcodedSources**

In `recipes.ts`, change the hardcoded source for the engagement ring:

```typescript
["engagement_ring", { type: "engagement" }],
```

- [ ] **Step 3: Update flat formatting and source icons**

`SOURCE_TYPE_LABEL` describes the separate item `SourceType` union and contains neither
`relationship` nor `engagement`; do not change that map. In `recipeSourceLabel`, rename only the
`RecipeSource` case:

```typescript
case "engagement":
  return "Receive from Elsie after getting to 10 hearts with a dateable character";
```

In `src/lib/components/icon/icon-maps.ts`, update both exhaustive RecipeSource structures:

Replace the `relationship: Heart` entry with `engagement: Heart`, and replace the relationship
filter with this exact entry:

```typescript
{ icon: Heart, label: "Engagement", types: ["engagement"] },
```

- [ ] **Step 4: Update computeRecipeSourceConditions**

In `entity-visibility.ts`, rename `relationship` to `engagement` in the switch case.

- [ ] **Step 5: Prove the rename is exhaustive without changing unrelated unions**

Run: `rg -n 'relationship|engagement' src pipeline -g '*.{ts,svelte}'`

Expected remaining `relationship` uses belong only to item-source restrictions, availability logic,
NPC UI copy, and progress-mark icon types. Every `RecipeSource["type"]` switch, map, and filter uses
`engagement`.

- [ ] **Step 6: Run tests to verify rename**

Run: `pnpm run check && pnpm run test:app -- format` Expected: type checking and the updated
`recipeSourceLabel` engagement test pass.

- [ ] **Step 7: Add upgradeAction to store type and extractor**

In `tracker-data.ts`, update the `stores` field in `TrackerData`:

```typescript
stores: Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }>;
```

Update both lookup members in `format.ts` so downstream code consumes those fields without an
assertion:

```typescript
perks: Partial<
  Record<
    string,
    {
      name: string;
      skillId: string;
      tier: number;
      visibility?: VisibilityCondition;
    }
  >
>;
recipeNames: Partial<Record<RecipeId, string>>;
stores: Partial<Record<string, { article?: "the"; name: string; upgradeAction?: string }>>;
```

Add `RecipeId` to the tracker-data type import and `VisibilityCondition` as a type import in
`format.ts`. `recipeSourceLabel()` does not consume `recipeNames`; the field exists for the
redaction-aware builder introduced in Task 4.

In `stores-meta.ts`, add `upgradeAction` for the general store. The extractor needs a map of store
IDs to upgrade actions:

```typescript
const UPGRADE_ACTIONS: Partial<Record<string, string>> = {
  general: "repairing",
};

// In the result construction:
const upgradeAction = UPGRADE_ACTIONS[storeId];
result[storeId as StoreId] = {
  ...(known.article ? { article: known.article } : {}),
  name,
  ...(upgradeAction ? { upgradeAction } : {}),
};
```

- [ ] **Step 7b: Add recipeNames to existing sourceLookups in recipes-content**

In `recipes-content.svelte`, add `recipeNames: {},` to the existing `sourceLookups` construction so
that the expanded `RecipeSourceLookups` type compiles between Task 2 and Task 5 (which replaces the
full construction):

```svelte
let sourceLookups: RecipeSourceLookups = $derived({
  biomes: trackerData.mines.biomes,
  festivals: trackerData.festivals,
  itemNames: Object.fromEntries(
    Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
  ),
  perks: trackerData.perks,
  perkTierLevels: trackerData.perkTierLevels,
  questNames: Object.fromEntries(
    Object.values(trackerData.quests).flatMap((group) =>
      Object.entries(group).map(([id, q]) => [id, q.name]),
    ),
  ),
  recipeNames: {},
  redactedStoreIds,
  skillNames: Object.fromEntries(
    Object.entries(trackerData.skills).map(([id, name]) => [id, name]),
  ),
  stores: trackerData.stores,
  treasureChestTiers: trackerData.treasureChestTiers,
});
```

- [ ] **Step 8: Add required date to festival type and extractor**

Before applying this implementation, write both exact tests from Step 9 and confirm that the valid
date assertion fails because `date` is absent. Add the invalid-season and invalid-day cases defined
below and confirm they also fail.

In `tracker-data.ts`, update the `festivals` field:

```typescript
festivals: Record<FestivalId, { date: { day: number; season: Season }; name: string }>;
```

In `festivals.ts`, extract the date field from each festival:

Add `Season` to the existing tracker-data type import:

```typescript
import type { FestivalId, Season } from "$lib/types/tracker-data.js";
```

```typescript
const dateObj = (festival as Record<string, unknown>).date;
if (typeof dateObj !== "object" || dateObj === null || Array.isArray(dateObj)) {
  throw new Error(`Festival "${festivalId}" has no valid date`);
}
const { day, season } = dateObj as Record<string, unknown>;
const validSeasons = new Set<Season>(["spring", "summer", "fall", "winter"]);
if (
  typeof day !== "number" ||
  !Number.isInteger(day) ||
  day < 1 ||
  day > 28 ||
  typeof season !== "string" ||
  !validSeasons.has(season as Season)
) {
  throw new Error(`Festival "${festivalId}" has no valid date`);
}
result[festivalId as FestivalId] = {
  date: { day, season: season as Season },
  name,
};
```

- [ ] **Step 9: Confirm the festival date tests authored before Step 8**

In `festivals.test.ts`, add a test:

```typescript
it("extracts festival date when present", () => {
  const fiddle = makeFiddle({
    festivals: {
      harvest_festival: {
        date: { day: 10, season: "fall" },
        name: "Harvest Festival",
      },
    },
  });
  const result = extractFestivals(fiddle);
  expect(result.harvest_festival).toEqual({
    date: { day: 10, season: "fall" },
    name: "Harvest Festival",
  });
});

it("rejects a festival without a valid date", () => {
  const fiddle = makeFiddle({ festivals: { harvest: { name: "Harvest Festival" } } });
  expect(() => extractFestivals(fiddle)).toThrow('Festival "harvest" has no valid date');
});

it.each([
  { date: { day: 10, season: "autumn" }, label: "unknown season" },
  { date: { day: 0, season: "fall" }, label: "day below range" },
  { date: { day: 29, season: "fall" }, label: "day above range" },
  { date: { day: 10.5, season: "fall" }, label: "fractional day" },
])("rejects $label", ({ date }) => {
  const fiddle = makeFiddle({ festivals: { harvest: { date, name: "Harvest Festival" } } });
  expect(() => extractFestivals(fiddle)).toThrow('Festival "harvest" has no valid date');
});
```

- [ ] **Step 10: Add requestedItemId to quest RecipeSource for fetch quests**

Before applying this implementation, add the scalar, quantity-object, array, and Tali mapping cases
listed in Step 11. Confirm each fails because the relevant quest-source field is absent.

In `tracker-data.ts`, update the quest variant of RecipeSource:

```typescript
| {
    challengeRecipeId?: RecipeId;
    questId: QuestId;
    questType: QuestType;
    requestedItemId?: ItemId;
    type: "quest";
    visibility?: VisibilityCondition;
  }
```

In `collectQuestScrollSources`, replace the current inline source object with a helper call after
`recipeId` has been resolved:

```typescript
const sources = result.get(recipeId) ?? [];
sources.push(buildQuestRecipeSource(questType, questId, quest, itemIdToRecipeId));
result.set(recipeId, sources);

function buildQuestRecipeSource(
  questType: string,
  questId: string,
  quest: Record<string, unknown>,
  itemIdToRecipeId: Map<string, string>,
): RecipeSource {
  const sourceBase = {
    questId: questId as QuestId,
    questType: questType as QuestType,
    type: "quest" as const,
  };

  if (questType === "fetch_quests") {
    const itemId = extractQuestRequiredItem(quest);
    return itemId ? { ...sourceBase, requestedItemId: itemId as ItemId } : sourceBase;
  }
  if (questType === "tali_challenges") {
    const itemId = extractQuestRequiredItem(quest);
    const challengeRecipeId = itemId ? itemIdToRecipeId.get(itemId) : undefined;
    return challengeRecipeId
      ? { ...sourceBase, challengeRecipeId: challengeRecipeId as RecipeId }
      : sourceBase;
  }
  return sourceBase;
}
```

`has_item` is scalar, object-shaped (`{ wild_berries: 5 }`), or an array of those objects. Normalize
all three forms and choose the first item in source order, matching the singular approved field:

```typescript
function extractQuestRequiredItem(quest: Record<string, unknown>): string | undefined {
  const stages = Array.isArray(quest.stages) ? quest.stages : [];
  for (const stage of stages) {
    if (typeof stage !== "object" || stage === null) continue;
    const requirements = (stage as Record<string, unknown>).requirements;
    if (typeof requirements !== "object" || requirements === null) continue;
    const itemId = firstRequiredItem((requirements as Record<string, unknown>).has_item);
    if (itemId) return itemId;
  }
  return undefined;
}

function firstRequiredItem(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const itemId = firstRequiredItem(entry);
      if (itemId) return itemId;
    }
    return undefined;
  }
  if (typeof value === "object" && value !== null) {
    return Object.keys(value)[0];
  }
  return undefined;
}
```

- [ ] **Step 11: Confirm the data-model extraction tests authored in the red phases**

Confirm the focused tests authored before each implementation group cover:

- `stores-meta.test.ts`: General Store emits `upgradeAction: "repairing"`; Inn omits it.
- `festivals.test.ts`: valid dates are required; missing dates, unknown seasons, out-of-range days,
  and fractional days throw.
- `recipes.test.ts`: fetch `has_item` works for string, quantity-object, and array forms; Tali item
  IDs are resolved through `itemIdToRecipeId` to `challengeRecipeId`; engagement source is renamed.
- `format.test.ts`: `recipeSourceLabel({ type: "engagement" }, lookups)` returns the approved copy.
  Update every `RecipeSourceLookups` fixture with `recipeNames: {}` so the new required lookup is
  compile-checked.
- `icon-maps` remains compile-checked through its exhaustive `Record<RecipeSource["type"], ...>`.

- [ ] **Step 12: Run focused and full tests**

Run: `pnpm run test:pipeline -- recipes stores-meta festivals` Expected: all focused pipeline tests
pass.

Run: `pnpm run test:app -- format` Expected: the flat-label test passes.

Run: `pnpm run test` Expected: all pass.

- [ ] **Step 13: Verify with pipeline run**

Run: `pnpm run pipeline -- pipeline/input/assets` Expected: pipeline completes. Check
`pipeline/output/tracker-data-readable.json` for:

- `engagement` type on engagement ring recipe
- `upgradeAction: "repairing"` on general store record
- `date` fields on festival records
- `requestedItemId` on fetch quest sources
- `challengeRecipeId` on tali challenge sources

- [ ] **Step 14: Commit**

Run the mandatory full pre-commit matrix from Global constraints now. Do not stage or commit until
all six commands and `git diff --check` exit zero.

```bash
git add src/lib/types/tracker-data.ts \
       pipeline/src/extractors/recipes.ts \
       pipeline/src/extractors/stores-meta.ts \
       pipeline/src/extractors/festivals.ts \
       pipeline/src/extractors/visibility/entity-visibility.ts \
       src/lib/components/icon/icon-maps.ts \
       src/lib/utils/format.ts \
       pipeline/src/extractors/festivals.test.ts \
       pipeline/src/extractors/recipes.test.ts \
       pipeline/src/extractors/stores-meta.test.ts \
       src/lib/utils/format.test.ts \
       src/lib/components/recipes-content.svelte \
       src/lib/data/tracker-data.json
git commit -m "feat: data model updates for partial source redaction

- Rename relationship → engagement source type
- Add upgradeAction to store records (general store: repairing)
- Add date to festival records
- Add requestedItemId/challengeRecipeId to quest RecipeSource"
```

---

### Task 3: Frontend — SourceSegment type, lookups, and grammar segments

**Files:**

- Create: `src/lib/utils/source-segments.ts`
- Create: `src/lib/utils/source-segments.test.ts`

**Interfaces:**

- Consumes: `VisibilityCondition` from `$lib/types/visibility.js`, `RecipeSource` and branded IDs
  from `$lib/types/tracker-data.js`, `RecipeSourceLookups` from `$lib/utils/format.js`
- Produces:
  - `SourceSegment` type — `string | { redacted: true } | { condition; revealed; redacted? }`
  - `SegmentLookups` interface — extends `RecipeSourceLookups` with visibility maps
  - `buildPerkLabel(perkId, lookups)` → `[SourceSegment, ...SourceSegment[]]`
  - `buildBiomeLabel(biomeId, lookups)` → `[SourceSegment, ...SourceSegment[]]`
  - `buildStoreQualifier(visibility, lookups, storeId)` → `SourceSegment[]`
  - `formatDateLabel(season, day)` → `string`

**TDD order for this task:** Write the complete Step 7 test file first and run it before creating
`source-segments.ts`; the suite must fail because the module does not exist. Implement Steps 1–6 in
small increments, rerunning the focused suite after each helper. Step 7 records the already-authored
red-phase tests and must not be deferred until after implementation.

- [ ] **Step 1: Write type definitions and SegmentLookups interface**

Create `src/lib/utils/source-segments.ts`:

```typescript
import type {
  BiomeId,
  FestivalId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  Season,
  StoreId,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { RecipeSourceLookups } from "./format.js";

export type SourceSegment =
  | string
  | { redacted: true }
  | {
      condition: VisibilityCondition;
      redacted?: [SourceSegment, ...SourceSegment[]];
      revealed: [SourceSegment, ...SourceSegment[]];
    };

export interface SegmentLookups extends RecipeSourceLookups {
  categoryVisibility: Record<string, VisibilityCondition>;
  festivalDates: Partial<Record<FestivalId, { day: number; season: Season }>>;
  itemVisibility: Partial<Record<ItemId, VisibilityCondition>>;
  npcNames: Partial<Record<NpcId, string>>;
  npcVisibility: Partial<Record<NpcId, VisibilityCondition>>;
  questNpcIds: Partial<Record<QuestId, NpcId>>;
  recipeVisibility: VisibilityCondition;
  storeVisibility: Partial<Record<StoreId, VisibilityCondition>>;
}
```

- [ ] **Step 2: Write the perk label grammar segment builder**

Perk label reveals the perk's proper name when the player reaches the skill level for that perk
tier. The skill name and tier number are always visible. Condition: `perk.visibility` (a
`skillLevel` threshold).

```typescript
import { formatBiomeName, seasonLabel } from "./format.js";

export function buildPerkLabel(
  perkId: PerkId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const perk = lookups.perks[perkId as string];
  if (!perk) return [`the ${titleCase(perkId as string)} perk`];

  const skillName = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  const tierSuffix = ` (${skillName} tier ${String(perk.tier)})`;
  const condition = perk.visibility;
  if (!condition) return [`the ${perk.name} perk${tierSuffix}`];

  return [
    {
      condition,
      redacted: ["the ", { redacted: true }, ` perk${tierSuffix}`],
      revealed: [`the ${perk.name} perk${tierSuffix}`],
    },
  ];
}
```

`perk.visibility` comes from the `RecipeSourceLookups.perks` member extended in Task 2 and stamped
by `assignPerkVisibility()` in the pipeline.

- [ ] **Step 3: Write the biome label grammar segment builder**

Biome label reveals the biome's proper name and floor range when the player reaches the biome's
start floor. Condition: `minesLevel(biome.startFloor)`.

```typescript
export function buildBiomeLabel(
  biomeId: BiomeId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const biome = lookups.biomes.find((b) => b.id === biomeId);
  if (!biome) return [titleCase(biomeId as string)];

  const condition: VisibilityCondition = { floor: biome.startFloor, type: "minesLevel" };
  const biomeName = formatBiomeName(biomeId, lookups.biomes);
  const floorRange = `Mines floors ${String(biome.startFloor)}–${String(biome.endFloor)}`;

  return [
    {
      condition,
      redacted: [
        { redacted: true },
        " (Mines floors ",
        { redacted: true },
        "–",
        { redacted: true },
        ")",
      ],
      revealed: [`${biomeName} (${floorRange})`],
    },
  ];
}
```

- [ ] **Step 4: Write the store qualifier grammar segment builder**

Store qualifier renders "(after upgrading)" or "(after repairing)" when a source has a non-always
`source.visibility` condition (indicating the item requires a store upgrade/repair). The action verb
comes from `stores[storeId].upgradeAction` (defaults to "upgrading").

```typescript
export function buildStoreQualifier(
  sourceVisibility: undefined | VisibilityCondition,
  lookups: SegmentLookups,
  storeId: StoreId,
): SourceSegment[] {
  if (!sourceVisibility || sourceVisibility.type === "always") return [];

  const action = lookups.stores[storeId]?.upgradeAction ?? "upgrading";

  return [
    {
      condition: sourceVisibility,
      redacted: [" (after ", { redacted: true }, ")"],
      revealed: [` (after ${action})`],
    },
  ];
}
```

- [ ] **Step 5: Write the date label formatter**

```typescript
export function formatDateLabel(season: Season, day: number): string {
  return `${seasonLabel(season)} ${String(day)}`;
}
```

- [ ] **Step 6: Add titleCase helper**

```typescript
function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
```

- [ ] **Step 7: Confirm the grammar tests authored before Step 1**

Create `src/lib/utils/source-segments.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  buildBiomeLabel,
  buildPerkLabel,
  buildStoreQualifier,
  formatDateLabel,
} from "./source-segments.js";

import type { BiomeId, PerkId, StoreId } from "$lib/types/tracker-data.js";

import type { SegmentLookups } from "./source-segments.js";

const BASE_LOOKUPS: SegmentLookups = {
  biomes: [
    { endFloor: 19, id: "biome_0" as BiomeId, name: "Upper Mines", startFloor: 1 },
    { endFloor: 39, id: "biome_1" as BiomeId, name: "The Tide Caverns", startFloor: 20 },
    { endFloor: 59, id: "biome_2" as BiomeId, name: "Deep Earth", startFloor: 40 },
  ],
  categoryVisibility: {},
  festivalDates: {},
  festivals: {},
  itemNames: {},
  itemVisibility: {},
  npcNames: {},
  npcVisibility: {},
  perks: {
    taste_maker: {
      name: "Taste Maker",
      skillId: "cooking",
      tier: 1,
      visibility: { level: 1, skillId: "cooking", type: "skillLevel" },
    },
  },
  perkTierLevels: [1, 5, 10, 15, 20],
  questNames: {},
  questNpcIds: {},
  recipeNames: {},
  recipeVisibility: { type: "always" },
  skillNames: { cooking: "Cooking" },
  stores: {
    inn: { article: "the" as const, name: "Sleeping Dragon Inn" },
    general: { article: "the" as const, name: "General Store", upgradeAction: "repairing" },
  },
  storeVisibility: {},
  treasureChestTiers: {},
};

describe("buildPerkLabel", () => {
  it("creates conditional node with skill name and tier always visible", () => {
    const result = buildPerkLabel("taste_maker" as PerkId, BASE_LOOKUPS);
    expect(result).toEqual([
      {
        condition: { level: 1, skillId: "cooking", type: "skillLevel" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });
});

describe("buildBiomeLabel", () => {
  it("creates conditional node with floor range redacted", () => {
    const result = buildBiomeLabel("biome_1" as BiomeId, BASE_LOOKUPS);
    expect(result).toEqual([
      {
        condition: { floor: 20, type: "minesLevel" },
        redacted: [
          { redacted: true },
          " (Mines floors ",
          { redacted: true },
          "–",
          { redacted: true },
          ")",
        ],
        revealed: ["the Tide Caverns (Mines floors 20–39)"],
      },
    ]);
  });
});

describe("buildStoreQualifier", () => {
  it("returns empty array when visibility is always", () => {
    expect(buildStoreQualifier({ type: "always" }, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("returns empty array when visibility is undefined", () => {
    expect(buildStoreQualifier(undefined, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("uses upgradeAction from store record", () => {
    const vis = { questId: "repair_the_general_store", type: "questAvailable" as const };
    const result = buildStoreQualifier(vis, BASE_LOOKUPS, "general" as StoreId);
    expect(result).toEqual([
      {
        condition: vis,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after repairing)"],
      },
    ]);
  });

  it("defaults to upgrading when no upgradeAction", () => {
    const vis = { questId: "repair_the_inn", type: "questAvailable" as const };
    const result = buildStoreQualifier(vis, BASE_LOOKUPS, "inn" as StoreId);
    expect(result[0]).toMatchObject({
      revealed: [" (after upgrading)"],
    });
  });
});

describe("formatDateLabel", () => {
  it("formats as Season day", () => {
    expect(formatDateLabel("winter", 3)).toBe("Winter 3");
    expect(formatDateLabel("fall", 10)).toBe("Fall 10");
  });
});
```

- [ ] **Step 8: Run tests**

Run: `pnpm run test:app -- source-segments` Expected: all pass.

- [ ] **Step 9: Commit**

Run the mandatory full pre-commit matrix from Global constraints now. Do not stage or commit until
all six commands and `git diff --check` exit zero.

```bash
git add src/lib/utils/source-segments.ts src/lib/utils/source-segments.test.ts
git commit -m "feat: add SourceSegment type and grammar segment builders

Defines the recursive SourceSegment tree type and shared grammar
segment helpers (perk label, biome label, store qualifier, date label)
for partial source redaction."
```

---

### Task 4: Frontend — buildSourceSegments() implementation

**Files:**

- Modify: `src/lib/utils/source-segments.ts` (add buildSourceSegments)
- Modify: `src/lib/utils/source-segments.test.ts` (add tests)

**Interfaces:**

- Consumes: `SourceSegment`, `SegmentLookups`, grammar segment builders from Task 3
- Produces:
  `buildSourceSegments(source: RecipeSource, lookups: SegmentLookups): [SourceSegment, ...SourceSegment[]]`

`SegmentLookups.recipeVisibility` carries the current recipe's condition because scroll-bundle names
redact on `Recipe.visibility`. Keeping it in the render-time context preserves the spec's
two-argument builder contract.

**TDD order for this task:** Execute Step 2 before Step 1: add the simple-source tests, run them,
and confirm failure because `buildSourceSegments()` is missing, then implement the scaffold. For
every complex source case in Steps 4–13, first add its exact case from Step 14 and confirm the
expected unimplemented-source failure; then implement only that case and rerun the focused test.
Step 14 is a catalog of incremental red phases, never a batch tests-after phase.

- [ ] **Step 1: Write the function scaffold and simple source types**

Source types with no redactable fragments return a plain string array. These are: `default`,
`museum_donation`, `renown`, `chicken_statue`, `wishing_well`, `treasure_chest`, `beach_cave_chest`,
`engagement`, `upgrade`.

Add `RecipeSource` to the tracker-data type import. Add `formatStoreName` and
`withIndefiniteArticle` to the value import from `format.js`; later switch cases in this task use
both helpers.

```typescript
export function buildSourceSegments(
  source: RecipeSource,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  switch (source.type) {
    case "beach_cave_chest":
      return ["Find in the Gold Treasure Chest in the Beach Cave"];
    case "chicken_statue":
      return [`Obtain from the Chicken Statue (${String(source.cost)} beads)`];
    case "default":
      return ["Available from the start"];
    case "engagement":
      return ["Receive from Elsie after getting to 10 hearts with a dateable character"];
    case "museum_donation": {
      const wingName = titleCase(source.wingId as string);
      const setWord = source.setCount === 1 ? "set" : "sets";
      return [`Complete ${String(source.setCount)} ${setWord} in the ${wingName} wing`];
    }
    case "renown":
      return [`Get the town's renown rank to level ${String(source.level)}`];
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier as string];
      const name = tierData?.name ?? `${titleCase(source.tier as string)} Treasure Box`;
      return [`Fish up ${withIndefiniteArticle(name)}`];
    }
    case "upgrade":
      return [upgradeSourceText(source)];
    case "wishing_well":
      return [`Obtain from the Wishing Well (${String(source.cost)}t)`];

    // Complex source types are added one case at a time in Steps 4–13.
    case "dragon_forge":
    case "festival":
    case "letter":
    case "mines_chest":
    case "mines_dig_site":
    case "perk":
    case "quest":
    case "scroll_bundle":
    case "store":
    case "store_with_perk":
      throw new Error(`Source type "${source.type}" is not implemented yet`);
  }
}

function upgradeSourceText(source: RecipeSource & { type: "upgrade" }): string {
  const UPGRADE_TEXT: Record<string, string> = {
    "House Stairs": "Upgrade your home a fourth time",
    "Starter Farm Bridge": "Expand your farm",
  };
  return UPGRADE_TEXT[source.upgradeName] ?? `Purchase ${source.upgradeName}`;
}
```

- [ ] **Step 2: Write tests for simple source types**

Extend the existing value import from `source-segments.js` to include `buildSourceSegments`. Extend
the existing tracker-data type import to include `FestivalId`, `ItemId`, `NpcId`, `QuestId`,
`QuestType`, `RecipeId`, `RecipeSource`, `TreasureChestTier`, and `WingId`; each is used by the
source cases added in this task. Then add:

```typescript
describe("buildSourceSegments — simple types", () => {
  it("default", () => {
    const source: RecipeSource = { type: "default" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Available from the start"]);
  });

  it("renown", () => {
    const source: RecipeSource = { level: 3, type: "renown" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Get the town's renown rank to level 3",
    ]);
  });

  it("museum donation", () => {
    const source: RecipeSource = {
      setCount: 3,
      type: "museum_donation",
      wingId: "archaeology" as WingId,
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Complete 3 sets in the Archaeology wing",
    ]);
  });

  it("chicken statue", () => {
    const source: RecipeSource = { cost: 10, type: "chicken_statue" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Chicken Statue (10 beads)",
    ]);
  });

  it("wishing well", () => {
    const source: RecipeSource = { cost: 500, type: "wishing_well" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Wishing Well (500t)",
    ]);
  });

  it("treasure chest", () => {
    const source: RecipeSource = {
      tier: "gold" as TreasureChestTier,
      type: "treasure_chest",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      treasureChestTiers: { gold: { name: "Golden Treasure Box" } },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Fish up a Golden Treasure Box"]);
  });

  it("beach cave chest", () => {
    const source: RecipeSource = { type: "beach_cave_chest" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Find in the Gold Treasure Chest in the Beach Cave",
    ]);
  });

  it("upgrade — House Stairs", () => {
    const source: RecipeSource = {
      storeId: "carpenter" as StoreId,
      type: "upgrade",
      upgradeName: "House Stairs",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Upgrade your home a fourth time"]);
  });

  it("upgrade — Starter Farm Bridge", () => {
    const source: RecipeSource = {
      storeId: "carpenter" as StoreId,
      type: "upgrade",
      upgradeName: "Starter Farm Bridge",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Expand your farm"]);
  });

  it("engagement", () => {
    const source: RecipeSource = { type: "engagement" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Receive from Elsie after getting to 10 hearts with a dateable character",
    ]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm run test:app -- source-segments` Expected: simple-type tests pass; complex types are not
exercised until their switch cases are added.

- [ ] **Step 4: Implement store source type**

Format: `Purchase from <storeName> [<storeQualifier>]`

```typescript
case "store": {
  const storeName = buildStoreName(source.storeId, lookups);
  const qualifier = source.upgraded
    ? buildStoreQualifier(source.visibility, lookups, source.storeId)
    : [];
  return ["Purchase from ", ...storeName, ...qualifier];
}
```

Add store name builder (reused by other source types):

```typescript
function buildStoreName(
  storeId: StoreId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const vis = lookups.storeVisibility[storeId];
  const name = formatStoreName(storeId, lookups.stores);
  if (!vis || vis.type === "always") return [name];
  return [{ condition: vis, revealed: [name] }];
}
```

- [ ] **Step 5: Implement store_with_perk source type**

Format: `Purchase from <storeName>, with <perkLabel>`

```typescript
case "store_with_perk": {
  const storeName = buildStoreName(source.storeId, lookups);
  const perkLabel = buildPerkLabel(source.perkId, lookups);
  return ["Purchase from ", ...storeName, ", with ", ...perkLabel];
}
```

- [ ] **Step 6: Implement scroll_bundle source type**

Format: `Purchase <bundleName> from <storeName> [<storeQualifier>]`

Bundle name redacts on `lookups.recipeVisibility` (the current recipe's own visibility).

```typescript
case "scroll_bundle": {
  const storeName = buildStoreName(source.storeId, lookups);
  const qualifier = buildStoreQualifier(source.visibility, lookups, source.storeId);
  const bundleSegment: SourceSegment =
    lookups.recipeVisibility.type === "always"
      ? `the ${source.bundleName}`
      : { condition: lookups.recipeVisibility, revealed: [`the ${source.bundleName}`] };
  return ["Purchase ", bundleSegment, " from ", ...storeName, ...qualifier];
}
```

- [ ] **Step 7: Implement perk source type**

Format: `Unlock <perkLabel>`

```typescript
case "perk": {
  const perkLabel = buildPerkLabel(source.perkId, lookups);
  return ["Unlock ", ...perkLabel];
}
```

- [ ] **Step 8: Implement mines_chest source type**

Format: `Find in a Treasure Chest in <biomeLabel>, with <perkLabel>`

```typescript
case "mines_chest": {
  const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
  const perkLabel = buildPerkLabel(source.perkId, lookups);
  return [
    "Find in a Treasure Chest in ",
    ...biomeLabel,
    ", with ",
    ...perkLabel,
  ];
}
```

- [ ] **Step 9: Implement mines_dig_site source type**

Format: `Dig up in <biomeLabel>, with <perkLabel>`

Entire source gated behind `perkUnlocked(perkId)` as a top-level conditional node.

```typescript
case "mines_dig_site": {
  const biomeLabel = buildBiomeLabel(source.biomeId, lookups);
  const perk = lookups.perks[source.perkId as string];
  const perkName = perk?.name ?? titleCase(source.perkId as string);
  const skillName = perk
    ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId))
    : "";
  const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";

  return [
    {
      condition: { perkId: source.perkId, type: "perkUnlocked" },
      revealed: [
        "Dig up in ",
        ...biomeLabel,
        `, with the ${perkName} perk${tierStr}`,
      ],
    },
  ];
}
```

- [ ] **Step 10: Implement dragon_forge source type**

Format: `Craft at <dragonForge>` — location gated behind `minesLevel(90)`.

```typescript
case "dragon_forge":
  return [
    "Craft at ",
    {
      condition: { floor: 90, type: "minesLevel" },
      revealed: ["the Dragon Forge (Mines level 90)"],
    },
  ];
```

- [ ] **Step 11: Implement letter source types**

Three variants: shipped_item, donated_item, reached_date.

```typescript
case "letter": {
  if (source.trigger === "shipped_item" || source.trigger === "donated_item") {
    const verb = source.trigger === "shipped_item" ? "shipping" : "donating";
    const itemName = lookups.itemNames[source.triggerItemId as string]
      ?? titleCase(source.triggerItemId as string);
    const itemVis = lookups.itemVisibility[source.triggerItemId];
    const nameWithArticle = withIndefiniteArticle(itemName);
    const itemSegment: SourceSegment = itemVis && itemVis.type !== "always"
      ? { condition: itemVis, revealed: [nameWithArticle] }
      : nameWithArticle;
    return [`Receive in a letter after ${verb} `, itemSegment];
  }
  // reached_date — no redactable fragments
  const { day, season, year } = source.triggerDate;
  const dateStr = year
    ? `${formatDateLabel(season, day)}, Year ${String(year)}`
    : formatDateLabel(season, day);
  return [`Receive in a letter after reaching ${dateStr}`];
}
```

- [ ] **Step 12: Implement festival source type**

Format: `Purchase from <storeName> at the <festivalName> (<dateLabel>)`

Festival stalls and names are always visible. Date uses the date label grammar segment.

```typescript
case "festival": {
  const festivalName =
    lookups.festivals[source.festivalId as string]?.name
    ?? titleCase(source.festivalId as string);
  const storeName = formatStoreName(source.storeId, lookups.stores);
  const date = lookups.festivalDates[source.festivalId];
  const dateSuffix = date ? ` (${formatDateLabel(date.season, date.day)})` : "";
  return [`Purchase from ${storeName} at the ${festivalName}${dateSuffix}`];
}
```

- [ ] **Step 13: Implement quest source type**

This is the most complex case: different format per quest type. Read `source.questType` to dispatch.

```typescript
case "quest":
  return buildQuestSegments(source, lookups);
```

Then implement the quest handler:

```typescript
function buildQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questType = source.questType as string;

  switch (questType) {
    case "heart_quests":
      return buildHeartQuestSegments(source, lookups);
    case "fetch_quests":
      return buildFetchQuestSegments(source, lookups);
    case "crown_quests":
      return buildCrownQuestSegments(source, lookups);
    case "tali_challenges":
      return buildCookingChallengeSegments(source, lookups);
    case "stillwell_challenges":
      return buildMissionQuestSegments(source, lookups);
    default:
      return buildStoryQuestSegments(source, lookups);
  }
}
```

**Story quests:** `Complete the <questName> quest`

```typescript
function buildStoryQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId as string);
  const questVis = source.visibility;

  // Handle quest names starting with "The" to avoid "the The"
  const displayName = questName.startsWith("The ") ? questName.slice(4) : questName;
  const prefix = "Complete the ";

  if (!questVis || questVis.type === "always") {
    return [`${prefix}${displayName} quest`];
  }
  return [prefix, { condition: questVis, revealed: [displayName] }, " quest"];
}
```

**Heart quests:** `Complete <npcName>'s <questName> quest`

```typescript
function buildHeartQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId as string);
  const questVis = source.visibility;

  const npcId = lookups.questNpcIds[source.questId];
  const npcName = npcId ? (lookups.npcNames[npcId] ?? titleCase(npcId)) : "???";
  const npcVis = npcId ? lookups.npcVisibility[npcId] : undefined;

  const npcSegment: SourceSegment =
    npcVis && npcVis.type !== "always" ? { condition: npcVis, revealed: [npcName] } : npcName;
  const questSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  return ["Complete ", npcSegment, "'s ", questSegment, " quest"];
}
```

**Fetch quests:** `Complete <npcName>'s request for <requestedItemName>`

```typescript
function buildFetchQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const npcId = lookups.questNpcIds[source.questId];
  const npcName = npcId ? (lookups.npcNames[npcId] ?? titleCase(npcId)) : "???";
  const npcVis = npcId ? lookups.npcVisibility[npcId] : undefined;
  const questVis = source.visibility;

  const npcSegment: SourceSegment =
    npcVis && npcVis.type !== "always" ? { condition: npcVis, revealed: [npcName] } : npcName;

  const itemId = source.requestedItemId;
  const itemName = itemId
    ? (lookups.itemNames[itemId as string] ?? titleCase(itemId as string))
    : "???";
  const itemSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [itemName] }
      : itemName;

  return ["Complete ", npcSegment, "'s request for ", itemSegment];
}
```

**Crown quests:** `Complete the Crown Request for <subject>` — gated behind
`categoryVisibility.crown_quests`.

```typescript
function buildCrownQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId as string);
  const subject = questName.replace(/^Crown Request:?\s*/, "");
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.crown_quests;

  const subjectSegment: SourceSegment =
    questVis && questVis.type !== "always" ? { condition: questVis, revealed: [subject] } : subject;

  const inner: [SourceSegment, ...SourceSegment[]] = [
    "Complete the Crown Request for ",
    subjectSegment,
  ];

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}
```

**Cooking challenges:** `Complete the <challengeRecipeName> cooking challenge` — gated behind
`npcKnown(taliferro)`.

```typescript
function buildCookingChallengeSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const recipeName = source.challengeRecipeId
    ? (lookups.recipeNames[source.challengeRecipeId] ??
      titleCase(source.challengeRecipeId as string))
    : (lookups.questNames[source.questId] ?? titleCase(source.questId as string));
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.tali_challenges;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [recipeName] }
      : recipeName;

  const inner: [SourceSegment, ...SourceSegment[]] = [
    "Complete the ",
    nameSegment,
    " cooking challenge",
  ];

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}
```

**Mission quests:** `Complete the <missionName> mission` — gated behind `npcKnown(stillwell)`.

```typescript
function buildMissionQuestSegments(
  source: RecipeSource & { type: "quest" },
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const questName = lookups.questNames[source.questId] ?? titleCase(source.questId as string);
  const questVis = source.visibility;
  const categoryVis = lookups.categoryVisibility.stillwell_challenges;

  const nameSegment: SourceSegment =
    questVis && questVis.type !== "always"
      ? { condition: questVis, revealed: [questName] }
      : questName;

  const inner: [SourceSegment, ...SourceSegment[]] = ["Complete the ", nameSegment, " mission"];

  if (!categoryVis || categoryVis.type === "always") return inner;
  return [{ condition: categoryVis, revealed: inner }];
}
```

- [ ] **Step 14: Confirm each complex-source test was authored before its implementation case**

Add tests for store, store_with_perk, mines_chest, mines_dig_site, dragon_forge, all three letter
variants, festival, scroll_bundle, perk, and quest variants. Use the spec's worked examples as test
cases.

```typescript
describe("buildSourceSegments — store", () => {
  it("store with non-always storeVisibility", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      stores: { ...BASE_LOOKUPS.stores, darcy: { name: "Darcy's Stall" } },
      storeVisibility: {
        darcy: { questId: "repair_the_bridge", type: "questCompleted" as const },
      },
    };
    const source: RecipeSource = { storeId: "darcy" as StoreId, type: "store" };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Purchase from ",
      {
        condition: { questId: "repair_the_bridge", type: "questCompleted" },
        revealed: ["Darcy's Stall"],
      },
    ]);
  });

  it("upgraded store with qualifier", () => {
    const vis = { questId: "repair_the_inn", type: "questAvailable" as const };
    const source: RecipeSource = {
      storeId: "inn" as StoreId,
      type: "store",
      upgraded: true,
      visibility: vis,
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Purchase from the Sleeping Dragon Inn",
      {
        condition: vis,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after upgrading)"],
      },
    ]);
  });
});

describe("buildSourceSegments — store_with_perk", () => {
  it("gates the store and perk names independently", () => {
    const source: RecipeSource = {
      perkId: "taste_maker" as PerkId,
      storeId: "inn" as StoreId,
      type: "store_with_perk",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Purchase from the Sleeping Dragon Inn, with ",
      {
        condition: { level: 1, skillId: "cooking", type: "skillLevel" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });
});

describe("buildSourceSegments — scroll_bundle", () => {
  it("uses recipe visibility for the bundle and source visibility for the qualifier", () => {
    const sourceVisibility = {
      questId: "repair_the_general_store" as QuestId,
      type: "questAvailable" as const,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      recipeVisibility: {
        questId: "repair_the_general_store" as QuestId,
        type: "questCompleted",
      },
    };
    const source: RecipeSource = {
      bundleName: "Fall Crop Sign Scroll Bundle",
      storeId: "general" as StoreId,
      type: "scroll_bundle",
      visibility: sourceVisibility,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase ",
      {
        condition: { questId: "repair_the_general_store", type: "questCompleted" },
        revealed: ["the Fall Crop Sign Scroll Bundle"],
      },
      " from the General Store",
      {
        condition: sourceVisibility,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after repairing)"],
      },
    ]);
  });
});

describe("buildSourceSegments — letter and perk", () => {
  it("gates a shipped item name with item visibility", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { crystal_berries: "Crystal Berries" },
      itemVisibility: {
        crystal_berries: { floor: 40, type: "minesLevel" },
      },
    };
    const source: RecipeSource = {
      trigger: "shipped_item",
      triggerItemId: "crystal_berries" as ItemId,
      type: "letter",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after shipping ",
      { condition: { floor: 40, type: "minesLevel" }, revealed: ["a Crystal Berries"] },
    ]);
  });

  it("gates a donated item name with item visibility", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { cave_kelp: "Cave Kelp" },
      itemVisibility: { cave_kelp: { floor: 20, type: "minesLevel" } },
    };
    const source: RecipeSource = {
      trigger: "donated_item",
      triggerItemId: "cave_kelp" as ItemId,
      type: "letter",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after donating ",
      { condition: { floor: 20, type: "minesLevel" }, revealed: ["a Cave Kelp"] },
    ]);
  });

  it("renders a reached-date trigger without redaction", () => {
    const source: RecipeSource = {
      trigger: "reached_date",
      triggerDate: { day: 3, season: "winter" },
      type: "letter",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Receive in a letter after reaching Winter 3",
    ]);
  });

  it("builds the perk grammar for a perk source", () => {
    const source: RecipeSource = { perkId: "taste_maker" as PerkId, type: "perk" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)[0]).toBe("Unlock ");
  });
});

describe("buildSourceSegments — festival", () => {
  it("includes the festival store, name, and required date", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      festivalDates: { harvest: { day: 10, season: "fall" } },
      festivals: { harvest: { name: "Harvest Festival" } },
      stores: { nora_souvenir_stall: { name: "Souvenir Stall" } },
    };
    const source: RecipeSource = {
      festivalId: "harvest" as FestivalId,
      storeId: "nora_souvenir_stall" as StoreId,
      type: "festival",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase from Souvenir Stall at the Harvest Festival (Fall 10)",
    ]);
  });
});

describe("buildSourceSegments — mines_chest (worked example: Chickpea Curry)", () => {
  it("matches spec worked example", () => {
    const source: RecipeSource = {
      biomeId: "biome_1" as BiomeId,
      perkId: "taste_maker" as PerkId,
      type: "mines_chest",
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Find in a Treasure Chest in ",
      {
        condition: { floor: 20, type: "minesLevel" },
        redacted: [
          { redacted: true },
          " (Mines floors ",
          { redacted: true },
          "–",
          { redacted: true },
          ")",
        ],
        revealed: ["the Tide Caverns (Mines floors 20–39)"],
      },
      ", with ",
      {
        condition: { level: 1, skillId: "cooking", type: "skillLevel" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });
});

describe("buildSourceSegments — mines_dig_site (worked example: Stalactite Arch)", () => {
  it("wraps in mechanic gate", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      perks: {
        ...BASE_LOOKUPS.perks,
        natural_beauty: {
          name: "Natural Beauty",
          skillId: "archaeology",
          tier: 3,
          visibility: { level: 10, skillId: "archaeology", type: "skillLevel" as const },
        },
      },
      skillNames: { ...BASE_LOOKUPS.skillNames, archaeology: "Archaeology" },
    };
    const source: RecipeSource = {
      biomeId: "biome_2" as BiomeId,
      perkId: "natural_beauty" as PerkId,
      type: "mines_dig_site",
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    const outer = result[0];
    expect(outer).toMatchObject({
      condition: { perkId: "natural_beauty", type: "perkUnlocked" },
    });
  });
});

describe("buildSourceSegments — dragon_forge", () => {
  it("gates location behind minesLevel 90", () => {
    const source: RecipeSource = { type: "dragon_forge" };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Craft at ",
      {
        condition: { floor: 90, type: "minesLevel" },
        revealed: ["the Dragon Forge (Mines level 90)"],
      },
    ]);
  });
});

describe("buildSourceSegments — quest types", () => {
  it("story quest with visibility gate", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      questNames: { unusual_seed: "The Unusual Seed" },
    };
    const source: RecipeSource = {
      questId: "unusual_seed" as QuestId,
      questType: "story_quests" as QuestType,
      type: "quest",
      visibility: { questId: "unusual_seed" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete the ",
      {
        condition: { questId: "unusual_seed", type: "questAvailable" },
        revealed: ["Unusual Seed"],
      },
      " quest",
    ]);
  });

  it("heart quest with NPC and quest name independently gated", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      npcNames: { balor: "Balor" },
      npcVisibility: {
        balor: { questId: "repair_the_bridge", type: "questCompleted" as const },
      },
      questNames: { tall_dark: "Tall, Dark and Mysterious" },
      questNpcIds: { tall_dark: "balor" as NpcId },
    };
    const source: RecipeSource = {
      questId: "tall_dark" as QuestId,
      questType: "heart_quests" as QuestType,
      type: "quest",
      visibility: { questId: "tall_dark" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete ",
      {
        condition: { questId: "repair_the_bridge", type: "questCompleted" },
        revealed: ["Balor"],
      },
      "'s ",
      {
        condition: { questId: "tall_dark", type: "questAvailable" },
        revealed: ["Tall, Dark and Mysterious"],
      },
      " quest",
    ]);
  });

  it("crown quest gated behind renown", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: { crown_quests: { level: 20, type: "renownLevel" as const } },
      questNames: { crown_crops: "Crown Request: Crops" },
    };
    const source: RecipeSource = {
      questId: "crown_crops" as QuestId,
      questType: "crown_quests" as QuestType,
      type: "quest",
      visibility: { questId: "crown_crops" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      condition: { level: 20, type: "renownLevel" },
    });
  });

  it("fetch quest gates NPC and requested item independently", () => {
    const source: RecipeSource = {
      questId: "request_for_berries" as QuestId,
      questType: "fetch_quests" as QuestType,
      requestedItemId: "wild_berries" as ItemId,
      type: "quest",
      visibility: { questId: "request_for_berries" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { wild_berries: "Wild Berries" },
      npcNames: { eiland: "Eiland" },
      npcVisibility: { eiland: { type: "always" } },
      questNpcIds: { request_for_berries: "eiland" as NpcId },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Complete Eiland's request for ",
      {
        condition: { questId: "request_for_berries", type: "questAvailable" },
        revealed: ["Wild Berries"],
      },
    ]);
  });

  it("wraps cooking challenges in their category gate", () => {
    const source: RecipeSource = {
      challengeRecipeId: "crispy_fried_earthshroom" as RecipeId,
      questId: "tali_earthshroom" as QuestId,
      questType: "tali_challenges" as QuestType,
      type: "quest",
      visibility: { questId: "tali_earthshroom" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: {
        tali_challenges: { npcId: "taliferro" as NpcId, type: "npcKnown" },
      },
      recipeNames: { crispy_fried_earthshroom: "Crispy Fried Earthshroom" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      {
        condition: { npcId: "taliferro", type: "npcKnown" },
        revealed: [
          "Complete the ",
          {
            condition: { questId: "tali_earthshroom", type: "questAvailable" },
            revealed: ["Crispy Fried Earthshroom"],
          },
          " cooking challenge",
        ],
      },
    ]);
  });

  it("wraps mission quests in their category gate", () => {
    const source: RecipeSource = {
      questId: "lost_relic" as QuestId,
      questType: "stillwell_challenges" as QuestType,
      type: "quest",
      visibility: { questId: "lost_relic" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: {
        stillwell_challenges: { npcId: "stillwell" as NpcId, type: "npcKnown" },
      },
      questNames: { lost_relic: "Lost Relic" },
    };
    expect(buildSourceSegments(source, lookups)[0]).toMatchObject({
      condition: { npcId: "stillwell", type: "npcKnown" },
    });
  });
});
```

- [ ] **Step 15: Run tests**

Run: `pnpm run test:app -- source-segments` Expected: all pass.

- [ ] **Step 16: Run focused task verification**

Run: `pnpm run check && pnpm run lint && pnpm run test` Expected: all pass.

The complete six-command matrix still runs immediately before the Step 17 commit, as required by
Global constraints.

- [ ] **Step 17: Commit**

Run the mandatory full pre-commit matrix from Global constraints now. Do not stage or commit until
all six commands and `git diff --check` exit zero.

```bash
git add src/lib/utils/source-segments.ts src/lib/utils/source-segments.test.ts
git commit -m "feat: implement buildSourceSegments for all source types

Handles all 18+ RecipeSource types with per-fragment visibility
conditions, mechanic-gated wrappers for dig sites/crown/cooking/mission
quest types, and per-quest-type formatting."
```

---

### Task 5: Frontend — Segment tree rendering and UI integration

**Files:**

- Create: `src/lib/components/source-segment-text.svelte`
- Create: `src/lib/components/recipe-source-list.svelte`
- Modify: `src/lib/components/redacted-row.svelte`
- Modify: `src/lib/components/recipes-content.svelte`
- Modify: `src/lib/components/almanac-content.svelte`
- Modify: `src/lib/components/animals-content.svelte`
- Modify: `src/lib/components/cosmetics-content.svelte`
- Modify: `src/lib/components/mines-content.svelte`
- Modify: `src/lib/components/museum-content.svelte`
- Modify: `src/lib/components/quests-content.svelte`
- Modify: `src/routes/(category)/renown/+page.svelte`
- Modify: `src/lib/utils/redaction-guard.svelte.ts`
- Modify: `src/lib/engine/visibility.ts:177-185` (remove `redactionState`)
- Modify: `src/lib/engine/__tests__/visibility.test.ts` (remove trichotomy tests)
- Create: `src/lib/components/source-segment-text.test.ts`
- Create: `src/lib/components/recipe-source-list.test.ts`
- Create: `src/lib/components/redacted-row.test.ts`
- Test: manual visual testing

**Interfaces:**

- Consumes: `buildSourceSegments()`, `SourceSegment`, `SegmentLookups` from Task 4; `isVisible()`
  from `visibility.ts`; `UserProgressionState` from `visibility.ts`
- Produces: `<SourceSegmentText>` for recursive tree rendering; `<RecipeSourceList>` as the single
  index-aligned source-list renderer used by both hidden-name and visible-name recipe rows; updated
  `<RedactedRow>` and `<RecipesContent>` components; callers that decide only entity-name visibility
  use `isEntityNameVisible()` directly

**Context:** The current UI uses a `"redacted" | "source-only" | "visible"` trichotomy from
`redactionState()`. For recipes, this is replaced by segment tree rendering — the segment tree
encodes all source granularity directly. Every non-recipe caller passes `undefined` as the source
condition today, including quests, so its use of `redactionState()` is exactly equivalent to an
entity-name visibility check. Migrate those callers to `isEntityNameVisible()` and remove the
trichotomy, its tests, and the `redaction` prop entirely. `RedactedRow` becomes a redacted-only row;
callers render it only when the entity name is hidden. A completed redacted row remains redacted
unless progression changes, preserving the “Yes, just this item” confirmation contract.

**TDD order for this task:** Write the renderer, accessibility, completed-row, and shared
source-list contract SSR tests in Step 6 before creating or changing the components. Confirm the
tests fail for the missing renderers and old completion behavior, then implement Steps 1–5 one
behavior at a time. The manual scenarios supplement these automated red-green cycles and never
replace them.

- [ ] **Step 1: Create SourceSegmentText component**

Create `src/lib/components/source-segment-text.svelte`:

```svelte
<script lang="ts">
  import { isVisible } from "$lib/engine/visibility.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  import SourceSegmentText from "./source-segment-text.svelte";

  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let { segments }: { segments: SourceSegment[] } = $props();
</script>

{#each segments as segment}
  {#if typeof segment === "string"}
    {segment}
  {:else if "redacted" in segment && segment.redacted === true}
    <span class="redacted-block inline-block align-baseline">
      <span class="sr-only">Redacted</span>
      <span aria-hidden="true">███</span>
    </span>
  {:else}
    {@const visible = isVisible(segment.condition, userState.progressionState)}
    {#if visible}
      <SourceSegmentText segments={segment.revealed} />
    {:else if segment.redacted}
      <SourceSegmentText segments={segment.redacted} />
    {:else}
      <span class="redacted-block inline-block align-baseline">
        <span class="sr-only">Redacted</span>
        <span aria-hidden="true">███</span>
      </span>
    {/if}
  {/if}
{/each}
```

Use the explicit self-import above. Do not use `<svelte:self>`; the installed Svelte compiler emits
the `svelte_self_deprecated` warning for that legacy element.

Style the redacted block with appropriate visual treatment. The exact styling (blur, black box,
click-to-reveal) is deferred to issue #6, but a minimum viable rendering:

```svelte
<style>
  .redacted-block {
    background: var(--muted);
    border-radius: 0.25rem;
    color: transparent;
    user-select: none;
  }
</style>
```

Create `src/lib/components/recipe-source-list.svelte` as the single list renderer used by both
recipe row branches. Keeping the source object and its segment tree in one indexed component makes
alignment testable and prevents the visible branch from falling back to flat labels:

```svelte
<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import SourceSegmentText from "$lib/components/source-segment-text.svelte";

  import type { RecipeSource } from "$lib/types/tracker-data.js";
  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    sourceSegments,
    sources,
  }: {
    sourceSegments: SourceSegment[][];
    sources: RecipeSource[];
  } = $props();
</script>

{#each sources as source, i (i)}
  <div class="flex items-center gap-2 text-sm" data-source-type={source.type}>
    <Icon.Source type={source.type} class="size-3.5 shrink-0 text-muted-foreground" />
    <span class="text-muted-foreground">
      <SourceSegmentText segments={sourceSegments[i]} />
    </span>
  </div>
{/each}
```

- [ ] **Step 2: Update redacted-row to accept segment trees**

Add `sourceSegments` as an optional alternative to `sourceLabels` and remove the `redaction` prop.
`RedactedRow` is rendered only for hidden names, so its visible branch and `CompletionRow` import
are deleted:

```svelte
<script lang="ts">
  import RecipeSourceList from "$lib/components/recipe-source-list.svelte";

  import type { SourceSegment } from "$lib/utils/source-segments.js";

  let {
    completed,
    name,
    onToggle,
    sourceLabels = [],
    sourceSegments = [],
    sources = [],
  }: {
    completed: boolean;
    name: string;
    onToggle: () => void;
    sourceLabels?: string[];
    sourceSegments?: SourceSegment[][];
    sources?: RecipeSource[];
  } = $props();
```

Remove the top-level `{#if redaction === "visible" || completed}` branch completely. Render the
existing redacted markup unconditionally. In that markup, render `Icon.Completion` with
`state={completed ? "completed" : "none"}` instead of replacing a completed row with
`CompletionRow`; this records completion without revealing the name.

Replace the recipe-source display path with the shared list component, while retaining the existing
flat-label loop as the fallback for non-recipe callers that do not pass segment trees:

```svelte
{#if sourceSegments.length > 0}
  <RecipeSourceList {sourceSegments} {sources} />
{:else}
  {#each sources as source, i (i)}
    <div class="flex items-center gap-2 text-sm">
      <Icon.Source type={source.type} class="size-3.5 shrink-0 text-muted-foreground" />
      <span class="text-muted-foreground">{sourceLabels[i] ?? source.type}</span>
    </div>
  {/each}
{/if}
```

- [ ] **Step 3: Update recipes-content to build and pass segment trees**

In `recipes-content.svelte`, import and use `buildSourceSegments`:

```svelte
<script lang="ts">
  import { buildSourceSegments } from "$lib/utils/source-segments.js";
  import type { SegmentLookups, SourceSegment } from "$lib/utils/source-segments.js";

  let sourceLookups: RecipeSourceLookups = $derived({
    biomes: trackerData.mines.biomes,
    festivals: trackerData.festivals,
    itemNames: Object.fromEntries(
      Object.entries(trackerData.items).map(([id, item]) => [id, item.name]),
    ),
    perks: trackerData.perks,
    perkTierLevels: trackerData.perkTierLevels,
    questNames: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group).map(([id, quest]) => [id, quest.name]),
      ),
    ),
    recipeNames: Object.fromEntries(
      Object.entries(trackerData.recipes).map(([id, recipe]) => [
        id,
        recipe.presentations[0]?.name ?? id,
      ]),
    ),
    redactedStoreIds,
    skillNames: Object.fromEntries(
      Object.entries(trackerData.skills).map(([id, name]) => [id, name]),
    ),
    stores: trackerData.stores,
    treasureChestTiers: trackerData.treasureChestTiers,
  });

  // The current recipe condition is added when each tree is built.
  let baseSegmentLookups: Omit<SegmentLookups, "recipeVisibility"> = $derived({
    ...sourceLookups,
    categoryVisibility: trackerData.categoryVisibility,
    festivalDates: Object.fromEntries(
      Object.entries(trackerData.festivals).map(([id, festival]) => [id, festival.date]),
    ),
    itemVisibility: Object.fromEntries(
      Object.entries(trackerData.items)
        .filter(([, item]) => item.visibility)
        .map(([id, item]) => [id, item.visibility]),
    ),
    npcNames: Object.fromEntries(
      Object.entries(trackerData.npcs).map(([id, npc]) => [id, npc.name]),
    ),
    npcVisibility: trackerData.npcVisibility,
    questNpcIds: Object.fromEntries(
      Object.values(trackerData.quests).flatMap((group) =>
        Object.entries(group)
          .filter(([, q]) => q.npc)
          .map(([id, q]) => [id, q.npc]),
      ),
    ),
    storeVisibility: trackerData.storeVisibility,
  });
```

Update the `RecipeEntry` interface and build segment trees:

```typescript
interface RecipeEntry {
  id: RecipeId;
  name: string;
  nameVisible: boolean;
  sourceLabels: string[];
  sourceSegments: SourceSegment[][];
  sources: RecipeSource[];
  visibility: VisibilityCondition;
}
```

In the entry construction:

```typescript
const visibility = recipe.visibility ?? { type: "always" };
entries.push({
  id: item.recipeId,
  name: item.name,
  nameVisible: isVisible(visibility, userState.progressionState),
  sourceLabels: recipe.sources.map((s) => recipeSourceLabel(s, sourceLookups)),
  sourceSegments: recipe.sources.map((source) =>
    buildSourceSegments(source, { ...baseSegmentLookups, recipeVisibility: visibility }),
  ),
  sources: recipe.sources,
  visibility,
});
```

Delete `isSourceVisible()` and `entryRedaction()`. A source is never filtered out; its tree decides
which fragments render. Use name visibility alone to select the row, and pass complete,
index-aligned source arrays to `RedactedRow`:

```svelte
<RedactedRow
  {completed}
  name={entry.name}
  onToggle={() => {
    if (completed) {
      toggleRecipe(
        entry,
        group.entries.map((candidate) => candidate.id),
      );
    } else {
      redactGuard.guard(entry.visibility, () => {
        toggleRecipe(
          entry,
          group.entries.map((candidate) => candidate.id),
        );
      });
    }
  }}
  sourceLabels={entry.sourceLabels}
  sourceSegments={entry.sourceSegments}
  sources={entry.sources}
/>
```

Select this invocation with `{#if !entry.nameVisible}` and place the current visible-row markup in
its `{:else}` branch. Do not include `completed` in the branch condition.

Import `RecipeSourceList` in `recipes-content.svelte`. In the visible branch, replace every
`visibleSources` length/type/list reference with `entry.sources`, then replace the expanded source
loop with the same shared list renderer used by `RedactedRow`:

```svelte
<RecipeSourceList sourceSegments={entry.sourceSegments} sources={entry.sources} />
```

This is required even when `entry.nameVisible` is true: Dragon Forge recipes have always-visible
names while their location fragment remains gated behind mines level 90.

- [ ] **Step 4: Migrate every RedactedRow caller to boolean name visibility**

For `almanac-content.svelte`, `animals-content.svelte`, `cosmetics-content.svelte`,
`mines-content.svelte`, `museum-content.svelte`, `quests-content.svelte`, and the renown page:

- replace the `redactionState` import with `isEntityNameVisible`;
- replace each helper or inline trichotomy calculation with
  `isEntityNameVisible(visibility, userState.progressionState)`;
- render `<RedactedRow>` only when that boolean is false, and remove the `redaction` prop;
- preserve each caller's existing visible-row branch and toggle guard unchanged.

In `redaction-guard.svelte.ts`, replace
`redactionState(visibility, undefined, userState.progressionState) === "visible"` with
`isEntityNameVisible(visibility, userState.progressionState)`.

Run:

```bash
rg -n 'redactionState|redaction=' src -g '*.{ts,svelte}'
```

Expected before Step 5: only the exported helper and its engine tests remain. Expected after Step 5:
no matches.

- [ ] **Step 5: Remove redactionState and its trichotomy tests**

Delete `redactionState()` from `visibility.ts`. Remove the dedicated `redactionState` suite from
`visibility.test.ts`. Where the later satisfaction tests use it only to prove entity visibility
before and after mutation, assert with `isEntityNameVisible()` instead. Where they separately verify
a source disclosure threshold, assert with `isSourceDetailVisible()`. Do not recreate the
three-valued return type under another name.

- [ ] **Step 6: Confirm the SSR regression tests authored before Steps 1–5**

Create `source-segment-text.test.ts` using `render` from `svelte/server`:

```typescript
import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import SourceSegmentText from "$lib/components/source-segment-text.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { SourceSegment } from "$lib/utils/source-segments.js";

afterEach(() => userState.resetAll());

describe("SourceSegmentText", () => {
  it("preserves structural text while hiding a gated fragment", () => {
    const segments: SourceSegment[] = [
      "Craft at ",
      {
        condition: { floor: 90, type: "minesLevel" },
        revealed: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { body } = render(SourceSegmentText, { props: { segments } });
    expect(body).toContain("Craft at");
    expect(body).toContain("Redacted");
    expect(body).not.toContain("Dragon Forge");
  });

  it("reveals a fragment when progression satisfies its condition", () => {
    userState.setMineFloor(90);
    const segments: SourceSegment[] = [
      {
        condition: { floor: 90, type: "minesLevel" },
        revealed: ["the Dragon Forge (Mines level 90)"],
      },
    ];
    const { body } = render(SourceSegmentText, { props: { segments } });
    expect(body).toContain("Dragon Forge");
    expect(body).not.toContain("Redacted");
  });
});
```

The nested `sr-only` text is the accessible representation of a hidden fragment. Do not expose the
flat unredacted `recipeSourceLabel()` as an `aria-label` while a fragment is hidden, because doing
so would disclose the spoiler to screen-reader users. Keep the flat label for search indexing and
for fully revealed accessibility contexts.

Create `recipe-source-list.test.ts` to enforce the indexed caller contract shared by both recipe row
branches:

```typescript
import { render } from "svelte/server";
import { beforeEach, describe, expect, it } from "vitest";

import RecipeSourceList from "$lib/components/recipe-source-list.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { RecipeSource } from "$lib/types/tracker-data.js";
import type { SourceSegment } from "$lib/utils/source-segments.js";

describe("RecipeSourceList", () => {
  beforeEach(() => userState.resetAll());

  it("renders every source through its index-aligned segment tree", () => {
    const sources: RecipeSource[] = [{ type: "dragon_forge" }, { type: "default" }];
    const sourceSegments: SourceSegment[][] = [
      [
        "Craft at ",
        {
          condition: { floor: 90, type: "minesLevel" },
          revealed: ["the Dragon Forge (Mines level 90)"],
        },
      ],
      ["Available from the start"],
    ];

    const { body } = render(RecipeSourceList, { props: { sourceSegments, sources } });

    expect(body).toContain('data-source-type="dragon_forge"');
    expect(body).toContain('data-source-type="default"');
    expect(body).toContain("Craft at");
    expect(body).toContain("Redacted");
    expect(body).not.toContain("Dragon Forge");
    expect(body).toContain("Available from the start");
  });
});
```

`RedactedRow` and the visible branch in `RecipesContent` must both render `RecipeSourceList`;
neither branch may contain its own source-label loop. This compile-checked shared boundary plus the
test above covers the caller contract without adding test-only expansion state to production
components.

Create `redacted-row.test.ts` to protect completion semantics:

```typescript
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";

import RedactedRow from "$lib/components/redacted-row.svelte";

describe("RedactedRow", () => {
  it("does not reveal a completed item whose visibility remains redacted", () => {
    const { body } = render(RedactedRow, {
      props: {
        completed: true,
        name: "Cherry Cobbler",
        onToggle: vi.fn(),
      },
    });
    expect(body).not.toContain("Cherry Cobbler");
    expect(body).toContain("Redacted");
  });
});
```

- [ ] **Step 7: Run focused tests, type checking, and linting**

Run: `pnpm run test:app -- source-segment-text recipe-source-list redacted-row` Expected: all three
SSR regression suites pass.

Run: `pnpm run check && pnpm run lint` Expected: no errors.

- [ ] **Step 8: Run all tests**

Run: `pnpm run test` Expected: all pass and the repository contains no `redactionState` or
`redaction=` match.

- [ ] **Step 9: Run the complete verification matrix**

Run: `pnpm run lint:fix` Expected: formatting and safe autofixes complete.

Run: `pnpm run lint && pnpm run check && pnpm run test && pnpm run build` Expected: every command
exits zero.

Run: `pnpm run pipeline -- pipeline/input/assets` Expected: regeneration succeeds and
`git diff --check` reports no whitespace errors.

- [ ] **Step 10: Start dev server and visually test**

Run: `pnpm run dev`

Test the following scenarios in a browser:

1. **Fresh save (no progression):** recipes from gated stores show `Purchase from ███`, mines
   recipes show floor ranges as `███`, perk names show `the ███ perk (Cooking tier 1)`.
2. **Partial progression:** advance mines to floor 20 — biome names for biome_1 should reveal while
   biome_0 names (already revealed) stay revealed. Unlock cooking level 1 — "Taste Maker" should
   appear in perk labels.
3. **Upgraded store items:** Beet Soup should show "Purchase from the Sleeping Dragon Inn (after
   ███)" until the inn quest is available, then "(after upgrading)".
4. **Mechanic-gated sources:** dig site sources should show `███` until the perk is unlocked, then
   reveal the full source with biome redaction.
5. **Show spoilers toggle:** all segments should reveal when spoilers are enabled.
6. **Completed items:** “Yes, just this item” keeps the completed row redacted; “Yes, and update my
   progress” reveals the name and any fragments satisfied by the resulting progression.

- [ ] **Step 11: Commit**

Run the mandatory full pre-commit matrix from Global constraints now. Do not stage or commit until
all six commands and `git diff --check` exit zero.

```bash
git add src/lib/components/source-segment-text.svelte \
       src/lib/components/source-segment-text.test.ts \
       src/lib/components/recipe-source-list.svelte \
       src/lib/components/recipe-source-list.test.ts \
       src/lib/components/redacted-row.svelte \
       src/lib/components/redacted-row.test.ts \
       src/lib/components/recipes-content.svelte \
       src/lib/components/almanac-content.svelte \
       src/lib/components/animals-content.svelte \
       src/lib/components/cosmetics-content.svelte \
       src/lib/components/mines-content.svelte \
       src/lib/components/museum-content.svelte \
       src/lib/components/quests-content.svelte \
       'src/routes/(category)/renown/+page.svelte' \
       src/lib/utils/redaction-guard.svelte.ts \
       src/lib/engine/visibility.ts \
       src/lib/engine/__tests__/visibility.test.ts
git commit -m "feat: render segment trees in recipe UI

Replaces binary redaction with per-fragment progressive redaction.
Each recipe source renders as a segment tree where fragments redact
independently based on player progression."
```
