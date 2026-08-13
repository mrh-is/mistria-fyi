# Spoiler system (progressive disclosure) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a pipeline-computed visibility system that redacts tracker content based on the
player's progression, with an app-side evaluator and UI integration across all category pages.

**Architecture:** The pipeline emits a `visibility: VisibilityCondition` field on every content
entity in `tracker-data.json`. A pure evaluator in `src/lib/engine/visibility.ts` takes a condition +
`UserProgressionState` (derived from `CompletedState` + tracker data) and returns a boolean. UI
components check visibility to render items as redacted, partially disclosed, or fully visible. No
game-data joining happens at runtime.

**Tech stack:** SvelteKit 2, Svelte 5 (runes), TypeScript (strict + `strictTypeChecked` ESLint),
Vitest, pnpm

## Global constraints

- Use **pnpm** for all commands (never npm/npx).
- **Strict TypeScript** with `consistent-type-imports`. Use `type` imports for type-only values.
- **Formatting:** Prettier — double quotes, no tabs, trailing commas, 100-char width, semicolons.
- **Naming:** `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs (`ItemId`, `QuestId`, etc.) for type safety.
- Run `pnpm run check` and `pnpm run lint:fix` after every task.
- Run `pnpm exec vitest run pipeline/` for pipeline tests.
- Sort all output arrays/objects deterministically (by ID or name) for stable output.
- Pipeline extractors throw on unexpected data — never fabricate fallback text.
- Existing `questGate` field on `items`/`animals`/`spells` is superseded by `visibility` and should
  be removed once all consumers migrate.

## File structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/types/tracker-data.ts` | Modify (Task 1) | Add `VisibilityCondition` type, `visibility` fields on entities, `storeVisibility`, `questChains`, `npcVisibility`, `heartLevelChanges` to `TrackerData` |
| `src/lib/types/visibility.ts` | Create (Task 1) | `VisibilityCondition` type union, exported separately for pipeline + app use |
| `pipeline/src/extractors/visibility/` | Create (Tasks 2–5) | New extraction modules for visibility conditions |
| `pipeline/src/extractors/visibility/cutscene-quest-map.ts` | Create (Task 2) | Cutscene-to-quest bidirectional index |
| `pipeline/src/extractors/visibility/cutscene-quest-map.test.ts` | Create (Task 2) | Tests for cutscene mapping |
| `pipeline/src/extractors/visibility/quest-chains.ts` | Create (Task 3) | Quest chain ordering extraction from letters + registries |
| `pipeline/src/extractors/visibility/quest-chains.test.ts` | Create (Task 3) | Tests for chain extraction |
| `pipeline/src/extractors/visibility/requirement-resolver.ts` | Create (Task 4) | Converts `RequirementExpression` → `VisibilityCondition` with boolean simplification |
| `pipeline/src/extractors/visibility/requirement-resolver.test.ts` | Create (Task 4) | Tests for requirement resolution |
| `pipeline/src/extractors/visibility/entity-visibility.ts` | Create (Task 5) | Assigns `visibility` to stores, NPCs, items, recipes, perks, cosmetics, quests, animals |
| `pipeline/src/extractors/visibility/entity-visibility.test.ts` | Create (Task 5) | Tests for entity visibility assignment |
| `pipeline/src/main.ts` | Modify (Task 5) | Wire visibility extraction into pipeline |
| `src/lib/engine/visibility.ts` | Create (Task 6) | `isVisible`, `isEntityNameVisible`, `isSourceDetailVisible`, `deriveProgressionState` |
| `src/lib/engine/__tests__/visibility.test.ts` | Create (Task 6) | Tests for evaluator + progression derivation |
| `src/lib/stores/user-state.svelte.ts` | Modify (Task 7) | Add `unlockedPerks`, `marriedNpc` to `CompletedState`; serialize/deserialize; new methods |
| `src/lib/engine/transfer.ts` | Modify (Task 7) | Bump to version 2, add perk bitfield |
| `src/lib/engine/__tests__/transfer.test.ts` | Modify (Task 7) | v1/v2 round-trip tests |
| `src/lib/engine/import-save.ts` | Modify (Task 8) | Import perks from `player.perks` |
| `src/lib/engine/search.ts` | Modify (Task 9) | Filter redacted entities from search results |
| `src/lib/components/redacted-row.svelte` | Create (Task 9) | Redacted item row component |
| `src/lib/components/confirm-redacted-dialog.svelte` | Create (Task 9) | "Complete redacted item" confirmation dialog |
| `src/lib/components/quests-content.svelte` | Modify (Task 10) | Integrate visibility into quest rendering |
| Various category content components | Modify (Task 10) | Integrate redacted row rendering |

---

### Task 1: Types — `VisibilityCondition` & `TrackerData` extensions

Add the visibility condition type system and extend `TrackerData` to carry visibility data.

**Files:**

- Create: `src/lib/types/visibility.ts`
- Modify: `src/lib/types/tracker-data.ts`

**Interfaces:**

- Produces:
  - `VisibilityCondition` — discriminated union with 13 variants (`always`, `questCompleted`,
    `questAvailable`, `npcKnown`, `skillLevel`, `perkUnlocked`, `minesLevel`, `heartLevel`,
    `renownLevel`, `married`, `and`, `or`)
  - `QuestVisibility` — `"unavailable" | "available" | "completed"`
  - Extended `TrackerData` with `storeVisibility`, `questChains`, `npcVisibility`,
    `heartLevelChanges`
  - `visibility` field on existing entity types

- [ ] **Step 1: Create the `VisibilityCondition` type**

```ts
// src/lib/types/visibility.ts
import type { NpcId, PerkId, QuestId, SkillId } from "./tracker-data.js";

export type VisibilityCondition =
  | { type: "always" }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "npcKnown"; npcId: NpcId }
  | { type: "skillLevel"; skillId: SkillId; level: number }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "minesLevel"; floor: number }
  | { type: "heartLevel"; npcId: NpcId; level: number }
  | { type: "renownLevel"; level: number }
  | { type: "married"; npcId: NpcId }
  | { type: "and"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "or"; conditions: [VisibilityCondition, ...VisibilityCondition[]] };

export type QuestVisibility = "unavailable" | "available" | "completed";
```

- [ ] **Step 2: Extend `TrackerData` with visibility fields**

Add `visibility` to entity types and new top-level fields. In `tracker-data.ts`:

```ts
import type { VisibilityCondition } from "./visibility.js";
```

Add `visibility?: VisibilityCondition` to:
- `TrackerData.items[id]` entries (alongside `category`, `name`, `questGate`, `recipeId`) — this is
  the primary entity map iterated by search, availability checks, and all content components
- `AlmanacCategory.items[id]` entries (alongside `name`, `colorCount`, `recipeId`)
- `Recipe` (top-level, alongside `sources`)
- `RecipeSource` base (add to each variant as optional field)
- `TrackerData.cosmetics[id]` entries
- `TrackerData.perks[id]` entries
- `TrackerData.animals[id]` entries
- `TrackerData.mines.spells[id]` entries
- `TrackerData.quests[type][id]` entries

Do NOT add `visibility` to `TrackerData.npcs[id]` entries. NPC visibility lives exclusively in the
top-level `npcVisibility: Record<NpcId, VisibilityCondition>` field (see below) to avoid a dead
duplicate field that is never populated.

Add new top-level `TrackerData` fields:

```ts
interface TrackerData {
  // ... existing fields ...
  storeVisibility: Record<StoreId, VisibilityCondition>;
  questChains: {
    story: Record<QuestId, { prerequisites: QuestId[] }>;
    crown: QuestId[];
    stillwell: QuestId[];
    tali: QuestId[];
    heart: Record<NpcId, { questId: QuestId; heartLevel: number; prerequisiteQuest?: QuestId }[]>;
    fetch: Record<QuestId, VisibilityCondition>; // Populated in Task 5, NOT Task 3
  };
  npcVisibility: Record<NpcId, VisibilityCondition>;
  heartLevelChanges: Record<QuestId, { npcId: NpcId; level: number }[]>;
  categoryVisibility: Record<string, VisibilityCondition>;
}
```

- [ ] **Step 3: Run `pnpm run check` to verify types compile**

Expected: type errors in pipeline extractors and `main.ts` because the new `TrackerData` fields are
required but not yet populated. This is expected; they will be populated in Tasks 2–5. Add
placeholder empty objects/records in `main.ts` temporarily to get types passing:

```ts
// In main.ts, add to the trackerData assembly:
storeVisibility: {},
questChains: { story: {}, crown: [], stillwell: [], tali: [], heart: {}, fetch: {} },
npcVisibility: {},
heartLevelChanges: {},
categoryVisibility: {},
```

- [ ] **Step 4: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/visibility.ts src/lib/types/tracker-data.ts pipeline/src/main.ts
git commit -m "add VisibilityCondition type and TrackerData visibility fields"
```

---

### Task 2: Pipeline — cutscene-to-quest mapping

Build a bidirectional index between cutscenes and quests. This is a dependency for requirement
resolution (Task 4) which needs to convert `seen_cutscene` predicates into `questCompleted` /
`questAvailable` conditions.

**Files:**

- Create: `pipeline/src/extractors/visibility/cutscene-quest-map.ts`
- Create: `pipeline/src/extractors/visibility/cutscene-quest-map.test.ts`

**Interfaces:**

- Consumes: `ParsedGameData` (fiddle data with `quests`, `cutscenes` TOML sections)
- Produces:
  - `CutsceneQuestMap` — `Record<string, { questId: QuestId; phase: "available" | "completed" }>`
  - `buildCutsceneQuestMap(fiddle: ParsedGameData): CutsceneQuestMap`

- [ ] **Step 1: Write failing tests for cutscene-quest mapping**

```ts
// pipeline/src/extractors/visibility/cutscene-quest-map.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { buildCutsceneQuestMap } from "./cutscene-quest-map.js";

