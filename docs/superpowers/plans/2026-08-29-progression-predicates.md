# Progression predicates implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all 97 unsupported `gamePredicate` availability conditions across five predicate
families (`reached_date`, `has_upper_floor`, `is_dating_someone`, `seen_cutscene`,
`unlocked_animal`) so the engine can evaluate them, the UI can track them, and save import can
extract them.

**Architecture:** Three predicates resolve to existing condition types (quest gates and a new
`isDating` condition). Two require genuinely new state (`reachedSeason`, `hasUpperFloor`). New types
flow through the pipeline's predicate projector, the availability/visibility type system, the engine
evaluator, user state persistence, save import, and transfer encoding. The cutscene map gets an
explicit override; `unlocked_animal` maps to a barn-upgrade quest gate.

**Tech Stack:** TypeScript, SvelteKit 5 (runes), Vitest, pnpm

**Spec:** `docs/superpowers/specs/2026-08-29-progression-predicates-design.md`

## Global constraints

- **Node** >= 26, **pnpm** exclusively (no npm/npx/yarn/bun).
- Lint must produce zero errors and zero warnings.
- `tracker-data.json` is generated; never hand-edit.
- `src/lib/components/ui/` is vendored shadcn-svelte; never edit.
- Use `type` imports (`consistent-type-imports`). Runes, not legacy stores.
- Season type: `"spring" | "summer" | "fall" | "winter"` (from `src/lib/types/tracker-data.ts`).

---

### Task 1: Type system — add new condition variants

**Files:**

- Modify: `src/lib/types/acquisition.ts:24-37` (AvailabilityCondition union)
- Modify: `src/lib/types/visibility.ts:1-17` (VisibilityCondition union)

**Interfaces:**

- Consumes: existing `Season` type from `src/lib/types/tracker-data.ts`
- Produces: three new variants in each union type, consumed by all later tasks

- [ ] **Step 1: Add variants to `AvailabilityCondition`**

In `src/lib/types/acquisition.ts`, add three new variants to the union (alphabetical order):

```typescript
export type AvailabilityCondition =
  | { type: "all"; conditions: NonEmptyArray<AvailabilityCondition> }
  | { type: "always" }
  | { type: "any"; conditions: NonEmptyArray<AvailabilityCondition> }
  | { type: "gamePredicate"; predicate: string; value: JsonValue }
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; npcId: NpcId }
  | { type: "isDating" }
  | { type: "minesLevel"; floor: number }
  | { type: "not"; condition: AvailabilityCondition }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "quest"; questId: QuestId; state: Omit<QuestVisibility, "unavailable"> }
  | { type: "reachedSeason"; season: Season }
  | { type: "season"; seasons: NonEmptyArray<Season> }
  | { type: "skillLevel"; level: number; skillId: SkillId }
  | { type: "time"; start: number; end: number }
  | { type: "weather"; weathers: Weather[] };
```

Add `Season` to the imports from `./tracker-data.js`.

- [ ] **Step 2: Add variants to `VisibilityCondition`**

In `src/lib/types/visibility.ts`, add three new variants (alphabetical order):

```typescript
export type VisibilityCondition =
  | { type: "always" }
  | { type: "and"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; npcId: NpcId }
  | { type: "isDating" }
  | { type: "married"; npcId: NpcId }
  | { type: "minesLevel"; floor: number }
  | { type: "npcKnown"; npcId: NpcId }
  | { type: "or"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "reachedSeason"; season: Season }
  | { type: "renownLevel"; level: number }
  | { type: "skillLevel"; level: number; skillId: SkillId };
```

Add `Season` to the imports from `./tracker-data.js` (alongside `NpcId`, `PerkId`, `QuestId`,
`SkillId`).

- [ ] **Step 3: Verify type errors surface**

Run: `pnpm run check 2>&1 | tail -30`

Expected: Type errors in every switch statement that exhaustively handles these unions. This
confirms the type system is guiding the remaining work. Do not fix them yet — later tasks handle
each switch.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/acquisition.ts src/lib/types/visibility.ts
git commit -m "feat: add hasUpperFloor, isDating, reachedSeason condition types

Closes #133 (types only — evaluators and pipeline follow)."
```

---

### Task 2: Engine evaluator — handle new visibility conditions

**Files:**

- Modify: `src/lib/engine/visibility.ts:13-23` (UserProgressionState interface)
- Modify: `src/lib/engine/visibility.ts:106-124` (isConditionInvertible)
- Modify: `src/lib/engine/visibility.ts:133-170` (isVisible)
- Modify: `src/lib/engine/visibility.ts:179-229` (satisfyCondition)
- Modify: `src/lib/engine/visibility.ts:304-338` (isBaseConditionMet)
- Modify: `src/lib/engine/visibility.ts:265-293` (evaluateQuestPrerequisites — temp state)
- Modify: `src/lib/engine/visibility.ts:26-102` (deriveProgressionState — temp states + return)
- Test: `src/lib/engine/__tests__/visibility.test.ts`

**Interfaces:**

- Consumes: `VisibilityCondition` with new variants (Task 1), `CompletedState` (modified in Task 3)
- Produces: updated `UserProgressionState` with `reachedSeason`, `hasUpperFloor`, `isDating` fields;
  updated `isVisible`, `satisfyCondition`, `isConditionInvertible`, `isBaseConditionMet`

- [ ] **Step 1: Add season ordering constant**

At the top of `src/lib/engine/visibility.ts`, after imports, add:

```typescript
const SEASON_ORD: Record<Season, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
```

Add `Season` to the imports from `$lib/types/tracker-data.js`.

- [ ] **Step 2: Extend `UserProgressionState`**

Add three fields to the interface at `visibility.ts:13-23`:

```typescript
export interface UserProgressionState {
  hasUpperFloor: boolean;
  isDating: boolean;
  knownNpcs: Set<NpcId>;
  marriedNpc: NpcId | null;
  minesFloor: number;
  npcLevels: Record<NpcId, number>;
  questVisibility: Record<QuestId, QuestVisibility>;
  reachedSeason: Season;
  renown: number;
  showSpoilers: boolean;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}
