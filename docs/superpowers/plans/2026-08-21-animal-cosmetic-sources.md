# Animal cosmetic sources & pet collectibles implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add acquisition sources to ranching animal cosmetics, and add pet cosmetics & pet skins as
new trackable collectibles on the animals page.

**Architecture:** Extend the pipeline's source accumulator pattern to cover animal cosmetics (via a
composite `animalId:cosmeticId` key), pet cosmetic sets, and pet skins. Add six new source
collectors across stores, chicken statue, festivals, quests, and breeding. On the app side, extend
user state, save import, transfer encoding, and the animals page UI.

**Tech Stack:** TypeScript, SvelteKit (runes), Vitest, pnpm

**Spec:** `docs/superpowers/specs/2026-08-21-animal-cosmetic-sources-design.md`

## Global constraints

- Use `pnpm` exclusively. Never `npm`, `npx`, `yarn`, or `bun`.
- TypeScript `strict: true`, `strictTypeChecked` ESLint.
- Use `type` imports (`consistent-type-imports`).
- Prettier: double quotes, no tabs, trailing commas, 100 char width, semicolons.
- Svelte: `let` (not `const`) for `$props()`. Runes only.
- `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
- Branded IDs for type safety (`string & { readonly __brand: "..." }`).
- Never hand-edit `tracker-data.json`. Never read it in tests.
- Run focused tests during development; full verification matrix before committing.
- Test save file: `pipeline/input/game-1315159680-autosave.sav`

---

### Task 1: Data contract changes

Update `tracker-data.ts` to make `AnimalCosmetic` extend `TrackerEntity`, drop `fullName`, and add
pet types.

**Files:**

- Modify: `src/lib/types/tracker-data.ts`

**Interfaces:**

- Produces: `AnimalCosmetic extends TrackerEntity`, `PetCosmeticSet extends TrackerEntity`,
  `PetSkin extends TrackerEntity`, `PetCosmeticSetId`, `PetSkinId`, `TrackerData.pets`

- [ ] **Step 1: Update `AnimalCosmetic` to extend `TrackerEntity` and drop `fullName`**

In `src/lib/types/tracker-data.ts`, change:

```typescript
export interface AnimalCosmetic {
  fullName: string;
  name: string;
}
```

to:

```typescript
export interface AnimalCosmetic extends TrackerEntity {
  name: string;
}
```

- [ ] **Step 2: Add pet types and IDs**

In `src/lib/types/tracker-data.ts`, add these types (alphabetical position):

```typescript
export type PetCosmeticSetId = string & { readonly __brand: "PetCosmeticSetId" };
export interface PetCosmeticSet extends TrackerEntity {
  name: string;
}
export type PetSkinId = string & { readonly __brand: "PetSkinId" };
export interface PetSkin extends TrackerEntity {
  name: string;
}
```

- [ ] **Step 3: Add `pets` to `TrackerData`**

In the `TrackerData` interface, add between `npcs` and `perkTierLevels`:

```typescript
pets: {
  cosmetics: Record<PetCosmeticSetId, PetCosmeticSet>;
  skins: Record<PetSkinId, PetSkin>;
}
```

- [ ] **Step 4: Export the new types**

Ensure `PetCosmeticSetId`, `PetCosmeticSet`, `PetSkinId`, and `PetSkin` are available via the
existing exports (they're in the same file, so they're exported by declaration).

- [ ] **Step 5: Fix all type errors from `fullName` removal**

Run `pnpm run check 2>&1 | tail -30` to find all references to `AnimalCosmetic.fullName`. There are
two sites:

1. `src/lib/engine/search.ts` — lines 97 and 102 reference `cosmetic.fullName`. Change line 97 to
   search against a synthesized full name:
   `\`${animal.name} ${cosmetic.name}\``. Change line 102 to produce the full name the same way. Remove the `fullName`field from the search result interface if it was only used for animal cosmetics (check`search-results.svelte`
   lines 79 and 137 for the display side).

2. `pipeline/src/extractors/animals.ts` — line 68 emits `fullName`. Remove that line.

Run `pnpm run check 2>&1 | tail -30` again to verify zero type errors.

- [ ] **Step 6: Commit**

```
feat: update data contract for animal cosmetic sources & pets (#107)
```

---

### Task 2: Source accumulators

Add `AnimalCosmeticSourceAccumulator` and `PetCosmeticSourceAccumulator` to the source accumulator
module.

**Files:**

- Modify: `pipeline/src/acquisition/source-accumulator.ts`

**Interfaces:**

- Produces: `AnimalCosmeticSourceAccumulator` (keyed by `AnimalCosmeticKey`),
  `PetCosmeticSourceAccumulator` (keyed by `PetCosmeticSetId`), `AnimalCosmeticKey` type

- [ ] **Step 1: Write tests for the new accumulators**

Create `pipeline/src/acquisition/source-accumulator-animals.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import {
  AnimalCosmeticSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "./source-accumulator";

import type { Source } from "$lib/types/acquisition";
import type { AnimalId, CosmeticId, PetCosmeticSetId } from "$lib/types/tracker-data";

describe("AnimalCosmeticSourceAccumulator", () => {
  it("accumulates sources by composite animalId:cosmeticId key", () => {
    const acc = new AnimalCosmeticSourceAccumulator();
    const source: Source = { type: "store", storeId: "haydens" as any };
    acc.add("chicken" as AnimalId, "top_hat" as CosmeticId, source);
    acc.add("chicken" as AnimalId, "top_hat" as CosmeticId, source); // duplicate

    const entries = acc.animalCosmeticEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      animalId: "chicken",
      cosmeticId: "top_hat",
      sources: [source],
    });
  });

  it("sorts entries by composite key", () => {
    const acc = new AnimalCosmeticSourceAccumulator();
    acc.add("cow" as AnimalId, "halo" as CosmeticId, { type: "store", storeId: "x" as any });
    acc.add("chicken" as AnimalId, "bow" as CosmeticId, { type: "breed" });

    const entries = acc.animalCosmeticEntries();
    expect(entries[0].animalId).toBe("chicken");
    expect(entries[1].animalId).toBe("cow");
  });
});

describe("PetCosmeticSourceAccumulator", () => {
  it("accumulates sources by set ID", () => {
    const acc = new PetCosmeticSourceAccumulator();
    const source: Source = { type: "chicken_statue", cost: 10 };
    acc.add("halo" as PetCosmeticSetId, source);

    expect(acc.get("halo" as PetCosmeticSetId)).toEqual([source]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run pipeline/src/acquisition/source-accumulator-animals.test.ts 2>&1 | tail -15`