import type { QuestId } from "$lib/types/tracker-data.js";

// Minimal fiddle factory for cutscene tests
function makeCutsceneFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    cutscenes: { cutscenes: overrides.cutscenes ?? {} },
    quests: overrides.quests ?? {},
    ...overrides,
  };
}

describe("buildCutsceneQuestMap", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("maps explicit quest_to_start on cutscene", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        my_cutscene: { quest_to_start: "some_quest" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.my_cutscene).toEqual({
      questId: "some_quest",
      phase: "available",
    });
  });

  it("maps explicit quest_to_progress on cutscene", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        repair_the_inn_pt_2: { quest_to_progress: "repair_the_inn" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.repair_the_inn_pt_2).toEqual({
      questId: "repair_the_inn",
      phase: "completed",
    });
  });

  it("maps quest stage cutscene references", () => {
    const fiddle = makeCutsceneFiddle({
      quests: {
        story_quests: {
          some_quest: {
            stages: [{ queries: [{ cutscene: "quest_start_scene" }] }],
          },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.quest_start_scene).toEqual({
      questId: "some_quest",
      phase: "available",
    });
  });

  it("maps _pt_2 naming convention to completed phase", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        repair_the_general_store_pt_2: {},
      },
      quests: {
        story_quests: {
          repair_the_general_store: { stages: [] },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.repair_the_general_store_pt_2).toEqual({
      questId: "repair_the_general_store",
      phase: "completed",
    });
  });

  it("handles priestess_quarters override to find_the_magic_key", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        priestess_quarters_pt_2: { quest_to_progress: "find_the_magic_key" },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.priestess_quarters_pt_2).toEqual({
      questId: "find_the_magic_key",
      phase: "completed",
    });
  });

  it("skips unmappable cutscenes like the_unusual_tree", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        the_unusual_tree_pt_1: {},
        the_unusual_tree_pt_2: {},
      },
      quests: {},
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.the_unusual_tree_pt_1).toBeUndefined();
    expect(map.the_unusual_tree_pt_2).toBeUndefined();
  });

  it("explicit fields take priority over naming convention", () => {
    const fiddle = makeCutsceneFiddle({
      cutscenes: {
        dragon_tablet_pt_2: { quest_to_progress: "the_dragonsworn_tablet" },
      },
      quests: {
        story_quests: {
          dragon_tablet: { stages: [] },
        },
      },
    });
    const map = buildCutsceneQuestMap(fiddle as never);
    expect(map.dragon_tablet_pt_2).toEqual({
      questId: "the_dragonsworn_tablet",
      phase: "completed",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/cutscene-quest-map.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildCutsceneQuestMap`**

```ts
// pipeline/src/extractors/visibility/cutscene-quest-map.ts
import type { QuestId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";

export interface CutsceneQuestEntry {
  phase: "available" | "completed";
  questId: QuestId;
}

export type CutsceneQuestMap = Record<string, CutsceneQuestEntry>;

export function buildCutsceneQuestMap(fiddle: ParsedGameData): CutsceneQuestMap {
  const map: CutsceneQuestMap = {};

  // Collect all known quest IDs
  const allQuestIds = new Set<string>();
  const questGroups = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  if (questGroups) {
    for (const group of Object.values(questGroups)) {
      if (typeof group === "object" && group !== null) {
        for (const questId of Object.keys(group)) {
          allQuestIds.add(questId);
        }
      }
    }
  }

  // Source 1: Explicit quest_to_start / quest_to_progress on cutscene entries
  const cutscenes =
    (fiddle.cutscenes as Record<string, unknown> | undefined)?.cutscenes as
      | Record<string, Record<string, unknown>>
      | undefined;

  if (cutscenes) {
    for (const [cutsceneId, cutscene] of Object.entries(cutscenes)) {
      if (typeof cutscene !== "object" || cutscene === null) continue;

      if (typeof cutscene.quest_to_start === "string") {
        map[cutsceneId] = {
          phase: "available",
          questId: cutscene.quest_to_start as QuestId,
        };
      }
      if (typeof cutscene.quest_to_progress === "string") {
        map[cutsceneId] = {
          phase: "completed",
          questId: cutscene.quest_to_progress as QuestId,
        };
      }
    }
  }

  // Source 2: Quest stage queries[].cutscene references
  if (questGroups) {
    for (const group of Object.values(questGroups)) {
      if (typeof group !== "object" || group === null) continue;
      for (const [questId, quest] of Object.entries(group as Record<string, unknown>)) {
        if (typeof quest !== "object" || quest === null) continue;
        const stages = (quest as Record<string, unknown>).stages;
        if (!Array.isArray(stages)) continue;
        for (const stage of stages) {
          if (typeof stage !== "object" || stage === null) continue;
          const queries = (stage as Record<string, unknown>).queries;
          if (!Array.isArray(queries)) continue;
          for (const query of queries) {
            if (typeof query !== "object" || query === null) continue;
            const cutsceneRef = (query as Record<string, unknown>).cutscene;
            if (typeof cutsceneRef === "string" && !(cutsceneRef in map)) {
              map[cutsceneRef] = {
                phase: "available",
                questId: questId as QuestId,
              };
            }
          }
        }
      }
    }
  }

  // Source 3: Naming convention — strip _pt_N suffix, match against quest IDs
  if (cutscenes) {
    for (const cutsceneId of Object.keys(cutscenes)) {
      if (cutsceneId in map) continue;
      const ptMatch = cutsceneId.match(/^(.+)_pt_(\d+)$/);
      if (!ptMatch) continue;
      const baseId = ptMatch[1];
      const partNumber = parseInt(ptMatch[2], 10);
      if (allQuestIds.has(baseId)) {
        map[cutsceneId] = {
          phase: partNumber >= 2 ? "completed" : "available",
          questId: baseId as QuestId,
        };
      }
    }
  }

  console.log(`  Cutscene-quest map: ${Object.keys(map).length} cutscenes mapped`);
  return map;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/cutscene-quest-map.test.ts`
Expected: PASS

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/visibility/cutscene-quest-map.ts \
      pipeline/src/extractors/visibility/cutscene-quest-map.test.ts
git commit -m "add cutscene-to-quest mapping extractor"
```

---

### Task 3: Pipeline — quest chain ordering

Extract quest chain ordering from letters and registry files. This data drives
`deriveProgressionState` in the app to determine which quests are available/unavailable.

**Files:**

- Create: `pipeline/src/extractors/visibility/quest-chains.ts`
- Create: `pipeline/src/extractors/visibility/quest-chains.test.ts`

**Interfaces:**

- Consumes: `ParsedGameData` (fiddle with `letters`, `quests.story_quests`,
  `quests.crown_registry`, `quests.stillwell_registry`, `quests.tali_registry`)
- Produces:
  - `QuestChainData` — same shape as `TrackerData["questChains"]` except `fetch` is
    `Record<QuestId, RequirementExpression>` (raw, not yet resolved to `VisibilityCondition`).
    Task 5 resolves these via the requirement resolver.
  - `extractQuestChains(fiddle: ParsedGameData): QuestChainData`

- [ ] **Step 1: Write failing tests for quest chain extraction**

Test story quest chain extraction from letter `completed_quest` dependencies. Test crown/stillwell/
tali ordering from explicit `order` arrays. Test heart quest chains from letter
`reached_heart_level` requirements. Test fetch quest raw requirement parsing from request board.
Test the cross-NPC dependency (Landen gated on Ryis's heart level).

Write tests using the `makeFiddle` pattern (minimal fiddle with targeted overrides). Each chain type
should have its own `describe` block. The test file structure follows
`pipeline/src/extractors/visibility/cutscene-quest-map.test.ts` as a template.

Key assertions:
- Story quest prerequisites are extracted from letters' `completed_quest` field
- Quests without letter triggers have empty prerequisite arrays
- Crown quest order matches the `order` array from `crown_registry.toml`
- Heart quests are ordered per-NPC with correct heart level thresholds
- Level 4+ heart quests include the prior heart quest as `prerequisiteQuest`
- Landen's "Bird Song" uses Ryis's NPC ID for the heart level gate, not Landen's

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/quest-chains.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `extractQuestChains`**

The function walks four data sources:

1. **`letters.toml`** → story quest dependencies. For each letter with a `quest_to_start` or
   `quest_to_complete` field that points to a story quest, extract the letter's
   `completed_quest` requirement as the quest's prerequisite. Store as
   `story: Record<QuestId, { prerequisites: QuestId[] }>`.

2. **Registry files** → ordered arrays. Read `order` from `crown_registry.toml`,
   `stillwell_registry.toml`, `tali_registry.toml`. Store as `crown: QuestId[]`, etc.

3. **`letters.toml`** → heart quest chains. For each letter with `reached_heart_level`, extract
   the NPC ID and level. Group by NPC, sort by level. For level 4+ entries, set
   `prerequisiteQuest` to the previous quest in the chain. Use the letter's
   `reached_heart_level` NPC key (not the quest's `npc_for_icon`) to handle cross-NPC
   dependencies.

4. **`request_board.toml`** → fetch quest raw requirements. Parse each entry's requirements using
   `buildRequirementDefinitions` + `parseRequirements` from `pipeline/src/requirements.ts` and
   store as `Record<QuestId, RequirementExpression>`. Do NOT resolve to `VisibilityCondition`
   here — that requires the cutscene-quest map and requirement resolver from Tasks 2 + 4, which
   may not exist yet. Task 5's `assignEntityVisibility` resolves these raw expressions into the
   final `questChains.fetch: Record<QuestId, VisibilityCondition>` field.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/quest-chains.test.ts`
Expected: PASS

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/visibility/quest-chains.ts \
      pipeline/src/extractors/visibility/quest-chains.test.ts
git commit -m "add quest chain ordering extractor"
```

---

### Task 4: Pipeline — requirement-to-visibility resolver

Convert the existing `RequirementExpression` trees into `VisibilityCondition` trees. This handles the
projection of non-spoiler predicates to `always` and boolean simplification.

**Files:**

- Create: `pipeline/src/extractors/visibility/requirement-resolver.ts`
- Create: `pipeline/src/extractors/visibility/requirement-resolver.test.ts`

**Interfaces:**

- Consumes:
  - `RequirementExpression` from `pipeline/src/requirements.ts`
  - `CutsceneQuestMap` from Task 2
- Produces:
  - `resolveToVisibility(expr: RequirementExpression, cutsceneMap: CutsceneQuestMap): VisibilityCondition`
  - `simplifyCondition(condition: VisibilityCondition): VisibilityCondition` — boolean identities

- [ ] **Step 1: Write failing tests for requirement resolution**

Test each predicate type mapping:

```ts
// pipeline/src/extractors/visibility/requirement-resolver.test.ts
import { describe, it, expect } from "vitest";

import { resolveToVisibility, simplifyCondition } from "./requirement-resolver.js";

import type { CutsceneQuestMap } from "./cutscene-quest-map.js";
import type { RequirementExpression } from "../../requirements.js";

const emptyCutsceneMap: CutsceneQuestMap = {};

describe("resolveToVisibility", () => {
  it("maps seen_cutscene via cutscene-quest map to questCompleted", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_the_inn_pt_2: { questId: "repair_the_inn" as never, phase: "completed" },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "repair_the_inn_pt_2",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "questCompleted",
      questId: "repair_the_inn",
    });
  });

  it("maps seen_cutscene with quest_to_start to questAvailable", () => {
    const cutsceneMap: CutsceneQuestMap = {
      quest_start: { questId: "some_quest" as never, phase: "available" },
    };
    const expr: RequirementExpression = {
      predicate: "seen_cutscene",
      value: "quest_start",
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "questAvailable",
      questId: "some_quest",
    });
  });

  it("maps reached_skill_level to skillLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_skill_level",
      value: { farming: 30 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "skillLevel",
      skillId: "farming",
      level: 30,
    });
  });

  it("maps reached_mines_level to minesLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_mines_level",
      value: 41,
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "minesLevel",
      floor: 41,
    });
  });

  it("maps completed_quest to questCompleted", () => {
    const expr: RequirementExpression = {
      predicate: "completed_quest",
      value: "repair_the_bridge",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "questCompleted",
      questId: "repair_the_bridge",
    });
  });

  it("maps met_npc to npcKnown", () => {
    const expr: RequirementExpression = {
      predicate: "met_npc",
      value: "stillwell",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "npcKnown",
      npcId: "stillwell",
    });
  });

  it("projects is_season to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_season",
      value: "spring",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects is_day_type to always", () => {
    const expr: RequirementExpression = {
      predicate: "is_day_type",
      value: "saturday",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects reached_date to always", () => {
    const expr: RequirementExpression = {
      predicate: "reached_date",
      value: { season: "spring", day: 1 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects acquired_item to always", () => {
    const expr: RequirementExpression = {
      predicate: "acquired_item",
      value: "copper_pickaxe",
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("projects invert (not) to always", () => {
    const expr: RequirementExpression = {
      not: { predicate: "seen_cutscene", value: "some_cutscene" },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({ type: "always" });
  });

  it("resolves all (and) composition", () => {
    const cutsceneMap: CutsceneQuestMap = {
      repair_inn_pt_2: { questId: "repair_the_inn" as never, phase: "completed" },
    };
    const expr: RequirementExpression = {
      all: [
        { predicate: "seen_cutscene", value: "repair_inn_pt_2" },
        { predicate: "reached_mines_level", value: 20 },
      ],
    };
    expect(resolveToVisibility(expr, cutsceneMap)).toEqual({
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "repair_the_inn" },
        { type: "minesLevel", floor: 20 },
      ],
    });
  });

  it("resolves any (or) composition", () => {
    const expr: RequirementExpression = {
      any: [
        { predicate: "completed_quest", value: "quest_a" },
        { predicate: "completed_quest", value: "quest_b" },
      ],
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "or",
      conditions: [
        { type: "questCompleted", questId: "quest_a" },
        { type: "questCompleted", questId: "quest_b" },
      ],
    });
  });

  it("maps reached_heart_level to heartLevel", () => {
    const expr: RequirementExpression = {
      predicate: "reached_heart_level",
      value: { ryis: 2 },
    };
    expect(resolveToVisibility(expr, emptyCutsceneMap)).toEqual({
      type: "heartLevel",
      npcId: "ryis",
      level: 2,
    });
  });
});

describe("simplifyCondition", () => {
  it("drops always from and", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [
          { type: "always" },
          { type: "questCompleted", questId: "q" as never },
        ],
      }),
    ).toEqual({ type: "questCompleted", questId: "q" });
  });

  it("collapses or containing always to always", () => {
    expect(
      simplifyCondition({
        type: "or",
        conditions: [
          { type: "always" },
          { type: "questCompleted", questId: "q" as never },
        ],
      }),
    ).toEqual({ type: "always" });
  });

  it("collapses empty and to always", () => {
    expect(simplifyCondition({ type: "and", conditions: [] as never })).toEqual({ type: "always" });
  });

  it("unwraps single-element and", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [{ type: "questCompleted", questId: "q" as never }],
      }),
    ).toEqual({ type: "questCompleted", questId: "q" });
  });

  it("simplifies nested and-of-or with always", () => {
    expect(
      simplifyCondition({
        type: "and",
        conditions: [
          {
            type: "or",
            conditions: [
              { type: "always" },
              { type: "questCompleted", questId: "q" as never },
            ],
          },
          { type: "minesLevel", floor: 20 },
        ],
      }),
    ).toEqual({ type: "minesLevel", floor: 20 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/requirement-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `resolveToVisibility` and `simplifyCondition`**

```ts
// pipeline/src/extractors/visibility/requirement-resolver.ts
import type { VisibilityCondition } from "$lib/types/visibility.js";
import type { NpcId, PerkId, QuestId, SkillId } from "$lib/types/tracker-data.js";

import type { RequirementExpression } from "../../requirements.js";

import type { CutsceneQuestMap } from "./cutscene-quest-map.js";

const NON_SPOILER_PREDICATES = new Set([
  "is_season",
  "is_day_type",
  "reached_date",
  "acquired_item",
  "has_upper_floor",
]);

const ALWAYS: VisibilityCondition = { type: "always" };

export function resolveToVisibility(
  expr: RequirementExpression,
  cutsceneMap: CutsceneQuestMap,
): VisibilityCondition {
  if ("all" in expr) {
    const conditions = expr.all.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({ type: "and", conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]] });
  }
  if ("any" in expr) {
    const conditions = expr.any.map((e) => resolveToVisibility(e, cutsceneMap));
    return simplifyCondition({ type: "or", conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]] });
  }
  if ("not" in expr) {
    return ALWAYS;
  }

  // Predicate leaf
  const { predicate, value } = expr;

  if (NON_SPOILER_PREDICATES.has(predicate)) return ALWAYS;

  if (predicate === "seen_cutscene" && typeof value === "string") {
    const entry = cutsceneMap[value];
    if (!entry) return ALWAYS;
    return entry.phase === "completed"
      ? { type: "questCompleted", questId: entry.questId }
      : { type: "questAvailable", questId: entry.questId };
  }

  if (predicate === "completed_quest" && typeof value === "string") {
    return { type: "questCompleted", questId: value as QuestId };
  }

  if (predicate === "met_npc") {
    if (typeof value === "string") {
      return { type: "npcKnown", npcId: value as NpcId };
    }
    if (Array.isArray(value)) {
      const conditions = value.map((npc) => ({
        type: "npcKnown" as const,
        npcId: npc as NpcId,
      }));
      return simplifyCondition({
        type: "and",
        conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
      });
    }
    return ALWAYS;
  }

  if (predicate === "reached_skill_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [skillId, level] = entries[0];
      return { type: "skillLevel", skillId: skillId as SkillId, level };
    }
    const conditions = entries.map(([skillId, level]) => ({
      type: "skillLevel" as const,
      skillId: skillId as SkillId,
      level,
    }));
    return simplifyCondition({
      type: "and",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }

  if (predicate === "reached_mines_level" && typeof value === "number") {
    return { type: "minesLevel", floor: value };
  }

  if (predicate === "reached_heart_level" && typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, number>);
    if (entries.length === 1) {
      const [npcId, level] = entries[0];
      return { type: "heartLevel", npcId: npcId as NpcId, level };
    }
    const conditions = entries.map(([npcId, level]) => ({
      type: "heartLevel" as const,
      npcId: npcId as NpcId,
      level,
    }));
    return simplifyCondition({
      type: "and",
      conditions: conditions as [VisibilityCondition, ...VisibilityCondition[]],
    });
  }

  // Unknown predicates — project to always (forward compatibility)
  return ALWAYS;
}

export function simplifyCondition(condition: VisibilityCondition): VisibilityCondition {
  if (condition.type === "and") {
    const simplified = condition.conditions
      .map(simplifyCondition)
      .filter((c) => c.type !== "always");
    if (simplified.length === 0) return ALWAYS;
    if (simplified.length === 1) return simplified[0];
    return { type: "and", conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]] };
  }
  if (condition.type === "or") {
    const simplified = condition.conditions.map(simplifyCondition);
    if (simplified.some((c) => c.type === "always")) return ALWAYS;
    if (simplified.length === 0) return ALWAYS;
    if (simplified.length === 1) return simplified[0];
    return { type: "or", conditions: simplified as [VisibilityCondition, ...VisibilityCondition[]] };
  }
  return condition;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/requirement-resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/visibility/requirement-resolver.ts \
      pipeline/src/extractors/visibility/requirement-resolver.test.ts
git commit -m "add requirement-to-visibility resolver with boolean simplification"
```

---

### Task 5: Pipeline — entity visibility assignment & wiring

Assign `visibility` conditions to every entity in `TrackerData`. Wire all visibility extractors into
the pipeline's `main.ts`. This is the largest pipeline task — it composes the cutscene map (Task 2),
quest chains (Task 3), and requirement resolver (Task 4) to stamp visibility on stores, NPCs, items,
recipes, perks, cosmetics, quests, and animals.

**Files:**

- Create: `pipeline/src/extractors/visibility/entity-visibility.ts`
- Create: `pipeline/src/extractors/visibility/entity-visibility.test.ts`
- Modify: `pipeline/src/main.ts`

**Interfaces:**

- Consumes:
  - `CutsceneQuestMap` from Task 2
  - `QuestChains` from Task 3
  - `resolveToVisibility`, `simplifyCondition` from Task 4
  - `buildRequirementDefinitions`, `parseRequirements` from `pipeline/src/requirements.ts`
  - All existing `TrackerData` slices (items, recipes, npcs, etc.)
- Produces:
  - `extractStoreVisibility(fiddle, cutsceneMap): Record<StoreId, VisibilityCondition>`
  - `extractNpcVisibility(): Record<NpcId, VisibilityCondition>` (hardcoded map)
  - `extractHeartLevelChanges(fiddle): Record<QuestId, { npcId, level }[]>`
  - `extractCategoryVisibility(): Record<string, VisibilityCondition>`
  - `assignEntityVisibility(trackerData, storeVisibility, cutsceneMap, fiddle): void` — mutates
    TrackerData in place to stamp `visibility` on items, recipes, perks, cosmetics, quests, animals
  - `extractFetchQuestVisibility(fiddle, cutsceneMap): Record<QuestId, VisibilityCondition>`

- [ ] **Step 1: Write failing tests**

Test each visibility assignment function. Key test cases:

**Store visibility:**
- General Store upgrade → `questCompleted("repair_the_general_store")`
- Taliferro → `questCompleted("upgrade_the_saturday_market")` (hardcoded)
- Balor → `always` (no gate)

**NPC visibility:**
- Caldarus → `questCompleted("breaking_the_fire_seal")` (hardcoded)
- Seridia → `questCompleted("breaking_the_final_seal")`
- Saturday Market vendors in correct waves
- Regular NPCs (Holt, Adeline, etc.) → `always`

**Heart level changes:**
- Breaking the Water Seal → Caldarus level 2, Seridia level 1
- Breaking the Final Seal → Caldarus level 6, Seridia level 6

**Item visibility:**
- Store item with upgrade requirement → composes store gate + item-specific requirement
- Non-gated item → `always`

**Recipe visibility:**
- Perk-sourced recipe → `perkUnlocked(id)`; source gets `skillLevel`
- Store-sourced recipe → inherits store visibility
- Default recipe → `always`
- Quest-sourced recipe → `questCompleted(questId)`

**Perk visibility:**
- Tier 1 → `skillLevel(skillId, 1)` which simplifies to `always` (everyone starts at level 1)
  ... actually tier 1 unlocks at level 1, which is always available. Check if this should be
  `always` or `skillLevel(skillId, 1)`. The spec says emit `skillLevel`, so emit it literally.
- Tier 4 → `skillLevel(skillId, 45)`

**Category visibility:**
- `stillwell_challenges` → `npcKnown("stillwell")`
- `tali_challenges` → `npcKnown("taliferro")`
- `story_quests` → `always`

**Quest visibility (from chains):**
- Heart quest at level 4 → `and(npcKnown(npc), heartLevel(npc, 4), questCompleted(prev))`
- Crown quest → `and(renownLevel(N), questCompleted(prev))` or just `renownLevel(N)` for first
- Fetch quest → resolved from request board raw `RequirementExpression` (from Task 3) via
  `resolveToVisibility` (from Task 4). This is where `questChains.fetch` gets its final
  `Record<QuestId, VisibilityCondition>` values

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run pipeline/src/extractors/visibility/entity-visibility.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement entity visibility functions**

The implementation has several sub-functions:

**`extractStoreVisibility`**: hardcoded mapping for the 12 gated stores (from spec Section 3d),
plus `always` for the 8 ungated stores. Uses the store IDs from `trackerData.stores`.

**`extractNpcVisibility`**: hardcoded mapping for gated NPCs (from spec Section 3e). Caldarus,
Seridia, Merri/Darcy/Vera/Louis, Taliferro/Wheedle, Stillwell/Zorel. All others → `always`.

**`extractHeartLevelChanges`**: walks `cutscenes.toml` entries, extracts `heart_level_changes`
fields. Maps cutscene → quest via `CutsceneQuestMap`, groups by quest ID.

**`extractCategoryVisibility`**: hardcoded mapping (from spec Section 3j). Crown quests need
`renownLevel(N)` where N is the exact level TBD (spec says pre-implementation research required).
Use a placeholder constant with a comment.

**`assignEntityVisibility`**: walks each entity type in TrackerData and stamps `visibility`:
- **Items**: for each item, look up its sources in `trackerData.sources`. If any source has a
  store restriction, compose with `storeVisibility`. If it has a `building` restriction, resolve
  via the requirement resolver. Otherwise `always`.
- **Recipes**: each `RecipeSource` variant maps to TWO conditions — one for the recipe entity
  (stronger gate) and one for the source detail (weaker gate for partial disclosure). The
  distinction matters for the three-phase reveal pattern:
  - `perk` source → entity: `perkUnlocked(perkId)`, source: `skillLevel(perkSkillId,
    perkTierLevels[tier - 1])` — the tier threshold is looked up from the perk's own data
  - `store` → entity: `questCompleted(storeUnlockQuest)`, source: `questAvailable(storeUnlockQuest)`
  - `quest` → entity: `questCompleted(questId)`, source: `questAvailable(questId)`
  - `mines_chest` / `mines_dig_site` → entity: `and(minesLevel, perkUnlocked)`, source:
    `minesLevel` alone (perk not yet required for partial reveal)
  - `museum_donation` → entity + source: `always`
  - `default` → entity + source: `always`
  - `scroll_bundle` → same as `store` (inherits store gate)
  - Other types: entity and source use the same condition (no intermediate phase)

  The recipe's overall entity visibility is the weakest (most permissive) of all its source-level
  entity conditions — `or` across all sources. Each `RecipeSource.visibility` field gets its own
  source-level condition independently.
- **Perks**: `skillLevel(skillId, perkTierLevels[tier - 1])`
- **Cosmetics**: derive from source (store, quest, chest). This task handles cosmetics that have
  sources in `trackerData.sources`; full cosmetic source coverage is tracked by issue #78.
- **Animals**: the 6 gated animals get `questCompleted("repair_haydens_barn")`.
- **Spells**: map to the tablet quest chain (`questCompleted`).
- **Quests**: story quests get `questCompleted(prerequisiteQuest)` from chain data. Heart quests
  get `and(npcKnown, heartLevel, questCompleted(prev))`. Fetch quests get their request board
  condition. Crown/stillwell/tali quests get chain position conditions.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Wire into `pipeline/src/main.ts`**

Replace the placeholder empty objects from Task 1 with actual extractor calls:

```ts
import { buildCutsceneQuestMap } from "./extractors/visibility/cutscene-quest-map.js";
import { extractQuestChains } from "./extractors/visibility/quest-chains.js";
import {
  assignEntityVisibility,
  extractCategoryVisibility,
  extractHeartLevelChanges,
  extractNpcVisibility,
  extractStoreVisibility,
} from "./extractors/visibility/entity-visibility.js";

// After existing extractions:
const cutsceneQuestMap = buildCutsceneQuestMap(fiddle);
const questChainsData = extractQuestChains(fiddle);
const storeVisibilityData = extractStoreVisibility(fiddle, cutsceneQuestMap);
const npcVisibilityData = extractNpcVisibility();
const heartLevelChangesData = extractHeartLevelChanges(fiddle);
const categoryVisibilityData = extractCategoryVisibility();

// Mutate TrackerData in place to stamp visibility
assignEntityVisibility(trackerData, storeVisibilityData, cutsceneQuestMap, fiddle);
```

Update the `trackerData` assembly to use the real values:

```ts
storeVisibility: storeVisibilityData,
questChains: questChainsData,
npcVisibility: npcVisibilityData,
heartLevelChanges: heartLevelChangesData,
categoryVisibility: categoryVisibilityData,
```

- [ ] **Step 6: Run full pipeline test suite**

Run: `pnpm exec vitest run pipeline/`
Expected: PASS

- [ ] **Step 7: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 8: Commit**

```bash
git add pipeline/src/extractors/visibility/entity-visibility.ts \
      pipeline/src/extractors/visibility/entity-visibility.test.ts \
      pipeline/src/main.ts
git commit -m "assign visibility conditions to all tracker entities"
```

---

### Task 6: App engine — visibility evaluator & progression state

Implement the pure visibility evaluation engine and the `deriveProgressionState` function that
computes `UserProgressionState` from `CompletedState` + tracker data.

**Files:**

- Create: `src/lib/engine/visibility.ts`
- Create: `src/lib/engine/__tests__/visibility.test.ts`

**Interfaces:**

- Consumes:
  - `VisibilityCondition`, `QuestVisibility` from `src/lib/types/visibility.ts`
  - `CompletedState`, `QuestState` from `src/lib/stores/user-state.svelte.ts`
  - `TrackerData` (for quest chains, NPC visibility, heart level changes)
- Produces:
  - `UserProgressionState` — interface with all fields needed for evaluation
  - `deriveProgressionState(completed: CompletedState, trackerData: TrackerData, showSpoilers: boolean): UserProgressionState`
  - `isVisible(condition: VisibilityCondition, state: UserProgressionState): boolean`
  - `isEntityNameVisible(entityVisibility: VisibilityCondition, state: UserProgressionState): boolean`
  - `isSourceDetailVisible(sourceVisibility: VisibilityCondition | undefined, state: UserProgressionState): boolean`
  - `redactionState(entityVisibility: VisibilityCondition, sourceVisibility: VisibilityCondition | undefined, state: UserProgressionState): "redacted" | "source-only" | "visible"`
  - `isConditionInvertible(condition: VisibilityCondition): boolean`
  - `satisfyCondition(condition: VisibilityCondition, completed: CompletedState, trackerData: TrackerData): void` — mutates CompletedState to satisfy a visibility condition

- [ ] **Step 1: Write failing tests for the evaluator**

```ts
// src/lib/engine/__tests__/visibility.test.ts
import { describe, it, expect } from "vitest";

import {
  deriveProgressionState,
  isConditionInvertible,
  isVisible,
  redactionState,
} from "../visibility.js";

import type { UserProgressionState } from "../visibility.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

function makeState(overrides: Partial<UserProgressionState> = {}): UserProgressionState {
  return {
    showSpoilers: false,
    skillLevels: {},
    npcLevels: {},
    minesFloor: 0,
    renown: 0,
    unlockedPerks: new Set(),
    marriedNpc: null,
    questVisibility: {},
    knownNpcs: new Set(),
    ...overrides,
  };
}

describe("isVisible", () => {
  it("always returns true", () => {
    expect(isVisible({ type: "always" }, makeState())).toBe(true);
  });

  it("questCompleted checks questVisibility", () => {
    const state = makeState({
      questVisibility: { repair_the_inn: "completed" } as never,
    });
    expect(isVisible({ type: "questCompleted", questId: "repair_the_inn" as never }, state)).toBe(
      true,
    );
    expect(
      isVisible({ type: "questCompleted", questId: "other_quest" as never }, state),
    ).toBe(false);
  });

  it("questAvailable matches available or completed", () => {
    const state = makeState({
      questVisibility: {
        available_quest: "available",
        completed_quest: "completed",
        unavailable_quest: "unavailable",
      } as never,
    });
    expect(
      isVisible({ type: "questAvailable", questId: "available_quest" as never }, state),
    ).toBe(true);
    expect(
      isVisible({ type: "questAvailable", questId: "completed_quest" as never }, state),
    ).toBe(true);
    expect(
      isVisible({ type: "questAvailable", questId: "unavailable_quest" as never }, state),
    ).toBe(false);
  });

  it("npcKnown checks knownNpcs set", () => {
    const state = makeState({ knownNpcs: new Set(["holt"]) as never });
    expect(isVisible({ type: "npcKnown", npcId: "holt" as never }, state)).toBe(true);
    expect(isVisible({ type: "npcKnown", npcId: "caldarus" as never }, state)).toBe(false);
  });

  it("skillLevel checks >= threshold", () => {
    const state = makeState({ skillLevels: { farming: 30 } as never });
    expect(
      isVisible({ type: "skillLevel", skillId: "farming" as never, level: 30 }, state),
    ).toBe(true);
    expect(
      isVisible({ type: "skillLevel", skillId: "farming" as never, level: 31 }, state),
    ).toBe(false);
    expect(
      isVisible({ type: "skillLevel", skillId: "mining" as never, level: 1 }, state),
    ).toBe(false);
  });

  it("perkUnlocked checks set membership", () => {
    const state = makeState({ unlockedPerks: new Set(["magic_design"]) as never });
    expect(isVisible({ type: "perkUnlocked", perkId: "magic_design" as never }, state)).toBe(true);
    expect(isVisible({ type: "perkUnlocked", perkId: "other_perk" as never }, state)).toBe(false);
  });

  it("minesLevel checks >= floor", () => {
    const state = makeState({ minesFloor: 40 });
    expect(isVisible({ type: "minesLevel", floor: 40 }, state)).toBe(true);
    expect(isVisible({ type: "minesLevel", floor: 41 }, state)).toBe(false);
  });

  it("heartLevel checks npcLevels >= level", () => {
    const state = makeState({ npcLevels: { ryis: 4 } as never });
    expect(isVisible({ type: "heartLevel", npcId: "ryis" as never, level: 4 }, state)).toBe(true);
    expect(isVisible({ type: "heartLevel", npcId: "ryis" as never, level: 5 }, state)).toBe(false);
  });

  it("renownLevel checks >= level", () => {
    const state = makeState({ renown: 50 });
    expect(isVisible({ type: "renownLevel", level: 50 }, state)).toBe(true);
    expect(isVisible({ type: "renownLevel", level: 51 }, state)).toBe(false);
  });

  it("married checks marriedNpc", () => {
    const state = makeState({ marriedNpc: "adeline" as never });
    expect(isVisible({ type: "married", npcId: "adeline" as never }, state)).toBe(true);
    expect(isVisible({ type: "married", npcId: "reina" as never }, state)).toBe(false);
  });

  it("and requires all sub-conditions", () => {
    const state = makeState({ minesFloor: 20, renown: 30 });
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isVisible(condition, state)).toBe(true);

    const stateLow = makeState({ minesFloor: 20, renown: 10 });
    expect(isVisible(condition, stateLow)).toBe(false);
  });

  it("or requires any sub-condition", () => {
    const condition: VisibilityCondition = {
      type: "or",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isVisible(condition, makeState({ minesFloor: 20 }))).toBe(true);
    expect(isVisible(condition, makeState({ renown: 30 }))).toBe(true);
    expect(isVisible(condition, makeState())).toBe(false);
  });

  it("showSpoilers bypasses all conditions", () => {
    const state = makeState({ showSpoilers: true });
    expect(isVisible({ type: "questCompleted", questId: "any" as never }, state)).toBe(true);
    expect(
      isVisible(
        {
          type: "and",
          conditions: [
            { type: "minesLevel", floor: 100 },
            { type: "renownLevel", level: 100 },
          ],
        },
        state,
      ),
    ).toBe(true);
  });
});

describe("redactionState", () => {
  it("returns visible when entity visibility is met", () => {
    const state = makeState({ minesFloor: 20 });
    expect(redactionState({ type: "minesLevel", floor: 20 }, undefined, state)).toBe("visible");
  });

  it("returns source-only when source is met but entity is not", () => {
    const state = makeState({ minesFloor: 20 });
    expect(
      redactionState(
        { type: "minesLevel", floor: 40 },
        { type: "minesLevel", floor: 20 },
        state,
      ),
    ).toBe("source-only");
  });

  it("returns redacted when neither is met", () => {
    const state = makeState();
    expect(
      redactionState(
        { type: "minesLevel", floor: 40 },
        { type: "minesLevel", floor: 20 },
        state,
      ),
    ).toBe("redacted");
  });

  it("returns redacted when entity not met and source is undefined", () => {
    const state = makeState();
    expect(redactionState({ type: "minesLevel", floor: 40 }, undefined, state)).toBe("redacted");
  });
});

describe("isConditionInvertible", () => {
  it("returns true for invertible primitives", () => {
    expect(isConditionInvertible({ type: "questCompleted", questId: "q" as never })).toBe(true);
    expect(isConditionInvertible({ type: "skillLevel", skillId: "s" as never, level: 10 })).toBe(
      true,
    );
    expect(isConditionInvertible({ type: "minesLevel", floor: 10 })).toBe(true);
    expect(isConditionInvertible({ type: "perkUnlocked", perkId: "p" as never })).toBe(true);
    expect(isConditionInvertible({ type: "married", npcId: "n" as never })).toBe(true);
  });

  it("returns false for npcKnown", () => {
    expect(isConditionInvertible({ type: "npcKnown", npcId: "n" as never })).toBe(false);
  });

  it("returns false for and containing npcKnown", () => {
    expect(
      isConditionInvertible({
        type: "and",
        conditions: [
          { type: "npcKnown", npcId: "n" as never },
          { type: "minesLevel", floor: 10 },
        ],
      }),
    ).toBe(false);
  });

  it("returns true for and of invertible conditions", () => {
    expect(
      isConditionInvertible({
        type: "and",
        conditions: [
          { type: "minesLevel", floor: 10 },
          { type: "renownLevel", level: 20 },
        ],
      }),
    ).toBe(true);
  });
});

describe("deriveProgressionState", () => {
  // These tests need a minimal TrackerData mock. The deriveProgressionState function
  // reads questChains, npcVisibility, heartLevelChanges from trackerData.
  // Build minimal mocks per test case.

  it("marks completed quests as completed", () => {
    // Test that QuestState "completed" → QuestVisibility "completed"
  });

  it("marks obtained quests as available", () => {
    // Test that QuestState "obtained" → QuestVisibility "available"
  });

  it("makes first story quest available when none completed", () => {
    // First quest in chain should be "available" when no prerequisites
  });

  it("marks NPC as known when unlock quest is completed", () => {
    // Seridia known after breaking_the_final_seal completed
  });

  it("masks NPC heart level to 0 when NPC not known", () => {
    // Caldarus at stored level 4 but not known → effective level 0
  });

  it("passes through heart level when NPC is always-known", () => {
    // Holt at stored level 5 → effective level 5
  });
});
```

Note: the `deriveProgressionState` tests need minimal `TrackerData` mocks. The implementer should
construct focused mocks for each test case rather than importing real tracker data. The exact mock
shapes depend on the final `TrackerData` type from Task 1.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/engine/__tests__/visibility.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement the visibility engine**

```ts
// src/lib/engine/visibility.ts
import type { CompletedState, QuestState } from "$lib/stores/user-state.svelte.js";
import type { NpcId, PerkId, QuestId, SkillId, TrackerData } from "$lib/types/tracker-data.js";
import type { QuestVisibility, VisibilityCondition } from "$lib/types/visibility.js";

export interface UserProgressionState {
  showSpoilers: boolean;
  skillLevels: Record<string, number>;
  npcLevels: Record<string, number>;
  minesFloor: number;
  renown: number;
  unlockedPerks: Set<PerkId>;
  marriedNpc: NpcId | null;
  questVisibility: Record<string, QuestVisibility>;
  knownNpcs: Set<NpcId>;
}

export function isVisible(
  condition: VisibilityCondition,
  state: UserProgressionState,
): boolean {
  if (state.showSpoilers) return true;

  switch (condition.type) {
    case "always":
      return true;
    case "questCompleted":
      return state.questVisibility[condition.questId as string] === "completed";
    case "questAvailable": {
      const vis = state.questVisibility[condition.questId as string];
      return vis === "available" || vis === "completed";
    }
    case "npcKnown":
      return state.knownNpcs.has(condition.npcId);
    case "skillLevel":
      return (state.skillLevels[condition.skillId as string] ?? 0) >= condition.level;
    case "perkUnlocked":
      return state.unlockedPerks.has(condition.perkId);
    case "minesLevel":
      return state.minesFloor >= condition.floor;
    case "heartLevel":
      return (state.npcLevels[condition.npcId as string] ?? 0) >= condition.level;
    case "renownLevel":
      return state.renown >= condition.level;
    case "married":
      return state.marriedNpc === condition.npcId;
    case "and":
      return condition.conditions.every((c) => isVisible(c, state));
    case "or":
      return condition.conditions.some((c) => isVisible(c, state));
  }
}

export function isEntityNameVisible(
  entityVisibility: VisibilityCondition,
  state: UserProgressionState,
): boolean {
  return isVisible(entityVisibility, state);
}

export function isSourceDetailVisible(
  sourceVisibility: VisibilityCondition | undefined,
  state: UserProgressionState,
): boolean {
  if (!sourceVisibility) return true;
  return isVisible(sourceVisibility, state);
}

export function redactionState(
  entityVisibility: VisibilityCondition,
  sourceVisibility: VisibilityCondition | undefined,
  state: UserProgressionState,
): "redacted" | "source-only" | "visible" {
  if (isEntityNameVisible(entityVisibility, state)) return "visible";
  if (sourceVisibility && isSourceDetailVisible(sourceVisibility, state)) return "source-only";
  return "redacted";
}

export function isConditionInvertible(condition: VisibilityCondition): boolean {
  switch (condition.type) {
    case "always":
      return true;
    case "npcKnown":
      return false;
    case "and":
      return condition.conditions.every(isConditionInvertible);
    case "or":
      return condition.conditions.every(isConditionInvertible);
    default:
      return true;
  }
}

export function deriveProgressionState(
  completed: CompletedState,
  trackerData: TrackerData,
  showSpoilers: boolean,
): UserProgressionState {
  // 1. Quest visibility
  const questVisibility: Record<string, QuestVisibility> = {};

  // Process all quest types
  for (const [questType, quests] of Object.entries(trackerData.quests)) {
    for (const questId of Object.keys(quests)) {
      const userState: QuestState = completed.questStates[questId] ?? "none";

      if (userState === "completed") {
        questVisibility[questId] = "completed";
      } else if (userState === "obtained") {
        questVisibility[questId] = "available";
      } else {
        // Evaluate prerequisites from chain data
        questVisibility[questId] = evaluateQuestPrerequisites(
          questId as QuestId,
          questType,
          completed,
          trackerData,
          questVisibility,
        );
      }
    }
  }

  // 2. Known NPCs
  const knownNpcs = new Set<NpcId>();
  for (const [npcId, visibility] of Object.entries(trackerData.npcVisibility)) {
    if (visibility.type === "always") {
      knownNpcs.add(npcId as NpcId);
    } else {
      // Need to check quest visibility for quest-gated NPCs
      // This uses the already-computed questVisibility
      const tempState: UserProgressionState = {
        showSpoilers: false,
        skillLevels: completed.skillLevels,
        npcLevels: completed.npcLevels,
        minesFloor: completed.mines.floor,
        renown: completed.renown,
        unlockedPerks: completed.unlockedPerks ?? new Set(),
        marriedNpc: completed.marriedNpc ?? null,
        questVisibility,
        knownNpcs: new Set(),
      };
      if (isVisible(visibility, tempState)) {
        knownNpcs.add(npcId as NpcId);
      }
    }
  }

  // 3. Effective NPC levels (masked to 0 for unknown NPCs with explicit gates)
  const effectiveNpcLevels: Record<string, number> = {};
  for (const [npcId, level] of Object.entries(completed.npcLevels)) {
    const npcVis = trackerData.npcVisibility[npcId as NpcId];
    if (npcVis && npcVis.type !== "always" && !knownNpcs.has(npcId as NpcId)) {
      effectiveNpcLevels[npcId] = 0;
    } else {
      effectiveNpcLevels[npcId] = level;
    }
  }

  return {
    showSpoilers,
    skillLevels: completed.skillLevels,
    npcLevels: effectiveNpcLevels,
    minesFloor: completed.mines.floor,
    renown: completed.renown,
    unlockedPerks: completed.unlockedPerks ?? new Set(),
    marriedNpc: completed.marriedNpc ?? null,
    questVisibility,
    knownNpcs,
  };
}
```

The `evaluateQuestPrerequisites` helper checks the `questChains` data to determine if a quest's
prerequisites are satisfied. For story quests, it checks `questChains.story[questId].prerequisites`.
For crown/stillwell/tali, it checks the ordered array. For heart quests, it checks heart level +
previous quest. For fetch quests, it evaluates the visibility condition from `questChains.fetch`.

The `satisfyCondition` function walks the condition tree and mutates `CompletedState` to satisfy
each primitive (as described in spec Section 2's invertible conditions).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/engine/__tests__/visibility.test.ts`
Expected: PASS

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/visibility.ts src/lib/engine/__tests__/visibility.test.ts
git commit -m "add visibility evaluator and progression state derivation"
```

---

### Task 7: User state — new fields, serialization, transfer codec v2

Add `unlockedPerks` and `marriedNpc` to `CompletedState`. Update serialization. Bump transfer codec
to version 2.

**Files:**

- Modify: `src/lib/stores/user-state.svelte.ts`
- Modify: `src/lib/engine/transfer.ts`
- Modify or create: `src/lib/engine/__tests__/transfer.test.ts`

**Interfaces:**

- Consumes: `PerkId`, `NpcId` from `src/lib/types/tracker-data.ts`
- Produces:
  - `CompletedState.unlockedPerks: Set<PerkId>` (new field)
  - `CompletedState.marriedNpc: NpcId | null` (new field)
  - `TRANSFER_VERSION = 2` with backward-compatible v1 decode
  - New methods on `userState`: `togglePerk(id)`, `setMarriedNpc(npcId | null)`

- [ ] **Step 1: Write failing tests for transfer codec v2**

```ts
// src/lib/engine/__tests__/transfer.test.ts
import { describe, it, expect } from "vitest";

import { decodeTransferPayload, encodeTransferPayload, TRANSFER_VERSION } from "../transfer.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";

// Helper to create a minimal CompletedState for testing
function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    cosmetics: new Set(),
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    questStates: {},
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    marriedNpc: null,
    ...overrides,
  };
}

