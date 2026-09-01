# Source integrity & redaction repair implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair generated acquisition-source metadata, progressive redaction, source labels, &
runtime validation so every generated source is structurally valid and renderable.

**Architecture:** Normalize source metadata at extraction boundaries, then derive entity and
per-source visibility through one conservative availability projection. Keep label construction in
the app, using complete production lookups and the original availability tree for truthful store
qualifier grammar. Treat native assets as authoritative and isolate runtime-only facts in reviewed
overrides.

**Tech stack:** TypeScript, SvelteKit, Vitest, pnpm, the existing TOML extraction pipeline, &
generated `tracker-data.json`.

**Spec:** `docs/superpowers/specs/2026-08-28-source-integrity-and-redaction-repair-design.md`

## Global constraints

- Use Node.js 26 or newer and pnpm exclusively.
- Follow test-driven development: add each behavioral test before its production change.
- Do not hand-edit `src/lib/data/tracker-data.json`; regenerate it with the pipeline.
- Keep the existing `Source`, `AvailabilityCondition`, & `VisibilityCondition` unions compatible.
- Reuse `simplifyCondition()` for visibility Boolean trees.
- Project unsupported availability facts to `always`; uncertainty reveals rather than over-redacts.
- Preserve `source.availability` even when it cannot participate in spoiler visibility.
- Compose availability-derived visibility with the variant-derived gate currently implemented by
  `acquisitionSourceCondition()`; the Task 2 refactor may rename that helper when it begins
  returning separate entity and source conditions, but must preserve its behavior.
- Do not add user-state tracking for native predicates such as `has_upper_floor` or
  `is_dating_someone` in this work.
- Game assets remain authoritative. A wiki disagreement changes code only when native evidence or an
  explicitly reviewed override supports it.
- Commit each completed task separately. Never stage the worktree-local `pipeline/input` symlink.
- Prefix repository shell commands with `rtk`, the project’s established command-output wrapper.

---

### Task 1: Normalize quest-source metadata

**Files:**

- Modify: `pipeline/src/extractor-helpers.ts`
- Modify: `pipeline/src/extractor-helpers.test.ts`
- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/recipes.test.ts`
- Modify: `pipeline/src/acquisition/reviewed-overrides.ts`
- Modify: `pipeline/src/acquisition/reviewed-overrides.test.ts`
- Modify: `pipeline/src/acquisition/validate-sources.test.ts`

**Interfaces:**

- Consumes: `QUEST_TYPE_MAP: Record<TrackedQuestGroup, QuestType>` from
  `pipeline/src/extractor-helpers.ts`.
- Produces: `buildQuestTypeIndex(fiddle): Map<QuestId, QuestType>` from the six tracked native
  groups.
- Produces: every recipe quest source carries a normalized `QuestType`; reviewed quest sources that
  cannot resolve through the normalized index carry an explicit normalized `questType`.
- Preserves: raw native group checks for `requestedItemId` and `challengeRecipeId` metadata.

- [ ] **Step 1: Replace raw-group expectations with normalized quest types in recipe tests**

Update the existing quest-source assertions and add this helper plus a table test that covers every
group accepted by `QUEST_TYPES_WITH_SCROLLS`:

```ts
function makeQuestRecipeFiddle(nativeGroup: string) {
  return makeFiddle({
    items: {
      furniture: {
        test_set: {
          default: {},
          test_item: {
            name: "Test Item",
            recipe: [{ count: 1, item: "wood" }],
            recipe_key: "test_recipe",
          },
        },
      },
    },
    quests: {
      [nativeGroup]: {
        test_quest: {
          name: "Test Quest",
          rewards: [{ crafting_scroll: "test_item" }],
        },
      },
    },
  });
}

it.each([
  ["fetch_quests", "fetch"],
  ["stillwell_challenges", "mission"],
  ["story_quests", "story"],
  ["tali_challenges", "cooking"],
] as const)("maps %s recipe rewards to %s quest sources", (nativeGroup, questType) => {
  const fiddle = makeQuestRecipeFiddle(nativeGroup);
  const { recipes } = extractRecipes(fiddle);

  expect(recipes["test_recipe" as RecipeId].sources[0]).toMatchObject({
    questId: "test_quest",
    questType,
    trigger: "completion",
    type: "quest",
  });
});
```

Keep focused assertions proving `fetch_quests` still emits `requestedItemId` and `tali_challenges`
still emits `challengeRecipeId`.

- [ ] **Step 2: Run the recipe tests and confirm the raw metadata fails**

Run:

```bash
rtk pnpm vitest run pipeline/src/extractors/recipes.test.ts
```

Expected: FAIL because emitted `questType` values still end in `_quests` or `_challenges`.

- [ ] **Step 3: Build and test the normalized quest-type index**

Add a focused helper test containing one quest in each tracked group and assert this exact map:

```ts
expect(buildQuestTypeIndex(fiddle)).toEqual(
  new Map([
    ["cooking_case", "cooking"],
    ["crown_case", "crown"],
    ["fetch_case", "fetch"],
    ["heart_case", "heart"],
    ["mission_case", "mission"],
    ["story_case", "story"],
  ]),
);
```

Implement it in `extractor-helpers.ts` by iterating `TRACKED_QUEST_GROUPS` and inserting
`QUEST_TYPE_MAP[nativeGroup]`. Throw a descriptive error if the same quest ID appears in two groups
with different normalized types.

- [ ] **Step 4: Normalize in `buildQuestRecipeSource()`**

Import `buildQuestTypeIndex` and narrow the raw group input to `TrackedQuestGroup`:

```ts
function buildQuestRecipeSource(
  nativeQuestGroup: TrackedQuestGroup,
  normalizedQuestType: QuestType,
  questId: string,
  quest: Record<string, unknown>,
  itemIdToRecipeId: Map<string, string>,
): AcquisitionSource {
  const sourceBase = {
    questId: questId as QuestId,
    questType: normalizedQuestType,
    trigger: "completion" as const,
    type: "quest" as const,
  };

  if (nativeQuestGroup === "fetch_quests") {
    // Preserve the existing requestedItemId extraction.
  }
  if (nativeQuestGroup === "tali_challenges") {
    // Preserve the existing challengeRecipeId extraction.
  }
  return sourceBase;
}
```

In `collectQuestScrollSources()`, build the index once and resolve each iterated `questId`. If a
tracked quest unexpectedly has no index entry, throw an error whose message includes “Unable to
normalize quest type” and the quest ID. Pass the normalized value plus the raw group into
`buildQuestRecipeSource()`. Narrow the quest iteration callback at the call site rather than
retaining `questType as QuestType`.

- [ ] **Step 5: Add explicit normalized metadata to runtime-only reviewed quest sources**

In `reviewed-overrides.test.ts`, iterate `ITEM_OVERRIDES` and assert that each quest source either
resolves in the fixture quest-type index or provides one of the six app values:

```ts
const QUEST_TYPES = new Set<QuestType>(["cooking", "crown", "fetch", "heart", "mission", "story"]);

