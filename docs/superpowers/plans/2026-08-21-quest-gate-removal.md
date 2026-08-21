# Quest gate removal & quest chain simplification

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dead `questGate`/`questGates` code and restructure `questChains` into per-quest
`visibility` conditions (for prerequisite logic) plus a generic `questOrder` map (for display
ordering).

**Architecture:** The pipeline already stamps `visibility` on quests via `assignQuestVisibility` in
`entity-visibility.ts`. Today that visibility data is duplicated: it lives both on the quest objects
_and_ in `questChains` on `TrackerData`, with the app's `visibility.ts` reading from `questChains`
at runtime. This plan removes the duplication by making the app read prerequisite data from the
quest's own `visibility` field, reducing `questChains` to just the ordered arrays
(crown/mission/cooking) and renaming it `questOrder`.

**Tech Stack:** TypeScript, SvelteKit, Vitest

**Spec:** `docs/superpowers/specs/2026-08-21-quest-gate-removal-design.md`

## Global constraints

- Use `pnpm` exclusively (no `npm`/`npx`/`yarn`/`bun`).
- Run `pnpm run lint:fix` before committing.
- Run the full verification matrix (`pnpm run check && pnpm run lint && pnpm run test`) once before
  the final commit, not after every edit.
- Never hand-edit `src/lib/data/tracker-data.json`.
- `strictTypeChecked` ESLint + `strict: true` tsconfig. Use `type` imports.

---

### Task 1: Remove `questGate` & `questGates` from the data contract and pipeline

**Files:**

- Delete: `pipeline/src/extractors/quest-gates.ts`
- Modify: `src/lib/types/tracker-data.ts` (remove `questGate` from `Item` and `Animal`, remove
  `questGates` from `TrackerData`)
- Modify: `pipeline/src/main.ts` (remove imports, calls, and output property)

**Interfaces:**

- Consumes: nothing from other tasks
- Produces: updated `TrackerData` type without `questGate`/`questGates` (consumed by all later
  tasks)

- [ ] **Step 1: Remove `questGate` from `Item` interface**

In `src/lib/types/tracker-data.ts`, remove the `questGate` field from `Item`:

```ts
// Before (line 86-90):
export interface Item extends TrackerEntity {
  category: string;
  name: string;
  questGate?: QuestId[];
}

// After:
export interface Item extends TrackerEntity {
  category: string;
  name: string;
}
```

- [ ] **Step 2: Remove `questGate` from `Animal` interface**

In `src/lib/types/tracker-data.ts`, remove the `questGate` field from `Animal`:

```ts
// Before (line 26-32):
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  name: string;
  questGate?: QuestId[];
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}

// After:
export interface Animal {
  cosmetics: Record<CosmeticId, AnimalCosmetic>;
  name: string;
  variantTiers: AnimalVariantTier[];
  visibility?: VisibilityCondition;
}
```

- [ ] **Step 3: Remove `questGates` from `TrackerData` interface**

In `src/lib/types/tracker-data.ts`, remove the `questGates` property (lines 191-196):

```ts
// Remove this entire block from TrackerData:
questGates: {
  animalGates: Record<AnimalId, QuestId[]>;
  itemGates: Record<ItemId, QuestId[]>;
  progressionFlagToQuests: Record<string, QuestId[]>;
  spellGates: Record<SpellId, QuestId[]>;
}
```

- [ ] **Step 4: Delete `pipeline/src/extractors/quest-gates.ts`**

```bash
rm pipeline/src/extractors/quest-gates.ts
```

- [ ] **Step 5: Remove quest gate imports and calls from `pipeline/src/main.ts`**

Remove the import block (lines 36-40):

```ts
// Delete:
import {
  applyAnimalQuestGates,
  applyItemQuestGates,
  applySpellQuestGates,
  extractQuestGates,
} from "./extractors/quest-gates.js";
```

Remove the `extractQuestGates` call (line 335):

```ts
// Delete:
const questGates = extractQuestGates(fiddle);
```

Remove the three `apply*` calls (lines 404-406):

```ts
// Delete:
applyItemQuestGates(items, questGates.itemGates);
applyAnimalQuestGates(animals, questGates.animalGates);
applySpellQuestGates(mines, questGates.spellGates);
```

Remove `questGates` from the `trackerData` object literal (line 441):

```ts
// Delete:
    questGates,
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm run check 2>&1 | tail -30
```