describe("transfer codec v2", () => {
  it("has version 2", () => {
    expect(TRANSFER_VERSION).toBe(2);
  });

  it("round-trips unlockedPerks", async () => {
    const completed = makeCompleted({
      unlockedPerks: new Set(["magic_design", "green_thumb"]) as never,
    });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.unlockedPerks).toEqual(new Set(["magic_design", "green_thumb"]));
  });

  it("round-trips marriedNpc", async () => {
    const completed = makeCompleted({ marriedNpc: "adeline" as never });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.marriedNpc).toBe("adeline");
  });

  it("round-trips null marriedNpc", async () => {
    const completed = makeCompleted({ marriedNpc: null });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.marriedNpc).toBeNull();
  });

  it("decodes v1 payload without perks or marriedNpc", async () => {
    // Encode with v1 format (before perks/marriedNpc existed)
    // This test ensures backward compatibility
    // The v1 decoder should return empty perks and null marriedNpc
  });
});
```

Note: the v1 backward-compatibility test requires saving a known v1 payload as a fixture or
constructing one manually. The implementer should encode a payload with the v1 code path (before
modification), save the base64 string, then verify the v2 decoder handles it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/engine/__tests__/transfer.test.ts`
Expected: FAIL

- [ ] **Step 3: Add `unlockedPerks` and `marriedNpc` to `CompletedState`**