```

- [ ] **Step 3: Write failing tests for `isVisible` with new conditions**

In `src/lib/engine/__tests__/visibility.test.ts`, update `makeState` to include the new fields
(defaults: `reachedSeason: "spring"`, `hasUpperFloor: false`, `isDating: false`). Then add tests:

```typescript
describe("reachedSeason visibility", () => {
  it("returns true when reached season meets or exceeds required season", () => {
    const condition: VisibilityCondition = { type: "reachedSeason", season: "summer" };
    expect(isVisible(condition, makeState({ reachedSeason: "summer" }))).toBe(true);
    expect(isVisible(condition, makeState({ reachedSeason: "fall" }))).toBe(true);
    expect(isVisible(condition, makeState({ reachedSeason: "winter" }))).toBe(true);
  });

  it("returns false when reached season is before required season", () => {
    const condition: VisibilityCondition = { type: "reachedSeason", season: "fall" };
    expect(isVisible(condition, makeState({ reachedSeason: "spring" }))).toBe(false);
    expect(isVisible(condition, makeState({ reachedSeason: "summer" }))).toBe(false);
  });

  it("spring is always reachable (default state)", () => {
    const condition: VisibilityCondition = { type: "reachedSeason", season: "spring" };
    expect(isVisible(condition, makeState())).toBe(true);
  });
});

describe("hasUpperFloor visibility", () => {
  it("returns true when has upper floor", () => {
    expect(isVisible({ type: "hasUpperFloor" }, makeState({ hasUpperFloor: true }))).toBe(true);
  });

  it("returns false when does not have upper floor", () => {
    expect(isVisible({ type: "hasUpperFloor" }, makeState({ hasUpperFloor: false }))).toBe(false);
  });
});