expect(source.questType === undefined || QUEST_TYPES.has(source.questType)).toBe(true);
```

Add `questType: "story"` to reviewed sources using these runtime cutscene or story-alias IDs, which
are absent from the generated quest registry:

```ts
const RUNTIME_ONLY_STORY_SOURCE_IDS = new Set([
  "another_tower",
  "balors_crate",
  "beach_date_unlock",
  "break_earth_seal",
  "break_fire_seal",
  "break_ruins_seal_pt_3",
  "break_water_seal",
  "elsies_dating_tutorial",
  "gem_cutting_date_unlock",
  "great_bird_0",
  "park_date_unlock",
  "ryis_lumber",
]);
```

The test must assert every reviewed quest source whose ID is in that set has `questType: "story"`,
and every reviewed quest source outside it omits redundant explicit metadata. Task 6’s generated
contract independently proves all other quest IDs resolve through the normalized tracker lookup.

- [ ] **Step 6: Prove runtime validation rejects raw quest-group strings**

Add this case to `validate-sources.test.ts`:

```ts
it("rejects a raw native quest group as questType", () => {
  const trackerData = {
    cosmetics: {},
    items: {
      scroll: {
        sources: [
          {
            questId: "story_quest",
            questType: "story_quests",
            trigger: "completion",
            type: "quest",
          },
        ],
      },
    },
    recipes: {},
  };
  const references = AcquisitionReferenceIndex.from({
    emitted: { items: trackerData.items, quests: { story: { story_quest: {} } } },
  });

  expect(() => validateAcquisitionSources(trackerData, references)).toThrow(
    'Unknown questType ID "story_quests"',
  );
});
```

- [ ] **Step 7: Run focused quest and validation tests**

Run:

```bash
rtk pnpm vitest run pipeline/src/extractor-helpers.test.ts pipeline/src/extractors/recipes.test.ts pipeline/src/acquisition/reviewed-overrides.test.ts pipeline/src/acquisition/validate-sources.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit normalized quest metadata**

```bash
rtk git add pipeline/src/extractor-helpers.ts pipeline/src/extractor-helpers.test.ts pipeline/src/extractors/recipes.ts pipeline/src/extractors/recipes.test.ts pipeline/src/acquisition/reviewed-overrides.ts pipeline/src/acquisition/reviewed-overrides.test.ts pipeline/src/acquisition/validate-sources.test.ts
rtk git commit -m "fix: normalize acquisition quest types"
```

---

### Task 2: Project availability into entity and source visibility

**Files:**

- Create: `pipeline/src/extractors/visibility/availability-projection.ts`
- Create: `pipeline/src/extractors/visibility/availability-projection.test.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.test.ts`

**Interfaces:**

- Produces: `availabilityToVisibility(condition?: AvailabilityCondition): VisibilityCondition`.
- Produces: `toAvailableVisibility(condition: VisibilityCondition): VisibilityCondition`.
- Produces internally:
  `computeSourceConditions(source, ctx): { entity: VisibilityCondition; source: VisibilityCondition }`.
- Guarantees: alternative sources combine with OR; gates within one source combine with AND; the
  source object is cloned before visibility metadata is stamped.

- [ ] **Step 1: Write the availability-projection truth-table tests**

Create `availability-projection.test.ts` with one table for supported leaves:

```ts
it.each([
  [{ type: "always" }, { type: "always" }],
  [
    { level: 4, npcId: "juniper", type: "heartLevel" },
    { level: 4, npcId: "juniper", type: "heartLevel" },
  ],
  [
    { floor: 40, type: "minesLevel" },
    { floor: 40, type: "minesLevel" },
  ],
  [
    { perkId: "espresso_yourself", type: "perkUnlocked" },
    { perkId: "espresso_yourself", type: "perkUnlocked" },
  ],
  [
    { questId: "repair_the_bridge", state: "available", type: "quest" },
    { questId: "repair_the_bridge", type: "questAvailable" },
  ],
  [
    { questId: "repair_the_bridge", state: "completed", type: "quest" },
    { questId: "repair_the_bridge", type: "questCompleted" },
  ],
  [
    { level: 15, skillId: "woodcrafting", type: "skillLevel" },
    { level: 15, skillId: "woodcrafting", type: "skillLevel" },
  ],
] as const)("projects %#", (availability, expected) => {
  expect(availabilityToVisibility(availability as AvailabilityCondition)).toEqual(expected);
});
```