In `user-state.svelte.ts`:

```ts
export interface CompletedState {
  // ... existing fields ...
  unlockedPerks: Set<PerkId>;
  marriedNpc: NpcId | null;
}
```

Update `createDefaultCompleted()` to include `unlockedPerks: new SvelteSet<PerkId>()` and
`marriedNpc: null`.

Update `serialize()` to include `unlockedPerks: [...state.completed.unlockedPerks].sort()` and
`marriedNpc: state.completed.marriedNpc`.

Update `deserialize()` to handle missing fields:
`unlockedPerks: brandedSet<PerkId>(s.completed.unlockedPerks ?? [])` and
`marriedNpc: (s.completed.marriedNpc as NpcId | null) ?? null`.

Update `SerializedState.completed` type to include `unlockedPerks?: string[]` and
`marriedNpc?: string | null`.

**Fix `showSpoilers` persistence** (pre-existing bug): `showSpoilers` currently resets to `false` on
every page load because `deserialize()` hardcodes it and `SerializedState` has no field for it.
While editing the serializer for the new fields above, also:
- Add `showSpoilers?: boolean` to `SerializedState` (top-level, not inside `completed`)
- Update `serialize()` to include `showSpoilers: state.showSpoilers`
- Update `deserialize()` to read `showSpoilers: s.showSpoilers ?? false`