Expected: type errors in `visibility.test.ts` (the test fixture still references `questGates` and
`questChains`). No errors in production code. These test fixture errors are fixed in Task 3.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Remove dead questGate/questGates from types and pipeline

Closes part 1 of #108. questGate on Item/Animal and questGates on
TrackerData were never read by app code — the visibility system
superseded them."
```

---

### Task 2: Replace `questChains` with `questOrder` on `TrackerData` and in the pipeline output

**Files:**

- Modify: `src/lib/types/tracker-data.ts` (replace `questChains` with `questOrder`)
- Modify: `pipeline/src/main.ts` (build `questOrder` instead of `questChains`)

**Interfaces:**

- Consumes: `TrackerData` without `questGates` (Task 1)
- Produces: `TrackerData` with `questOrder: Partial<Record<QuestType, QuestId[]>>` instead of
  `questChains` (consumed by Tasks 3 and 4)

- [ ] **Step 1: Replace `questChains` with `questOrder` in `TrackerData`**

In `src/lib/types/tracker-data.ts`, replace the `questChains` property (lines 183-189):

```ts
// Before:
  questChains: {
    crown: QuestId[];
    fetch: Record<QuestId, VisibilityCondition>;
    heart: Record<NpcId, { heartLevel: number; prerequisiteQuest?: QuestId; questId: QuestId }[]>;
    stillwell: QuestId[];
    story: Record<QuestId, { prerequisites: QuestId[] }>;
    tali: QuestId[];
  };

// After:
  questOrder: Partial<Record<QuestType, QuestId[]>>;
```

This also requires importing `QuestType` if it isn't already used at that position in the file. It
is already defined in the same file, so no import needed.

- [ ] **Step 2: Update `pipeline/src/main.ts` to emit `questOrder`**

Replace the `questChains` property in the `trackerData` object literal (line 440):

```ts
// Before:
    questChains: { ...questChainsRaw, fetch: fetchQuestVisibilityData },

// After:
    questOrder: {
      cooking: questChainsRaw.tali,
      crown: questChainsRaw.crown,
      mission: questChainsRaw.stillwell,
    },
```

- [ ] **Step 3: Verify types compile (expect downstream errors)**

```bash
pnpm run check 2>&1 | tail -30
```

Expected: type errors in `visibility.ts`, `quests-content.svelte`, and test files that reference
`questChains`. These are fixed in Tasks 3 and 4.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Replace questChains with questOrder on TrackerData

questOrder is typed as Partial<Record<QuestType, QuestId[]>> and carries
only the ordered arrays (crown, mission, cooking). Prerequisite data for
fetch/heart/story quests now lives on each quest's visibility field,
set by the pipeline's assignQuestVisibility."
```

---

### Task 3: Update app visibility engine to use `questOrder` and per-quest visibility

This is the core logic change. The app's `evaluateQuestPrerequisites` and
`markQuestPrerequisitesCompleted` currently read prerequisite data from `questChains`. After this
task, fetch/heart/story quests read their prerequisites from their own `visibility` field, and
ordered chains (crown/mission/cooking) read from `questOrder`.

**Files:**

- Modify: `src/lib/engine/visibility.ts`
- Modify: `src/lib/engine/__tests__/visibility.test.ts`

**Interfaces:**

- Consumes: `TrackerData` with `questOrder` (Task 2)
- Produces: updated `deriveProgressionState`, `satisfyCondition` (consumed by existing app code; no
  signature changes)

- [ ] **Step 1: Update test fixture `makeTrackerData` to use `questOrder`**

In `src/lib/engine/__tests__/visibility.test.ts`, update the `makeTrackerData` defaults:

```ts
// Before (line 80-86):
    questChains: { crown: [], fetch: {}, heart: {}, stillwell: [], story: {}, tali: [] },
    questGates: {
      animalGates: {},
      itemGates: {},
      progressionFlagToQuests: {},
      spellGates: {},
    },

// After:
    questOrder: {},
```

Also remove the `emptyStoryChains` constant (lines 287-294):

```ts
// Delete:
const emptyStoryChains = {
  crown: [],
  fetch: {},
  heart: {},
  stillwell: [],
  story: {},
  tali: [],
};
```

- [ ] **Step 2: Update test cases that set `questChains` for story quests**

Story quest prerequisites are now expressed as `visibility` on the quest object itself, not in
`questChains`. Update every test that passes `questChains.story`. The pattern is:

```ts
// Before:
const trackerData = makeTrackerData({
  questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
  quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
});

// After (no prerequisites = no visibility condition):
const trackerData = makeTrackerData({
  quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
});
```