Add explicit nested `all` and `any` cases. Assert season, weather, time, `not`, and `gamePredicate`
each return `{ type: "always" }`. Include an `any` whose unsupported child simplifies the entire
projection to `always`.

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run:

```bash
rtk pnpm vitest run pipeline/src/extractors/visibility/availability-projection.test.ts
```

Expected: FAIL because `availability-projection.ts` does not exist.

- [ ] **Step 3: Implement the conservative projection**

Create the module using the approved mapping and the existing simplifier:

```ts
export function availabilityToVisibility(condition?: AvailabilityCondition): VisibilityCondition {
  if (!condition) return ALWAYS;

  switch (condition.type) {
    case "always":
    case "heartLevel":
    case "minesLevel":
    case "perkUnlocked":
    case "skillLevel":
      return condition;
    case "quest":
      return condition.state === "completed"
        ? { questId: condition.questId, type: "questCompleted" }
        : { questId: condition.questId, type: "questAvailable" };
    case "all":
    case "any":
      return simplifyCondition({
        conditions: condition.conditions.map(availabilityToVisibility) as [
          VisibilityCondition,
          ...VisibilityCondition[],
        ],
        type: condition.type === "all" ? "and" : "or",
      });
    case "gamePredicate":
    case "not":
    case "season":
    case "time":
    case "weather":
      return ALWAYS;
  }
}
```

Move the existing recursive quest-completion-to-availability conversion out of
`entity-visibility.ts` as the exported `toAvailableVisibility()` helper.

- [ ] **Step 4: Add entity-composition and cloning tests**

Extend `entity-visibility.test.ts` with fixtures covering:

```ts
it("ANDs a store gate with supported stock availability", () => {
  // A store source gated by the store repair and Woodcrafting level 15.
  // Expect the item entity visibility to be and(questCompleted, skillLevel).
  // Expect the cloned source visibility to be and(questAvailable, skillLevel).
});

it("ORs alternative acquisition paths after composing each source", () => {
  // One perk-gated store source plus one ungated forage source.
  // Expect no entity visibility after always-stripping.
});

it("does not mutate a source object shared by two fixtures", () => {
  const shared: Source = { storeId: "general" as StoreId, type: "store" };
  // Assign two tracker-data fixtures and assert `shared` still has no visibility property.
});
```

Cover items, recipes, and cosmetics. Retain the specialized recipe expectations for perk, quest,
mine chest, mine dig site, store, and scroll bundle sources.

- [ ] **Step 5: Run entity tests and confirm stock gates are ignored**

Run:

```bash
rtk pnpm vitest run pipeline/src/extractors/visibility/entity-visibility.test.ts
```

Expected: FAIL because item and cosmetic paths use only `acquisitionSourceCondition()` and do not
stamp per-source visibility.

- [ ] **Step 6: Refactor all sourced entities through one composition function**

Preserve the existing variant-specific entity/source pair, then compose availability:

```ts
function computeSourceConditions(
  source: AcquisitionSource,
  ctx: SourceVisibilityContext,
): { entity: VisibilityCondition; source: VisibilityCondition } {
  const variant = acquisitionSourceConditions(source, ctx);
  const availabilityEntity = availabilityToVisibility(source.availability);
  const availabilitySource = toAvailableVisibility(availabilityEntity);

  return {
    entity: andSimplify([variant.entity, availabilityEntity]),
    source: andSimplify([variant.source, availabilitySource]),
  };
}
```

`andSimplify()` and the neighboring `orSimplify()` remain thin arity guards around the existing
`simplifyCondition()` implementation. They must not contain independent flattening, deduplication,
or Boolean simplification logic.

Replace the recipe-only stamping path with a shared helper:

```ts
function assignSourcedEntityVisibility(
  entity: { sources?: SourceTuple; visibility?: VisibilityCondition },
  ctx: SourceVisibilityContext,
): void {
  const sources = entity.sources ?? [];
  const computed = sources.map((source) => ({
    conditions: computeSourceConditions(source, ctx),
    source,
  }));

  entity.sources = computed.map(({ conditions, source }) => ({
    ...source,
    visibility: conditions.source,
  })) as SourceTuple;
  entity.visibility = orSimplify(computed.map(({ conditions }) => conditions.entity));
}
```

Call it for items, recipes, and top-level cosmetics. For optional or empty source arrays, retain the
existing always-visible behavior and do not invent an empty `SourceTuple`.

- [ ] **Step 7: Run focused projection and visibility tests**

Run:

```bash
rtk pnpm vitest run pipeline/src/extractors/visibility/availability-projection.test.ts pipeline/src/extractors/visibility/entity-visibility.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit availability projection**

```bash
rtk git add pipeline/src/extractors/visibility/availability-projection.ts pipeline/src/extractors/visibility/availability-projection.test.ts pipeline/src/extractors/visibility/entity-visibility.ts pipeline/src/extractors/visibility/entity-visibility.test.ts
rtk git commit -m "fix: project source availability into visibility"
```

---

### Task 3: Repair production perk lookups and tier thresholds

**Files:**

- Create: `src/lib/utils/segment-lookups.test.ts`
- Modify: `src/lib/utils/segment-lookups.ts`
- Modify: `src/lib/utils/source-segments.ts`
- Modify: `src/lib/utils/source-segments.test.ts`

**Interfaces:**

- Produces: `buildBaseSegmentLookups()` with `perks` keyed by `PerkId`, each value containing
  `{ name, skillId, tier }`.
- Preserves: the existing `RecipeSourceLookups["perks"]` interface and title-case fallback for
  malformed synthetic inputs.

- [ ] **Step 1: Add a production lookup flattening test**

Create `segment-lookups.test.ts`:

```ts
it("flattens every generated perk under its PerkId", () => {
  const lookups = buildBaseSegmentLookups(new Set());
  const expected = Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
    skill.perkTiers.flatMap((tier, index) =>
      Object.entries(tier).map(
        ([perkId, perk]) => [perkId, { name: perk.name, skillId, tier: index + 1 }] as const,
      ),
    ),
  );

  expect(lookups.perks).toEqual(Object.fromEntries(expected));
});
```

- [ ] **Step 2: Correct the tier-one threshold expectation**

Change `buildPerkLabel()`’s tier-one test from level `5` to level `1`, matching
`BASE_LOOKUPS.perkTierLevels[0]`:

```ts
condition: { type: "skillLevel", level: 1, skillId: "cooking" },
```

Add a tier-five case proving the last valid lookup uses index four.

- [ ] **Step 3: Run the lookup and source-segment tests to verify both defects**

Run:

```bash
rtk pnpm vitest run src/lib/utils/segment-lookups.test.ts src/lib/utils/source-segments.test.ts
```

Expected: FAIL because `perks` is keyed by skill and `buildPerkLabel()` uses the one-based tier as
an array index.

- [ ] **Step 4: Flatten skills into the production perk lookup**

Construct the lookup without changing its declared type:

```ts
const perks = Object.fromEntries(
  Object.entries(trackerData.skills).flatMap(([skillId, skill]) =>
    skill.perkTiers.flatMap((tier, tierIndex) =>
      Object.entries(tier).map(([perkId, perk]) => [
        perkId,
        { name: perk.name, skillId, tier: tierIndex + 1 },
      ]),
    ),
  ),
);
```

Return `perks` from `buildBaseSegmentLookups()` instead of `trackerData.skills`.

- [ ] **Step 5: Fix the tier index in `buildPerkLabel()`**

```ts
const level = lookups.perkTierLevels[perk.tier - 1];
```

Keep the existing redacted/revealed segment shape, skill name, and one-based tier copy.

- [ ] **Step 6: Run focused app tests**

Run:

```bash
rtk pnpm vitest run src/lib/utils/segment-lookups.test.ts src/lib/utils/source-segments.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit the perk contract repair**

```bash
rtk git add src/lib/utils/segment-lookups.ts src/lib/utils/segment-lookups.test.ts src/lib/utils/source-segments.ts src/lib/utils/source-segments.test.ts
rtk git commit -m "fix: build complete perk segment lookups"
```

---

### Task 4: Render truthful store-stock qualifiers

**Files:**

- Modify: `src/lib/utils/source-segments.ts`
- Modify: `src/lib/utils/source-segments.test.ts`

**Interfaces:**

- Changes: `buildStoreQualifier(source, lookups)` consumes the complete `store` or `scroll_bundle`
  source rather than only `source.visibility`.
- Produces internally: `describeStoreAvailability(condition, lookups): string[] | undefined`.
- Guarantees: unsupported availability is omitted from copy; `all` is stable and exhaustive; `any`
  renders only when every branch is supported.

- [ ] **Step 1: Add focused store grammar tests**

Add table tests for each supported stock gate:

```ts
it.each([
  [
    { perkId: "taste_maker", type: "perkUnlocked" },
    { perkId: "taste_maker", type: "perkUnlocked" },
    ", with the Taste Maker perk (Cooking tier 1)",
  ],
  [
    { level: 15, skillId: "woodcrafting", type: "skillLevel" },
    { level: 15, skillId: "woodcrafting", type: "skillLevel" },
    ", at Woodcrafting level 15",
  ],
  [
    { floor: 40, type: "minesLevel" },
    { floor: 40, type: "minesLevel" },
    ", after reaching Mines floor 40",
  ],
  [
    { level: 4, npcId: "juniper", type: "heartLevel" },
    { level: 4, npcId: "juniper", type: "heartLevel" },
    ", at 4 hearts with Juniper",
  ],
  [
    { questId: "stock_the_pantry", state: "completed", type: "quest" },
    { questId: "stock_the_pantry", type: "questAvailable" },
    ", after completing Stock the Pantry",
  ],
  [
    { questId: "stock_the_pantry", state: "available", type: "quest" },
    { questId: "stock_the_pantry", type: "questAvailable" },
    ", once Stock the Pantry is available",
  ],
] as const)("renders stock availability %#", (availability, visibility, revealed) => {
  const source: Source = {
    availability: availability as AvailabilityCondition,
    storeId: "general" as StoreId,
    type: "store",
    visibility: visibility as VisibilityCondition,
  };
  expect(buildSourceSegments(source, STORE_LOOKUPS)).toContainEqual({
    condition: source.visibility,
    redacted: expect.any(Array),
    revealed: [revealed],
  });
});
```

Both quest states intentionally use `questAvailable` as the source-fragment disclosure condition:
the entity remains gated by the availability projection, while the player may learn the eventual
“after completing” requirement once the quest itself is available.

Also test:

- the General Store retains “after repairing” from `upgradeAction`;
- a store without `upgradeAction` retains “after upgrading”;
- `all` emits every supported fragment in traversal order;
- fully supported `any` emits one grouped “after one of” fragment;
- `any` containing a `gamePredicate` emits no stock qualifier;
- season, weather, time, `not`, and `gamePredicate` emit no stock qualifier; and
- source and store names remain redacted until their own visibility conditions pass.

- [ ] **Step 2: Run source-segment tests and confirm generic upgrade wording fails**

Run:

```bash
rtk pnpm vitest run src/lib/utils/source-segments.test.ts
```

Expected: FAIL because `buildStoreQualifier()` treats every non-always visibility as a generic store
upgrade.

- [ ] **Step 3: Implement leaf descriptions without changing source schemas**