This ensures the "Show all spoilers" toggle survives page reloads.

Add methods to the store:

```ts
togglePerk(id: PerkId) {
  toggleInSet(state.completed.unlockedPerks, id);
},
setMarriedNpc(npcId: NpcId | null) {
  state.completed.marriedNpc = npcId;
},
```

Update `mergeFromSave` to handle the new fields:

```ts
// Perks (union)
if (imported.unlockedPerks) {
  for (const id of imported.unlockedPerks) {
    if (!state.completed.unlockedPerks.has(id)) {
      state.completed.unlockedPerks.add(id);
      counts.perks++;
    }
  }
}
```

Add `perks: number` to `MergeCounts`.

- [ ] **Step 4: Update transfer codec to version 2**

In `transfer.ts`, bump `TRANSFER_VERSION` to `2`.

Add after quest states encoding (step 11):

```ts
// 12. Perk bitfield (new in v2)
const perkOrder = getPerkOrder();
parts.push(toBitfield(perkOrder, completed.unlockedPerks));

// 13. Married NPC index (new in v2) — 1 byte: 0xFF = no spouse, else index into npcOrder
const npcOrder = getNpcOrder();
const marriedIndex = completed.marriedNpc
  ? npcOrder.indexOf(completed.marriedNpc)
  : -1;
parts.push(new Uint8Array([marriedIndex === -1 ? 0xff : marriedIndex]));
```