```ts
// Before (with prerequisites):
const trackerData = makeTrackerData({
  questChains: {
    ...emptyStoryChains,
    story: {
      [firstQuest]: { prerequisites: [] },
      [theSecondQuest]: { prerequisites: [firstQuest] },
    },
  },
  quests: {
    [story]: {
      [firstQuest]: { name: "First" },
      [theSecondQuest]: { name: "Second" },
    },
  },
});

// After (prerequisites become visibility on the quest):
const trackerData = makeTrackerData({
  quests: {
    [story]: {
      [firstQuest]: { name: "First" },
      [theSecondQuest]: {
        name: "Second",
        visibility: { type: "questCompleted", questId: firstQuest },
      },
    },
  },
});
```

Apply this pattern to all tests referencing `questChains.story`:

- "marks completed quests as completed" (line 298)
- "marks obtained quests as available" (line 312)
- "makes first story quest available when none completed" (line 329)
- "marks NPC as known when unlock quest is completed" (line 347)
- "cascades heart level from heartLevelChanges" (line 411)
- "marks quest as completed for questCompleted" (line 499)
- "completes quest prerequisites when satisfying a chained quest" (line 536)
- "hides then reveals an entity after satisfying its condition" (line 583)
- "reveals source detail and entity name at their separate thresholds" (line 602)
- "satisfying a quest reveals NPC-gated content" (line 636)
- "completing a chain quest cascades visibility to gated items" (line 661)
- "just-this-item does not cascade quest state" (line 691)

- [ ] **Step 3: Update test cases that set `questChains` for ordered chains (crown)**

Crown chain tests use `questChains.crown` for ordering. Replace with `questOrder`:

```ts
// Before:
const trackerData = makeTrackerData({
  categoryVisibility: { crown: { type: "always" } },
  questChains: {
    ...emptyStoryChains,
    crown: [firstQuest, theSecondQuest, thirdCrown],
  },
  quests: { ... },
});

// After:
const trackerData = makeTrackerData({
  categoryVisibility: { crown: { type: "always" } },
  questOrder: { crown: [firstQuest, theSecondQuest, thirdCrown] },
  quests: { ... },
});
```

Apply to the "marks ordered chain predecessors completed for questAvailable" test (line 556).

- [ ] **Step 4: Rewrite `evaluateQuestPrerequisites` in `visibility.ts`**

The function currently has a `switch` on `questType` with six cases. After the change:

- `fetch`, `heart`, `story`: read the quest's own `visibility` field via `isVisible`
- `cooking`, `crown`, `mission`: read from `trackerData.questOrder` via `evaluateOrderedChain`
- Default: `"unavailable"`

```ts
function evaluateQuestPrerequisites(
  questId: QuestId,
  questType: QuestType,
  completed: CompletedState,
  trackerData: TrackerData,
  questVisibilitySoFar: Record<string, QuestVisibility>,
): QuestVisibility {
  const order = trackerData.questOrder[questType];
  if (order) {
    const visibility = trackerData.categoryVisibility[questType] ?? { type: "always" as const };
    return evaluateOrderedChain(order, questId, completed, trackerData, visibility);
  }

  const quest = trackerData.quests[questType][questId];
  if (!quest?.visibility) return "available";

  const tempState: UserProgressionState = {
    knownNpcs: new Set(),
    marriedNpc: completed.marriedNpc,
    minesFloor: completed.mines.floor,
    npcLevels: completed.npcLevels,
    questVisibility: questVisibilitySoFar,
    renown: completed.renown,
    showSpoilers: false,
    skillLevels: completed.skillLevels,
    unlockedPerks: completed.unlockedPerks,
  };
  return isVisible(quest.visibility, tempState) ? "available" : "unavailable";
}
```

Note: the `tempState` pattern is already used by the existing `fetch` case. The key insight is that
ordered-chain quests are identified by having an entry in `questOrder`, and everything else reads
its own `visibility`.

- [ ] **Step 5: Remove `findHeartChainEntry` helper**

Delete the `findHeartChainEntry` function (lines 325-334). It's no longer needed since heart quest
prerequisites are now on the quest's `visibility` field.

Also remove the `HeartChainEntry` interface (lines 26-31).

- [ ] **Step 6: Rewrite `markQuestPrerequisitesCompleted` in `visibility.ts`**

This function is the invertibility counterpart of `evaluateQuestPrerequisites`. Same restructure:

```ts
function markQuestPrerequisitesCompleted(
  questId: QuestId,
  completed: CompletedState,
  trackerData: TrackerData,
): void {
  const questType = findQuestType(questId, trackerData);
  if (!questType) return;

  const order = trackerData.questOrder[questType];
  if (order) {
    markOrderedPredecessorsCompleted(order, questId, completed, trackerData);
    return;
  }

  const quest = trackerData.quests[questType][questId];
  if (quest?.visibility) {
    satisfyCondition(quest.visibility, completed, trackerData);
  }
}
```

- [ ] **Step 7: Remove unused `lookup` helper if no longer referenced**

Check whether `lookup` (line 387) is still used after the refactoring. It was used for
`chains.fetch`, `chains.story` lookups. If nothing else references it, delete it.

- [ ] **Step 8: Run the app test suite**

```bash
pnpm run test:app 2>&1 | tail -30
```

Expected: all tests pass. If any fail, fix the test fixture data (most likely a test still
referencing `questChains` or `emptyStoryChains`).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Update visibility engine to use questOrder and per-quest visibility

evaluateQuestPrerequisites and markQuestPrerequisitesCompleted now read
prerequisite data from each quest's visibility field for fetch/heart/story
quests, and from questOrder for ordered chains (crown/mission/cooking).
Removes the HeartChainEntry interface, findHeartChainEntry, and lookup
helpers."
```

---

### Task 4: Update `quests-content.svelte` to use `questOrder`

**Files:**

- Modify: `src/lib/components/quests-content.svelte`

**Interfaces:**

- Consumes: `TrackerData` with `questOrder` (Task 2)
- Produces: no interface changes (UI component)

- [ ] **Step 1: Replace the chain order lookup**

In `src/lib/components/quests-content.svelte`, replace the hardcoded chain lookup (lines 134-141):

```svelte
<!-- Before: -->
{@const chainOrder =
  questType === "crown"
    ? trackerData.questChains.crown
    : questType === "mission"
      ? trackerData.questChains.stillwell
      : questType === "cooking"
        ? trackerData.questChains.tali
        : null}

<!-- After: -->
{@const chainOrder = trackerData.questOrder[questType] ?? null}
```

- [ ] **Step 2: Run the full verification matrix**

```bash
pnpm run check 2>&1 | tail -30
pnpm run lint 2>&1 | tail -30
pnpm run test 2>&1 | tail -30
```

Expected: all pass clean.

- [ ] **Step 3: Run `pnpm run lint:fix` and commit**

```bash
pnpm run lint:fix 2>&1 | tail -10
git add -A
git commit -m "Use questOrder in quests-content.svelte

Replaces the hardcoded crown/stillwell/tali ternary chain with a single
questOrder lookup, which also generalizes to any future ordered quest type."
```

---

### Task 5: Regenerate tracker data and verify

**Files:**

- Regenerate: `src/lib/data/tracker-data.json`

**Interfaces:**

- Consumes: all prior tasks
- Produces: updated generated data file

- [ ] **Step 1: Regenerate tracker data**

```bash
pnpm run pipeline -- pipeline/input 2>&1 | tail -30
```

Expected: pipeline runs successfully. The output `tracker-data.json` now has `questOrder` instead of
`questChains`, and no `questGates` or per-entity `questGate` fields.

- [ ] **Step 2: Verify the generated data shape**

```bash
node -e "
  const d = require('./src/lib/data/tracker-data.json');
  console.log('has questOrder:', 'questOrder' in d);
  console.log('questOrder keys:', Object.keys(d.questOrder || {}));
  console.log('has questChains:', 'questChains' in d);
  console.log('has questGates:', 'questGates' in d);
  const firstItem = Object.values(d.items)[0];
  console.log('first item has questGate:', 'questGate' in (firstItem || {}));
"
```

Expected:

```
has questOrder: true
questOrder keys: [ 'cooking', 'crown', 'mission' ]
has questChains: false
has questGates: false
first item has questGate: false
```

- [ ] **Step 3: Run the full verification matrix one final time**

```bash
pnpm run check 2>&1 | tail -30
pnpm run lint 2>&1 | tail -30
pnpm run test 2>&1 | tail -30
```

Expected: all pass clean.

- [ ] **Step 4: Commit the regenerated data**

```bash
git add src/lib/data/tracker-data.json
git commit -m "Regenerate tracker-data.json without questGates/questChains

Data now uses questOrder (cooking, crown, mission) and per-quest
visibility conditions. Closes #108."
```