Build strings from `source.availability`:

```ts
function describeStoreAvailability(
  condition: AvailabilityCondition,
  lookups: SegmentLookups,
): string[] | undefined {
  switch (condition.type) {
    case "always":
    case "season":
    case "time":
    case "weather":
      return [];
    case "perkUnlocked":
      return [`, with ${plainPerkLabel(condition.perkId, lookups)}`];
    case "skillLevel":
      return [`, at ${skillName(condition.skillId, lookups)} level ${String(condition.level)}`];
    case "minesLevel":
      return [`, after reaching Mines floor ${String(condition.floor)}`];
    case "heartLevel":
      return [`, at ${String(condition.level)} hearts with ${npcName(condition.npcId, lookups)}`];
    case "quest": {
      const name = questName(condition.questId, lookups);
      return condition.state === "completed"
        ? [`, after completing ${name}`]
        : [`, once ${name} is available`];
    }
    case "all":
      return flattenEverySupportedChild(condition.conditions, lookups);
    case "any":
      return describeEveryBranchOrOmit(condition.conditions, lookups);
    case "gamePredicate":
    case "not":
      return undefined;
  }
}
```

The concrete helpers must use the same perk, skill, NPC, and quest lookup fallbacks already used by
other source formatters. Do not call `buildPerkLabel()` inside a plain revealed string because its
nested gate would duplicate the outer source condition.

- [ ] **Step 4: Separate store-level and stock-level qualifier copy**

Change both source variants to pass the complete source:

```ts
const qualifier = buildStoreQualifier(source, lookups);
```

Inside `buildStoreQualifier()`:

1. derive the store-level action only when the store gate contributes to `source.visibility`;
2. derive stock fragments from `source.availability`;
3. return no fragment if neither exists; and
4. wrap the combined revealed copy in the stamped `source.visibility`, retaining a redacted
   placeholder with the same punctuation.

When a stock quest condition names the same quest as the store-level visibility gate, render only
the store’s `upgradeAction` phrase so the label does not duplicate the same requirement. For other
quest IDs beginning with `repair_` or `upgrade_`, use repair/upgrade wording; use the quest-state
grammar above for all other quest stock gates.

For a composite `any`, join complete branch descriptions with “ or ” under a single “after one of”
phrase. If any branch returns `undefined`, omit the complete stock qualifier.

- [ ] **Step 5: Run focused source-segment tests**

Run:

```bash
rtk pnpm vitest run src/lib/utils/source-segments.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit store qualifier grammar**

```bash
rtk git add src/lib/utils/source-segments.ts src/lib/utils/source-segments.test.ts
rtk git commit -m "fix: describe store stock progression gates"
```

---

### Task 5: Correct and validate Void Herb

**Files:**

- Modify: `pipeline/src/acquisition/reviewed-overrides.ts`
- Modify: `pipeline/src/acquisition/reviewed-overrides.test.ts`
- Modify: `pipeline/src/acquisition/source-accumulator.ts`
- Modify: `pipeline/src/acquisition/source-accumulator.test.ts`
- Modify: `pipeline/src/acquisition/validate-sources.ts`
- Modify: `pipeline/src/acquisition/validate-sources.test.ts`
- Modify: `pipeline/src/extractors/visibility/entity-visibility.test.ts`
- Modify: `src/lib/utils/source-segments.test.ts`

**Interfaces:**

- Produces: `SourceAccumulator.replace(targetId, sources, provenance?: SourceProvenance): void` for
  explicitly reviewed replacement overrides without changing existing additive overrides.
- Produces: Void Herb source
  `{ type: "forage", locationIds: ["mines"], availability: quest-completed(find_the_magic_key) }`.
- Guarantees: runtime validation requires `biomeId` on `mine`, `mines_chest`, and `mines_dig_site`;
  `mine_fish` remains the only mine-family variant with an optional biome.

- [ ] **Step 1: Add the reviewed override regression test**

```ts
expect(ITEM_SOURCE_REPLACEMENTS["void_herb" as ItemId]).toEqual([
  {
    availability: {
      questId: "find_the_magic_key",
      state: "completed",
      type: "quest",
    },
    locationIds: ["mines"],
    type: "forage",
  },
]);
```

In the same production edit, place the Void Herb wiki URL immediately above the override and record
the quest gate as project-owner-reviewed evidence; verify that prose in the staged diff.

- [ ] **Step 2: Add the malformed mine-source validation test**

```ts
it("rejects a mine source without biomeId", () => {
  const trackerData = {
    cosmetics: {},
    items: { void_herb: { sources: [{ type: "mine" }] } },
    recipes: {},
  };
  const references = AcquisitionReferenceIndex.from({ emitted: { items: trackerData.items } });

  expect(() => validateAcquisitionSources(trackerData, references)).toThrow(
    "items.void_herb.sources[0].biomeId",
  );
});
```

Use a table to prove `mine`, `mines_chest`, and `mines_dig_site` all reject a missing `biomeId`.
Retain a neighboring test proving `{ type: "mine_fish" }` is valid. The existing validator already
requires the field for the chest and dig-site variants; those two rows are regression coverage,
while the `mine` row is the new failing case.

- [ ] **Step 3: Run focused tests and confirm the invalid source is still accepted**

Run:

```bash
rtk pnpm vitest run pipeline/src/acquisition/reviewed-overrides.test.ts pipeline/src/acquisition/validate-sources.test.ts
```

Expected: FAIL because Void Herb has no reviewed forage override and `mine.biomeId` is currently
validated as optional.

- [ ] **Step 4: Add and test explicit accumulator replacement semantics**

Add a test proving replacement removes previously collected sources for only the selected target:

```ts
const accumulator = new ItemSourceAccumulator();
accumulator.add("void_herb" as ItemId, {
  biomeId: "ancient_ruins" as MinesBiomeId,
  type: "mine",
});
accumulator.add("other_item" as ItemId, { type: "default" });