Expected: FAIL — `AnimalCosmeticSourceAccumulator` and `PetCosmeticSourceAccumulator` not found.

- [ ] **Step 3: Widen the `targetNamespace` literal type and implement the accumulators**

In `pipeline/src/acquisition/source-accumulator.ts`:

1. Widen the `SourceAccumulator` constructor parameter type from `"cosmetics" | "items"` to
   `string`.

2. Add the `AnimalCosmeticKey` type and new accumulator classes after the existing ones:

```typescript
export type AnimalCosmeticKey = `${AnimalId}:${CosmeticId}`;

export class AnimalCosmeticSourceAccumulator {
  readonly #inner = new (class extends SourceAccumulator<AnimalCosmeticKey> {
    constructor() {
      super("animalCosmetics");
    }
  })();

  add(
    animalId: AnimalId,
    cosmeticId: CosmeticId,
    source: Source,
    provenance?: SourceProvenance,
  ): void {
    this.#inner.add(`${animalId}:${cosmeticId}` as AnimalCosmeticKey, source, provenance);
  }

  animalCosmeticEntries(): { animalId: AnimalId; cosmeticId: CosmeticId; sources: Source[] }[] {
    return this.#inner.entries().map(([key, sources]) => {
      const [animalId, cosmeticId] = key.split(":") as [string, string];
      return {
        animalId: animalId as AnimalId,
        cosmeticId: cosmeticId as CosmeticId,
        sources,
      };
    });
  }

  get(animalId: AnimalId, cosmeticId: CosmeticId): Source[] {
    return this.#inner.get(`${animalId}:${cosmeticId}` as AnimalCosmeticKey);
  }
}

export class PetCosmeticSourceAccumulator extends SourceAccumulator<PetCosmeticSetId> {
  constructor() {
    super("petCosmetics");
  }
}
```