Add `getPerkOrder()`:

```ts
function getPerkOrder(): PerkId[] {
  return (Object.keys(trackerData.perks) as PerkId[]).sort();
}
```

Update decoder to handle both v1 and v2:

```ts
const version = payloadBytes[0];
if (version !== 1 && version !== 2) {
  throw new Error(`Unsupported transfer version: ${String(version)}`);
}

// ... existing decode steps 1-11 ...

// Steps 12-13: v2 only
let unlockedPerks = new Set<PerkId>();
let marriedNpc: NpcId | null = null;

if (version >= 2) {
  const perkOrder = getPerkOrder();
  const perkBytes = readBytes(Math.ceil(perkOrder.length / 8));
  unlockedPerks = fromBitfield(perkOrder, perkBytes) as Set<PerkId>;

  const marriedByte = readBytes(1)[0];
  if (marriedByte !== 0xff) {
    const npcOrder = getNpcOrder();
    marriedNpc = npcOrder[marriedByte] ?? null;
  }
}

return {
  // ... existing fields ...
  unlockedPerks,
  marriedNpc,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/engine/__tests__/transfer.test.ts`
Expected: PASS

- [ ] **Step 6: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/user-state.svelte.ts src/lib/engine/transfer.ts \
      src/lib/engine/__tests__/transfer.test.ts