accumulator.replace("void_herb" as ItemId, [{ locationIds: ["mines"], type: "forage" }]);

expect(accumulator.get("void_herb" as ItemId)).toEqual([
  { locationIds: ["mines"], type: "forage" },
]);
expect(accumulator.get("other_item" as ItemId)).toEqual([{ type: "default" }]);
```

Implement `replace(targetId, sources, provenance?)` by deleting only the target’s internal source
map and reusing `add()` for each replacement so canonical ordering and optional provenance remain
intact. `applyReviewedOverrides()` supplies provenance for the reviewed replacement; direct unit
tests may omit it just as existing `add()` tests do.

- [ ] **Step 5: Add the exact reviewed Void Herb replacement override**

Import `LocationId`, then add:

```ts
// Wiki: https://fieldsofmistria.wiki.gg/wiki/Void_Herb
// Foraging in any Mines biome is wiki-supported. Completion of “Find the Magic Key” is an
// explicit project-owner-reviewed gate because the structured assets do not encode it here.
export const ITEM_SOURCE_REPLACEMENTS: Partial<Record<ItemId, Source[]>> = {
  ["void_herb" as ItemId]: [
    {
      availability: {
        questId: "find_the_magic_key" as QuestId,
        state: "completed",
        type: "quest",
      },
      locationIds: ["mines" as LocationId],
      type: "forage",
    },
  ],
};
```

Update `applyReviewedOverrides()` to process the existing additive `ITEM_OVERRIDES` first, then
process `ITEM_SOURCE_REPLACEMENTS` with `itemAccumulator.replace()` so the replacement is the final
source set for its target. Validate replacement targets with the same `missing-target` diagnostic
shape and keep obsolete-addition diagnostics unchanged. This removes the invalid native-derived
`{ type: "mine" }` result rather than appending a contradictory second path.

- [ ] **Step 6: Require `biomeId` for `mine` at the JSON boundary**

Change the `mine` validation branch to:

```ts
case "mine":
  stringReferences.push(["biomeId", "biome"]);
  break;
```

Do not change the optional `mine_fish` branch.

- [ ] **Step 7: Test entity visibility and rendered copy**

Add a visibility fixture asserting the override’s projected entity condition is:

```ts
{ questId: "find_the_magic_key", type: "questCompleted" }
```

Add a source-segment case asserting:

```ts
expect(buildSourceSegments(voidHerbSource, lookups)).toEqual(["Forage at Mines"]);
```

- [ ] **Step 8: Run all focused Void Herb tests**

Run:

```bash
rtk pnpm vitest run pipeline/src/acquisition/source-accumulator.test.ts pipeline/src/acquisition/reviewed-overrides.test.ts pipeline/src/acquisition/validate-sources.test.ts pipeline/src/extractors/visibility/entity-visibility.test.ts src/lib/utils/source-segments.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the reviewed correction**

```bash
rtk git add pipeline/src/acquisition/source-accumulator.ts pipeline/src/acquisition/source-accumulator.test.ts pipeline/src/acquisition/reviewed-overrides.ts pipeline/src/acquisition/reviewed-overrides.test.ts pipeline/src/acquisition/validate-sources.ts pipeline/src/acquisition/validate-sources.test.ts pipeline/src/extractors/visibility/entity-visibility.test.ts src/lib/utils/source-segments.test.ts
rtk git commit -m "fix: correct Void Herb acquisition source"
```

---

### Task 6: Enforce the generated source contract exhaustively

**Files:**

- Create: `src/lib/data/source-rendering.invariants.test.ts`
- Modify: `src/lib/data/tracker-data.invariants.test.ts`

**Interfaces:**

- Produces internally: `collectSourcedEntities(trackerData): { id, kind, sources, visibility }[]`.
- Produces internally: `walkSegments(segments): void`, visiting every revealed and redacted branch.
- Guarantees: failures identify entity kind, entity ID, source index, and serialized source.

- [ ] **Step 1: Write an exhaustive generated-data source collector**

Create `source-rendering.invariants.test.ts` and recursively discover every object with a non-empty
`sources` array. Stop descending once an entity is collected so source payloads are not mistaken for
entities:

```ts
type SourcedEntity = {
  entity: { sources: Source[]; visibility?: VisibilityCondition };
  path: string;
};

function collectSourcedEntities(value: unknown, path = "trackerData"): SourcedEntity[] {
  if (Array.isArray(value)) {
    return value.flatMap((child, index) =>
      collectSourcedEntities(child, `${path}[${String(index)}]`),
    );
  }
  if (!isRecord(value)) return [];

  if (Array.isArray(value.sources) && value.sources.length > 0) {
    expect(value.sources.every(isSource), `${path}.sources`).toBe(true);
    return [
      {
        entity: value as { sources: Source[]; visibility?: VisibilityCondition },
        path,
      },
    ];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectSourcedEntities(child, `${path}.${key}`),
  );
}

const sourcedEntities = collectSourcedEntities(trackerData);
```

Implement `isRecord()` and an exhaustive `isSource()` discriminant guard using the declared
`Source["type"]` values. Assert the discovered paths include representatives under items, recipes,
cosmetics, spells, pet cosmetics, pet skins, and animal cosmetics. This recursive discovery makes a
new source-bearing tracker branch enter the contract automatically instead of silently bypassing a
hardcoded list.

- [ ] **Step 2: Add the render-all contract**

Build production lookups with `buildBaseSegmentLookups(new Set())`. For each source:

```ts
const context = `${path} source[${String(index)}] ${JSON.stringify(source)}`;
expect(() => {
  const segments = buildSourceSegments(source, {
    ...baseLookups,
    entityVisibility: entity.visibility,
  });
  expect(segments.length, context).toBeGreaterThan(0);
  walkSegments(segments, context);
}).not.toThrow();
```

`walkSegments()` must recurse through `revealed` and optional `redacted` arrays and reject empty
branches. A `{ redacted: true }` leaf and non-empty strings are terminal valid nodes.

- [ ] **Step 3: Add hard reference assertions**

For each source variant, assert the references the formatter requires:

```ts
if (source.type === "mine" || source.type === "mines_chest" || source.type === "mines_dig_site") {
  expect(
    baseLookups.biomes.some(({ id }) => id === source.biomeId),
    context,
  ).toBe(true);
}
if ("perkId" in source) {
  expect(baseLookups.perks[source.perkId], context).toBeDefined();
}
if (source.type === "quest") {
  expect(source.questType ?? baseLookups.questTypes[source.questId], context).toBeDefined();
}
if ("storeId" in source) {
  expect(baseLookups.stores[source.storeId], context).toBeDefined();
}
```

This direct perk assertion proves production rendering never uses fallback metadata.

- [ ] **Step 4: Add deterministic unsupported-predicate diagnostics**

Walk every `source.availability` tree, collect `gamePredicate` leaves, and sort records by
predicate, entity kind, entity ID, then source index:

```ts
type UnsupportedPredicateDiagnostic = {
  entityId: string;
  entityKind: string;
  predicate: string;
  sourceIndex: number;
};
```

The test must assert the array is already in deterministic order and print the complete JSON array
in the failure message of a stable count/name assertion. Do not fail merely because supported
projection maps these leaves to `always`; this diagnostic is the seed for the follow-up issue.

- [ ] **Step 5: Run the new contract before regeneration**

Run:

```bash
rtk pnpm vitest run src/lib/data/source-rendering.invariants.test.ts
```

Expected: FAIL against the old generated JSON, identifying raw quest types, missing quest types,
missing perk lookups, and Void Herb’s missing biome.

- [ ] **Step 6: Regenerate tracker data from the shared assets**

Run:

```bash
rtk pnpm run pipeline -- pipeline/input
```

Expected: the pipeline completes, rewrites `src/lib/data/tracker-data.json`, and the output contains
normalized quest types, stamped availability visibility, and the reviewed Void Herb source.

- [ ] **Step 7: Run generated-data contracts**

Run:

```bash
rtk pnpm vitest run src/lib/data/source-rendering.invariants.test.ts src/lib/data/tracker-data.invariants.test.ts
```

Expected: PASS with every generated source renderable and every required lookup resolved.

- [ ] **Step 8: Commit regenerated data and contracts**

```bash
rtk git add src/lib/data/source-rendering.invariants.test.ts src/lib/data/tracker-data.invariants.test.ts src/lib/data/tracker-data.json
rtk git commit -m "test: enforce generated source rendering contracts"
```

---

### Task 7: Resolve the audited factual disagreements case by case

**Files:**

- Modify: `docs/superpowers/notes/2026-08-24-issue-97-wiki-source-audit.md`
- Modify only when native-confirmed: the responsible collector or extractor under
  `pipeline/src/acquisition/collectors/` or `pipeline/src/extractors/`
- Modify only when explicitly reviewed: `pipeline/src/acquisition/reviewed-overrides.ts`
- Test: the colocated `*.test.ts` file for each changed collector, extractor, or override

**Interfaces:**

- Consumes: the 21-row discrepancy list in the audit ledger and the evidence policy in the approved
  spec.
- Produces: one ledger disposition per row: `native-confirmed correction`, `reviewed override`, or
  `unresolved or wiki-stale`.
- Guarantees: wiki absence alone never removes a source; ambiguous cases preserve current native
  behavior.

- [ ] **Step 1: Record a disposition table before editing extraction code**

Add a four-column table to the audit ledger with “Cases”, “Native evidence inspected”,
“Disposition”, and “Code/test consequence” headings. Add one completed row for each of the 21
individual disagreements: Iron Fish, Silver Squid, Bait Thief, Blue Crab, Hake, Sea Urchin, Gar, Big
Cookie, Dozy’s Dog Bed, Temple Flower Seed, Valen’s Workstation, Void Stone, Void Powder, Gemstone
Bridge, Breath of Spring Basket, Rabbit Plushie, Hayden’s Weathervane, Maple’s Aldarian Star
Drawing, Royal Chest, Dragon Road Wall, and Water Altar. Every row must name exact asset paths and
native field values, choose exactly one approved disposition, and state either the exact changed
module or “preserve current behavior”. Do not commit an undecided, blank, or provisional cell.

The batched searches in Step 2 are only an investigation optimization. Items from the same mechanic
may receive different dispositions and must never be collapsed into one ledger decision.

- [ ] **Step 2: Inspect native assets with one batched search per mechanic**

Use `rg` against `pipeline/input` for all IDs in a mechanic at once, for example:

```bash
rtk rg -n -i 'iron_fish|silver_squid|bait_thief|blue_crab|hake|sea_urchin|gar' pipeline/input
rtk rg -n -i 'big_cookie|dozys_dog_bed|temple_flower_seed|valens_workstation' pipeline/input
rtk rg -n -i 'void_stone|void_powder|gemstone_bridge' pipeline/input
rtk rg -n -i 'breath_of_spring|rabbit_plushie|haydens_weathervane|maples_drawing|royal_chest' pipeline/input
rtk rg -n -i 'dragon_road_wall|water_altar' pipeline/input
```

