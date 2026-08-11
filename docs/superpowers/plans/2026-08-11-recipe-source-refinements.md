# Recipe source refinements implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the recipe pipeline with branded types, new top-level lookups (perks, stores, festivals, treasure chest tiers), split dungeon sources into mines_chest/mines_dig_site, fix biome ID derivation, upgrade display labels with helper functions, and add source-type icons to the recipe list UI.

**Architecture:** Four new extractors (`extractPerks`, `extractStoresMeta`, `extractFestivals`, `extractTreasureChestTiers`) produce top-level lookup tables on `TrackerData`. The `RecipeSource` union is reshaped with branded ID types (`PerkId`, `StoreId`, `FestivalId`, `QuestType`, `TreasureChestTier`) and new variants (`mines_chest`, `mines_dig_site`, `store_with_perk`). The `recipeSourceLabel` function is rewritten with expanded lookups and new helpers (`withIndefiniteArticle`, `formatStoreName`, `formatBiomeName`). The recipe list component replaces green dots with Lucide icons mapped by source type.

**Tech Stack:** TypeScript pipeline extractors, Vitest, Svelte 5 (runes), Lucide icons (`@lucide/svelte`), Tailwind 4

## Global constraints

- Use **pnpm** for all commands (never npm/npx).
- **Strict TypeScript** with `strictTypeChecked` ESLint. Use `type` imports (`consistent-type-imports`).
- **Formatting:** Prettier with double quotes, no tabs, trailing commas, 100-char width, semicolons.
- **Naming:** `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files. Branded IDs for type safety.
- Run `pnpm run lint:fix` before committing. All commits must type-check independently, **except** Task 1 (type-only changes that intentionally break consumers fixed in later tasks). Tasks 2–5 (new extractors) type-check independently. Tasks 6+ must restore full type-check.
- Run `pnpm exec vitest run pipeline/` for pipeline tests. Also run `pnpm exec tsc -p pipeline/tsconfig.json --noEmit` for pipeline type-checking.
- Sort all output arrays and object keys deterministically (by ID or name) so output is stable across runs.
- Game assets are available at `pipeline/input/assets/` (symlink to main worktree). Real-data tests should run. Regenerate `tracker-data.json` after pipeline changes.

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types/tracker-data.ts` | Modify (Task 1) | Add `PerkId`, `StoreId`, `FestivalId`, `QuestType`, `TreasureChestTier`; reshape `RecipeSource` union; add `perks`, `perkTierLevels`, `stores`, `festivals`, `treasureChestTiers` to `TrackerData` |
| `pipeline/src/extractors/perks.ts` | Create (Task 2) | `extractPerks` — reads `ui/skill_menu/*.toml` + `perks.toml` + `ui/skill_menu/defaults.toml` |
| `pipeline/src/extractors/perks.test.ts` | Create (Task 2) | Unit tests for `extractPerks` |
| `pipeline/src/extractors/stores-meta.ts` | Create (Task 3) | `extractStoresMeta` — reads `stores.toml` for display names and articles |
| `pipeline/src/extractors/stores-meta.test.ts` | Create (Task 3) | Unit tests for `extractStoresMeta` |
| `pipeline/src/extractors/festivals.ts` | Create (Task 4) | `extractFestivals` — reads `festivals.toml` for display names |
| `pipeline/src/extractors/festivals.test.ts` | Create (Task 4) | Unit tests for `extractFestivals` |
| `pipeline/src/extractors/treasure-chest-tiers.ts` | Create (Task 5) | `extractTreasureChestTiers` — reads `items/fish/misc.toml` + `fishing.chest_tables` |
| `pipeline/src/extractors/treasure-chest-tiers.test.ts` | Create (Task 5) | Unit tests for `extractTreasureChestTiers` |
| `pipeline/src/extractors/recipes.ts` | Modify (Task 6) | Fix biome ID derivation, rename dungeon→mines, split chest/dig-site, use branded types, handle `include_recipe` requirements, bake in costs from `fiddle.misc` |
| `pipeline/src/extractors/recipes.test.ts` | Modify (Task 6) | Update all tests for reshaped source types |
| `pipeline/src/main.ts` | Modify (Task 7) | Wire up four new extractors into pipeline and `TrackerData` assembly |
| `src/lib/utils/format.ts` | Modify (Task 8) | Rewrite `recipeSourceLabel` with `RecipeSourceLookups`, add helpers `withIndefiniteArticle`, `formatStoreName`, `formatBiomeName` |
| `src/lib/components/recipes-content.svelte` | Modify (Task 9) | Replace green dots with Lucide icons, carry `sources: RecipeSource[]` on `RecipeEntry`, pass expanded lookups |
| `src/lib/stores/user-state.svelte.ts` | Audit (Task 9) | Verify no breakage from `TrackerData` shape changes |

---

### Task 1: Types — branded IDs, reshaped RecipeSource, TrackerData lookups

**Files:**
- Modify: `src/lib/types/tracker-data.ts`

**Interfaces:**
- Consumes: existing `BiomeId`, `ItemId`, `QuestId`, `WingId`, `SkillId`, `Season`
- Produces: new branded types `FestivalId`, `PerkId`, `QuestType`, `StoreId`, `TreasureChestTier`; reshaped `RecipeSource` union; expanded `TrackerData` with `perks`, `perkTierLevels`, `stores`, `festivals`, `treasureChestTiers`

- [ ] **Step 1: Add new branded types**

Add these after the existing branded types in `src/lib/types/tracker-data.ts`:

```typescript
export type FestivalId = string & { readonly __brand: "FestivalId" };
export type PerkId = string & { readonly __brand: "PerkId" };
export type QuestType = string & { readonly __brand: "QuestType" };
export type StoreId = string & { readonly __brand: "StoreId" };
export type TreasureChestTier = string & { readonly __brand: "TreasureChestTier" };
```

- [ ] **Step 2: Replace `RecipeSource` union**

Replace the existing `RecipeSource` type with:

```typescript
export type RecipeSource =
  | { type: "beach_cave_chest" }
  | { type: "chicken_statue"; cost: number }
  | { type: "default" }
  | { type: "dragon_forge" }
  | { type: "festival"; festivalId: FestivalId; storeId: StoreId }
  | { type: "letter"; trigger: "donated_item"; triggerItemId: ItemId }
  | { type: "letter"; trigger: "reached_date"; triggerDate: { day: number; season: Season; year?: number } }
  | { type: "letter"; trigger: "shipped_item"; triggerItemId: ItemId }
  | { type: "mines_chest"; biomeId: BiomeId; perkId: PerkId }
  | { type: "mines_dig_site"; biomeId: BiomeId; perkId: PerkId }
  | { type: "museum_donation"; setCount: number; wingId: WingId }
  | { type: "perk"; perkId: PerkId }
  | { type: "quest"; questId: QuestId; questType: QuestType }
  | { type: "relationship" }
  | { type: "renown"; level: number }
  | { type: "scroll_bundle"; bundleName: string; storeId: StoreId }
  | { type: "store"; storeId: StoreId; upgraded?: true }
  | { type: "store_with_perk"; perkId: PerkId; storeId: StoreId }
  | { type: "treasure_chest"; tier: TreasureChestTier }
  | { type: "upgrade"; storeId: StoreId; upgradeName: string }
  | { type: "wishing_well"; cost: number };
```

- [ ] **Step 3: Add new TrackerData fields**