git commit -m "add unlockedPerks and marriedNpc to state, bump transfer codec to v2"
```

---

### Task 8: Save importer — perk import

Extend the save file importer to read `player.perks` from the save file and populate
`unlockedPerks` on `CompletedState`.

**Files:**

- Modify: `src/lib/engine/import-save.ts`
- Modify or create: `src/lib/engine/__tests__/import-save.test.ts`

**Interfaces:**

- Consumes: `PlayerSave` (extended with `perks` field), `TrackerData.perks`
- Produces: `Partial<CompletedState>` with `unlockedPerks: Set<PerkId>`

- [ ] **Step 1: Write failing test for perk import**

```ts
// In import-save test file
it("imports perks from player.perks", () => {
  const bundle: SaveBundle = {
    player: {
      perks: ["magic_design", "green_thumb", "unknown_perk"],
    },
  };
  const { completed, result } = buildImportState(bundle);
  // Valid perks are imported, unknown ones generate warnings
  expect(completed.unlockedPerks).toBeDefined();
  expect(completed.unlockedPerks!.has("magic_design" as never)).toBe(true);
  expect(completed.unlockedPerks!.has("green_thumb" as never)).toBe(true);
  expect(completed.unlockedPerks!.has("unknown_perk" as never)).toBe(false);
  expect(result.warnings).toContain("Unknown perk: unknown_perk");
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add `perks` to `PlayerSave` interface and import logic**

In `import-save.ts`, add `perks?: string[]` to the `PlayerSave` interface.

Add perk import logic after the existing spells import:

```ts
// ── Perks ──
const perkIds = new Set<PerkId>();
const validPerks = new Set(Object.keys(trackerData.perks));

for (const id of save?.perks ?? []) {
  if (validPerks.has(id)) {
    perkIds.add(id as PerkId);
  } else {
    warnings.push(`Unknown perk: ${id}`);
  }
}
counts.perks = perkIds.size;
```

Add `unlockedPerks: perkIds` to the returned `completed` object. Add `perks: 0` to the initial
`counts` object.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```bash
git add src/lib/engine/import-save.ts src/lib/engine/__tests__/import-save.test.ts
git commit -m "import perks from save file"
```

---

### Task 9: UI — search filtering, redacted row component, confirmation dialog

Integrate visibility into search (exclude redacted entities), create the redacted row component, and
build the "complete redacted item" confirmation dialog.

**Files:**

- Modify: `src/lib/engine/search.ts`
- Create: `src/lib/components/redacted-row.svelte`
- Create: `src/lib/components/confirm-redacted-dialog.svelte`

**Interfaces:**

- Consumes:
  - `UserProgressionState`, `isVisible`, `isEntityNameVisible`, `redactionState` from
    `src/lib/engine/visibility.ts`
  - `VisibilityCondition` from entity data
  - `AlertDialog` component pattern (existing in codebase)
- Produces:
  - Updated `searchItems` that accepts `UserProgressionState` and filters redacted entities
  - `RedactedRow` component — renders a row with redacted name/source based on `redactionState`
  - `ConfirmRedactedDialog` component — "complete redacted item" dialog with three options

- [ ] **Step 1: Update search to filter redacted entities**

Modify `searchItems` to accept `progressionState: UserProgressionState` as an additional parameter.
Before adding an entity to results, check if its `visibility` condition is met. If not, skip it.

```ts
export function searchItems(
  query: string,
  completed: CompletedState,
  worldState: { season: Season; weather: Weather },
  progressionState: UserProgressionState,
): SearchResult[] {
  // ... existing query check ...

  for (const [id, item] of Object.entries(trackerData.items)) {
    // Skip redacted items
    const visibility = item.visibility;
    if (visibility && !isVisible(visibility, progressionState)) continue;

    if (item.name.toLowerCase().includes(q)) {
      // ... existing result push ...
    }
  }

  // NPCs: use trackerData.npcVisibility[id] (not a field on the NPC entry itself)
  for (const [id, npc] of Object.entries(trackerData.npcs)) {
    const npcVis = trackerData.npcVisibility[id as NpcId];
    if (npcVis && !isVisible(npcVis, progressionState)) continue;
    // ... existing NPC matching ...
  }

  // Animals, cosmetics, quests: check entity.visibility before matching name
}
```

Update all call sites of `searchItems` to pass the progression state. The main call site is in
`search-results.svelte` (or wherever the search input component lives).

- [ ] **Step 2: Create `RedactedRow` component**

```svelte
<!-- src/lib/components/redacted-row.svelte -->
<script lang="ts">
  import type { VisibilityCondition } from "$lib/types/visibility.js";
  import type { UserProgressionState } from "$lib/engine/visibility.js";

  let {
    completed = false,
    entityVisibility,
    name,
    onToggle,
    redaction,
    sources = [],
    sourceVisibility,
  }: {
    completed: boolean;
    entityVisibility: VisibilityCondition;
    name: string;
    onToggle: () => void;
    redaction: "redacted" | "source-only" | "visible";
    sources?: { label: string }[];
    sourceVisibility?: VisibilityCondition;
  } = $props();
</script>

<!-- Render based on redaction state:
  - "visible": show name + sources normally (delegate to completion-row)
  - "source-only": show redacted name placeholder, show source hints
  - "redacted": show redacted name placeholder, show redacted source placeholder
-->
```

The component wraps the existing `completion-row.svelte` pattern. When `redaction` is `"visible"`,
it passes through to the normal row rendering. When redacted, it replaces the name with a
placeholder and adjusts the source display.

The exact visual treatment is deferred to issue #6, but the component should establish the three
rendering paths. Use a simple text placeholder (e.g., a locked icon + "Redacted") as the interim
visual.

- [ ] **Step 3: Create `ConfirmRedactedDialog` component**

```svelte
<!-- src/lib/components/confirm-redacted-dialog.svelte -->
<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { isConditionInvertible } from "$lib/engine/visibility.js";

  import type { VisibilityCondition } from "$lib/types/visibility.js";

  let {
    condition,
    onCancel,
    onComplete,
    onCompleteAndUpdate,
    open = $bindable(false),
  }: {
    condition: VisibilityCondition;
    onCancel: () => void;
    onComplete: () => void;
    onCompleteAndUpdate: () => void;
    open: boolean;
  } = $props();

  const invertible = $derived(isConditionInvertible(condition));
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Complete redacted item?</AlertDialog.Title>
      <AlertDialog.Description>
        This item is still hidden based on your tracked progression. Are you sure you want to mark
        it as completed?
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={onCancel}>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action onclick={onComplete}>Yes, just this item</AlertDialog.Action>
      {#if invertible}
        <AlertDialog.Action onclick={onCompleteAndUpdate}>
          Yes, and update my progress
        </AlertDialog.Action>
      {/if}
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
```

- [ ] **Step 4: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/search.ts src/lib/components/redacted-row.svelte \
      src/lib/components/confirm-redacted-dialog.svelte
git commit -m "add search spoiler filtering, redacted row component, and confirmation dialog"
```

---

### Task 10: UI — integrate visibility into category pages

Wire the visibility system into all content components. This is the final integration task that makes
redaction visible throughout the app.

**Files:**

- Modify: `src/lib/components/quests-content.svelte`
- Modify: all other category content components (almanac, animals, cosmetics, mines, museum, npcs,
  recipes, renown, skills)
- Modify: `src/routes/all/` section components
- Modify: `src/routes/settings/spoilers-card.svelte`

**Interfaces:**

- Consumes:
  - `UserProgressionState` as a `$derived` rune from user state
  - `deriveProgressionState` from `src/lib/engine/visibility.ts`
  - `redactionState`, `isVisible` from `src/lib/engine/visibility.ts`
  - `RedactedRow` component from Task 9
  - `ConfirmRedactedDialog` from Task 9
  - `VisibilityCondition` from entity data

- [ ] **Step 1: Create a reactive `UserProgressionState` derivation**

Add a `$derived` rune in a shared location (either in `user-state.svelte.ts` or a new
`src/lib/stores/progression.svelte.ts`). This computes `UserProgressionState` reactively from the
current `CompletedState`:

```ts
// In user-state.svelte.ts or a new file
import { deriveProgressionState } from "$lib/engine/visibility.js";

// Inside createUserState or as a standalone derived store:
const progressionState = $derived(
  deriveProgressionState(state.completed, trackerData, state.showSpoilers),
);
```

Expose this on the `userState` object so components can access it:

```ts
get progressionState(): UserProgressionState {
  return progressionState;
},
```

- [ ] **Step 2: Update quests content component**

In `quests-content.svelte`:

1. Import `isVisible`, `redactionState` from `$lib/engine/visibility.js`
2. For each quest row, check `trackerData.quests[questType][questId].visibility`
3. If `redactionState` is `"redacted"`, render a `RedactedRow` instead of the normal row
4. If `"source-only"`, show quest type hint but redact the name
5. If `"visible"`, render normally (existing behavior)
6. Add category-level redaction: check `trackerData.categoryVisibility[questType]` before
   rendering the entire section

For quest checkbox interaction on redacted rows, intercept the click and show the
`ConfirmRedactedDialog`. Wire the three dialog options:
- "Just this item" → toggle quest state directly
- "Update my progress" → call `satisfyCondition` then toggle
- "Cancel" → no-op

- [ ] **Step 3: Update all other category content components**

Apply the same pattern to each content component. The pattern is consistent:

1. Look up `entity.visibility` (or `always` if not present)
2. Compute `redactionState`
3. Branch rendering: redacted → `RedactedRow`, source-only → partial reveal, visible → existing
4. Intercept checkbox on redacted rows → `ConfirmRedactedDialog`

Category-specific notes:
- **Almanac**: items have `visibility` from `TrackerData.almanac[].items[id]`
- **Animals**: species-level visibility from `TrackerData.animals[id].visibility`; existing tier blur
  system continues to work for variant tiers within a visible species
- **Cosmetics**: `TrackerData.cosmetics[id].visibility`
- **Mines**: spell visibility from `TrackerData.mines.spells[id].visibility`; biome visibility from
  `minesLevel(startFloor)`
- **Museum**: item visibility from `TrackerData.items[id].visibility` (museum items are also almanac
  items)
- **NPCs**: NPC visibility from `TrackerData.npcVisibility[id]`
- **Recipes**: recipe-level visibility from `TrackerData.recipes[id].visibility`; source-level from
  each `RecipeSource.visibility`
- **Renown**: reward visibility from `renownLevel(level)`
- **Skills/Perks**: perk visibility from `TrackerData.perks[id].visibility`

- [ ] **Step 4: Update the `/all` aggregate page section components**

Each section component in `src/routes/all/` mirrors its category page. Apply the same visibility
checks.

- [ ] **Step 5: Update undo toasts for redacted names**

In all toast messages that display entity names, check visibility before showing the name. If the
entity is redacted, show the redaction placeholder instead.

- [ ] **Step 6: Update accessible labels**

Audit all `aria-label` and `title` attributes that render entity names. Route them through the
visibility check. Redacted names must not appear in accessibility attributes.

- [ ] **Step 7: Start dev server and test in browser**

Run: `pnpm run dev`

Verify:
- Fresh state (no save): most content redacted, only early-game items visible
- Toggle "Show all spoilers" → everything visible; off → redaction returns
- Import a save file → content unredacts based on progression
- Complete a story quest → downstream content unredacts
- Search for a redacted item → no results
- Click checkbox on redacted row → confirmation dialog appears
- Mobile viewport → redacted rows render correctly

- [ ] **Step 8: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "integrate visibility system into all category pages and UI surfaces"
```

---

### Task 11: Integration test & cleanup

Run the full pipeline with real game data (if available), verify end-to-end behavior, clean up
superseded code.

**Files:**

- Modify: `pipeline/src/extractors/quest-gates.ts` — deprecation notes
- Remove from entities: `questGate` field (if all consumers migrated to `visibility`)
- Verify: all `pnpm run check`, `pnpm run lint:fix`, `pnpm exec vitest run pipeline/`

- [ ] **Step 1: Run full pipeline with game data (if available)**

Run: `pnpm run pipeline -- pipeline/input/assets/`
Verify: no errors, `tracker-data.json` contains `visibility` fields on entities.

If game data is not available, run: `pnpm exec vitest run pipeline/`
Verify: all unit tests pass.

- [ ] **Step 2: Verify `questGate` migration**

Check all remaining references to `questGate` in the codebase. If all consumers now use `visibility`
instead, the `questGate` field can be removed from `TrackerData` and the `applyXxxQuestGates`
functions in `quest-gates.ts` can be removed. If some consumers still read `questGate`, leave it in
place with a comment noting it's superseded by `visibility`.

Run: `grep -rn "questGate" src/ pipeline/` to find remaining references.

- [ ] **Step 3: Run full test suite**

Run:
```bash
pnpm run check
pnpm run lint
pnpm exec vitest run pipeline/
pnpm exec vitest run src/
```

All must pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "complete spoiler system integration, clean up superseded quest gates"
```