describe("isDating visibility", () => {
  it("returns true when dating someone", () => {
    expect(isVisible({ type: "isDating" }, makeState({ isDating: true }))).toBe(true);
  });

  it("returns false when not dating", () => {
    expect(isVisible({ type: "isDating" }, makeState({ isDating: false }))).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/visibility.test.ts 2>&1 | tail -20`

Expected: Compile errors or test failures (switch not exhaustive, new fields missing).

- [ ] **Step 5: Implement `isVisible` cases**

Add to the switch in `isVisible` (visibility.ts, around line 142):

```typescript
case "hasUpperFloor":
  return state.hasUpperFloor;
case "isDating":
  return state.isDating;
case "reachedSeason":
  return SEASON_ORD[state.reachedSeason] >= SEASON_ORD[condition.season];
```

- [ ] **Step 6: Implement `isConditionInvertible` cases**

Add to the switch (around line 107):

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return true;
```

- [ ] **Step 7: Implement `satisfyCondition` cases**

Add to the switch (around line 184):

```typescript
case "hasUpperFloor":
  completed.hasUpperFloor = true;
  return;
case "isDating":
  return;
case "reachedSeason":
  if (SEASON_ORD[condition.season] > SEASON_ORD[completed.reachedSeason]) {
    completed.reachedSeason = condition.season;
  }
  return;
```

- [ ] **Step 8: Implement `isBaseConditionMet` cases**

Add to the switch (around line 309):

```typescript
case "hasUpperFloor":
  return completed.hasUpperFloor;
case "isDating":
  return completed.romanticNpcs.size > 0 || completed.marriedNpc !== null;
case "reachedSeason":
  return SEASON_ORD[completed.reachedSeason] >= SEASON_ORD[condition.season];
```

- [ ] **Step 9: Update `deriveProgressionState` and temp state constructors**

In `deriveProgressionState` (around line 26), add the new fields to the return value and the two
temp `UserProgressionState` objects (around lines 64 and 281):

```typescript
// In the return statement and temp states:
hasUpperFloor: completed.hasUpperFloor,
isDating: completed.romanticNpcs.size > 0 || completed.marriedNpc !== null,
reachedSeason: completed.reachedSeason,
```

- [ ] **Step 10: Write tests for `satisfyCondition` with new conditions**

```typescript
describe("satisfyCondition with new predicates", () => {
  it("satisfies reachedSeason by advancing to required season", () => {
    const completed = makeCompleted({ reachedSeason: "spring" });
    satisfyCondition({ type: "reachedSeason", season: "fall" }, completed, trackerData);
    expect(completed.reachedSeason).toBe("fall");
  });

  it("does not regress reachedSeason", () => {
    const completed = makeCompleted({ reachedSeason: "winter" });
    satisfyCondition({ type: "reachedSeason", season: "summer" }, completed, trackerData);
    expect(completed.reachedSeason).toBe("winter");
  });

  it("satisfies hasUpperFloor", () => {
    const completed = makeCompleted({ hasUpperFloor: false });
    satisfyCondition({ type: "hasUpperFloor" }, completed, trackerData);
    expect(completed.hasUpperFloor).toBe(true);
  });

  it("isDating is a no-op", () => {
    const completed = makeCompleted({ romanticNpcs: new Set() });
    satisfyCondition({ type: "isDating" }, completed, trackerData);
    expect(completed.romanticNpcs.size).toBe(0);
  });
});
```

- [ ] **Step 11: Run tests**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/visibility.test.ts 2>&1 | tail -20`

Expected: All new tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/lib/engine/visibility.ts src/lib/engine/__tests__/visibility.test.ts
git commit -m "feat: evaluate hasUpperFloor, isDating, reachedSeason visibility conditions"
```

---

### Task 3: User state — add fields to CompletedState, serialization, and merge

**Files:**

- Modify: `src/lib/stores/user-state.svelte.ts:32-48` (CompletedState)
- Modify: `src/lib/stores/user-state.svelte.ts:51-68` (MergeCounts)
- Modify: `src/lib/stores/user-state.svelte.ts:82-108` (SerializedState)
- Modify: `src/lib/stores/user-state.svelte.ts:137-163` (createDefaultCompleted)
- Modify: `src/lib/stores/user-state.svelte.ts:259-442` (mergeFromSave)
- Modify: `src/lib/stores/user-state.svelte.ts:459-476` (setters)
- Modify: `src/lib/stores/user-state.svelte.ts:474` (setSeason — auto-advance reachedSeason)
- Modify: `src/lib/stores/user-state.svelte.ts:563-596` (deserialize)
- Modify: `src/lib/stores/user-state.svelte.ts:611-644` (serialize)
- Modify: `src/lib/stores/user-state.svelte.ts:198-216` (hasAnyProgress)
- Test: `src/lib/stores/user-state.test.ts`
- Test: `src/lib/stores/user-state-hydration.test.ts`

**Interfaces:**

- Consumes: `UserProgressionState` with new fields (Task 2), `Season`, `NpcId`
- Produces: `CompletedState` with `reachedSeason`, `hasUpperFloor`, `romanticNpcs`; `MergeCounts`
  with `reachedSeason`, `hasUpperFloor`, `romanticNpcs`; new setters
  `setReachedSeason(season: Season)`, `setHasUpperFloor(value: boolean)`,
  `toggleRomanticNpc(npcId: NpcId)`

- [ ] **Step 1: Add fields to `CompletedState`**

```typescript
export interface CompletedState {
  almanac: Set<ItemId>;
  almanacRecipes: Set<RecipeId>;
  animalCosmetics: Record<AnimalId, Set<CosmeticId>>;
  animals: Record<AnimalId, Set<AnimalVariantId>>;
  cosmetics: Set<CosmeticId>;
  dates: Set<DateId>;
  hasUpperFloor: boolean;
  marriedNpc: NpcId | null;
  mines: { floor: number; spells: Set<SpellId> };
  museum: Set<ItemId>;
  npcLevels: Record<NpcId, number>;
  petCosmetics: Set<PetCosmeticSetId>;
  petSkins: Set<PetSkinId>;
  questStates: Record<QuestId, QuestState>;
  reachedSeason: Season;
  renown: number;
  romanticNpcs: Set<NpcId>;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}
```

- [ ] **Step 2: Add fields to `MergeCounts`**

```typescript
export interface MergeCounts {
  almanac: number;
  almanacRecipes: number;
  animalCosmetics: number;
  animals: number;
  cosmetics: number;
  dates: number;
  hasUpperFloor: number;
  mineFloor: number;
  museum: number;
  npcLevels: number;
  perks: number;
  petCosmetics: number;
  petSkins: number;
  quests: number;
  reachedSeason: number;
  renown: number;
  romanticNpcs: number;
  skillLevels: number;
  spells: number;
}
```

- [ ] **Step 3: Add fields to `SerializedState`**

In the `completed` block of `SerializedState`:

```typescript
hasUpperFloor?: boolean;
reachedSeason?: Season;
romanticNpcs?: string[];
```

All optional for backward compatibility.

- [ ] **Step 4: Update `createDefaultCompleted`**

Add to the return value:

```typescript
hasUpperFloor: false,
reachedSeason: "spring" as Season,
romanticNpcs: new SvelteSet<NpcId>(),
```

- [ ] **Step 5: Update `serialize`**

Add to the serialized completed object:

```typescript
hasUpperFloor: state.completed.hasUpperFloor,
reachedSeason: state.completed.reachedSeason,
romanticNpcs: [...state.completed.romanticNpcs].sort(),
```

- [ ] **Step 6: Update `deserialize`**

Add to the returned completed object (around line 579):

```typescript
hasUpperFloor: s.completed.hasUpperFloor ?? false,
reachedSeason: (s.completed.reachedSeason as Season | undefined) ?? "spring",
romanticNpcs: brandedSet<NpcId>(s.completed.romanticNpcs ?? []),
```

- [ ] **Step 7: Update `mergeFromSave`**

Initialize the new counts to 0 in the `counts` object. Add merge logic after the existing blocks:

```typescript
// Reached season (take later season)
if (imported.reachedSeason !== undefined) {
  const SEASON_ORD: Record<Season, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
  if (SEASON_ORD[imported.reachedSeason] > SEASON_ORD[state.completed.reachedSeason]) {
    state.completed.reachedSeason = imported.reachedSeason;
    counts.reachedSeason = 1;
  }
}

// Has upper floor (logical OR)
if (imported.hasUpperFloor && !state.completed.hasUpperFloor) {
  state.completed.hasUpperFloor = true;
  counts.hasUpperFloor = 1;
}

// Romantic NPCs (union)
if (imported.romanticNpcs) {
  for (const id of imported.romanticNpcs) {
    if (!state.completed.romanticNpcs.has(id)) {
      state.completed.romanticNpcs.add(id);
      counts.romanticNpcs++;
    }
  }
}
```

- [ ] **Step 8: Add setters**

Add after the existing `setSeason` method:

```typescript
setHasUpperFloor(value: boolean) {
  state.completed.hasUpperFloor = value;
},
setReachedSeason(season: Season) {
  const SEASON_ORD: Record<Season, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
  if (SEASON_ORD[season] > SEASON_ORD[state.completed.reachedSeason]) {
    state.completed.reachedSeason = season;
  }
},
toggleRomanticNpc(npcId: NpcId) {
  if (state.completed.romanticNpcs.has(npcId)) {
    state.completed.romanticNpcs.delete(npcId);
  } else {
    state.completed.romanticNpcs.add(npcId);
  }
},
```

- [ ] **Step 9: Update `setSeason` to auto-advance `reachedSeason`**

Modify the existing `setSeason`:

```typescript
setSeason(season: Season) {
  state.worldState.season = season;
  const SEASON_ORD: Record<Season, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
  if (SEASON_ORD[season] > SEASON_ORD[state.completed.reachedSeason]) {
    state.completed.reachedSeason = season;
  }
},
```

- [ ] **Step 10: Update `setMarriedNpc` to clear romantic NPCs**

```typescript
setMarriedNpc(npcId: NpcId | null) {
  state.completed.marriedNpc = npcId;
  if (npcId !== null) {
    state.completed.romanticNpcs.clear();
  }
},
```

- [ ] **Step 11: Update `hasAnyProgress`**

Add to the derived check:

```typescript
state.completed.hasUpperFloor ||
state.completed.reachedSeason !== "spring" ||
state.completed.romanticNpcs.size > 0 ||
```

- [ ] **Step 12: Fix all `makeCompleted` helpers in test files**

Update `makeCompleted` in both `visibility.test.ts` and `transfer.test.ts` to include the new
defaults:

```typescript
hasUpperFloor: false,
reachedSeason: "spring" as Season,
romanticNpcs: new Set(),
```

Also update the `import-save.test.ts` helper if it has one.

- [ ] **Step 13: Run tests**

Run: `pnpm run test:app 2>&1 | tail -30`

Expected: All tests pass (existing + new serialization behavior).

- [ ] **Step 14: Commit**

```bash
git add src/lib/stores/user-state.svelte.ts src/lib/stores/*.test.ts src/lib/engine/__tests__/*.test.ts
git commit -m "feat: add reachedSeason, hasUpperFloor, romanticNpcs to CompletedState"
```

---

### Task 4: Availability condition evaluator — handle new types in switch statements

**Files:**

- Modify: `src/lib/engine/availability-condition.ts:30-76` (evaluateAvailabilityCondition)
- Modify: `src/lib/engine/availability-condition.ts:84-108` (hasTimelyCondition)
- Modify: `src/lib/engine/availability-condition.ts:110-157` (simplifyAvailabilityCondition)
- Modify: `src/lib/engine/availability-condition.ts:159-188` (collectBadges)
- Test: `src/lib/engine/__tests__/availability-condition.test.ts`

**Interfaces:**

- Consumes: `AvailabilityCondition` with new variants (Task 1)
- Produces: exhaustive switch coverage for all condition types

- [ ] **Step 1: Write failing test**

In `availability-condition.test.ts`, add:

```typescript
describe("new progression condition types", () => {
  it.each([
    { type: "hasUpperFloor" },
    { type: "isDating" },
    { type: "reachedSeason", season: "summer" },
  ] as const)("evaluates %s as unknown (no availability context)", (condition) => {
    expect(evaluateAvailabilityCondition(condition as AvailabilityCondition, {})).toBe("unknown");
  });

  it.each([
    { type: "hasUpperFloor" },
    { type: "isDating" },
    { type: "reachedSeason", season: "summer" },
  ] as const)("%s is not timely", (condition) => {
    expect(hasTimelyCondition(condition as AvailabilityCondition)).toBe(false);
  });

  it.each([
    { type: "hasUpperFloor" },
    { type: "isDating" },
    { type: "reachedSeason", season: "summer" },
  ] as const)("simplify passes through %s unchanged", (condition) => {
    expect(simplifyAvailabilityCondition(condition as AvailabilityCondition)).toEqual(condition);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:
`pnpm run test:app -- --run src/lib/engine/__tests__/availability-condition.test.ts 2>&1 | tail -20`

- [ ] **Step 3: Add cases to all switch statements**

In `evaluateAvailabilityCondition`:

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return "unknown";
```

In `hasTimelyCondition`:

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return false;
```

In `simplifyAvailabilityCondition` (alongside `heartLevel`, `minesLevel`, etc.):

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return condition;
```

In `collectBadges` (alongside `heartLevel`, `minesLevel`, etc.):

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  break;
```

- [ ] **Step 4: Run tests**

Run:
`pnpm run test:app -- --run src/lib/engine/__tests__/availability-condition.test.ts 2>&1 | tail -20`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/availability-condition.ts src/lib/engine/__tests__/availability-condition.test.ts
git commit -m "feat: handle new condition types in availability evaluator switches"
```

---

### Task 5: Pipeline — map predicates to typed conditions

**Files:**

- Modify: `pipeline/src/acquisition/availability.ts:115-192` (projectPredicate)
- Modify: `pipeline/src/extractors/visibility/cutscene-quest-map.ts` (explicit override)
- Modify: `pipeline/src/extractors/visibility/availability-projection.ts:8-38`
  (availabilityToVisibility)
- Modify: `pipeline/src/extractors/visibility/availability-projection.ts:40-64`
  (toAvailableVisibility)
- Modify: `pipeline/src/acquisition/validate-sources.ts:54-68` (AVAILABILITY_FIELDS)
- Modify: `pipeline/src/acquisition/validate-sources.ts:620-625` (gamePredicate switch)
- Test: `pipeline/src/acquisition/availability.test.ts`
- Test: `pipeline/src/extractors/visibility/availability-projection.test.ts`

**Interfaces:**

- Consumes: `AvailabilityCondition` and `VisibilityCondition` with new variants (Task 1)
- Produces: pipeline emits typed conditions instead of `gamePredicate` for the five families;
  `availabilityToVisibility` maps new types 1:1

- [ ] **Step 1: Add `destroy_vines_eastern_road` to cutscene quest map**

In `buildCutsceneQuestMap` in `cutscene-quest-map.ts`, add an explicit override after the existing
Source 3 block (before the console.log):

```typescript
// Explicit overrides for cutscenes that cannot be derived from quest data
if (!("destroy_vines_eastern_road" in map)) {
  map["destroy_vines_eastern_road"] = {
    phase: "completed",
    questId: "breaking_the_fire_seal" as QuestId,
  };
}
```

- [ ] **Step 2: Write failing tests for `projectPredicate` new cases**

In `pipeline/src/acquisition/availability.test.ts`, add tests for each predicate:

```typescript
it("maps reached_date with season string to reachedSeason", () => {
  const result = projectRequirementExpressionToAvailability(
    { predicate: "reached_date", value: "summer" },
    context,
    sourceLocation,
  );
  expect(result).toEqual({ type: "reachedSeason", season: "summer" });
});

it("throws on reached_date with object value (day-level granularity)", () => {
  expect(() =>
    projectRequirementExpressionToAvailability(
      { predicate: "reached_date", value: { season: "spring", day: 5 } },
      context,
      sourceLocation,
    ),
  ).toThrow();
});

it("maps has_upper_floor to hasUpperFloor", () => {
  const result = projectRequirementExpressionToAvailability(
    { predicate: "has_upper_floor", value: true },
    context,
    sourceLocation,
  );
  expect(result).toEqual({ type: "hasUpperFloor" });
});

it("maps is_dating_someone to isDating", () => {
  const result = projectRequirementExpressionToAvailability(
    { predicate: "is_dating_someone", value: true },
    context,
    sourceLocation,
  );
  expect(result).toEqual({ type: "isDating" });
});

it("maps unlocked_animal to repair_haydens_barn quest", () => {
  const result = projectRequirementExpressionToAvailability(
    { predicate: "unlocked_animal", value: "duck" },
    context,
    sourceLocation,
  );
  expect(result).toEqual({
    type: "quest",
    questId: "repair_haydens_barn",
    state: "completed",
  });
});

it("maps seen_cutscene elsie_dating_tutorial to isDating", () => {
  const result = projectRequirementExpressionToAvailability(
    { predicate: "seen_cutscene", value: "elsie_dating_tutorial" },
    { ...context, cutsceneMap: {} },
    sourceLocation,
  );
  expect(result).toEqual({ type: "isDating" });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run: `pnpm run test:pipeline -- --run pipeline/src/acquisition/availability.test.ts 2>&1 | tail -20`

- [ ] **Step 4: Implement `projectPredicate` cases**

Add to `projectPredicate` in `availability.ts`, before the final `gamePredicate` fallback:

```typescript
case "has_upper_floor":
  if (jsonValue === true) {
    return { type: "hasUpperFloor" };
  }
  break;
case "is_dating_someone":
  if (jsonValue === true) {
    return { type: "isDating" };
  }
  break;
case "reached_date": {
  if (typeof jsonValue === "string" && ALL_SEASONS.has(jsonValue as Season)) {
    return { type: "reachedSeason", season: jsonValue as Season };
  }
  if (typeof jsonValue === "object" && jsonValue !== null) {
    throw new Error(
      `Day-level reached_date is not supported at ${sourceFieldPath(sourceLocation, predicate)} in ${sourceLocation.sourcePath}`,
    );
  }
  break;
}
case "unlocked_animal":
  if (typeof jsonValue === "string") {
    return { type: "quest", questId: "repair_haydens_barn" as QuestId, state: "completed" };
  }
  break;
```

Also update the `seen_cutscene` case to handle `"elsie_dating_tutorial"`:

```typescript
case "seen_cutscene":
  if (typeof jsonValue === "string") {
    if (jsonValue === "elsie_dating_tutorial") {
      return { type: "isDating" };
    }
    const cutscene = context.cutsceneMap[jsonValue];
    if (cutscene) {
      return { type: "quest", questId: cutscene.questId, state: cutscene.phase };
    }
  }
  break;
```

Add `QuestId` to the imports if not already present. Add `Season` to the `ALL_SEASONS` import or
verify it exists (it does — it's already defined at line 18).

- [ ] **Step 5: Update `availabilityToVisibility`**

In `availability-projection.ts`, add cases to `availabilityToVisibility`:

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return condition;
```

These three types are shared between `AvailabilityCondition` and `VisibilityCondition`, so 1:1
passthrough works.

Add to `toAvailableVisibility`:

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return condition;
```

- [ ] **Step 6: Update `AVAILABILITY_FIELDS` in `validate-sources.ts`**

Add to the `AVAILABILITY_FIELDS` record:

```typescript
hasUpperFloor: [],
isDating: [],
reachedSeason: ["season"],
```

Add the new types to the validation switch (around line 620) alongside the no-op cases:

```typescript
case "hasUpperFloor":
case "isDating":
  return;
case "reachedSeason":
  requireString(value, "season", targetId, fieldPath, source, diagnostics);
  return;
```

- [ ] **Step 7: Write tests for availability projection**

In `availability-projection.test.ts`, add to the `"projects supported leaf"` test array:

```typescript
[
  { type: "hasUpperFloor" },
  { type: "hasUpperFloor" },
],
[
  { type: "isDating" },
  { type: "isDating" },
],
[
  { type: "reachedSeason", season: "fall" },
  { type: "reachedSeason", season: "fall" },
],
```

- [ ] **Step 8: Run all pipeline tests**

Run: `pnpm run test:pipeline 2>&1 | tail -30`

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add pipeline/src/acquisition/availability.ts pipeline/src/extractors/visibility/cutscene-quest-map.ts pipeline/src/extractors/visibility/availability-projection.ts pipeline/src/acquisition/validate-sources.ts pipeline/src/acquisition/availability.test.ts pipeline/src/extractors/visibility/availability-projection.test.ts
git commit -m "feat: map all five predicate families to typed availability conditions"
```

---

### Task 6: Source segments rendering and remaining switch exhaustiveness

**Files:**

- Modify: `src/lib/utils/source-segments.ts:535-564` (describeStoreAvailability)
- Modify: `src/lib/data/source-rendering.invariants.test.ts:69-92` (collectGamePredicates)
- Modify: `src/lib/data/source-rendering.invariants.test.ts:210-237` (diagnostic assertion)

**Interfaces:**

- Consumes: `AvailabilityCondition` with new variants (Task 1)
- Produces: source segments render new condition types; diagnostic asserts zero gamePredicates

- [ ] **Step 1: Add cases to `describeStoreAvailability` in source-segments.ts**

Find the switch at around line 535 and add (the user will copy-edit these strings later):

```typescript
case "hasUpperFloor":
  return [", after upgrading your home"];
case "isDating":
  return [", while dating someone"];
case "reachedSeason": {
  const seasonName = condition.season.charAt(0).toUpperCase() + condition.season.slice(1);
  return [`, after reaching ${seasonName}`];
}
```

- [ ] **Step 2: Add cases to `collectGamePredicates`**

In `source-rendering.invariants.test.ts`, update `collectGamePredicates` to handle the new types
(they produce no game predicates, same as `heartLevel` etc.):

```typescript
case "hasUpperFloor":
case "isDating":
case "reachedSeason":
  return [];
```

- [ ] **Step 3: Regenerate tracker data**

Run: `pnpm run pipeline -- pipeline/input 2>&1 | tail -10`

This regenerates `tracker-data.json` with the new typed conditions instead of `gamePredicate`.

- [ ] **Step 4: Update the diagnostic assertion**

Change the invariant test assertion from 97 records / 5 families to 0:

```typescript
it("has no unsupported predicate diagnostics", () => {
  const diagnostics: UnsupportedPredicateDiagnostic[] = sourcedEntities
    .flatMap(({ entity, path }) => {
      const { entityId, entityKind } = pathIdentity(path);
      return entity.sources.flatMap((source, sourceIndex) =>
        collectGamePredicates("availability" in source ? source.availability : undefined).map(
          ({ predicate }) => ({ entityId, entityKind, predicate, sourceIndex }),
        ),
      );
    })
    .sort(
      (left, right) =>
        left.predicate.localeCompare(right.predicate) ||
        left.entityKind.localeCompare(right.entityKind) ||
        left.entityId.localeCompare(right.entityId) ||
        left.sourceIndex - right.sourceIndex,
    );
  const details = JSON.stringify(diagnostics, null, 2);

  expect(diagnostics, details).toHaveLength(0);
});
```

- [ ] **Step 5: Run full app tests**

Run: `pnpm run test:app 2>&1 | tail -30`

Expected: All pass, including the updated diagnostic.

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/source-segments.ts src/lib/data/source-rendering.invariants.test.ts src/lib/data/tracker-data.json
git commit -m "feat: render new condition types in source segments, zero unsupported predicates"
```

---

### Task 7: Transfer encoding v5 — encode and decode new fields

**Files:**

- Modify: `src/lib/engine/transfer.ts:20` (TRANSFER_VERSION)
- Modify: `src/lib/engine/transfer.ts:26-188` (decodeTransferPayload)
- Modify: `src/lib/engine/transfer.ts:190-318` (encodeTransferPayload)
- Modify: `src/lib/engine/transfer.ts:430-490` (ordering functions)
- Test: `src/lib/engine/__tests__/transfer.test.ts`

**Interfaces:**

- Consumes: `CompletedState` with new fields (Task 3)
- Produces: v5 transfer codec; backward-compatible decoding of v1–v4

- [ ] **Step 1: Write failing tests**

In `transfer.test.ts`, update `makeCompleted` to include new defaults, add `Season` import, then:

```typescript
describe("transfer codec v5", () => {
  it("has version 5", () => {
    expect(TRANSFER_VERSION).toBe(5);
  });

  it("round-trips reachedSeason", async () => {
    const completed = makeCompleted({ reachedSeason: "fall" as Season });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.reachedSeason).toBe("fall");
  });

  it("round-trips hasUpperFloor", async () => {
    const completed = makeCompleted({ hasUpperFloor: true });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.hasUpperFloor).toBe(true);
  });

  it("round-trips romanticNpcs", async () => {
    const completed = makeCompleted({
      romanticNpcs: new Set(["juniper" as NpcId, "march" as NpcId]),
    });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.romanticNpcs).toEqual(new Set(["juniper", "march"]));
  });

  it("round-trips empty romanticNpcs", async () => {
    const completed = makeCompleted({ romanticNpcs: new Set() });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.romanticNpcs).toEqual(new Set());
  });

  it("decodes v1 payload with default new fields", async () => {
    const decoded = await decodeTransferPayload(V1_FIXTURE);
    expect(decoded.reachedSeason).toBe("spring");
    expect(decoded.hasUpperFloor).toBe(false);
    expect(decoded.romanticNpcs).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/transfer.test.ts 2>&1 | tail -20`

- [ ] **Step 3: Bump version and add ordering function**

```typescript
export const TRANSFER_VERSION = 5;
```

Add a `getDateableNpcOrder` function alongside the other ordering functions:

```typescript
function getDateableNpcOrder(): NpcId[] {
  return (Object.keys(trackerData.npcs) as NpcId[])
    .filter((id) => trackerData.npcs[id].dateable === true)
    .sort();
}
```

- [ ] **Step 4: Add decode logic for v5**

After the v4 date bitfield block (around line 169), add:

```typescript
// 17. Progression byte (v5) — bits 7-6: reachedSeason, bit 5: hasUpperFloor
// 18. Romantic NPCs bitfield (v5)
let reachedSeason: Season = "spring";
let hasUpperFloor = false;
let romanticNpcs = new Set<NpcId>();

if (version >= 5) {
  const SEASON_BY_ORD: Season[] = ["spring", "summer", "fall", "winter"];
  const progressionByte = readBytes(1)[0];
  reachedSeason = SEASON_BY_ORD[(progressionByte >> 6) & 0x3] ?? "spring";
  hasUpperFloor = (progressionByte & 0x20) !== 0;

  const dateableNpcOrder = getDateableNpcOrder();
  const romanticBytes = readBytes(Math.ceil(dateableNpcOrder.length / 8));
  romanticNpcs = fromBitfield(dateableNpcOrder, romanticBytes) as Set<NpcId>;
}
```

Add the new fields to the return value:

```typescript
return {
  almanac,
  animalCosmetics,
  animals,
  cosmetics,
  dates,
  hasUpperFloor,
  marriedNpc,
  mines: { floor, spells },
  museum,
  npcLevels,
  petCosmetics,
  petSkins,
  questStates,
  reachedSeason,
  renown,
  romanticNpcs,
  skillLevels,
  unlockedPerks,
};
```

- [ ] **Step 5: Add encode logic for v5**

After the date bitfield encode (around line 300), add:

```typescript
// 17. Progression byte (new in v5) — bits 7-6: reachedSeason, bit 5: hasUpperFloor
const SEASON_ORD: Record<Season, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };
let progressionByte = (SEASON_ORD[completed.reachedSeason] & 0x3) << 6;
if (completed.hasUpperFloor) progressionByte |= 0x20;
parts.push(new Uint8Array([progressionByte]));

// 18. Romantic NPCs bitfield (new in v5)
const dateableNpcOrder = getDateableNpcOrder();
parts.push(toBitfield(dateableNpcOrder, completed.romanticNpcs));
```

- [ ] **Step 6: Update version check in decoder**

Update the version guard at the top of `decodeTransferPayload`:

```typescript
if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) {
```

- [ ] **Step 7: Run tests**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/transfer.test.ts 2>&1 | tail -20`

Expected: All pass, including backward-compatible v1 decoding.

- [ ] **Step 8: Commit**

```bash
git add src/lib/engine/transfer.ts src/lib/engine/__tests__/transfer.test.ts
git commit -m "feat: transfer encoding v5 — reachedSeason, hasUpperFloor, romanticNpcs"
```

---

### Task 8: Save import — extract new fields from game save data

**Files:**

- Modify: `src/lib/engine/import-save.ts:33-37` (GamedataSave — no changes needed, `t2_world_facts`
  is `Record<string, unknown>`)
- Modify: `src/lib/engine/import-save.ts:60-340` (buildImportState)
- Test: `src/lib/engine/__tests__/import-save.test.ts`

**Interfaces:**

- Consumes: `CompletedState` with new fields (Task 3), `MergeCounts` with new fields (Task 3)
- Produces: save import extracts `reachedSeason`, `hasUpperFloor`, `romanticNpcs`

- [ ] **Step 1: Write failing tests**

In `import-save.test.ts`, add tests:

```typescript
describe("new progression fields from save", () => {
  it("extracts hasUpperFloor from t2_world_facts", () => {
    const bundle: SaveBundle = {
      gamedata: { t2_world_facts: { has_upper_floor: true } },
    };
    const { completed } = buildImportState(bundle);
    expect(completed.hasUpperFloor).toBe(true);
  });

  it("defaults hasUpperFloor to false when missing", () => {
    const bundle: SaveBundle = {
      gamedata: { t2_world_facts: {} },
    };
    const { completed } = buildImportState(bundle);
    expect(completed.hasUpperFloor).toBe(false);
  });

  it("extracts romanticNpcs from t2_world_facts dating keys", () => {
    const bundle: SaveBundle = {
      gamedata: {
        t2_world_facts: {
          juniper_is_dating: true,
          march_is_dating: true,
          adeline_is_dating: false,
        },
      },
    };
    const { completed } = buildImportState(bundle);
    expect(completed.romanticNpcs).toEqual(new Set(["juniper", "march"]));
  });

  it("extracts reachedSeason from t2_world_facts current_season", () => {
    const bundle: SaveBundle = {
      gamedata: { t2_world_facts: { current_season: "fall" } },
    };
    const { completed } = buildImportState(bundle);
    expect(completed.reachedSeason).toBe("fall");
  });

  it("defaults reachedSeason to spring when missing", () => {
    const bundle: SaveBundle = { gamedata: { t2_world_facts: {} } };
    const { completed } = buildImportState(bundle);
    expect(completed.reachedSeason).toBe("spring");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/import-save.test.ts 2>&1 | tail -20`

- [ ] **Step 3: Implement extraction**

In `buildImportState`, after the renown extraction block (around line 290), add:

```typescript
// ── Has upper floor (from gamedata.json → t2_world_facts) ──
const hasUpperFloor = facts?.has_upper_floor === true;

// ── Romantic NPCs (from gamedata.json → t2_world_facts → {npc}_is_dating) ──
const romanticNpcs = new Set<NpcId>();
if (facts) {
  const dateableNpcs = Object.entries(trackerData.npcs)
    .filter(([, npc]) => npc.dateable === true)
    .map(([id]) => id);
  for (const npcId of dateableNpcs) {
    if (facts[`${npcId}_is_dating`] === true) {
      romanticNpcs.add(npcId as NpcId);
    }
  }
}

// ── Reached season (from gamedata.json → t2_world_facts → current_season) ──
const VALID_SEASONS = new Set(["spring", "summer", "fall", "winter"]);
const reachedSeason: Season = (
  typeof facts?.current_season === "string" && VALID_SEASONS.has(facts.current_season)
    ? facts.current_season
    : "spring"
) as Season;
```

Add `Season` to the imports from `$lib/types/tracker-data.js`. Add `NpcId` if not already imported.

Add these fields to the returned `completed` object:

```typescript
hasUpperFloor,
reachedSeason,
romanticNpcs,
```

Update `counts` initialization to include:

```typescript
hasUpperFloor: 0,
reachedSeason: 0,
romanticNpcs: 0,
```

And set the counts:

```typescript
if (hasUpperFloor) counts.hasUpperFloor = 1;
if (reachedSeason !== "spring") counts.reachedSeason = 1;
counts.romanticNpcs = romanticNpcs.size;
```

- [ ] **Step 4: Run tests**

Run: `pnpm run test:app -- --run src/lib/engine/__tests__/import-save.test.ts 2>&1 | tail -20`

Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/import-save.ts src/lib/engine/__tests__/import-save.test.ts
git commit -m "feat: extract reachedSeason, hasUpperFloor, romanticNpcs from save data"
```

---

### Task 9: Full verification and pipeline regeneration

**Files:**

- Modify: `src/lib/data/tracker-data.json` (regenerated)
- All modified files from previous tasks

**Interfaces:**

- Consumes: everything from Tasks 1–8
- Produces: clean build, clean lint, all tests green, zero unsupported predicates

- [ ] **Step 1: Regenerate tracker data**

Run: `pnpm run pipeline -- pipeline/input 2>&1 | tail -10`

Verify the cutscene map log line shows a higher count than before (the `destroy_vines_eastern_road`
override was added).

- [ ] **Step 2: Verify zero gamePredicate in generated data**

Run:
`node -e "const d=require('./src/lib/data/tracker-data.json'); function walk(o){if(!o||typeof o!=='object')return 0; if(o.type==='gamePredicate')return 1; return Object.values(o).reduce((s,v)=>s+walk(v),0)} console.log('gamePredicate count:', walk(d))"`

Expected: `gamePredicate count: 0`

- [ ] **Step 3: Run full test suite**

Run: `pnpm run test 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 4: Run lint**

Run: `pnpm run lint 2>&1 | tail -30`

Expected: Zero errors, zero warnings.

- [ ] **Step 5: Run type check**

Run: `pnpm run check 2>&1 | tail -30`

Expected: No errors.

- [ ] **Step 6: Run build**

Run: `pnpm run build 2>&1 | tail -30`

Expected: Clean build.

- [ ] **Step 7: Commit regenerated data**

```bash
git add src/lib/data/tracker-data.json
git commit -m "chore: regenerate tracker-data.json with resolved predicates"
```