Add inside the `TrackerData` interface, alphabetically among existing fields:

```typescript
festivals: Record<FestivalId, { name: string }>;
```

```typescript
perkTierLevels: number[];
perks: Record<PerkId, { name: string; skillId: SkillId; tier: number }>;
```

```typescript
stores: Record<StoreId, { article?: "the"; name: string }>;
```

```typescript
treasureChestTiers: Record<TreasureChestTier, { name: string }>;
```

- [ ] **Step 4: Run type-check to confirm expected failures**

Run: `pnpm run check`
Expected: Type errors in `recipes.ts`, `format.ts`, `recipes-content.svelte`, `user-state.svelte.ts`, `main.ts` (the files fixed in later tasks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/tracker-data.ts
git commit -m "refactor: reshape RecipeSource with branded types, add TrackerData lookups"
```

---

### Task 2: New extractor — `extractPerks`

**Files:**
- Create: `pipeline/src/extractors/perks.ts`
- Create: `pipeline/src/extractors/perks.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` (reads `fiddle.ui.skill_menu`, `fiddle.perks`)
- Produces: `extractPerks(fiddle: ParsedGameData): { perkTierLevels: number[]; perks: Record<PerkId, { name: string; skillId: SkillId; tier: number }> }`

The pipeline's `parseFiddle` maps directory structure to dotted keys. The `ui/skill_menu/*.toml` files become `fiddle.ui.skill_menu.*` (one key per file). `perks.toml` becomes `fiddle.perks`. `ui/skill_menu/defaults.toml` becomes `fiddle.ui.skill_menu.defaults`.

- [ ] **Step 1: Write the test file**

Create `pipeline/src/extractors/perks.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractPerks } from "./perks.js";

import type { PerkId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    perks: {},
    ui: { skill_menu: { defaults: {} } },
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractPerks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts perks from skill menu files with tier info", () => {
    const fiddle = makeFiddle({
      perks: {
        dungeon_delicacies: { name: "Dungeon Delicacies" },
        ornamental: { name: "Ornamental" },
      },
      ui: {
        skill_menu: {
          cooking: {
            tier_1: [{ perk: "dungeon_delicacies" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
          },
          farming: {
            tier_1: [],
            tier_2: [],
            tier_3: [],
            tier_4: [{ perk: "ornamental" }],
            tier_5: [],
          },
        },
      },
    });

    const { perks, perkTierLevels } = extractPerks(fiddle);

    expect(perks).toEqual({
      dungeon_delicacies: { name: "Dungeon Delicacies", skillId: "cooking", tier: 1 },
      ornamental: { name: "Ornamental", skillId: "farming", tier: 4 },
    });
    expect(perkTierLevels).toEqual([1, 15, 30, 45, 60]);
  });

  it("skips defaults.toml when iterating skill menus", () => {
    const fiddle = makeFiddle({
      perks: {
        horsepower: { name: "Horsepower" },
      },
      ui: {
        skill_menu: {
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
            tier_1: [{ perk: "should_not_appear" }],
          },
          mount: {
            tier_1: [{ perk: "horsepower" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
        },
      },
    });

    const { perks } = extractPerks(fiddle);
    expect(perks).not.toHaveProperty("should_not_appear");
    expect(perks).toHaveProperty("horsepower");
  });

  it("throws when perk has no name in perks.toml", () => {
    const fiddle = makeFiddle({
      perks: {},
      ui: {
        skill_menu: {
          combat: {
            tier_1: [{ perk: "unknown_perk" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
          },
        },
      },
    });

    expect(() => extractPerks(fiddle)).toThrow(
      'Perk "unknown_perk" found in skill menu but has no name in perks.toml',
    );
  });

  it("returns empty result when no ui.skill_menu data", () => {
    const fiddle = makeFiddle({ ui: {} });

    const { perks, perkTierLevels } = extractPerks(fiddle);
    expect(Object.keys(perks)).toEqual([]);
    expect(perkTierLevels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/perks.test.ts`
Expected: FAIL — module `./perks.js` not found.

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/extractors/perks.ts`:

```typescript
import type { PerkId, SkillId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPerks(fiddle: ParsedGameData): {
  perkTierLevels: number[];
  perks: Record<PerkId, { name: string; skillId: SkillId; tier: number }>;
} {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const skillMenus = ui?.skill_menu as Record<string, Record<string, unknown>> | undefined;
  if (!skillMenus) return { perkTierLevels: [], perks: {} as Record<PerkId, { name: string; skillId: SkillId; tier: number }> };

  const defaults = skillMenus.defaults as Record<string, unknown> | undefined;
  const category = defaults?.category as Record<string, unknown> | undefined;
  const perkTierLevels = Array.isArray(category?.level_requirements)
    ? (category.level_requirements as number[])
    : [];

  const perksData = fiddle.perks as Record<string, Record<string, unknown>> | undefined;
  const perks = {} as Record<PerkId, { name: string; skillId: SkillId; tier: number }>;

  for (const skillId of Object.keys(skillMenus).sort()) {
    if (skillId === "defaults") continue;
    const skillMenu = skillMenus[skillId];
    if (typeof skillMenu !== "object" || skillMenu === null) continue;

    for (let tierIdx = 1; tierIdx <= 5; tierIdx++) {
      const tierKey = `tier_${tierIdx}`;
      const tierEntries = Array.isArray(skillMenu[tierKey]) ? (skillMenu[tierKey] as unknown[]) : [];

      for (const entry of tierEntries) {
        if (typeof entry !== "object" || entry === null) continue;
        const perkId = (entry as Record<string, unknown>).perk as string | undefined;
        if (!perkId) continue;

        const perkData = perksData?.[perkId];
        const name = perkData?.name as string | undefined;
        if (!name) {
          throw new Error(`Perk "${perkId}" found in skill menu but has no name in perks.toml — check data assembly`);
        }

        perks[perkId as PerkId] = {
          name,
          skillId: skillId as SkillId,
          tier: tierIdx,
        };
      }
    }
  }

  console.log(`  Perks: ${Object.keys(perks).length} perks, ${perkTierLevels.length} tier levels`);
  return { perkTierLevels, perks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/perks.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/perks.ts pipeline/src/extractors/perks.test.ts
git commit -m "feat: add extractPerks extractor for perk lookup data"
```

---

### Task 3: New extractor — `extractStoresMeta`

**Files:**
- Create: `pipeline/src/extractors/stores-meta.ts`
- Create: `pipeline/src/extractors/stores-meta.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` (reads `fiddle.stores`)
- Produces: `extractStoresMeta(fiddle: ParsedGameData): Record<StoreId, { article?: "the"; name: string }>`

- [ ] **Step 1: Write the test file**

Create `pipeline/src/extractors/stores-meta.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractStoresMeta } from "./stores-meta.js";

import type { StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    stores: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractStoresMeta", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts known stores with correct article classification", () => {
    const fiddle = makeFiddle({
      stores: {
        default: {},
        general: { name: "General Store" },
        merri: { name: "Merri's Stall" },
      },
    });

    const stores = extractStoresMeta(fiddle);
    expect(stores).toEqual({
      general: { article: "the", name: "General Store" },
      merri: { name: "Merri's Stall" },
    });
  });

  it("assigns article 'the' for establishment stores", () => {
    const fiddle = makeFiddle({
      stores: {
        blacksmith: { name: "Blacksmith's Shop" },
        carpenter: { name: "Carpenter's Shop" },
        inn: { name: "Sleeping Dragon Inn" },
        terithia: { name: "Tackle Shop" },
      },
    });

    const stores = extractStoresMeta(fiddle);
    expect(stores["carpenter" as StoreId]).toEqual({ article: "the", name: "Carpenter's Shop" });
    expect(stores["inn" as StoreId]).toEqual({ article: "the", name: "Sleeping Dragon Inn" });
    expect(stores["blacksmith" as StoreId]).toEqual({ article: "the", name: "Blacksmith's Shop" });
    expect(stores["terithia" as StoreId]).toEqual({ article: "the", name: "Tackle Shop" });
  });

  it("omits article for personal and bare-noun stalls", () => {
    const fiddle = makeFiddle({
      stores: {
        darcy: { name: "Darcy's Stall" },
        hayden: { name: "Hayden's Shop" },
        maple_spring_festival: { name: "Food Stall" },
      },
    });

    const stores = extractStoresMeta(fiddle);
    expect(stores["darcy" as StoreId]).toEqual({ name: "Darcy's Stall" });
    expect(stores["hayden" as StoreId]).toEqual({ name: "Hayden's Shop" });
    expect(stores["maple_spring_festival" as StoreId]).toEqual({ name: "Food Stall" });
  });

  it("throws on unknown store ID", () => {
    const fiddle = makeFiddle({
      stores: {
        mystery_vendor: { name: "Mystery Vendor" },
      },
    });

    expect(() => extractStoresMeta(fiddle)).toThrow(
      'Unknown store "mystery_vendor" — add it to KNOWN_STORES in stores-meta.ts',
    );
  });

  it("returns empty when no stores data", () => {
    const fiddle = makeFiddle({ stores: undefined });
    const stores = extractStoresMeta(fiddle);
    expect(Object.keys(stores)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/stores-meta.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/extractors/stores-meta.ts`:

```typescript
import type { StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

const KNOWN_STORES: Record<string, { article?: "the"; name: string }> = {
  balor: { name: "Balor's Wagon" },
  blacksmith: { article: "the", name: "Blacksmith's Shop" },
  carpenter: { article: "the", name: "Carpenter's Shop" },
  darcy: { name: "Darcy's Stall" },
  elsie_spring_festival: { name: "Clothing Stall" },
  general: { article: "the", name: "General Store" },
  hayden: { name: "Hayden's Shop" },
  inn: { article: "the", name: "Sleeping Dragon Inn" },
  louis: { name: "Louis' Stall" },
  maple_spring_festival: { name: "Food Stall" },
  merri: { name: "Merri's Stall" },
  nora_souvenir_stall: { name: "Souvenir Stall" },
  terithia: { article: "the", name: "Tackle Shop" },
  valens_clinic: { name: "Valen's Clinic" },
  vera: { name: "Vera's Stall" },
  wheedle: { name: "Wheedle's Stall" },
  zorel: { name: "Zorel's Stall" },
};

export function extractStoresMeta(
  fiddle: ParsedGameData,
): Record<StoreId, { article?: "the"; name: string }> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return {} as Record<StoreId, { article?: "the"; name: string }>;

  const result = {} as Record<StoreId, { article?: "the"; name: string }>;

  for (const storeId of Object.keys(stores).sort()) {
    if (storeId === "default") continue;
    const store = stores[storeId];
    if (typeof store !== "object" || store === null) continue;

    const known = KNOWN_STORES[storeId];
    if (!known) {
      throw new Error(`Unknown store "${storeId}" — add it to KNOWN_STORES in stores-meta.ts`);
    }

    result[storeId as StoreId] = known;
  }

  console.log(`  Stores: ${Object.keys(result).length}`);
  return result;
}
```

All known stores are hardcoded with their correct article classification. Unknown stores throw immediately so new game versions surface as pipeline errors rather than silently leaking bad display text.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/stores-meta.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/stores-meta.ts pipeline/src/extractors/stores-meta.test.ts
git commit -m "feat: add extractStoresMeta extractor for store display names"
```

---

### Task 4: New extractor — `extractFestivals`

**Files:**
- Create: `pipeline/src/extractors/festivals.ts`
- Create: `pipeline/src/extractors/festivals.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` (reads `fiddle.festivals`)
- Produces: `extractFestivals(fiddle: ParsedGameData): Record<FestivalId, { name: string }>`

- [ ] **Step 1: Write the test file**

Create `pipeline/src/extractors/festivals.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractFestivals } from "./festivals.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    festivals: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractFestivals", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts festival names from festivals data", () => {
    const fiddle = makeFiddle({
      festivals: {
        default: {},
        harvest: { name: "Harvest Festival", stocks: {} },
        spring: { name: "Spring Festival", stocks: {} },
      },
    });

    const festivals = extractFestivals(fiddle);
    expect(festivals).toEqual({
      harvest: { name: "Harvest Festival" },
      spring: { name: "Spring Festival" },
    });
  });

  it("skips default key", () => {
    const fiddle = makeFiddle({
      festivals: {
        default: { name: "Default" },
        winter: { name: "Winter Festival" },
      },
    });

    const festivals = extractFestivals(fiddle);
    expect(festivals).not.toHaveProperty("default");
    expect(festivals).toHaveProperty("winter");
  });

  it("returns empty when no festivals data", () => {
    const fiddle = makeFiddle({ festivals: undefined });
    const festivals = extractFestivals(fiddle);
    expect(Object.keys(festivals)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/festivals.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/extractors/festivals.ts`:

```typescript
import type { FestivalId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractFestivals(
  fiddle: ParsedGameData,
): Record<FestivalId, { name: string }> {
  const festivals = fiddle.festivals as Record<string, Record<string, unknown>> | undefined;
  if (!festivals) return {} as Record<FestivalId, { name: string }>;

  const result = {} as Record<FestivalId, { name: string }>;

  for (const festivalId of Object.keys(festivals).sort()) {
    if (festivalId === "default") continue;
    const festival = festivals[festivalId];
    if (typeof festival !== "object" || festival === null) continue;

    const name = festival.name as string | undefined;
    if (!name) continue;

    result[festivalId as FestivalId] = { name };
  }

  console.log(`  Festivals: ${Object.keys(result).length}`);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/festivals.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/festivals.ts pipeline/src/extractors/festivals.test.ts
git commit -m "feat: add extractFestivals extractor for festival display names"
```

---

### Task 5: New extractor — `extractTreasureChestTiers`

**Files:**
- Create: `pipeline/src/extractors/treasure-chest-tiers.ts`
- Create: `pipeline/src/extractors/treasure-chest-tiers.test.ts`

**Interfaces:**
- Consumes: `ParsedGameData` (reads `fiddle.items.fish.misc` for item names, `fiddle.fishing.chest_tables` for tier keys)
- Produces: `extractTreasureChestTiers(fiddle: ParsedGameData): Record<TreasureChestTier, { name: string }>`

The matching rule: `chest_tables` keys are tier IDs (e.g., `wood`, `copper`, `silver`, `gold`, `abyss`). Item IDs are `treasure_box_${tier}`. Look up `fiddle.items.fish.misc.treasure_box_${tier}.name` for the canonical display name.

- [ ] **Step 1: Write the test file**

Create `pipeline/src/extractors/treasure-chest-tiers.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractTreasureChestTiers } from "./treasure-chest-tiers.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    fishing: {},
    items: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractTreasureChestTiers", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("maps chest_tables keys to treasure box item names", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          copper: { items: [] },
          gold: { items: [] },
          wood: { items: [] },
        },
      },
      items: {
        fish: {
          misc: {
            default: {},
            treasure_box_copper: { name: "Copper Treasure Box" },
            treasure_box_gold: { name: "Golden Treasure Box" },
            treasure_box_wood: { name: "Wooden Treasure Box" },
          },
        },
      },
    });

    const tiers = extractTreasureChestTiers(fiddle);
    expect(tiers).toEqual({
      copper: { name: "Copper Treasure Box" },
      gold: { name: "Golden Treasure Box" },
      wood: { name: "Wooden Treasure Box" },
    });
  });

  it("throws when treasure box item not found for tier", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          abyss: { items: [] },
        },
      },
      items: {},
    });

    expect(() => extractTreasureChestTiers(fiddle)).toThrow(
      'Treasure chest tier "abyss" has no matching item "treasure_box_abyss"',
    );
  });

  it("returns empty when no fishing data", () => {
    const fiddle = makeFiddle({ fishing: undefined });
    const tiers = extractTreasureChestTiers(fiddle);
    expect(Object.keys(tiers)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run pipeline/src/extractors/treasure-chest-tiers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `pipeline/src/extractors/treasure-chest-tiers.ts`:

```typescript
import type { TreasureChestTier } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractTreasureChestTiers(
  fiddle: ParsedGameData,
): Record<TreasureChestTier, { name: string }> {
  const fishing = fiddle.fishing as Record<string, unknown> | undefined;
  if (!fishing) return {} as Record<TreasureChestTier, { name: string }>;

  const chestTables = fishing.chest_tables as Record<string, unknown> | undefined;
  if (!chestTables) return {} as Record<TreasureChestTier, { name: string }>;

  const items = fiddle.items as Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  const fishMisc = items?.fish?.misc as Record<string, Record<string, unknown>> | undefined;

  const result = {} as Record<TreasureChestTier, { name: string }>;

  for (const tier of Object.keys(chestTables).sort()) {
    const itemKey = `treasure_box_${tier}`;
    const itemData = fishMisc?.[itemKey];
    const name = itemData?.name as string | undefined;
    if (!name) {
      throw new Error(`Treasure chest tier "${tier}" has no matching item "${itemKey}" in items/fish/misc — check data assembly`);
    }

    result[tier as TreasureChestTier] = { name };
  }

  console.log(`  Treasure chest tiers: ${Object.keys(result).length}`);
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run pipeline/src/extractors/treasure-chest-tiers.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/treasure-chest-tiers.ts pipeline/src/extractors/treasure-chest-tiers.test.ts
git commit -m "feat: add extractTreasureChestTiers extractor"
```

---

### Task 6: Reshape recipe extractor — branded types, mines split, costs, requirements

**Files:**
- Modify: `pipeline/src/extractors/recipes.ts`
- Modify: `pipeline/src/extractors/recipes.test.ts`

**Interfaces:**
- Consumes: updated `RecipeSource` from Task 1 (branded `PerkId`, `StoreId`, `FestivalId`, `QuestType`, `TreasureChestTier`, `BiomeId`); `ParsedGameData`
- Produces: recipes with reshaped sources matching the new `RecipeSource` union

This is the largest task. It makes these changes to `recipes.ts`:

1. **Biome ID fix**: `collectDungeonDelicacySources` uses array index `biome_${i}` instead of `biomeObj.id`
2. **Rename + split**: `collectDungeonDelicacySources` → `collectMinesRecipeSources`, merge `collectBiomeFurnitureSources` into it. `dungeon_delicacies`/`taste_maker` → `mines_chest`; `furniture` → `mines_dig_site`
3. **Branded types**: all `storeId` → `StoreId`, `festivalId` → `FestivalId`, `questType` → `QuestType`, `perk` → `perkId: PerkId`, `chestTier` → `tier: TreasureChestTier`
4. **Costs**: `chicken_statue` and `wishing_well` replace `tier` with `cost: number` from `fiddle.misc`
5. **Store requirements**: `collectStoreScrollSources` checks `requirements` for `repaired_*` (emit `upgraded: true`) and `has_perk` (emit `store_with_perk`)
6. **Letter dates**: `collectLetterScrollSources` extracts `triggerDate` from `reached_date` requirement
7. **Hardcoded sources**: `upgrade` gains `storeId: "carpenter" as StoreId`

- [ ] **Step 1: Update imports**

In `pipeline/src/extractors/recipes.ts`, update the import from `$lib/types/tracker-data.js`:

```typescript
import type {
  BiomeId,
  FestivalId,
  ItemId,
  PerkId,
  QuestId,
  QuestType,
  Recipe,
  RecipeId,
  RecipePresentation,
  RecipeSource,
  Season,
  StoreId,
  TreasureChestTier,
  WingId,
} from "$lib/types/tracker-data.js";
```

- [ ] **Step 2: Replace `collectDungeonDelicacySources` and `collectBiomeFurnitureSources` with `collectMinesRecipeSources`**

Remove both `collectDungeonDelicacySources` and `collectBiomeFurnitureSources`. Replace with:

```typescript
function collectMinesRecipeSources(
  fiddle: ParsedGameData,
  itemIdToRecipeId: Map<string, string>,
): Map<string, RecipeSource[]> {
  const dungeons = fiddle.dungeons as Record<string, Record<string, unknown>> | undefined;
  if (!dungeons) return new Map();

  const result = new Map<string, RecipeSource[]>();

  const dungeonsData = dungeons.dungeons as Record<string, unknown> | undefined;
  if (!dungeonsData) return result;

  const biomes = Array.isArray(dungeonsData.biomes) ? (dungeonsData.biomes as unknown[]) : [];

  for (let i = 0; i < biomes.length; i++) {
    const biome = biomes[i];
    if (typeof biome !== "object" || biome === null) continue;
    const biomeObj = biome as Record<string, unknown>;
    const biomeId = `biome_${i}` as BiomeId;

    const chestArrays: [string, PerkId][] = [
      ["dungeon_delicacies", "dungeon_delicacies" as PerkId],
      ["taste_maker", "taste_maker" as PerkId],
    ];
    for (const [arrayKey, perkId] of chestArrays) {
      const items = Array.isArray(biomeObj[arrayKey]) ? (biomeObj[arrayKey] as unknown[]) : [];

      for (const itemId of items) {
        if (typeof itemId !== "string") continue;

        const recipeId = itemIdToRecipeId.get(itemId);
        if (!recipeId) continue;

        const sources = result.get(recipeId) ?? [];
        sources.push({ biomeId, perkId, type: "mines_chest" });
        result.set(recipeId, sources);
      }
    }

    const furniture = Array.isArray(biomeObj.furniture) ? (biomeObj.furniture as unknown[]) : [];
    for (const itemId of furniture) {
      if (typeof itemId !== "string") continue;

      const recipeId = itemIdToRecipeId.get(itemId);
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ biomeId, perkId: "natural_beauty" as PerkId, type: "mines_dig_site" });
      result.set(recipeId, sources);
    }
  }

  return result;
}
```

- [ ] **Step 3: Update `collectChickenStatueSources` to emit `cost` instead of `tier`**

Replace the `rollTiers` array and source push:

```typescript
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

  const misc = fiddle.misc as Record<string, Record<string, unknown>> | undefined;
  const chickenMisc = misc?.chicken_statue as Record<string, unknown> | undefined;
  const lowPrice = (chickenMisc?.low_price as number | undefined) ?? 10;
  const highPrice = (chickenMisc?.high_price as number | undefined) ?? 100;

  const rollCosts: [string, number][] = [
    ["small_roll", lowPrice],
    ["large_roll", highPrice],
  ];
  for (const [rollKey, cost] of rollCosts) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        "chicken_statue",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ cost, type: "chicken_statue" });
      result.set(recipeId, sources);
    }
  }

  return result;
}
```

- [ ] **Step 4: Update `collectWishingWellSources` to emit `cost` instead of `tier`**

Same pattern as chicken statue:

```typescript
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

  const misc = fiddle.misc as Record<string, Record<string, unknown>> | undefined;
  const wellMisc = misc?.wishing_well as Record<string, unknown> | undefined;
  const lowPrice = (wellMisc?.low_price as number | undefined) ?? 100;
  const highPrice = (wellMisc?.high_price as number | undefined) ?? 500;

  const rollCosts: [string, number][] = [
    ["small_roll", lowPrice],
    ["large_roll", highPrice],
  ];
  for (const [rollKey, cost] of rollCosts) {
    const roll = Array.isArray(common[rollKey]) ? (common[rollKey] as unknown[]) : [];
    for (const entry of roll) {
      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      const scrollTarget =
        (obj.recipe_scroll as string | undefined) ?? (obj.crafting_scroll as string | undefined);
      if (!scrollTarget) continue;

      const recipeId = resolveScrollTarget(
        scrollTarget,
        itemIdToRecipeId,
        knownRecipeIds,
        "wishing_well",
      );
      if (!recipeId) continue;

      const sources = result.get(recipeId) ?? [];
      sources.push({ cost, type: "wishing_well" });
      result.set(recipeId, sources);
    }
  }

  return result;
}
```

- [ ] **Step 5: Update `collectFishingChestSources` to use `TreasureChestTier`**

Change the source push from `{ chestTier, type: "treasure_chest" }` to `{ tier: chestTier as TreasureChestTier, type: "treasure_chest" }`.

- [ ] **Step 6: Update `collectPerkSources` to use `PerkId`**

Change `{ perk, type: "perk" }` to `{ perkId: perk as PerkId, type: "perk" }`.

- [ ] **Step 7: Update `collectStoreScrollSources` for `upgraded` and `store_with_perk`**

Add requirement detection. After resolving the scroll target or `include_recipe` item, check for requirements:

```typescript
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
    const storeObj = store;
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

          const recipeId = scrollTarget
            ? resolveScrollTarget(scrollTarget, itemIdToRecipeId, knownRecipeIds, `stores/${storeId}`)
            : obj.include_recipe === true
              ? itemIdToRecipeId.get(obj.item as string)
              : undefined;

          if (!recipeId) continue;

          const sources = result.get(recipeId) ?? [];
          const requirements = obj.requirements as Record<string, unknown> | undefined;

          if (requirements) {
            const hasPerk = requirements.has_perk as string | undefined;
            if (hasPerk) {
              sources.push({ perkId: hasPerk as PerkId, storeId: storeId as StoreId, type: "store_with_perk" });
              result.set(recipeId, sources);
              continue;
            }
            const UPGRADE_PREDICATES = new Set(["repaired_inn", "repaired_general_store", "repaired_carpenters_shop"]);
            const isUpgraded = Object.keys(requirements).some((k) => UPGRADE_PREDICATES.has(k));
            if (isUpgraded) {
              sources.push({ storeId: storeId as StoreId, type: "store", upgraded: true });
              result.set(recipeId, sources);
              continue;
            }
          }

          sources.push({ storeId: storeId as StoreId, type: "store" });
          result.set(recipeId, sources);
        }
      }
    }
  }

  return result;
}
```

- [ ] **Step 8: Update `collectLetterScrollSources` for `triggerDate`**

In the `reached_date` branch, extract date components:

```typescript
if (requirements.reached_date !== undefined) {
  const dateVal = requirements.reached_date as Record<string, unknown> | string | undefined;
  let triggerDate: { day: number; season: Season; year?: number } | undefined;
  if (typeof dateVal === "object" && dateVal !== null) {
    const day = dateVal.day as number | undefined;
    const season = dateVal.season as Season | undefined;
    const year = dateVal.year as number | undefined;
    if (day !== undefined && season !== undefined) {
      triggerDate = year !== undefined && year > 1 ? { day, season, year } : { day, season };
    }
  }
  if (triggerDate) {
    sources.push({ trigger: "reached_date", triggerDate, type: "letter" });
  } else {
    console.warn(
      `  Warning: letter "${letterId}" has reached_date but couldn't parse date — skipping`,
    );
  }
  result.set(recipeId, sources);
  continue;
}
```

- [ ] **Step 9: Update branded types on remaining collectors**

- `collectFestivalScrollSources`: cast `festivalId` to `FestivalId`, `vendorStoreId` to `StoreId`
- `collectQuestScrollSources`: cast `questType` to `QuestType`
- `collectScrollBundleSources`: cast `storeId` to `StoreId`
- `collectHardcodedSources`: add `storeId: "carpenter" as StoreId` to upgrade sources

In `collectHardcodedSources`:
```typescript
const hardcoded: [string, RecipeSource][] = [
  ["water_sprite_statue_v1", { type: "beach_cave_chest" }],
  ["stairs", { storeId: "carpenter" as StoreId, type: "upgrade", upgradeName: "House Stairs" }],
  ["farm_bridge", { storeId: "carpenter" as StoreId, type: "upgrade", upgradeName: "Starter Farm Bridge" }],
  ["engagement_ring", { type: "relationship" }],
];
```

- [ ] **Step 10: Update `extractRecipes` main function**

Replace `mergeSources(collectDungeonDelicacySources(...))` and `mergeSources(collectBiomeFurnitureSources(...))` with `mergeSources(collectMinesRecipeSources(fiddle, itemIdToRecipeId))`.

- [ ] **Step 11: Update tests for new source shapes**

In `pipeline/src/extractors/recipes.test.ts`, update these assertions:

**chicken_statue test**: `{ tier: "small", type: "chicken_statue" }` → `{ cost: 10, type: "chicken_statue" }`. Add `misc: { chicken_statue: { high_price: 100, low_price: 10 } }` to the fixture's `makeFiddle` overrides.

**wishing_well test**: `{ tier: "large", type: "wishing_well" }` → `{ cost: 500, type: "wishing_well" }`. Add `misc: { wishing_well: { high_price: 500, low_price: 100 } }` to the fixture's `makeFiddle` overrides.

**fishing chest test**: `{ chestTier: "bronze", type: "treasure_chest" }` → `{ tier: "bronze", type: "treasure_chest" }`

**deduplication test**: `{ chestTier: "bronze"... }` → `{ tier: "bronze"... }` etc.

**dungeon_chest test**: rename to "maps dungeon_delicacies items to mines_chest source with biome index". Remove `id: "biome_0"` from the fixture's biome object (the extractor derives the ID from the array index, not from a field). Change expected source from `{ biomeId: "biome_0", perk: "dungeon_delicacies", type: "dungeon_chest" }` to `{ biomeId: "biome_0", perkId: "dungeon_delicacies", type: "mines_chest" }`

**festival test**: cast `festivalId`/`storeId` assertions to match branded shape (values unchanged, types align)

**store tests**: add test for `upgraded` and `store_with_perk`:

```typescript
it("emits store source with upgraded flag when requirements include repaired_*", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          inn_special: {
            name: "Inn Special",
            recipe: [{ count: 1, item: "flour" }],
          },
        },
      },
    },
    stores: {
      sleeping_dragon_inn: {
        categories: [
          {
            constant_stock: [
              {
                recipe_scroll: "inn_special",
                requirements: { repaired_inn: true },
              },
            ],
          },
        ],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["inn_special" as RecipeId];
  expect(recipe.sources).toEqual([
    { storeId: "sleeping_dragon_inn", type: "store", upgraded: true },
  ]);
});

it("emits store_with_perk source when requirements include has_perk", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          espresso: {
            name: "Espresso",
            recipe: [{ count: 1, item: "coffee_beans" }],
          },
        },
      },
    },
    stores: {
      darcy_stall: {
        categories: [
          {
            constant_stock: [
              {
                include_recipe: true,
                item: "espresso",
                requirements: { has_perk: "espresso_yourself" },
              },
            ],
          },
        ],
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["espresso" as RecipeId];
  expect(recipe.sources).toEqual([
    { perkId: "espresso_yourself", storeId: "darcy_stall", type: "store_with_perk" },
  ]);
});
```

Add test for `taste_maker` → `mines_chest`:

```typescript
it("maps taste_maker items to mines_chest source", () => {
  const fiddle = makeFiddle({
    dungeons: {
      dungeons: {
        biomes: [
          {
            dungeon_delicacies: [],
            furniture: [],
            taste_maker: ["spicy_soup"],
          },
        ],
      },
    },
    items: {
      other: {
        cooked_dishes: {
          default: {},
          spicy_soup: {
            name: "Spicy Soup",
            recipe: [{ count: 1, item: "pepper" }],
          },
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["spicy_soup" as RecipeId];
  expect(recipe.sources).toEqual([
    { biomeId: "biome_0", perkId: "taste_maker", type: "mines_chest" },
  ]);
});
```

Add test for furniture → `mines_dig_site`:

```typescript
it("maps biome furniture items to mines_dig_site source", () => {
  const fiddle = makeFiddle({
    dungeons: {
      dungeons: {
        biomes: [
          {
            dungeon_delicacies: [],
            furniture: ["cave_shelf"],
            taste_maker: [],
          },
        ],
      },
    },
    items: {
      furniture: {
        cave_set: {
          cave_shelf: {
            name: "Cave Shelf",
            recipe: [{ count: 5, item: "stone" }],
          },
          default: {},
        },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["cave_shelf" as RecipeId];
  expect(recipe.sources).toEqual([
    { biomeId: "biome_0", perkId: "natural_beauty", type: "mines_dig_site" },
  ]);
});
```

Add test for letter with `reached_date`:

```typescript
it("maps letter recipe_scroll with reached_date requirement to letter source with triggerDate", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        cooked_dishes: {
          default: {},
          seasonal_dish: {
            name: "Seasonal Dish",
            recipe: [{ count: 1, item: "pumpkin" }],
          },
        },
      },
    },
    letters: {
      fall_letter: {
        items: [{ recipe_scroll: "seasonal_dish" }],
        requirements: { reached_date: { day: 15, season: "fall" } },
      },
    },
  });

  const { recipes } = extractRecipes(fiddle);
  const recipe = recipes["seasonal_dish" as RecipeId];
  expect(recipe.sources).toEqual([
    { trigger: "reached_date", triggerDate: { day: 15, season: "fall" }, type: "letter" },
  ]);
});
```

- [ ] **Step 12: Run tests**

Run: `pnpm exec vitest run pipeline/`
Expected: All tests pass.

- [ ] **Step 13: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 14: Commit**

```bash
git add pipeline/src/extractors/recipes.ts pipeline/src/extractors/recipes.test.ts
git commit -m "feat: reshape recipe sources with branded types, mines split, costs, requirements"
```

---

### Task 7: Wire up new extractors in pipeline main

**Files:**
- Modify: `pipeline/src/main.ts`

**Interfaces:**
- Consumes: `extractPerks` from Task 2, `extractStoresMeta` from Task 3, `extractFestivals` from Task 4, `extractTreasureChestTiers` from Task 5
- Produces: `TrackerData` with `perks`, `perkTierLevels`, `stores`, `festivals`, `treasureChestTiers` fields

- [ ] **Step 1: Add imports**

Add to the import block in `pipeline/src/main.ts`:

```typescript
import { extractFestivals } from "./extractors/festivals.js";
import { extractPerks } from "./extractors/perks.js";
import { extractStoresMeta } from "./extractors/stores-meta.js";
import { extractTreasureChestTiers } from "./extractors/treasure-chest-tiers.js";
```

- [ ] **Step 2: Call new extractors in Step 3 block**

Add after the existing extractor calls (around line 103):

```typescript
const { perks, perkTierLevels } = extractPerks(fiddle);
const storesMeta = extractStoresMeta(fiddle);
const festivals = extractFestivals(fiddle);
const treasureChestTiers = extractTreasureChestTiers(fiddle);
```

- [ ] **Step 3: Add new fields to TrackerData assembly**

In the `trackerData` object literal (around line 120), add the new fields in alphabetical order:

```typescript
const trackerData: TrackerData = {
  almanac,
  animals,
  cosmetics,
  festivals,
  generatedAt: new Date().toISOString(),
  items,
  mines,
  museum,
  npcs,
  perkTierLevels,
  perks,
  questGates,
  quests,
  recipes,
  renown,
  skills,
  sources,
  stores: storesMeta,
  treasureChestTiers,
  version,
};
```

- [ ] **Step 4: Run type-check**

Run: `pnpm run check`
Expected: Pipeline and types pass. `format.ts` and `recipes-content.svelte` may still have errors (fixed in Tasks 8-9).

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/main.ts
git commit -m "feat: wire up perks, stores, festivals, treasure chest tier extractors"
```

---

### Task 8: Update display labels with enriched lookups and helpers

**Files:**
- Modify: `src/lib/utils/format.ts`

**Interfaces:**
- Consumes: updated `RecipeSource` from Task 1, `TrackerData` fields from Task 7
- Produces: `RecipeSourceLookups` interface, `recipeSourceLabel(source, lookups)`, `withIndefiniteArticle(name)`, `formatStoreName(storeId, stores)`, `formatBiomeName(biomeId, biomes)`

- [ ] **Step 1: Update imports and add the `RecipeSourceLookups` interface and helper functions**

Update the import at the top of `format.ts` to include `BiomeId`, `StoreId`, and `TrackerData`:

```typescript
import type { BiomeId, RecipeSource, Season, SourceType, StoreId, TrackerData, Weather } from "$lib/types/tracker-data.js";
```

Add before `recipeSourceLabel`:

```typescript
export interface RecipeSourceLookups {
  biomes: { endFloor: number; id: string; name: string; startFloor: number }[];
  festivals: Record<string, { name: string }>;
  itemNames: Record<string, string>;
  perks: Record<string, { name: string; skillId: string; tier: number }>;
  perkTierLevels: number[];
  questNames: Record<string, string>;
  skillNames: Record<string, string>;
  stores: Record<string, { article?: "the"; name: string }>;
  treasureChestTiers: Record<string, { name: string }>;
}

export function withIndefiniteArticle(name: string): string {
  const firstChar = name.charAt(0).toLowerCase();
  const article = "aeiou".includes(firstChar) ? "an" : "a";
  return `${article} ${name}`;
}

export function formatStoreName(
  storeId: StoreId,
  stores: Record<StoreId, { article?: "the"; name: string }>,
): string {
  const store = stores[storeId];
  if (!store) return titleCase(storeId);
  return store.article ? `${store.article} ${store.name}` : store.name;
}

export function formatBiomeName(
  biomeId: BiomeId,
  biomes: TrackerData["mines"]["biomes"],
): string {
  const biome = biomes.find((b) => b.id === biomeId);
  if (!biome) return titleCase(biomeId);
  if (biome.name.startsWith("The ")) return `the ${biome.name.slice(4)}`;
  return `the ${biome.name}`;
}
```

- [ ] **Step 2: Rewrite `recipeSourceLabel`**

Replace the existing function with:

```typescript
export function recipeSourceLabel(
  source: RecipeSource,
  lookups: RecipeSourceLookups,
): string {
  switch (source.type) {
    case "beach_cave_chest":
      return "Find in the Gold Treasure Chest in the Beach Cave";
    case "chicken_statue":
      return `Obtain from the Chicken Statue (${String(source.cost)} beads)`;
    case "default":
      return "Available from the start";
    case "dragon_forge":
      return "Craft at the Dragon Forge (Mines level 90)";
    case "festival": {
      const festivalName = lookups.festivals[source.festivalId]?.name ?? titleCase(source.festivalId);
      const storeName = formatStoreName(source.storeId, lookups.stores);
      return `Purchase from ${storeName} at the ${festivalName}`;
    }
    case "letter": {
      if (source.trigger === "shipped_item") {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Receive in a letter after shipping ${withIndefiniteArticle(name)}`;
      }
      if (source.trigger === "donated_item") {
        const name = lookups.itemNames[source.triggerItemId] ?? titleCase(source.triggerItemId);
        return `Receive in a letter after donating ${withIndefiniteArticle(name)}`;
      }
      const { day, season, year } = source.triggerDate;
      const seasonName = seasonLabel(season);
      const dateStr = year ? `${seasonName} ${String(day)}, Year ${String(year)}` : `${seasonName} ${String(day)}`;
      return `Receive in a letter after reaching ${dateStr}`;
    }
    case "mines_chest": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}` : "";
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Find in a Treasure Chest in ${biomeName}${floorRange ? ` (${floorRange})` : ""}, with the ${perkName} perk${tierStr}`;
    }
    case "mines_dig_site": {
      const biomeName = formatBiomeName(source.biomeId, lookups.biomes);
      const biome = lookups.biomes.find((b) => b.id === source.biomeId);
      const floorRange = biome ? `floors ${String(biome.startFloor)}–${String(biome.endFloor)}` : "";
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Dig up in ${biomeName}${floorRange ? ` (${floorRange})` : ""}, with the ${perkName} perk${tierStr}`;
    }
    case "museum_donation": {
      const wingName = titleCase(source.wingId);
      const setWord = source.setCount === 1 ? "set" : "sets";
      return `Complete ${String(source.setCount)} ${setWord} in the ${wingName} wing`;
    }
    case "perk": {
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      const skillName = perk ? (lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId)) : "";
      const tierStr = perk ? ` (${skillName} tier ${String(perk.tier)})` : "";
      return `Unlock the ${perkName} perk${tierStr}`;
    }
    case "quest": {
      const name = lookups.questNames[source.questId] ?? titleCase(source.questId);
      return `Complete the ${name} quest`;
    }
    case "relationship":
      return "Receive from Elsie after getting to 10 hearts with a dateable character";
    case "renown":
      return `Get the town rank to level ${String(source.level)}`;
    case "scroll_bundle": {
      const storeName = formatStoreName(source.storeId, lookups.stores);
      return `Purchase the ${source.bundleName} from ${storeName}`;
    }
    case "store": {
      const storeName = formatStoreName(source.storeId, lookups.stores);
      const suffix = source.upgraded ? " (after upgrade)" : "";
      return `Purchase from ${storeName}${suffix}`;
    }
    case "store_with_perk": {
      const storeName = formatStoreName(source.storeId, lookups.stores);
      const perk = lookups.perks[source.perkId];
      const perkName = perk?.name ?? titleCase(source.perkId);
      return `Purchase from ${storeName} (requires ${perkName} perk)`;
    }
    case "treasure_chest": {
      const tierData = lookups.treasureChestTiers[source.tier];
      const name = tierData?.name ?? `${titleCase(source.tier)} Treasure Box`;
      return `Fish up ${withIndefiniteArticle(name)}`;
    }
    case "upgrade": {
      const storeName = formatStoreName(source.storeId, lookups.stores);
      return `Purchase ${source.upgradeName} from ${storeName}`;
    }
    case "wishing_well":
      return `Obtain from the Wishing Well (${String(source.cost)}t)`;
  }
}
```

- [ ] **Step 3: Add unit tests for label helpers and key label branches**

Create `src/lib/utils/format.test.ts` (or add to it if it exists). Tests should cover:

```typescript
import { describe, expect, it } from "vitest";

import { formatBiomeName, formatStoreName, recipeSourceLabel, withIndefiniteArticle } from "./format.js";

import type { BiomeId, RecipeSource, StoreId } from "$lib/types/tracker-data.js";

const EMPTY_LOOKUPS = {
  biomes: [],
  festivals: {},
  itemNames: {},
  perks: {},
  perkTierLevels: [],
  questNames: {},
  skillNames: {},
  stores: {},
  treasureChestTiers: {},
};

describe("withIndefiniteArticle", () => {
  it("uses 'an' for vowel-starting names", () => {
    expect(withIndefiniteArticle("Apple")).toBe("an Apple");
  });
  it("uses 'a' for consonant-starting names", () => {
    expect(withIndefiniteArticle("Potato")).toBe("a Potato");
  });
});

describe("formatStoreName", () => {
  it("prepends article when present", () => {
    const stores = { general_store: { article: "the" as const, name: "General Store" } };
    expect(formatStoreName("general_store" as StoreId, stores as Record<StoreId, { article?: "the"; name: string }>)).toBe("the General Store");
  });
  it("omits article for possessive names", () => {
    const stores = { merri_stall: { name: "Merri's Stall" } };
    expect(formatStoreName("merri_stall" as StoreId, stores as Record<StoreId, { article?: "the"; name: string }>)).toBe("Merri's Stall");
  });
  it("falls back to titleCase for unknown stores", () => {
    expect(formatStoreName("unknown_shop" as StoreId, {} as Record<StoreId, { article?: "the"; name: string }>)).toBe("Unknown Shop");
  });
});

describe("formatBiomeName", () => {
  it("lowercases leading 'The' in biome names", () => {
    const biomes = [{ endFloor: 19, id: "biome_0" as BiomeId, name: "The Tide Caverns", startFloor: 1 }];
    expect(formatBiomeName("biome_0" as BiomeId, biomes)).toBe("the Tide Caverns");
  });
  it("prepends 'the' for names without leading article", () => {
    const biomes = [{ endFloor: 39, id: "biome_1" as BiomeId, name: "Upper Mines", startFloor: 20 }];
    expect(formatBiomeName("biome_1" as BiomeId, biomes)).toBe("the Upper Mines");
  });
});

describe("recipeSourceLabel", () => {
  it("renders default source", () => {
    expect(recipeSourceLabel({ type: "default" }, EMPTY_LOOKUPS)).toBe("Available from the start");
  });
  it("renders store with upgrade", () => {
    const lookups = { ...EMPTY_LOOKUPS, stores: { inn: { article: "the" as const, name: "Sleeping Dragon Inn" } } as Record<StoreId, { article?: "the"; name: string }> };
    expect(recipeSourceLabel({ type: "store", storeId: "inn" as StoreId, upgraded: true } as RecipeSource, lookups)).toBe("Purchase from the Sleeping Dragon Inn (after upgrade)");
  });
  it("renders letter with reached_date", () => {
    const source: RecipeSource = { type: "letter", trigger: "reached_date", triggerDate: { day: 28, season: "summer" } };
    expect(recipeSourceLabel(source, EMPTY_LOOKUPS)).toBe("Receive in a letter after reaching Summer 28");
  });
  it("renders treasure_chest with tier name", () => {
    const lookups = { ...EMPTY_LOOKUPS, treasureChestTiers: { gold: { name: "Golden Treasure Box" } } };
    const source: RecipeSource = { type: "treasure_chest", tier: "gold" as any };
    expect(recipeSourceLabel(source, lookups)).toBe("Fish up a Golden Treasure Box");
  });
});
```

- [ ] **Step 4: Run type-check**

Run: `pnpm run check`
Expected: `format.ts` passes. `recipes-content.svelte` may still have errors (fixed in Task 9).

- [ ] **Step 5: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 6: Commit**

```bash
git add src/lib/utils/format.ts
git commit -m "feat: rewrite recipeSourceLabel with enriched lookups and display helpers"
```

---

### Task 9: Update recipe list component — expanded lookups, source icons

**Files:**
- Modify: `src/lib/components/recipes-content.svelte`
- Audit: `src/lib/stores/user-state.svelte.ts`

**Interfaces:**
- Consumes: `recipeSourceLabel` with `RecipeSourceLookups` from Task 8, `RecipeSource` from Task 1, Lucide icons from `@lucide/svelte`, `trackerData` with new fields from Task 7
- Produces: Updated recipe list UI with source-type icons replacing green dots

- [ ] **Step 1: Update `RecipeEntry` interface to carry sources**

Change the `RecipeEntry` interface in `recipes-content.svelte`:

```typescript
interface RecipeEntry {
  id: RecipeId;
  name: string;
  sourceLabels: string[];
  sources: RecipeSource[];
}
```

- [ ] **Step 2: Build expanded sourceLookups**

Replace the existing `sourceLookups` derived value:

```typescript
import type { RecipeSource, RecipeId } from "$lib/types/tracker-data.js";
import type { RecipeSourceLookups } from "$lib/utils/format.js";

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
  skillNames: Object.fromEntries(
    Object.entries(trackerData.skills).map(([id, name]) => [id, name]),
  ),
  stores: trackerData.stores,
  treasureChestTiers: trackerData.treasureChestTiers,
});
```

- [ ] **Step 3: Update `recipesByCategory` to pass sources through**

In the recipe entry construction, add `sources`:

```typescript
entries.push({
  id: item.recipeId,
  name: item.name,
  sourceLabels: recipe.sources
    .map((s) => recipeSourceLabel(s, sourceLookups))
    .filter(Boolean),
  sources: recipe.sources,
});
```

- [ ] **Step 4: Add source icon imports and mapping**

Add Lucide icon imports and a mapping function:

```typescript
import {
  Archive,
  ChevronRight,
  CircleCheck,
  Coins,
  Crown,
  Flame,
  Forklift,
  Heart,
  Landmark,
  Mail,
  PartyPopper,
  Pickaxe,
  Scroll,
  ShoppingCart,
  Sparkles,
} from "@lucide/svelte";

import type { Component } from "svelte";

const SOURCE_ICON: Record<RecipeSource["type"], Component> = {
  beach_cave_chest: Archive,
  chicken_statue: Coins,
  default: CircleCheck,
  dragon_forge: Flame,
  festival: PartyPopper,
  letter: Mail,
  mines_chest: Pickaxe,
  mines_dig_site: Pickaxe,
  museum_donation: Landmark,
  perk: Sparkles,
  quest: Scroll,
  relationship: Heart,
  renown: Crown,
  scroll_bundle: ShoppingCart,
  store: ShoppingCart,
  store_with_perk: ShoppingCart,
  treasure_chest: Archive,
  upgrade: Forklift,
  wishing_well: Coins,
};
```

- [ ] **Step 5: Replace green dot with source icon in template**

Replace the source label rendering block (the `{#each entry.sourceLabels as label}` loop):

```svelte
{#each entry.sources as source, i}
  <div class="flex items-center gap-2 text-sm">
    <svelte:component
      this={SOURCE_ICON[source.type]}
      class="size-3.5 shrink-0 text-muted-foreground"
    />
    <span class="text-muted-foreground">{entry.sourceLabels[i]}</span>
  </div>
{/each}
```

- [ ] **Step 6: Verify `user-state.svelte.ts` is unaffected**

Run: `grep -n "defaultUnlocked\|RecipeSource\|recipe\.sources" src/lib/stores/user-state.svelte.ts`
Expected: Only `recipe.sources.some((s) => s.type === "default")` at ~line 114, which is unchanged.

- [ ] **Step 7: Run full checks**

Run: `pnpm run check && pnpm run lint && pnpm exec vitest run pipeline/`
Expected: All pass clean.

- [ ] **Step 8: Run lint:fix**

Run: `pnpm run lint:fix`

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/recipes-content.svelte
git commit -m "feat: add source-type icons and enriched labels to recipe list"
```

---

### Task 10: Final validation, regeneration, and cleanup

**Files:**
- All modified files
- Possibly: `src/lib/data/tracker-data.json` (if assets available)

- [ ] **Step 1: Run full validation suite**

Run: `pnpm run check && pnpm run lint && pnpm exec vitest run pipeline/`
Expected: All pass clean.

- [ ] **Step 2: Regenerate tracker-data.json if assets are available**

Check: `ls pipeline/input/assets/fiddle/ 2>/dev/null`

If assets exist, run: `pnpm run pipeline -- pipeline/input/assets`

If assets are not available, note that `tracker-data.json` will need regeneration on the next pipeline run with assets.

- [ ] **Step 3: File follow-up GitHub issues**

File two issues as specified in the design spec:

```bash
gh issue create --title "Centralized SourceIcon component" --body "Create a semantic \`<SourceIcon type={...} />\` component that maps internal source type semantics to icons, instead of importing Lucide icons directly. Also revisit the \`Archive\` icon for treasure chests; design or source something better."

gh issue create --title "Auto-complete recipe from quest reward" --body "When a quest is completed and its reward includes a recipe, auto-mark the recipe as complete. Show a toast notification. Check for prior completion to avoid double-toggling."
```

- [ ] **Step 4: Run lint:fix for final formatting**

Run: `pnpm run lint:fix`

- [ ] **Step 5: Final commit if needed**

If lint:fix made changes:
```bash
git add -A
git commit -m "chore: lint, format, regenerate tracker-data"
```