Add the necessary imports for `AnimalId`, `CosmeticId`, and `PetCosmeticSetId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run pipeline/src/acquisition/source-accumulator-animals.test.ts 2>&1 | tail -15`

Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add animal cosmetic & pet cosmetic source accumulators (#107)
```

---

### Task 3: Animals extractor changes

Update the animals extractor to drop `fullName`, initialize `sources` on cosmetics, and collect
`default_cosmetic` breed sources from seasonal variants.

**Files:**

- Modify: `pipeline/src/extractors/animals.ts`
- Modify: `pipeline/src/extractors/animals.test.ts`

**Interfaces:**

- Consumes: `AnimalCosmetic` (from Task 1 — now extends `TrackerEntity`)
- Produces: `extractAnimals` now returns cosmetics with `sources: [{ type: "default" }]` for
  breed-sourced cosmetics (matching the `default_cosmetic` field on variants)

- [ ] **Step 1: Update tests to expect new cosmetic shape**

In `pipeline/src/extractors/animals.test.ts`, update existing cosmetic assertions to expect
`sources: []` (no `fullName`). Then add a test for `default_cosmetic`:

```typescript
it("assigns breed source to cosmetics referenced by default_cosmetic on variants", () => {
  const fiddle = buildFiddle({
    ranching: {
      animals: {
        chicken: {
          core: { name: "Chicken" },
          variants: {
            spring: {
              name: "Spring Chicken",
              default_unlocked: true,
              default_cosmetic: "flower_crown",
            },
          },
          cosmetics: {
            flower_crown: { name: "Chicken Flower Crown" },
            top_hat: { name: "Chicken Top Hat" },
          },
        },
      },
    },
  });

  const result = extractAnimals(fiddle);
  expect(result.chicken.cosmetics.flower_crown).toEqual({
    name: "Flower Crown",
    sources: [{ type: "breed" }],
  });
  expect(result.chicken.cosmetics.top_hat).toEqual({
    name: "Top Hat",
    sources: [],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run pipeline/src/extractors/animals.test.ts 2>&1 | tail -20`

Expected: FAIL — cosmetics still have `fullName` and no `sources`.

- [ ] **Step 3: Update the animals extractor**

In `pipeline/src/extractors/animals.ts`:

1. Remove the `fullName` field from the cosmetic output (line 69, `fullName: rawName`).

2. Collect `default_cosmetic` values from all variants into a `Set<string>`:

```typescript
const breedCosmetics = new Set<string>();
if (rawVariants) {
  for (const [vid, v] of Object.entries(rawVariants)) {
    if (vid === "default") continue;
    const defaultCosmetic = v.default_cosmetic as string | undefined;
    if (defaultCosmetic && defaultCosmetic !== "<n/a>") {
      breedCosmetics.add(defaultCosmetic);
    }
    // ...existing variant processing...
  }
}
```

3. When building each cosmetic entry, check if its ID is in `breedCosmetics`:

```typescript
cosmetics[cid as CosmeticId] = {
  name: stripped || rawName,
  sources: breedCosmetics.has(cid) ? [{ type: "breed" as const }] : [],
};
```

The return type already matches `AnimalCosmetic` (now extending `TrackerEntity`) because we provide
`sources` (a `Source[]`, which will be narrowed to `SourceTuple` when sources are attached in
main.ts).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run pipeline/src/extractors/animals.test.ts 2>&1 | tail -20`

Expected: PASS (fix any other existing tests that assert on the old `fullName` shape).

- [ ] **Step 5: Commit**

```
feat: drop fullName from animal cosmetics, add breed sources (#107)
```

---

### Task 4: Pet cosmetics & skins extractors

New extractor that reads `pets.toml` cosmetic sets and discovers pet skins from item definitions.

**Files:**

- Create: `pipeline/src/extractors/pets.ts`
- Create: `pipeline/src/extractors/pets.test.ts`

**Interfaces:**

- Produces: `extractPetCosmetics(fiddle) → Record<PetCosmeticSetId, PetCosmeticSet>`,
  `extractPetSkins(fiddle) → Record<PetSkinId, PetSkin>`

- [ ] **Step 1: Write tests**

Create `pipeline/src/extractors/pets.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { extractPetCosmetics, extractPetSkins } from "./pets";

import type { ParsedGameData } from "../parse-fiddle";

function buildFiddle(overrides: Record<string, unknown>): ParsedGameData {
  return overrides as unknown as ParsedGameData;
}

describe("extractPetCosmetics", () => {
  it("extracts cosmetic sets with names and empty sources", () => {
    const fiddle = buildFiddle({
      pets: {
        cosmetic_sets: {
          halo: { ui_icon: "spr_ui_item_pet_cosmetic_halo", name: "Halo" },
          flower_crown: { ui_icon: "spr_ui_item_pet_cosmetic_flower_crown" },
        },
      },
    });

    const result = extractPetCosmetics(fiddle);
    expect(result).toEqual({
      halo: { name: "Halo", sources: [] },
      flower_crown: { name: "Flower Crown", sources: [] },
    });
  });

  it("returns empty record when no cosmetic_sets exist", () => {
    const fiddle = buildFiddle({ pets: {} });
    expect(extractPetCosmetics(fiddle)).toEqual({});
  });
});

describe("extractPetSkins", () => {
  it("extracts skins from items with pet_skin_unlock field", () => {
    const fiddle = buildFiddle({
      items: {
        pet_skin_sapling: {
          name: "Pet Skin: Sapling",
          pet_skin_unlock: "sapling",
          soulbind: "forever",
        },
        pet_skin_mushroom: {
          name: "Pet Skin: Mushroom",
          pet_skin_unlock: "mushroom",
          soulbind: "forever",
        },
        regular_item: {
          name: "Egg",
        },
      },
    });

    const result = extractPetSkins(fiddle);
    expect(result).toEqual({
      sapling: { name: "Sapling", sources: [] },
      mushroom: { name: "Mushroom", sources: [] },
    });
  });

  it("returns empty record when no pet skin items exist", () => {
    const fiddle = buildFiddle({ items: {} });
    expect(extractPetSkins(fiddle)).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run pipeline/src/extractors/pets.test.ts 2>&1 | tail -15`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the extractors**

Create `pipeline/src/extractors/pets.ts`:

```typescript
import type {
  PetCosmeticSet,
  PetCosmeticSetId,
  PetSkin,
  PetSkinId,
} from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPetCosmetics(
  fiddle: ParsedGameData,
): Record<PetCosmeticSetId, PetCosmeticSet> {
  const pets = fiddle.pets as Record<string, unknown> | undefined;
  const sets = pets?.cosmetic_sets as Record<string, Record<string, unknown>> | undefined;
  if (!sets) return {};

  const result = {} as Record<PetCosmeticSetId, PetCosmeticSet>;
  for (const [id, set] of Object.entries(sets)) {
    const name = (set.name as string | undefined) ?? titleCase(id);
    result[id as PetCosmeticSetId] = { name, sources: [] };
  }

  console.log(`  Pet cosmetic sets: ${Object.keys(result).length}`);
  return result;
}

export function extractPetSkins(fiddle: ParsedGameData): Record<PetSkinId, PetSkin> {
  const items = fiddle.items as Record<string, Record<string, unknown>> | undefined;
  if (!items) return {};

  const result = {} as Record<PetSkinId, PetSkin>;
  for (const [, item] of Object.entries(items)) {
    if (typeof item !== "object" || item === null) continue;
    const skinUnlock = item.pet_skin_unlock as string | undefined;
    if (!skinUnlock) continue;

    const rawName = (item.name as string | undefined) ?? skinUnlock;
    const name = rawName.replace(/^Pet Skin:\s*/i, "");
    result[skinUnlock as PetSkinId] = { name, sources: [] };
  }

  console.log(`  Pet skins: ${Object.keys(result).length}`);
  return result;
}

function titleCase(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run pipeline/src/extractors/pets.test.ts 2>&1 | tail -15`

Expected: PASS

- [ ] **Step 5: Commit**

```
feat: add pet cosmetics & pet skins extractors (#107)
```

---

### Task 5: Collector changes — stores, chicken statue, festivals, quests, monsters

Extend existing collectors to handle `animal_cosmetic`, `pet_cosmetic`, and ribbon cosmetic entries.

**Files:**

- Modify: `pipeline/src/acquisition/collectors/stores.ts`
- Modify: `pipeline/src/acquisition/collectors/stores.test.ts`
- Modify: `pipeline/src/acquisition/collectors/rewards.ts`
- Modify: `pipeline/src/acquisition/collectors/rewards.test.ts`
- Modify: `pipeline/src/acquisition/collectors/natural.ts`
- Modify: `pipeline/src/acquisition/collectors/natural.test.ts`

**Interfaces:**

- Consumes: `AnimalCosmeticSourceAccumulator`, `PetCosmeticSourceAccumulator` (from Task 2)
- Produces: All four collector entry points gain optional `animalCosmeticAccumulator?` and/or
  `petCosmeticAccumulator?` parameters. The function signatures become:
  - `collectStoreSources(fiddle, requirementContext, accumulator, cosmeticAccumulator?, animalCosmeticAccumulator?)`
  - `collectRewardSources(fiddle, accumulator, cosmeticAccumulator?, animalCosmeticAccumulator?, petCosmeticAccumulator?)`
  - `collectNaturalSources(fiddle, accumulator, cosmeticAccumulator, petCosmeticAccumulator?)`

- [ ] **Step 1: Write tests for store animal cosmetic collection**

In `pipeline/src/acquisition/collectors/stores.test.ts`, add:

```typescript
import { AnimalCosmeticSourceAccumulator } from "../source-accumulator";

it("collects animal_cosmetic entries from store stock", () => {
  const fiddle = buildFiddle({
    stores: {
      haydens: {
        categories: [
          {
            constant_stock: [
              { animal: "chicken", animal_cosmetic: "top_hat" },
              {
                requirements: { unlocked_animal: "horse" },
                animal: "horse",
                animal_cosmetic: "cowboy_hat",
              },
            ],
          },
        ],
      },
    },
  });

  const acc = new ItemSourceAccumulator();
  const cosAcc = new CosmeticSourceAccumulator();
  const animalCosAcc = new AnimalCosmeticSourceAccumulator();
  collectStoreSources(fiddle, requirementContext, acc, cosAcc, animalCosAcc);

  const entries = animalCosAcc.animalCosmeticEntries();
  expect(entries).toContainEqual(
    expect.objectContaining({
      animalId: "chicken",
      cosmeticId: "top_hat",
      sources: [{ type: "store", storeId: "haydens" }],
    }),
  );
});
```

- [ ] **Step 2: Write tests for chicken statue animal cosmetic & pet cosmetic collection**

In `pipeline/src/acquisition/collectors/rewards.test.ts`, add tests for a new
`collectChickenStatueLootSources` function (or the expanded `collectRewardSources`):

```typescript
import {
  AnimalCosmeticSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "../source-accumulator";

describe("chicken statue loot", () => {
  it("collects animal_cosmetic entries as chicken_statue sources", () => {
    const fiddle = buildFiddle({
      chicken_statue: {
        common: {
          small_roll: [{ animal: "chicken", animal_cosmetic: "business_tie" }],
        },
      },
      misc: { chicken_statue: { low_price: 10, high_price: 100 } },
    });

    const acc = new ItemSourceAccumulator();
    const cosAcc = new CosmeticSourceAccumulator();
    const animalCosAcc = new AnimalCosmeticSourceAccumulator();
    const petCosAcc = new PetCosmeticSourceAccumulator();
    collectRewardSources(fiddle, acc, cosAcc, animalCosAcc, petCosAcc);

    const entries = animalCosAcc.animalCosmeticEntries();
    expect(entries).toContainEqual(
      expect.objectContaining({
        animalId: "chicken",
        cosmeticId: "business_tie",
        sources: [{ type: "chicken_statue", cost: 10 }],
      }),
    );
  });

  it("collects pet_cosmetic entries as chicken_statue sources", () => {
    const fiddle = buildFiddle({
      chicken_statue: {
        common: {
          small_roll: [{ pet_cosmetic: "halo" }],
        },
      },
      misc: { chicken_statue: { low_price: 10, high_price: 100 } },
    });

    const acc = new ItemSourceAccumulator();
    const cosAcc = new CosmeticSourceAccumulator();
    const animalCosAcc = new AnimalCosmeticSourceAccumulator();
    const petCosAcc = new PetCosmeticSourceAccumulator();
    collectRewardSources(fiddle, acc, cosAcc, animalCosAcc, petCosAcc);

    expect(petCosAcc.get("halo" as any)).toContainEqual(
      expect.objectContaining({ type: "chicken_statue", cost: 10 }),
    );
  });
});
```

- [ ] **Step 3: Write tests for festival stock animal cosmetics and festival prize ribbon
      cosmetics**

In `pipeline/src/acquisition/collectors/rewards.test.ts`:

```typescript
describe("festival animal cosmetics", () => {
  it("collects animal_cosmetic from festival stock", () => {
    const fiddle = buildFiddle({
      festivals: {
        winter: {
          stocks: {
            nora_souvenir_stall: [
              { animal: "chicken", animal_cosmetic: "apple", tier_required: 0 },
            ],
          },
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    const cosAcc = new CosmeticSourceAccumulator();
    const animalCosAcc = new AnimalCosmeticSourceAccumulator();
    collectRewardSources(fiddle, acc, cosAcc, animalCosAcc);

    const entries = animalCosAcc.animalCosmeticEntries();
    expect(entries).toContainEqual(
      expect.objectContaining({
        animalId: "chicken",
        cosmeticId: "apple",
      }),
    );
  });
});

describe("festival prize ribbons", () => {
  it("collects ribbon cosmetics from animal festival rewards", () => {
    const fiddle = buildFiddle({
      misc: {
        small_animal_festival_rewards: [
          { placeable: "white_{AnimalKind}_wall_ribbon", cosmetic: "ribbon_white" },
        ],
      },
    });

    const acc = new ItemSourceAccumulator();
    const cosAcc = new CosmeticSourceAccumulator();
    const animalCosAcc = new AnimalCosmeticSourceAccumulator();
    collectRewardSources(fiddle, acc, cosAcc, animalCosAcc);

    for (const kind of ["capybara", "chicken", "duck", "rabbit"]) {
      const entries = animalCosAcc.animalCosmeticEntries();
      expect(entries).toContainEqual(
        expect.objectContaining({
          animalId: kind,
          cosmeticId: "ribbon_white",
          sources: [
            { type: "festival_activity", activityId: "animal_contest", festivalId: "animal" },
          ],
        }),
      );
    }
  });
});
```

- [ ] **Step 4: Write tests for quest animal cosmetics**

In `pipeline/src/acquisition/collectors/rewards.test.ts`:

```typescript
describe("quest animal cosmetics", () => {
  it("collects animal_cosmetic from quest rewards", () => {
    const fiddle = buildFiddle({
      quests: {
        story: {
          food_quest: {
            rewards: [{ animal: "cow", animal_cosmetic: "cheese_hat" }],
          },
        },
      },
    });

    const acc = new ItemSourceAccumulator();
    const cosAcc = new CosmeticSourceAccumulator();
    const animalCosAcc = new AnimalCosmeticSourceAccumulator();
    collectRewardSources(fiddle, acc, cosAcc, animalCosAcc);

    const entries = animalCosAcc.animalCosmeticEntries();
    expect(entries).toContainEqual(
      expect.objectContaining({
        animalId: "cow",
        cosmeticId: "cheese_hat",
        sources: [{ type: "quest", questId: "food_quest", trigger: "completion" }],
      }),
    );
  });
});
```

- [ ] **Step 5: Write tests for monster pet_cosmetic drops**

In `pipeline/src/acquisition/collectors/natural.test.ts`:

```typescript
import { PetCosmeticSourceAccumulator } from "../source-accumulator";

it("collects pet_cosmetic drops from monsters", () => {
  const fiddle = buildFiddle({
    monsters: {
      saps: {
        pink_sapling: {
          drops: [{ pet_cosmetic: "skull_mask", chance: 10 }],
        },
      },
    },
  });

  const acc = new ItemSourceAccumulator();
  const cosAcc = new CosmeticSourceAccumulator();
  const petCosAcc = new PetCosmeticSourceAccumulator();
  collectNaturalSources(fiddle, acc, cosAcc, petCosAcc);

  expect(petCosAcc.get("skull_mask" as any)).toContainEqual(
    expect.objectContaining({ type: "monster", monsterId: "pink_sapling" }),
  );
});
```

- [ ] **Step 6: Run tests to verify they all fail**

Run: `pnpm vitest run pipeline/src/acquisition/collectors/ 2>&1 | tail -30`

Expected: FAIL — new tests fail because collectors don't handle the new entry types.

- [ ] **Step 7: Implement stores.ts changes**

In `pipeline/src/acquisition/collectors/stores.ts`:

1. Add `AnimalCosmeticSourceAccumulator` to imports.
2. Add `animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator` parameter to
   `collectStoreSources` and pass it through to `processStoreEntry`.
3. In `processStoreEntry`, after the existing `cosmeticId` handling, add:

```typescript
const animalCosmeticId = obj.animal_cosmetic as string | undefined;
const animalId = obj.animal as string | undefined;
if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
  const availability = combineAvailability(baseAvailability, requirementAvailability);
  const source = buildStoreSource(storeId, availability);
  animalCosmeticAccumulator.add(animalId as AnimalId, animalCosmeticId as CosmeticId, source);
  return;
}
```

Add import for `AnimalId`.

- [ ] **Step 8: Implement rewards.ts changes**

In `pipeline/src/acquisition/collectors/rewards.ts`:

1. Add `AnimalCosmeticSourceAccumulator`, `PetCosmeticSourceAccumulator` imports.
2. Update `collectRewardSources` signature to accept optional `animalCosmeticAccumulator?` and
   `petCosmeticAccumulator?`. Pass them through to the sub-collectors.

3. Add `collectChickenStatueLootSources` function:

```typescript
function collectChickenStatueLootSources(
  fiddle: ParsedGameData,
  animalCosmeticAccumulator?: AnimalCosmeticSourceAccumulator,
  petCosmeticAccumulator?: PetCosmeticSourceAccumulator,
): void {
  const chickenStatue = fiddle.chicken_statue as
    Record<string, Record<string, unknown>> | undefined;
  if (!chickenStatue) return;

  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const chickenMisc = (misc?.chicken_statue as Record<string, unknown>) ?? {};
  const cost = (chickenMisc.low_price as number | undefined) ?? 10;

  for (const [, tier] of Object.entries(chickenStatue)) {
    if (typeof tier !== "object" || tier === null) continue;
    for (const rollKey of ["small_roll", "large_roll"]) {
      const rolls = (tier as Record<string, unknown>)[rollKey];
      if (!Array.isArray(rolls)) continue;

      for (const entry of rolls) {
        if (typeof entry !== "object" || entry === null) continue;
        const obj = entry as Record<string, unknown>;

        const animalCosmeticId = obj.animal_cosmetic as string | undefined;
        const animalId = obj.animal as string | undefined;
        if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
          animalCosmeticAccumulator.add(animalId as AnimalId, animalCosmeticId as CosmeticId, {
            type: "chicken_statue",
            cost,
          });
        }

        const petCosmeticId = obj.pet_cosmetic as string | undefined;
        if (petCosmeticId && petCosmeticAccumulator) {
          petCosmeticAccumulator.add(petCosmeticId as PetCosmeticSetId, {
            type: "chicken_statue",
            cost,
          });
        }
      }
    }
  }
}
```

Call it from `collectRewardSources`.

4. Update `collectFestivalStockSources` — add `animalCosmeticAccumulator?` parameter. In the entry
   loop, add a branch:

```typescript
const animalCosmeticId = obj.animal_cosmetic as string | undefined;
const animalId = obj.animal as string | undefined;
if (animalCosmeticId && animalId && animalCosmeticAccumulator) {
  animalCosmeticAccumulator.add(animalId as AnimalId, animalCosmeticId as CosmeticId, source);
  continue;
}
```

5. Update `collectAnimalFestivalRewardSources` — add `animalCosmeticAccumulator?` parameter. In the
   `expandRewards` inner function, after the existing `accumulator.add(itemId, ...)`, handle the
   `cosmetic` field:

```typescript
const cosmeticId = obj.cosmetic as string | undefined;
if (cosmeticId && animalCosmeticAccumulator) {
  for (const kind of animalKinds) {
    animalCosmeticAccumulator.add(kind as AnimalId, cosmeticId as CosmeticId, {
      type: "festival_activity",
      activityId: "animal_contest" as ActivityId,
      festivalId: "animal" as FestivalId,
    });
  }
}
```

6. Update `processQuestRewards` — add `animalCosmeticAccumulator?` parameter. Add branch:

```typescript
const animalCosmeticId = obj.animal_cosmetic as string | undefined;
const questAnimalId = obj.animal as string | undefined;
if (animalCosmeticId && questAnimalId && animalCosmeticAccumulator) {
  animalCosmeticAccumulator.add(questAnimalId as AnimalId, animalCosmeticId as CosmeticId, {
    type: "quest",
    questId: questId as QuestId,
    trigger: "completion",
  });
}
```

- [ ] **Step 9: Implement natural.ts changes**

In `pipeline/src/acquisition/collectors/natural.ts`:

1. Add `PetCosmeticSourceAccumulator` import and `PetCosmeticSetId`.
2. Add `petCosmeticAccumulator?: PetCosmeticSourceAccumulator` parameter to `collectNaturalSources`
   and pass it to `collectMonsterDropSources`.
3. In the monster drop loop (around line 358-376), add after the existing `cosmeticId` handling:

```typescript
const petCosmeticId = dropObj.pet_cosmetic as string | undefined;
if (petCosmeticId && petCosmeticAccumulator) {
  petCosmeticAccumulator.add(petCosmeticId as PetCosmeticSetId, {
    type: "monster",
    monsterId: monsterId as MonsterId,
  });
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `pnpm vitest run pipeline/src/acquisition/collectors/ 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 11: Commit**

```
feat: collect animal cosmetic & pet cosmetic sources from all TOML sources (#107)
```

---

### Task 6: Pipeline wiring (main.ts)

Wire the new extractors and accumulators into the pipeline's main function. Attach sources to animal
cosmetics, build pet data, and include `pets` in the output.

**Files:**

- Modify: `pipeline/src/main.ts`

**Interfaces:**

- Consumes: `extractPetCosmetics`, `extractPetSkins` (Task 4), `AnimalCosmeticSourceAccumulator`,
  `PetCosmeticSourceAccumulator` (Task 2), updated collector signatures (Task 5)

- [ ] **Step 1: Add imports**

Add to imports in `pipeline/src/main.ts`:

```typescript
import { extractPetCosmetics, extractPetSkins } from "./extractors/pets.js";
import {
  AnimalCosmeticSourceAccumulator,
  PetCosmeticSourceAccumulator,
} from "./acquisition/source-accumulator.js";
```

- [ ] **Step 2: Add extractor calls in Step 3 block**

After `const animals = extractAnimals(fiddle);` (line 327), add:

```typescript
const petCosmetics = extractPetCosmetics(fiddle);
const petSkins = extractPetSkins(fiddle);
```

- [ ] **Step 3: Create accumulators and update collector calls**

After the existing `cosmeticSources` creation (line 346), add:

```typescript
const animalCosmeticSources = new AnimalCosmeticSourceAccumulator();
const petCosmeticSources = new PetCosmeticSourceAccumulator();
```

Update each collector call to pass the new accumulators:

```typescript
collectNaturalSources(fiddle, itemSources, cosmeticSources, petCosmeticSources);
collectRewardSources(
  fiddle,
  itemSources,
  cosmeticSources,
  animalCosmeticSources,
  petCosmeticSources,
);
collectStoreSources(
  fiddle,
  requirementContext,
  itemSources,
  cosmeticSources,
  animalCosmeticSources,
);
```

(`collectExplorationSources` doesn't need changes — no animal cosmetic or pet cosmetic entries in
exploration sources.)

- [ ] **Step 4: Attach animal cosmetic sources**

After the existing "Attach inline acquisition sources to cosmetics" block (after line 382), add:

```typescript
for (const { animalId, cosmeticId, sources } of animalCosmeticSources.animalCosmeticEntries()) {
  const animal = animals[animalId];
  if (!animal) continue;
  const cosmetic = animal.cosmetics[cosmeticId];
  if (!cosmetic) continue;
  cosmetic.sources = [...cosmetic.sources, ...sources];
}
```

- [ ] **Step 5: Attach pet cosmetic sources**

After the animal cosmetic attachment block, add:

```typescript
for (const [setId, sources] of petCosmeticSources.entries()) {
  const set = petCosmetics[setId];
  if (set) {
    set.sources = sources;
  }
}
```

- [ ] **Step 6: Attach pet skin sources (copy from item sources)**

Pet skins are items whose sources come from the item source accumulator. After source attachment:

```typescript
for (const [skinId, skin] of Object.entries(petSkins)) {
  const itemId = `pet_skin_${skinId}`;
  const itemSrc = itemSources.get(itemId as ItemId);
  if (itemSrc.length > 0) {
    skin.sources = itemSrc;
  }
}
```

- [ ] **Step 7: Add `pets` to the TrackerData assembly**

In the `trackerData` object literal (line 428+), add between `npcs` and `perkTierLevels`:

```typescript
pets: { cosmetics: petCosmetics, skins: petSkins },
```

- [ ] **Step 8: Update logging**

Update the inline sources log (around line 398) to include animal cosmetic, pet cosmetic, and pet
skin stats:

```typescript
const animalCosmeticsWithSources = Object.values(animals).reduce(
  (n, a) => n + Object.values(a.cosmetics).filter((c) => c.sources.length > 0).length,
  0,
);
const totalAnimalCosmetics = Object.values(animals).reduce(
  (n, a) => n + Object.keys(a.cosmetics).length,
  0,
);
const petCosmeticsWithSources = Object.values(petCosmetics).filter(
  (c) => c.sources.length > 0,
).length;
const petSkinsWithSources = Object.values(petSkins).filter((s) => s.sources.length > 0).length;
```

Add these to the log line.

- [ ] **Step 9: Run the pipeline and verify output**

Run: `pnpm run pipeline -- pipeline/input/assets/fiddle 2>&1 | tail -20`

Expected: Pipeline completes. Check the log for pet cosmetic sets count (12), pet skins count (14),
and animal cosmetics with sources.

- [ ] **Step 10: Commit**

```
feat: wire animal cosmetics & pets into pipeline (#107)
```

---

### Task 7: User state & save import

Add pet cosmetics and pet skins to the completed state, save import, serialization, and transfer
encoding.

**Files:**

- Modify: `src/lib/stores/user-state.svelte.ts`
- Modify: `src/lib/engine/import-save.ts`
- Modify: `src/lib/engine/transfer.ts`
- Modify: `src/lib/engine/__tests__/transfer.test.ts`

**Interfaces:**

- Consumes: `PetCosmeticSetId`, `PetSkinId`, `TrackerData.pets` (from Task 1)
- Produces: `CompletedState.petCosmetics`, `CompletedState.petSkins`, `togglePetCosmetic()`,
  `togglePetSkin()`, updated transfer encode/decode with version bump

- [ ] **Step 1: Add to `CompletedState` and `MergeCounts`**

In `src/lib/stores/user-state.svelte.ts`, add to `CompletedState`:

```typescript
petCosmetics: Set<PetCosmeticSetId>;
petSkins: Set<PetSkinId>;
```

Add to `MergeCounts`:

```typescript
petCosmetics: number;
petSkins: number;
```

Add to `SerializedState.completed`:

```typescript
petCosmetics?: string[];
petSkins?: string[];
```

Import `PetCosmeticSetId` and `PetSkinId` from tracker-data.

- [ ] **Step 2: Update `createDefaultCompleted`**

Add to the return value:

```typescript
petCosmetics: new SvelteSet<PetCosmeticSetId>(),
petSkins: new SvelteSet<PetSkinId>(),
```

- [ ] **Step 3: Add toggle methods**

Add alongside `toggleAnimalCosmetic`:

```typescript
togglePetCosmetic(setId: PetCosmeticSetId) {
  if (state.completed.petCosmetics.has(setId)) {
    state.completed.petCosmetics.delete(setId);
  } else {
    state.completed.petCosmetics.add(setId);
  }
  scheduleSave();
},

togglePetSkin(skinId: PetSkinId) {
  if (state.completed.petSkins.has(skinId)) {
    state.completed.petSkins.delete(skinId);
  } else {
    state.completed.petSkins.add(skinId);
  }
  scheduleSave();
},
```

- [ ] **Step 4: Update serialization (serialize/deserialize)**

In the `serialize` function, add to the completed object:

```typescript
petCosmetics: [...s.completed.petCosmetics].sort(),
petSkins: [...s.completed.petSkins].sort(),
```

In the `deserialize` function, add to the completed mapping (alongside the existing set
initializations):

```typescript
petCosmetics: new SvelteSet<PetCosmeticSetId>((raw.completed.petCosmetics ?? []) as PetCosmeticSetId[]),
petSkins: new SvelteSet<PetSkinId>((raw.completed.petSkins ?? []) as PetSkinId[]),
```

- [ ] **Step 5: Update merge import logic**

In the `mergeImport` function, add cases for the new sets alongside the existing almanac/cosmetics
patterns:

```typescript
if (imported.petCosmetics) {
  for (const id of imported.petCosmetics) {
    if (!state.completed.petCosmetics.has(id)) {
      state.completed.petCosmetics.add(id);
      counts.petCosmetics++;
    }
  }
}

if (imported.petSkins) {
  for (const id of imported.petSkins) {
    if (!state.completed.petSkins.has(id)) {
      state.completed.petSkins.add(id);
      counts.petSkins++;
    }
  }
}
```

Initialize `petCosmetics: 0` and `petSkins: 0` in the counts object.

- [ ] **Step 6: Update save import (`import-save.ts`)**

In `src/lib/engine/import-save.ts`, add two new sections after the animal cosmetics block:

```typescript
// ── Pet cosmetic sets ──
const petCosmetics = new Set<PetCosmeticSetId>();
const validPetCosmetics = new Set(Object.keys(trackerData.pets.cosmetics));

for (const id of save?.pet_cosmetic_sets_unlocked ?? []) {
  if (validPetCosmetics.has(id)) {
    petCosmetics.add(id as PetCosmeticSetId);
  } else {
    warnings.push(`Unknown pet cosmetic set: ${id}`);
  }
}
counts.petCosmetics = petCosmetics.size;

// ── Pet skins ──
const petSkins = new Set<PetSkinId>();
const validPetSkins = new Set(Object.keys(trackerData.pets.skins));

for (const id of save?.pet_skin_unlocks ?? []) {
  if (validPetSkins.has(id)) {
    petSkins.add(id as PetSkinId);
  } else {
    warnings.push(`Unknown pet skin: ${id}`);
  }
}
counts.petSkins = petSkins.size;
```

Add `petCosmetics` and `petSkins` to the returned result object, and `petCosmetics: 0` and
`petSkins: 0` to the counts initialization.

Import `PetCosmeticSetId` and `PetSkinId`.

- [ ] **Step 7: Update transfer encoding**

In `src/lib/engine/transfer.ts`:

1. Bump `TRANSFER_VERSION` from `2` to `3`.

2. In `encodeTransferPayload`, after section 13 (married NPC), add:

```typescript
// 14. Pet cosmetics (new in v3)
const petCosmeticOrder = getPetCosmeticOrder();
parts.push(toBitfield(petCosmeticOrder, completed.petCosmetics));

// 15. Pet skins (new in v3)
const petSkinOrder = getPetSkinOrder();
parts.push(toBitfield(petSkinOrder, completed.petSkins));
```

3. In `decodeTransferPayload`, after section 13, add (guarded by version check):

```typescript
let petCosmetics = new Set<PetCosmeticSetId>();
let petSkins = new Set<PetSkinId>();
if (version >= 3) {
  const petCosmeticOrder = getPetCosmeticOrder();
  const petCosmeticBytes = readBytes(Math.ceil(petCosmeticOrder.length / 8));
  petCosmetics = fromBitfield(petCosmeticOrder, petCosmeticBytes) as Set<PetCosmeticSetId>;

  const petSkinOrder = getPetSkinOrder();
  const petSkinBytes = readBytes(Math.ceil(petSkinOrder.length / 8));
  petSkins = fromBitfield(petSkinOrder, petSkinBytes) as Set<PetSkinId>;
}
```

Add to the returned object.

4. Add ordering functions:

```typescript
function getPetCosmeticOrder(): PetCosmeticSetId[] {
  return (Object.keys(trackerData.pets.cosmetics) as PetCosmeticSetId[]).sort();
}

function getPetSkinOrder(): PetSkinId[] {
  return (Object.keys(trackerData.pets.skins) as PetSkinId[]).sort();
}
```

Import `PetCosmeticSetId` and `PetSkinId`.

- [ ] **Step 8: Update transfer tests**

In `src/lib/engine/__tests__/transfer.test.ts`, update the mock completed state to include
`petCosmetics` and `petSkins` as empty sets. Add a test for round-tripping pet data:

```typescript
it("round-trips pet cosmetics and pet skins", async () => {
  const state = createTestCompletedState();
  state.petCosmetics = new Set(["halo", "skull_mask"] as PetCosmeticSetId[]);
  state.petSkins = new Set(["sapling", "mushroom"] as PetSkinId[]);

  const encoded = await encodeTransferPayload(state);
  const decoded = await decodeTransferPayload(encoded);

  expect(decoded.petCosmetics).toEqual(state.petCosmetics);
  expect(decoded.petSkins).toEqual(state.petSkins);
});
```

- [ ] **Step 9: Run tests**

Run: `pnpm vitest run src/lib/engine/__tests__/transfer.test.ts 2>&1 | tail -15`

Then: `pnpm run check 2>&1 | tail -30`

Expected: PASS

- [ ] **Step 10: Commit**

```
feat: add pet cosmetics & skins to user state, save import, and transfer (#107)
```

---

### Task 8: UI — animals page

Update the animals page to pass real sources for animal cosmetics and add Pet Cosmetics and Pet
Skins sections.

**Files:**

- Modify: `src/lib/components/animals-content.svelte`
- Modify: `src/lib/components/animal-cosmetics-section.svelte`
- Modify: `src/routes/settings/import-card.svelte`
- Modify: `src/routes/settings/transfer-card.svelte`

**Interfaces:**

- Consumes: `TrackerData.pets`, `CompletedState.petCosmetics`, `CompletedState.petSkins`,
  `togglePetCosmetic()`, `togglePetSkin()` (from Tasks 1, 7)

- [ ] **Step 1: Pass real sources in animal-cosmetics-section.svelte**

In `src/lib/components/animal-cosmetics-section.svelte`, line 48, change:

```typescript
sources: [],
```

to:

```typescript
sources: cosmetic.sources,
```

(This works because `AnimalCosmetic` now extends `TrackerEntity` and has `sources: SourceTuple`.)

- [ ] **Step 2: Add pet cosmetics and pet skins sections to animals-content.svelte**

In `src/lib/components/animals-content.svelte`:

1. Add imports:

```typescript
import ExpandableSection from "./expandable-section.svelte";
import TrackerRow from "./tracker-row.svelte";
import { buildBaseSegmentLookups } from "$lib/utils/segment-lookups.js";
import { recordEntries } from "$lib/utils";
import { celebrate, celebrateCategory } from "$lib/utils/celebrate.js";
import { showUndoToast } from "$lib/utils/undo-toast.js";

import type { PetCosmeticSetId, PetSkinId } from "$lib/types/tracker-data";
```

2. Add helper functions for pet completion:

```typescript
function arePetCosmeticsComplete(): boolean {
  return Object.keys(trackerData.pets.cosmetics).every((id) =>
    userState.state.completed.petCosmetics.has(id as PetCosmeticSetId),
  );
}

function arePetSkinsComplete(): boolean {
  return Object.keys(trackerData.pets.skins).every((id) =>
    userState.state.completed.petSkins.has(id as PetSkinId),
  );
}
```

3. Update `areAllAnimalsComplete` to include pets:

```typescript
function areAllAnimalsComplete(): boolean {
  return (
    Object.keys(trackerData.animals).every((id) => isAnimalComplete(id as AnimalId)) &&
    arePetCosmeticsComplete() &&
    arePetSkinsComplete()
  );
}
```

4. Add pet cosmetics section in the template, between `AnimalCosmeticsSection` and `AllCompleted`:

```svelte
<ExpandableSection
  count={Object.keys(trackerData.pets.cosmetics).filter((id) =>
    userState.state.completed.petCosmetics.has(id as PetCosmeticSetId),
  ).length}
  name="Pet Cosmetics"
  total={Object.keys(trackerData.pets.cosmetics).length}
>
  {#each recordEntries(trackerData.pets.cosmetics) as [setId, set] (setId)}
    {@const completed = userState.state.completed.petCosmetics.has(setId)}
    {#if completed ? userState.state.showCompleted : true}
      <TrackerRow
        display={completed ? { mode: "completed" } : { mode: "visible" }}
        lookups={baseLookups}
        name={set.name}
        sources={set.sources}
        onToggle={() => {
          userState.togglePetCosmetic(setId);
          const nowCompleted = userState.state.completed.petCosmetics.has(setId);
          showUndoToast(set.name, nowCompleted, () => userState.togglePetCosmetic(setId));
          if (nowCompleted && areAllAnimalsComplete()) celebrateCategory();
          else if (nowCompleted && arePetCosmeticsComplete()) celebrate();
        }}
      />
    {/if}
  {/each}
</ExpandableSection>
```

5. Add pet skins section similarly:

```svelte
<ExpandableSection
  count={Object.keys(trackerData.pets.skins).filter((id) =>
    userState.state.completed.petSkins.has(id as PetSkinId),
  ).length}
  name="Pet Skins"
  total={Object.keys(trackerData.pets.skins).length}
>
  {#each recordEntries(trackerData.pets.skins) as [skinId, skin] (skinId)}
    {@const completed = userState.state.completed.petSkins.has(skinId)}
    {#if completed ? userState.state.showCompleted : true}
      <TrackerRow
        display={completed ? { mode: "completed" } : { mode: "visible" }}
        lookups={baseLookups}
        name={skin.name}
        sources={skin.sources}
        onToggle={() => {
          userState.togglePetSkin(skinId);
          const nowCompleted = userState.state.completed.petSkins.has(skinId);
          showUndoToast(skin.name, nowCompleted, () => userState.togglePetSkin(skinId));
          if (nowCompleted && areAllAnimalsComplete()) celebrateCategory();
          else if (nowCompleted && arePetSkinsComplete()) celebrate();
        }}
      />
    {/if}
  {/each}
</ExpandableSection>
```

6. Add `baseLookups` (needed for `TrackerRow`):

```typescript
let redactedStoreIds = $derived(
  new Set(
    recordEntries(trackerData.stores)
      .filter(
        ([, { visibility }]) => visibility && !isVisible(visibility, userState.progressionState),
      )
      .map(([id]) => id),
  ),
);

let baseLookups = $derived(buildBaseSegmentLookups(redactedStoreIds));
```

Add `isVisible` to imports from `$lib/engine/visibility.js`.

- [ ] **Step 3: Update import-card.svelte and transfer-card.svelte**

In `src/routes/settings/import-card.svelte`, add pet cosmetic and pet skin count displays alongside
the existing `animalCosmetics` display:

```svelte
{#if importResult.counts.petCosmetics > 0}
  <li>Pet cosmetics: +{importResult.counts.petCosmetics}</li>
{/if}
{#if importResult.counts.petSkins > 0}
  <li>Pet skins: +{importResult.counts.petSkins}</li>
{/if}
```

Update the "items imported" total to include the new counts.

In `src/routes/settings/transfer-card.svelte`, add similar displays and update the total.

- [ ] **Step 4: Run type check and fix any remaining errors**

Run: `pnpm run check 2>&1 | tail -30`

Fix any type errors (likely around the `baseLookups` or other imports).

- [ ] **Step 5: Commit**

```
feat: display animal cosmetic sources & pet collectibles on animals page (#107)
```

---

### Task 9: Verification & cleanup

Run the full verification matrix, test against the real save file, and clean up.

**Files:** None new — verification only.

- [ ] **Step 1: Run the pipeline to regenerate tracker data**

Run: `pnpm run pipeline -- pipeline/input/assets/fiddle 2>&1 | tail -30`

Expected: Pipeline completes successfully. Check log for:

- Pet cosmetic sets: 12
- Pet skins: 14
- Animal cosmetics with sources > 0

- [ ] **Step 2: Run the full test suite**

Run: `pnpm run test 2>&1 | tail -15`

Expected: All tests pass.

- [ ] **Step 3: Run type checking**

Run: `pnpm run check 2>&1 | tail -15`

Expected: No errors.

- [ ] **Step 4: Run lint**

Run: `pnpm run lint 2>&1 | tail -15`

Expected: No errors (run `pnpm run lint:fix` first if needed).

- [ ] **Step 5: Test save file import**

Write a quick test or use the dev server to import the save file at
`pipeline/input/game-1315159680-autosave.sav`. Expected results from the save:

- `pet_cosmetic_sets_unlocked`: 12 sets (all unlocked)
- `pet_skin_unlocks`: 9 skins (sapling, flying_tome, rock_stack, griffin_statue, flame_spirit,
  void_cat, mimic, stalagmite, mushroom)

- [ ] **Step 6: Visual verification**

Run: `pnpm run dev`

Open the animals page in the browser. Verify:

- Animal cosmetics now show sources (stores, chicken statue, festivals, quests, breed)
- Pet Cosmetics section appears with 12 rows
- Pet Skins section appears with 14 rows
- Completing all entries fires confetti

- [ ] **Step 7: Run build**

Run: `pnpm run build 2>&1 | tail -15`

Expected: Build succeeds.

- [ ] **Step 8: Final commit (if any cleanup needed)**

```
chore: verification cleanup (#107)
```