For every case, follow references into the defining loot, quest, requirement, or reward table until
the acquisition condition is explicit. If the data is contradictory or only a tag/name hint,
classify it as unresolved and preserve code.

- [ ] **Step 3: Write failing narrow tests only for confirmed corrections**

For every native-confirmed correction, use the affected collector’s existing minimal-fixture style
and assert the complete expected `Source` object for the audited item ID. For every reviewed
runtime-only correction, assert the complete `ITEM_OVERRIDES[id]` or `ITEM_SOURCE_REPLACEMENTS[id]`
array. For unresolved/wiki-stale rows, add no speculative production behavior; the completed ledger
row is the deliverable.

- [ ] **Step 4: Run each new focused test and verify the intended failure**

Run the complete focused pipeline source suites after adding each mechanic’s cases:

```bash
rtk pnpm vitest run pipeline/src/acquisition pipeline/src/extractors
```

Expected: each native-confirmed or reviewed-override test fails for the specific old source value,
not because the fixture or import is malformed.

- [ ] **Step 5: Make the narrowest evidence-backed correction**

- Fix a shared extractor only when the incorrect interpretation affects every row governed by that
  native field.
- Add an `ITEM_OVERRIDES` entry only when runtime behavior is not represented in structured data and
  the project-owner-reviewed evidence is explicit.
- Preserve the current extractor output for every unresolved or wiki-stale row.
- Add the wiki URL and native asset path to each reviewed override comment.

- [ ] **Step 6: Run all affected focused tests**

Run:

```bash
rtk pnpm vitest run pipeline/src/acquisition pipeline/src/extractors
```

Expected: PASS.

- [ ] **Step 7: Regenerate data if any correction changed a source**

Run:

```bash
rtk pnpm run pipeline -- pipeline/input
rtk pnpm vitest run src/lib/data/source-rendering.invariants.test.ts src/lib/data/tracker-data.invariants.test.ts
```

Expected: PASS. If every disagreement is unresolved or wiki-stale, skip regeneration and state that
fact in the commit body.

- [ ] **Step 8: Commit factual dispositions and supported corrections**

```bash
rtk git add docs/superpowers/notes/2026-08-24-issue-97-wiki-source-audit.md pipeline/src src/lib/data/tracker-data.json
rtk git commit -m "fix: resolve audited source discrepancies"
```

Before committing, inspect `git diff --cached --name-only` and unstage every unrelated file and the
`pipeline/input` symlink.

---

### Task 8: Create the unsupported-predicate follow-up and complete verification

**Files:**

- Modify if necessary: `docs/superpowers/notes/2026-08-24-issue-97-wiki-source-audit.md`

**Interfaces:**

- Consumes: the deterministic unsupported-predicate diagnostic from Task 6.
- Produces: one GitHub follow-up issue limited to tracking currently unsupported progression facts.
- Produces: a fully verified issue #97 branch ready for review.

- [ ] **Step 1: Run the complete verification matrix**

Run each command directly and retain its exit status:

```bash
rtk pnpm run lint
rtk pnpm run check
rtk pnpm run test
rtk pnpm run build
rtk git diff --check
```

Expected: all commands exit zero. The complete Vitest suite must report at least the existing 52
test files and 729 tests plus every test added by this plan.

- [ ] **Step 2: Capture the final unsupported-predicate diagnostic**

Run:

```bash
rtk pnpm vitest run src/lib/data/source-rendering.invariants.test.ts --reporter=verbose
```

Copy the deterministic predicate names and affected entity IDs produced by the contract helper.
Confirm `has_upper_floor`, `is_dating_someone`, and any unmapped `seen_cutscene` facts remain
availability-only and do not appear in generated entity visibility.

- [ ] **Step 3: Create the follow-up issue**

Create one issue titled “Track unsupported progression predicates used by acquisition sources”. Its
Context section must state that issue #97 preserved native acquisition availability predicates that
Mistria Field Guide cannot yet evaluate without over-redacting content. Its Initial scope section
must contain the complete deterministic predicate/entity JSON captured in Step 2, including
`has_upper_floor`, `is_dating_someone`, and unmapped `seen_cutscene` records. Its Acceptance
criteria must require importing or deriving each supported fact into `UserProgressionState`, mapping
each native predicate through the acquisition requirement resolver, adding
save-import/backup/transfer compatibility tests for new state, replacing covered diagnostics with
visibility tests, and preserving conservative reveal behavior for predicates that remain
unsupported.

Create `/tmp/issue-97-follow-up.md` with `apply_patch`; do not use shell redirection.

Run:

```bash
rtk gh issue create --title "Track unsupported progression predicates used by acquisition sources" --body-file /tmp/issue-97-follow-up.md
```

Record the created issue URL in the audit ledger’s Follow-up section.

- [ ] **Step 4: Verify the final diff and commit the follow-up reference**

Run:

```bash
rtk git status --short
rtk git diff --check
rtk git diff --stat main...HEAD
```

Expected: only issue #97 implementation, generated data, tests, audit documentation, and the
approved spec/plan are present. `pipeline/input` remains untracked and unstaged.

If the follow-up URL changed the audit ledger, commit it:

```bash
rtk git add docs/superpowers/notes/2026-08-24-issue-97-wiki-source-audit.md
rtk git commit -m "docs: link source predicate tracking follow-up"
```

- [ ] **Step 5: Push and open the issue #97 pull request**

```bash
rtk git push -u origin 97-source-wiki-audit
rtk gh pr create --title "Fix acquisition source integrity and redaction" --body "Closes #97"
```

In the PR body, summarize the normalized quest metadata, projected availability gates, corrected
perk lookups, store qualifier grammar, Void Herb override, exhaustive contracts, factual
dispositions, verification results, and the unsupported-predicate follow-up issue.
