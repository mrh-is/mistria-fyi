# Pipeline v2: TOML-based data processing implementation plan

> Status: Historical design artifact for PR #43. See `pipeline/README.md` for implemented behavior.
> Where this document differs from the code, the maintainer guide and production code are
> authoritative.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the harvest-helper data pipeline to read Mistria v1.0.2's TOML directory tree
instead of the flat `__fiddle__.json` format from v0.13.4.

**Architecture:** Replace the single-file JSON parser with a strict directory-walking TOML parser
that preserves source-file provenance. Add a shared requirements resolver for the new typed
requirement system, and a cycle-safe value expression evaluator. Update all extractors for native
TOML arrays/tables. Minimal frontend changes to handle new restriction types without breaking the
app.

**Tech Stack:** TypeScript, tsx, pnpm, smol-toml

**Spec:** `docs/superpowers/specs/2026-08-10-pipeline-v2-design.md`

## Global constraints

- Package manager is **pnpm** (not npm/npx/bun). Pipeline runner is **tsx**.
- Run `pnpm run check` and `pnpm run lint` before committing.
- The v1.0.2 fixture is checked in at `pipeline/input/assets/`; commands in this plan use that
  fixture. Because the root `pipeline` script changes into `pipeline/`, its CLI argument is
  `input/assets`; code and commands that run from the repository root use `pipeline/input/assets`.
- Error handling follows the **process-or-ignore** model: data claimed by an extractor is processed
  (errors are fatal if malformed); data claimed by no extractor is silently skipped. See spec for
  full description.
- The enumerable `FiddleData` shape remains `Record<string, unknown>`. Its parser-built provenance
  map is attached under a non-enumerable symbol, so passing `parsed.data` preserves provenance
  without changing iteration or serialized output.
- Evaluation and every extractor continue to accept `FiddleData`. Internal helpers either retain
  that data object or receive a `DataContext` whose `sourceFile` was resolved via
  `sourceFileFor(fiddle, dottedPath)`. Never replace parser-derived provenance with a hard-coded
  filename.
- Claimed v2 sequence fields must be native arrays. Centralized `expectArray()` and
  `expectStringArray()` helpers reject non-arrays with entity, field, and source-file context.
  Remove the duplicated permissive `toArray()` fallbacks.
- Skills data in the new format has no `name` field (only `sprite`). The extractor's `snakeToTitle`
  fallback already handles this.

## File structure

**Modified files:**

- `pnpm-workspace.yaml` — register `pipeline/` as a workspace package
- `pipeline/package.json` — add `smol-toml` dependency
- `pipeline/src/parse-fiddle.ts` — full rewrite: TOML directory walker
- `pipeline/src/parse-fiddle.test.ts` — parser count, representative paths, provenance, collisions,
  and parse errors
- `pipeline/src/data-shapes.ts` — strict array/object/string validators with contextual errors
- `pipeline/src/requirements.ts` — typed Boolean requirements parser and named-requirement resolver
- `pipeline/src/requirements.test.ts` — primitive, nested, named, cycle, and unknown-name cases
- `pipeline/src/localize.ts` — gut to English-only no-op
- `pipeline/src/main.ts` — new CLI arg for assets path, remove localize step, add evaluate step
- `pipeline/src/extractors/almanac.ts` — real arrays, localized strings inline
- `pipeline/src/extractors/sources.ts` — new requirements system, real arrays
- `pipeline/src/extractors/museum.ts` — real arrays for wings/sets/ordering
- `pipeline/src/extractors/quest-gates.ts` — remove obsolete `progression_unlocks` inference;
  preserve only direct gates supported by the current schema
- `pipeline/src/extractors/animals.ts` — one-file-per-animal structure
- `pipeline/src/extractors/cosmetics.ts` — minor: real arrays in sub-category map
- `pipeline/src/extractors/mines.ts` — real arrays for biomes
- `pipeline/src/extractors/npcs.ts` — one-file-per-NPC structure
- `pipeline/src/extractors/quests.ts` — real arrays for stages/rewards/requirements
- `pipeline/src/extractors/renown.ts` — real arrays for ranks/rewards
- `pipeline/src/extractors/skills.ts` — no `name` field, use ID fallback

**New files:**

- `pipeline/src/evaluate.ts` — cycle-safe value expression resolver
- `pipeline/src/evaluate.test.ts` — transitive values, bonsai fallback, malformed inputs, unknowns,
  and cycles

**Frontend & type updates:**

- `src/lib/types/tracker-data.ts` — add new `RestrictionType` variants for the v1.0.2 requirement
  system. The pipeline owns this file; the frontend is downstream.
- Frontend restriction display components — minimal updates to handle new restriction types with
  generic fallback rendering (not full UI redesign)

**Deferred (separate specs & PRs):**

- Recipe tracking & acquisition display — see `docs/superpowers/specs/2026-08-10-recipe-tracking.md`
- Quest-gate improvements (requirement → quest inference) — see
  `docs/superpowers/specs/2026-08-10-quest-gate-improvements.md`
- New data domains (children, cameos, dating, etc. — spec section 7). These need new extractors and
  `TrackerData` sections.

**Execution order:** Task 1 → Task 2 → Task 8 → Task 2A → Tasks 3–7 → Tasks 9–10. The evaluator runs
immediately after parser/main plumbing because it is the riskiest independent transformation.

---

### Task 1: TOML parser & directory walker

Replace `parse-fiddle.ts` with a TOML directory walker that produces the same `FiddleData` shape.

**Files:**

- Modify: `pnpm-workspace.yaml` (add `pipeline` to `packages`)
- Modify: `pipeline/package.json` (add smol-toml)
- Rewrite: `pipeline/src/parse-fiddle.ts`
- Create: `pipeline/src/parse-fiddle.test.ts`

**Interfaces:**

- Produces: `parseFiddle(assetsDir: string): ParsedFiddle`, where `ParsedFiddle` contains `data`,
  `fileCount`, and `sourceFiles: Map<string, string>`. The map keys are dotted parser root paths
  such as `items.furniture.basic_set`; values are relative filenames such as
  `items/furniture/basic_set.toml`.
- Produces: `sourceFileFor(fiddle: FiddleData, dottedPath: string): string`, which finds the longest
  parser root that contains a processed dotted path and returns its relative filename.

- [ ] **Step 1: Register the pipeline workspace and install smol-toml**

Add the pipeline package to `pnpm-workspace.yaml`:

```yaml
packages:
  - pipeline
```

Then install the dependency through that workspace importer:

```bash
pnpm --filter harvest-helper-pipeline add smol-toml
```

- [ ] **Step 2: Rewrite parse-fiddle.ts**

Replace the entire file. The new parser:

1. Accepts a path to the assets directory
2. Recursively walks `assets/fiddle/`
3. Skips `.meta.toml` files (engine metadata)
4. Parses each `.toml` file with `smol-toml`
5. Maps file path to dict key: `items/furniture/basic_set.toml` → `data.items.furniture.basic_set`
6. For top-level files like `stores.toml`, the key is just `stores`
7. For directories like `npcs/holt.toml`, the key is `npcs.holt`
8. Merges each parsed file's contents at its key path in the result object
9. Logs count of files parsed

```typescript
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { parse } from "smol-toml";

const SOURCE_FILES: unique symbol = Symbol("sourceFiles");

export type FiddleData = Record<string, unknown> & {
  readonly [SOURCE_FILES]: ReadonlyMap<string, string>;
};

export interface ParsedFiddle {
  data: FiddleData;
  fileCount: number;
  sourceFiles: Map<string, string>;
}

export function parseFiddle(assetsDir: string): ParsedFiddle {
  const fiddleDir = join(assetsDir, "fiddle");
  const data = {} as FiddleData;
  const sourceFiles = new Map<string, string>();

  walkDirectory(fiddleDir, fiddleDir, data, sourceFiles);
  Object.defineProperty(data, SOURCE_FILES, {
    enumerable: false,
    value: sourceFiles,
  });

  console.log(`  Parsed ${sourceFiles.size} TOML files from ${fiddleDir}`);
  return { data, fileCount: sourceFiles.size, sourceFiles };
}

export function sourceFileFor(fiddle: FiddleData, dottedPath: string): string {
  let candidate = dottedPath;
  while (candidate.length > 0) {
    const sourceFile = fiddle[SOURCE_FILES].get(candidate);
    if (sourceFile) return sourceFile;
    const separator = candidate.lastIndexOf(".");
    candidate = separator === -1 ? "" : candidate.slice(0, separator);
  }
  throw new Error(`No TOML source file found for ${dottedPath}`);
}

function walkDirectory(
  dir: string,
  rootDir: string,
  result: FiddleData,
  sourceFiles: Map<string, string>,
): void {
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      walkDirectory(fullPath, rootDir, result, sourceFiles);
      continue;
    }

    if (!entry.endsWith(".toml") || entry.endsWith(".meta.toml")) continue;

    const relPath = relative(rootDir, fullPath);
    const keyPath = relPath.replace(/\.toml$/, "").split("/");
    const sourceKey = keyPath.join(".");
    const conflictingKey = [...sourceFiles.keys()].find(
      (existing) =>
        existing === sourceKey ||
        existing.startsWith(`${sourceKey}.`) ||
        sourceKey.startsWith(`${existing}.`),
    );
    if (conflictingKey) {
      throw new Error(
        `Duplicate or colliding TOML destinations "${conflictingKey}" and "${sourceKey}" from ${relPath}`,
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parse(readFileSync(fullPath, "utf-8"));
    } catch (error) {
      throw new Error(`Failed to parse ${relPath}`, { cause: error });
    }

    setNestedValue(result, keyPath, parsed, relPath);
    sourceFiles.set(sourceKey, relPath);
  }
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string[],
  value: Record<string, unknown>,
  sourceFile: string,
): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in current)) {
      current[key] = {};
    } else if (
      typeof current[key] !== "object" ||
      current[key] === null ||
      Array.isArray(current[key])
    ) {
      throw new Error(`Path collision while assigning ${sourceFile} at ${path.join(".")}`);
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = path[path.length - 1];
  if (lastKey in current) {
    throw new Error(`Duplicate or colliding path ${path.join(".")} from ${sourceFile}`);
  }
  current[lastKey] = value;
}
```

- [ ] **Step 3: Add parser tests**

Add fixture-backed tests that call the function rather than merely importing its module:

```typescript
import { describe, expect, it } from "vitest";

import { parseFiddle, sourceFileFor } from "./parse-fiddle.js";

describe("parseFiddle", () => {
  it("parses the complete v1.0.2 fixture with representative paths", () => {
    const parsed = parseFiddle("pipeline/input/assets");
    expect(parsed.fileCount).toBe(295);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes");
    expect(parsed.data).toHaveProperty("npcs.holt");
    expect(parsed.data).toHaveProperty("dungeons.dungeons.biomes");
    expect(parsed.sourceFiles.get("items.other.cooked_dishes")).toBe(
      "items/other/cooked_dishes.toml",
    );
    expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
      "items/other/cooked_dishes.toml",
    );
  });
});
```

Use temporary-directory fixtures for malformed TOML, duplicate destinations, and file/directory
collisions; assert that each error includes the relative filename and dotted destination.

- [ ] **Step 4: Run the parser tests and type-check**

```bash
pnpm exec vitest run pipeline/src/parse-fiddle.test.ts
pnpm run check
```

- [ ] **Step 5: Commit**

```bash
git add pnpm-workspace.yaml pipeline/package.json pnpm-lock.yaml pipeline/src/parse-fiddle.ts \
  pipeline/src/parse-fiddle.test.ts
git commit -m "Replace flat JSON parser with TOML directory walker"
```

---

### Task 2: Update main.ts entry point

Update the pipeline entry point to accept the assets directory path, drop the localize step, and
route through the new parser.

**Files:**

- Modify: `pipeline/src/main.ts`
- Modify: `pipeline/src/localize.ts`

**Interfaces:**

- Consumes: `parseFiddle(assetsDir: string): ParsedFiddle` and `sourceFileFor()` from Task 1
- Produces: Updated pipeline that reads from assets dir via CLI arg or env var

- [ ] **Step 1: Update main.ts**

Key changes:

1. Accept assets dir as CLI arg (`process.argv[2]`) or `MISTRIA_ASSETS` env var
2. Remove the localize step entirely (English strings are inline in TOML)
3. Pass assets dir to `parseFiddle()` instead of `INPUT_DIR`
4. Read version from `fiddle.misc` (there's no `version.toml`; version may not exist in the new
   format — log "unknown" and continue)
5. Keep the rest of the pipeline (extractors, assembly, output) the same

```typescript
// New CLI arg handling at the top of main()
const assetsDir = process.argv[2] ?? process.env.MISTRIA_ASSETS;
if (!assetsDir) {
  console.error("Usage: tsx src/main.ts <path-to-assets-dir>");
  console.error("  Or set MISTRIA_ASSETS environment variable");
  process.exit(1);
}

// Replace old parse + localize with:
console.log("Step 1: Parsing TOML data...");
const parsed = parseFiddle(assetsDir);
const fiddle = parsed.data;

// The provenance map is attached non-enumerably to `fiddle`. Passing this object to evaluation and
// every extractor preserves parser-derived filenames without changing enumerable data or output.

// Remove Step 2 (localize) entirely
// Renumber remaining steps
```

Also update the `pipeline` script in the root `package.json` to accept the assets path:

```json
"pipeline": "cd pipeline && tsx src/main.ts"
```

(The user passes the path as an argument: `pnpm run pipeline -- /path/to/assets`)

- [ ] **Step 2: Gut localize.ts**

Replace the entire file with a stub that explains why it's a no-op:

```typescript
// English strings are inline in the TOML data (v1.0.2+).
// This module is retained as a stub for future i18n support.

export function localize(_fiddle: unknown, _lang?: string): never {
  if (_lang && _lang !== "en") {
    throw new Error(`Localization for "${_lang}" is not yet supported`);
  }
  throw new Error("localize() should not be called — English strings are inline in TOML data");
}
```

Remove the `localize` import and call from `main.ts`. Pass `fiddle` directly to extractors (they
previously received the localized result, which was the same shape).

- [ ] **Step 3: Add a bounded parser/main smoke mode**

```bash
pnpm run pipeline -- input/assets --parse-only
```

The smoke mode stops after parsing and checks `fileCount === 295` plus the same three representative
paths as the parser test. It must not enter extractors or invite unbounded fixes that belong to
later tasks.

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/main.ts pipeline/src/localize.ts package.json
git commit -m "Update pipeline entry point for TOML input, remove localize step"
```

---

### Task 2A: Strict data shapes & requirements resolver

Build the shared validation and requirements layer before migrating any extractor that reads
`requirements`.

**Files:**

- Create: `pipeline/src/data-shapes.ts`
- Create: `pipeline/src/requirements.ts`
- Create: `pipeline/src/requirements.test.ts`

**Interfaces:**

- Consumes: `FiddleData` with attached parser provenance from Task 1 when constructing each
  `DataContext`
- Produces: `expectArray<T>(value, context): T[]` and `expectStringArray(value, context): string[]`;
  both throw contextual errors for claimed non-arrays.
- Produces: `parseRequirements(value, registry, context): RequirementExpr`.
- Produces: `resolveNamedRequirements(expr, registry, context): RequirementExpr`, with recursive
  expansion, unknown-name detection, and cycle reporting.

- [ ] **Step 1: Define the typed Boolean AST and strict shape helpers**

```typescript
export type RequirementExpr =
  | { all: RequirementExpr[] }
  | { any: RequirementExpr[] }
  | { not: RequirementExpr }
  | { predicate: string; value: unknown };

export interface DataContext {
  entity?: string;
  field: string;
  sourceFile: string;
}
```

Every production `DataContext.sourceFile` must come from
`sourceFileFor(fiddle, processedDottedPath)`. Literal filenames are allowed only in isolated unit
tests that construct synthetic contexts.

`parseRequirements` recognizes primitive predicates declared as empty top-level tables in
`requirements.toml`, named predicates declared with bodies in that file, implicit `all` for sibling
keys, `or`, `invert`, native arrays, inline tables, and dotted tables. A Boolean `true` under a
named requirement means “expand this name”. A primitive predicate keeps its value for
consumer-specific validation.

- [ ] **Step 2: Write resolver tests before implementation**

Cover these fixture-derived cases:

```typescript
expect(resolve({ repaired_general_store: true })).toEqual({
  predicate: "seen_cutscene",
  value: "repair_the_general_store_pt_2",
});

expect(resolve({ reached_skill_level: { ranching: 20 } })).toEqual({
  predicate: "reached_skill_level",
  value: { ranching: 20 },
});

expect(() => resolve({ unknown_requirement: true })).toThrow(/unknown_requirement.*stores\.toml/);
expect(() => resolveNamed("cycle_a", cyclicRegistry)).toThrow(/cycle_a -> cycle_b -> cycle_a/);
```

Also test nested `or`, nested `invert`, arrays of alternatives, inline tables, dotted tables, and
the real `broke_bell` definition from `requirements.toml`.

- [ ] **Step 3: Implement the resolver with DFS states**

Use `unvisited`, `visiting`, and `resolved` states per named requirement. Cache resolved names, but
retain caller context in thrown errors. Do not coerce malformed values or silently return an empty
expression.

- [ ] **Step 4: Run focused verification**

```bash
pnpm exec vitest run pipeline/src/requirements.test.ts
pnpm run check
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/data-shapes.ts pipeline/src/requirements.ts pipeline/src/requirements.test.ts
git commit -m "Add strict TOML requirement resolution"
```

---

### Task 3: Update almanac extractor

The almanac categories are now a real TOML array, and tags on items are real arrays. The
`readAlmanacCategories` function's numbered-key-to-sorted-array logic needs to handle native arrays.

**Files:**

- Modify: `pipeline/src/extractors/almanac.ts`

**Interfaces:**

- Consumes: `FiddleData` with TOML-native structure and attached parser provenance
- Produces: Same `{ almanac, items }` return shape — no type changes

- [ ] **Step 1: Update readAlmanacCategories**

The almanac categories path is now `ui.menus.sub_menus.almanac.categories` and is a real array of
`{ key, tags, local_key?, icon_sprite? }` objects instead of a numbered-key object. The categories
are in the file `ui/menus/sub_menus.toml`, which the parser places at `fiddle.ui.menus.sub_menus`.

Update `readAlmanacCategories`:

```typescript
function readAlmanacCategories(fiddle: FiddleData): RawAlmanacCategory[] {
  const sourceFile = sourceFileFor(fiddle, "ui.menus.sub_menus.almanac.categories");
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const subMenus = menus?.sub_menus as Record<string, unknown> | undefined;
  const almanac = subMenus?.almanac as Record<string, unknown> | undefined;
  const arr = expectArray<Record<string, unknown>>(almanac?.categories, {
    field: "almanac.categories",
    sourceFile,
  });

  return arr.map((cat: Record<string, unknown>) => ({
    key: cat.key as string,
    tags: expectStringArray(cat.tags, {
      entity: cat.key as string,
      field: "tags",
      sourceFile,
    }),
  }));
}
```

- [ ] **Step 2: Verify items have names without localization**

Most TOML names are inline English strings, but the fish category retains
`local_key = "misc_local/fishing_and_diving"`. Never use `local_key` as display text. Add an English
override for `fish` to produce “Fishing and Diving”, then fall back to `snakeToTitle(category.key)`.
Reject generated display names matching localization-path syntax.

- [ ] **Step 3: Update the chest exclusion logic**

`fish.toml` parses to `fiddle.fish`. Keep `buildChestIdSet`, require `is_chest` to be a TOML Boolean
when present, and throw with fish ID and `fish.toml` if the processed field has another type.

Update category assignment to iterate categories in menu order and select the first category whose
tag set intersects the item's tags. Do not iterate item tags first. Add regression cases for a
perfect ore and a dragon-forged material, both of which have multiple almanac-category tags.

Collapse furniture by `(recipe_key, item.name)`, not `recipe_key` alone. This preserves one row per
colorway family while keeping distinct single- and double-bed presentations separate. Recipe
acquisition display is deferred to the recipe tracking spec.

- [ ] **Step 4: Run the pipeline and verify almanac output**

```bash
pnpm run pipeline -- input/assets
```

Check the almanac section of `pipeline/output/tracker-data-readable.json` for:

- Exactly 12 categories
- The fish category name is “Fishing and Diving”
- Known multi-category fixtures follow menu-order precedence
- No output name matches localization-path syntax
- Furniture colorways with the same recipe key and name are collapsed; mixed-name recipe keys remain
  separate rows

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/extractors/almanac.ts
git commit -m "Update almanac extractor for TOML native arrays"
```

---

### Task 4: Update museum extractor

Museum wings and set ordering now come from real TOML arrays instead of numbered-key objects.

**Files:**

- Modify: `pipeline/src/extractors/museum.ts`

**Interfaces:**

- Consumes: `FiddleData` with TOML-native structure and attached parser provenance
- Produces: Same `MuseumWing[]` return shape

- [ ] **Step 1: Update readMuseumOrdering**

The museum ordering in `ui/menus/standard_menus.toml` now uses real arrays:

- `wings` is `[{ wing: "archaeology", ... }, ...]` (real array, not numbered-key object)
- `{wing}_order` is `["common_finds", "prehistoric", ...]` (real string array)

Update `readMuseumOrdering`:

```typescript
function readMuseumOrdering(fiddle: FiddleData): {
  setOrders: Record<string, string[]>;
  wingOrder: string[];
} {
  const sourceFile = sourceFileFor(fiddle, "ui.menus.standard_menus.museum");
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const standardMenus = menus?.standard_menus as Record<string, unknown> | undefined;
  const museum = standardMenus?.museum as Record<string, unknown> | undefined;
  if (!museum) return { setOrders: {}, wingOrder: [] };

  // Wings: now a real array of { wing: string, ... }
  const rawWings = expectArray<Record<string, unknown>>(museum.wings, {
    field: "museum.wings",
    sourceFile,
  });
  const wingOrder: string[] = [];
  for (const entry of rawWings) {
    const wingId = entry.wing;
    if (typeof wingId !== "string") {
      throw new Error(`museum.wings entry lacks string wing in ${sourceFile}`);
    }
    wingOrder.push(wingId);
  }

  // Set orders: now real string arrays
  const setOrders: Record<string, string[]> = {};
  for (const wingId of wingOrder) {
    const orderKey = `${wingId}_order`;
    const rawOrder = museum[orderKey];
    setOrders[wingId] = expectStringArray(rawOrder, {
      entity: wingId,
      field: orderKey,
      sourceFile,
    });
  }

  return { setOrders, wingOrder };
}
```

- [ ] **Step 2: Update museum wing set item arrays**

Museum wings are in `museum_wings/{wing}.toml`. Each claimed `sets.{setId}.items` field must pass
`expectStringArray`; a missing set, missing item array, or unknown set referenced by menu ordering
is fatal with wing, set, and source-file context.

- [ ] **Step 3: Run the pipeline, verify museum output**

Check `tracker-data-readable.json` for:

- 4 wings in correct order (archaeology, fish, flora, insect)
- Sets within each wing in correct order
- Item arrays populated

- [ ] **Step 4: Commit**

```bash
git add pipeline/src/extractors/museum.ts
git commit -m "Update museum extractor for TOML native arrays"
```

---

### Task 5: Update sources extractor

The sources extractor is the most complex — it pulls from stores, fish, bugs, forageables, crafting,
crops, monsters, quests, festivals, and renown. The main changes: store entries use a new
`requirements` sub-table, and all arrays are native TOML arrays.

**Files:**

- Modify: `pipeline/src/extractors/sources.ts`
- Create: `pipeline/src/extractors/sources.test.ts`
- Modify: `src/lib/types/tracker-data.ts`
- Modify: `src/lib/engine/availability.ts`
- Modify: `src/lib/components/restriction-badges.svelte`

**Interfaces:**

- Consumes: `FiddleData` with TOML-native structure and attached parser provenance
- Produces: Same `TrackerData["sources"]` shape

- [ ] **Step 1: Add failing store-entry classification tests**

The fixture contains 327 string entries, 572 `{ item }` entries, 96 `{ cosmetic }` entries, 35
`{ recipe_scroll }` entries, 12 `{ crafting_scroll }` entries, and 25 other entries. Test constant,
seasonal, and random stock with the same parser. Item and cosmetic entries are claimed. Store recipe
and crafting scrolls are explicitly ignored as non-quest acquisition channels outside this PR. Any
other processed shape produces a contextual error.

- [ ] **Step 2: Map store requirements explicitly**

Consume the resolved AST from Task 2A. Add the smallest `Restriction` union members needed to
preserve the observed predicates instead of relabeling Boolean names as perks:

| Predicate                                 | Restriction                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| `has_perk = "steady_supplies"`            | `{ type: "perk", perk: "steady_supplies" }`               |
| `reached_skill_level = { ranching = 20 }` | `{ type: "skill", skill: "ranching", level: 20 }`         |
| `reached_mines_level = 21`                | `{ type: "minesLevel", level: 21 }`                       |
| `is_season = "spring"`                    | `{ type: "season", seasons: ["spring"] }`                 |
| `unlocked_animal = "duck"`                | `{ type: "animal", animal: "duck" }`                      |
| `seen_cutscene = "reina_two_hearts"`      | `{ type: "cutscene", cutscene: "reina_two_hearts" }`      |
| `reached_date = "summer"`                 | `{ type: "seenSeason", season: "summer" }`                |
| `has_upper_floor = true`                  | `{ type: "upperFloor" }`                                  |
| `is_dating_someone = true`                | `{ type: "relationship", relationship: "datingSomeone" }` |

Named repair/unlock requirements resolve through `requirements.toml` to their primitive predicate
trees. Preserve conjunction, disjunction, and inversion in the output representation; do not flatten
an `or` tree into restrictions that the UI interprets as `all`. If the current `Restriction[]`
schema cannot express the tree losslessly, add a nested `RequirementExpr` field to `Source` and
adapt the availability/display consumers in the same task.

Unsupported predicates on claimed stock are fatal and include the store, stock kind, item or
cosmetic, predicate, and `stores.toml`.

- [ ] **Step 3: Use strict arrays in every source domain**

Replace each local `toArray()` with `expectArray()`. Preserve the observed forageable and monster
paths; once a sub-extractor claims an entry, validate its required ID and sequence fields rather
than using `continue` or `[]` defaults.

- [ ] **Step 4: Add fixture-backed source invariants**

Assert representative entries for each observed store predicate, store cosmetics, constant stock,
seasonal stock, random stock, fish, bugs, crops, forageables, monster drops, festivals, renown, and
ordinary quest item rewards. Assert that recipe/crafting-scroll stock is counted as explicitly
ignored and does not become a finished-item source.

- [ ] **Step 5: Run focused verification**

```bash
pnpm exec vitest run pipeline/src/extractors/sources.test.ts
pnpm run check
```

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/extractors/sources.ts pipeline/src/extractors/sources.test.ts \
  src/lib/types/tracker-data.ts src/lib/engine/availability.ts \
  src/lib/components/restriction-badges.svelte
git commit -m "Update sources extractor for TOML requirements system and native arrays"
```

---

### Task 6: Update remaining extractors (animals, npcs, cosmetics, mines, quests, renown, skills)

These extractors need smaller updates — primarily handling TOML-native arrays and the
one-file-per-entity structure for NPCs and animals.

**Files:**

- Modify: `pipeline/src/extractors/animals.ts`
- Modify: `pipeline/src/extractors/npcs.ts`
- Modify: `pipeline/src/extractors/cosmetics.ts`
- Modify: `pipeline/src/extractors/mines.ts`
- Modify: `pipeline/src/extractors/quests.ts`
- Modify: `pipeline/src/extractors/renown.ts`
- Modify: `pipeline/src/extractors/skills.ts`

**Interfaces:**

- Consumes: `FiddleData` with TOML-native structure and attached parser provenance
- Produces: Same return types for each extractor — no type changes

- [ ] **Step 1: Update animals extractor**

Animals are now one file per species under `ranching/animals/`. The parser maps
`ranching/animals/chicken.toml` to `fiddle.ranching.animals.chicken`. This is the same path the
extractor already reads (`fiddle.ranching.animals`), so the top-level access works.

The per-animal structure uses `core`, `variants.{variantId}`, and `cosmetics.{cosmeticId}` tables.
Validate `core.name`, each claimed variant's name/default/tier fields, and each cosmetic's name
fields. Nested rendering tables such as `variants.default.male` are part of the variant object and
are ignored.

The `default.toml` file parses as `fiddle.ranching.animals.default`; explicitly classify it as
ignored.

Animal availability moved to `core.requirements`. For example, alpaca requires
`repaired_haydens_farm = true` and `reached_date = { season = "winter", day = 1, year = 1 }`. Parse
this through Task 2A. Do not read `core.progression_requirement` or silently drop the gate.

- [ ] **Step 2: Update npcs extractor**

NPCs are one file per NPC under `npcs/`. The parser maps `npcs/holt.toml` to `fiddle.npcs.holt`.
Iterate `fiddle.npcs`, explicitly ignore the default entry, and require each claimed NPC's string
name, Boolean `dateable`, and birthday season/day with that NPC's source filename.

Key difference: in the old flat format, NPC data was deeply nested (`npcs.holt.birthday.season`). In
TOML, `birthday` is an inline table `{ season = "fall", day = 14 }` — same nested shape.

Do not coerce strings or default a missing birthday/dateable field.

- [ ] **Step 3: Update cosmetics extractor**

Player cosmetics are in `player_assets.toml`, which the parser maps to `fiddle.player_assets`. The
extractor already reads from this path. The structure should be the same — each cosmetic is a
top-level key with `name`, `ui_slot`, `default_unlocked`, `ui_sub_category`.

Customization menu metadata is at `fiddle.ui.menus.sub_menus.customization`; player assets retain
`ui_sub_category`. Update `buildSubCategoryMap` to that exact path and fail if a processed cosmetic
references an unknown subcategory.

- [ ] **Step 4: Update mines extractor**

Dungeon biomes are now in `dungeons/dungeons.toml` at `fiddle.dungeons.dungeons.biomes` — but wait,
the parser maps `dungeons/dungeons.toml` to `fiddle.dungeons.dungeons`, and the biomes are a
`[[biomes]]` array at the top level of that file. So they're at `fiddle.dungeons.dungeons.biomes` as
a real array.

The existing extractor reads:

```typescript
const sourceFile = sourceFileFor(fiddle, "dungeons.dungeons.biomes");
const dungeonsInner = dungeons?.dungeons as Record<string, unknown> | undefined;
const rawBiomes = expectArray<Record<string, unknown>>(dungeonsInner?.biomes, {
  field: "dungeons.biomes",
  sourceFile,
});
```

Require numeric `max_floors` from `fiddle.dungeons.misc`; do not default missing biome or floor
data.

Spells are in `spells.toml` at `fiddle.spells`. Same path. But note: the new format has a
`[default]` entry with placeholder values — the extractor already skips `id === "default"`. Also,
skill names may not be in `spells.toml` (they have `name` and `description` fields, so they should
be fine).

- [ ] **Step 5: Update quests extractor**

Quests are in `quests/story_quests.toml`, `quests/heart_quests.toml`, etc. The parser maps these to
`fiddle.quests.story_quests`, `fiddle.quests.heart_quests`, etc. — same paths.

The `QUEST_TYPES` array filters to
`["story_quests", "heart_quests", "fetch_quests", "crown_quests"]`. Require all four fixture files
and report a missing file with its expected relative path.

Quest stages and rewards are now real TOML arrays (`[[quest.stages]]`, `rewards = [...]`). The
visible-quest extractor validates the quest ID, name, and optional `npc_for_icon`; Task 7 owns
stage, requirement, query, and reward parsing across every quest file.

- [ ] **Step 6: Retain and validate renown ranks**

`renown.toml` contains both `rewards` and `[[ranks]]`. Keep `renown.ranks` as the rank source,
require a native array, validate every rank name, and assert the fixture produces exactly 11 ranks
from Wood through Mistril. `renown.rewards` remains solely an acquisition source for reward
extraction; never derive ranks from reward grouping.

- [ ] **Step 7: Update skills extractor**

Skills are in `skills.toml` at `fiddle.skills`. Each skill has only a `sprite` field, so retain the
`snakeToTitle(id)` name fallback and assert exactly nine non-default skills for this fixture.

- [ ] **Step 8: Run full pipeline and verify all extractor outputs**

```bash
pnpm run pipeline -- input/assets
```

Check each section of `tracker-data-readable.json`:

- Animals: all species present with variants and cosmetics
- NPCs: all NPCs with birthdays and dateable flag
- Cosmetics: all processed entries have valid slots and known subcategories
- Mines: biomes with correct floor ranges
- Quests: all quest types populated
- Renown: exactly 11 named ranks, including Mistril
- Skills: exactly nine skills

- [ ] **Step 9: Commit**

```bash
git add pipeline/src/extractors/animals.ts pipeline/src/extractors/npcs.ts \
  pipeline/src/extractors/cosmetics.ts pipeline/src/extractors/mines.ts \
  pipeline/src/extractors/quests.ts pipeline/src/extractors/renown.ts \
  pipeline/src/extractors/skills.ts
git commit -m "Update remaining extractors for TOML native data structure"
```

---

### Task 7: Simplify quest-gate extractor

The v1.0.2 data does not contain `progression_unlocks`, `quest_is_completed` store fields, or the
old animal `progression_requirement` field. Remove those obsolete inference paths. Preserve direct
quest item rewards as item gates. Log what's deferred. Comprehensive quest-gate inference is a
follow-up (see `docs/superpowers/specs/2026-08-10-quest-gate-improvements.md`).

**Files:**

- Modify: `pipeline/src/extractors/quest-gates.ts`
- Modify: `pipeline/src/extractors/quests.ts`

**Interfaces:**

- Consumes: strict arrays from Task 2A
- Produces: `QuestGateIndex` with direct item reward gates only. `animalGates` and `spellGates` will
  be empty until the quest-gate improvements spec is implemented.

- [ ] **Step 1: Remove obsolete inference paths**

Delete:

- `progression_unlocks` collection from cutscenes
- `quest_is_completed` / `progression` fields from store stock entries
- `collectItemQuestGates` store-based inference
- `collectAnimalQuestGates` based on `progression_requirement`
- `collectSpellQuestGates` based on cutscene `spell_to_unlock`

These fields no longer exist in v1.0.2. The shared resolver from Task 2A handles the new
`requirements` system, but mapping requirements back to quests is deferred work.

- [ ] **Step 2: Preserve direct quest item rewards**

Keep the direct path: quest rewards with `{ item = “...” }` create item gates. Update the stage,
query, and reward parsing to use strict arrays (real TOML arrays instead of numbered-key objects).

Update the quests extractor to scan all quest files including `stillwell_challenges` and
`tali_challenges` (these contain challenge quests with item/recipe rewards).

- [ ] **Step 3: Log deferred gates**

Log a summary of what's not yet covered:

```
Quest gates: N direct item gates preserved
  Deferred: animal gates (requires requirement→quest inference)
  Deferred: spell gates (requires cutscene→quest inference)
  Deferred: store item gates (requires requirement→quest inference)
```

Return empty `animalGates` and `spellGates` rather than silently pretending they have no
requirements.

- [ ] **Step 4: Run pipeline, verify quest gate output**

```bash
pnpm run pipeline -- input/assets
```

Verify:

- `questGates.itemGates` has entries from direct quest rewards
- `questGates.animalGates` and `spellGates` are empty (logged as deferred)
- No crashes from missing fields

- [ ] **Step 5: Commit**

```bash
git add pipeline/src/extractors/quest-gates.ts pipeline/src/extractors/quests.ts
git commit -m “Simplify quest-gate extractor for v1.0.2, defer requirement inference”
```

---

### Task 8: Value expression evaluator

Add a new module to resolve computed values: `self.recipe * <multiplier>` for furniture/dish bin
prices and `<item_id>.store * <count>` for bundle prices. Dish restore calculation is deferred
because the current `TrackerData` does not consume it and the TOML alone does not settle its
semantics.

**Files:**

- Create: `pipeline/src/evaluate.ts`
- Create: `pipeline/src/evaluate.test.ts`
- Modify: `pipeline/src/main.ts` (add evaluate step)

**Interfaces:**

- Consumes: `FiddleData` (full parsed data with attached parser-derived provenance)
- Produces: Mutates `FiddleData` in place, resolving string expressions to numbers with DFS cycle
  detection and contextual errors derived through `sourceFileFor()`

- [ ] **Step 1: Write evaluator regression tests**

Before implementation, cover transitive expressions, a dependency cycle with its full chain,
`lemon_bonsai` and `cherry_bonsai` using their saplings' 400 store values, missing ingredients,
ingredients with neither bin nor store value, malformed recipe entries, unknown expression patterns,
and recipe ingredient counts greater than one.

- [ ] **Step 2: Create evaluate.ts with expression resolver**

```typescript
import { sourceFileFor, type FiddleData } from "./parse-fiddle.js";

type ResolutionState = "resolved" | "visiting";
type ValueField = "bin" | "store";

interface EvaluationContext {
  allItems: Map<string, Record<string, unknown>>;
  fiddle: FiddleData;
  itemRoots: Map<string, string>;
  stack: string[];
  valueStates: Map<string, ResolutionState>;
}

export function evaluateExpressions(fiddle: FiddleData): void {
  const itemsRoot = fiddle.items as
    Record<string, Record<string, Record<string, Record<string, unknown>>>> | undefined;
  if (!itemsRoot) return;

  // Build a flat item registry for cross-references
  const allItems = new Map<string, Record<string, unknown>>();
  const itemRoots = new Map<string, string>();
  for (const [categoryId, subCategories] of Object.entries(itemsRoot)) {
    for (const [fileId, categoryItems] of Object.entries(subCategories)) {
      const itemRoot = `items.${categoryId}.${fileId}`;
      const sourceFile = sourceFileFor(fiddle, itemRoot);
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (typeof item === "object" && item !== null) {
          const priorRoot = itemRoots.get(itemId);
          if (priorRoot) {
            throw new Error(
              `Duplicate item ID "${itemId}" in ${sourceFile} and ${sourceFileFor(fiddle, priorRoot)}`,
            );
          }
          allItems.set(itemId, item as Record<string, unknown>);
          itemRoots.set(itemId, itemRoot);
        }
      }
    }
  }

  const context: EvaluationContext = {
    allItems,
    fiddle,
    itemRoots,
    stack: [],
    valueStates: new Map(),
  };
  let resolved = 0;

  // Resolve every value expression through memoized DFS; never rely on map iteration order.
  for (const [itemId, item] of allItems) {
    const value = item.value as Record<string, unknown> | undefined;
    if (typeof value?.bin === "string") {
      resolveValueField(itemId, "bin", context);
      resolved++;
    }
    if (typeof value?.store === "string") {
      resolveValueField(itemId, "store", context);
      resolved++;
    }
  }

  console.log(`  Expressions: ${resolved} values resolved`);
}

function resolveExpression(
  expr: string,
  itemId: string,
  item: Record<string, unknown>,
  context: EvaluationContext,
): number {
  // Pattern 1: self.recipe * <multiplier>
  const selfRecipeMatch = /^self\.recipe\s*\*\s*([\d.]+)$/.exec(expr);
  if (selfRecipeMatch) {
    const multiplier = parseFloat(selfRecipeMatch[1]);
    const recipeCost = calculateRecipeCost(itemId, item, context);
    return Math.round(recipeCost * multiplier);
  }

  // Pattern 2: <item_id>.store * <count>
  const refStoreMatch = /^(\w+)\.store\s*\*\s*(\d+)$/.exec(expr);
  if (refStoreMatch) {
    const refId = refStoreMatch[1];
    const count = parseInt(refStoreMatch[2], 10);
    const storeVal = resolveValueField(refId, "store", context, itemId);
    if (typeof storeVal !== "number") {
      throw itemError(
        context,
        itemId,
        `Expression "${expr}" on item "${itemId}": "${refId}.store" is not a number (got ${typeof storeVal})`,
      );
    }
    return storeVal * count;
  }

  throw itemError(context, itemId, `Unknown expression pattern "${expr}" on item "${itemId}"`);
}

function resolveValueField(
  itemId: string,
  field: ValueField,
  context: EvaluationContext,
  requesterId = itemId,
): number | undefined {
  const item = context.allItems.get(itemId);
  if (!item) {
    throw itemError(context, requesterId, `Value dependency references missing item "${itemId}"`);
  }
  const value = item.value as Record<string, unknown> | undefined;
  if (!value) return undefined;
  const raw = value[field];
  if (raw === undefined) return undefined;
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") {
    throw itemError(
      context,
      itemId,
      `Item "${itemId}" value.${field} must be a number or expression`,
    );
  }

  const key = `${itemId}.value.${field}`;
  if (context.valueStates.get(key) === "visiting") {
    throw itemError(context, itemId, `Value cycle: ${[...context.stack, key].join(" -> ")}`);
  }
  context.valueStates.set(key, "visiting");
  context.stack.push(key);
  const resolved = resolveExpression(raw, itemId, item, context);
  context.stack.pop();
  context.valueStates.set(key, "resolved");
  value[field] = resolved;
  return resolved;
}

function calculateRecipeCost(
  itemId: string,
  item: Record<string, unknown>,
  context: EvaluationContext,
): number {
  const recipe = item.recipe;
  if (!Array.isArray(recipe)) {
    throw itemError(context, itemId, `Item "${itemId}" has self.recipe value but no recipe array`);
  }

  let total = 0;
  for (const ingredient of recipe) {
    if (typeof ingredient !== "object" || ingredient === null) {
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    const ing = ingredient as Record<string, unknown>;
    const ingItemId = ing.item as string | undefined;
    if (!ingItemId) {
      if (typeof ing.hours === "number" && typeof ing.minutes === "number") continue;
      throw itemError(context, itemId, `Malformed recipe entry on item "${itemId}"`);
    }
    if (ing.count !== undefined && (typeof ing.count !== "number" || ing.count <= 0)) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" has invalid count for "${ingItemId}"`,
      );
    }
    const count = (ing.count as number | undefined) ?? 1;

    const ingItem = context.allItems.get(ingItemId);
    if (!ingItem) {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" references missing item "${ingItemId}"`,
      );
    }

    let ingredientValue = resolveValueField(ingItemId, "bin", context, itemId);
    ingredientValue ??= resolveValueField(ingItemId, "store", context, itemId);
    if (typeof ingredientValue !== "number") {
      throw itemError(
        context,
        itemId,
        `Recipe for "${itemId}" uses "${ingItemId}", which has neither numeric bin nor store value`,
      );
    }
    total += ingredientValue * count;
  }

  return total;
}

function itemError(context: EvaluationContext, itemId: string, message: string): Error {
  const itemRoot = context.itemRoots.get(itemId);
  if (!itemRoot) return new Error(message);
  return new Error(`${message} in ${sourceFileFor(context.fiddle, itemRoot)}`);
}
```

- [ ] **Step 3: Enforce complete claimed-value resolution**

After walking the registry, scan every processed value field and throw if `value.bin` or
`value.store` retains a string. Include the item ID, field, original string, dependency chain, and
source file in the error. Do not inspect or mutate `restore` in this PR.

- [ ] **Step 4: Wire evaluate step into main.ts**

Add after the parse step in `main.ts`:

```typescript
import { evaluateExpressions } from "./evaluate.js";

// After parsing:
console.log("Step 2: Evaluating expressions...");
evaluateExpressions(fiddle);
```

Renumber subsequent steps.

- [ ] **Step 5: Run pipeline, verify expression resolution**

```bash
pnpm run pipeline -- input/assets
```

Run the focused tests before the pipeline:

```bash
pnpm exec vitest run pipeline/src/evaluate.test.ts
```

Then assert `lemon_bonsai.value.bin === 462`, `cherry_bonsai.value.bin === 462`, and zero remaining
string expressions in processed `value.bin` or `value.store` fields.

- [ ] **Step 6: Commit**

```bash
git add pipeline/src/evaluate.ts pipeline/src/evaluate.test.ts pipeline/src/main.ts
git commit -m "Add cycle-safe value expression evaluator"
```

---

### Task 9: End-to-end validation & output comparison

Run the full pipeline, verify the output is correct, and compare against the v0.13.4 tracker data to
catch regressions.

**Files:**

- No new files — this is a validation task

- [ ] **Step 1: Run the full pipeline**

```bash
pnpm run pipeline -- input/assets
```

Pipeline should complete without errors and write output only after every extractor and validation
invariant succeeds.

- [ ] **Step 2: Run type checking and linting**

```bash
pnpm run check
pnpm run lint
```

Fix any issues.

- [ ] **Step 3: Run exact fixture invariants**

The old `tracker-data.json` (from v0.13.4) is in `src/lib/data/tracker-data.json`. Compare top-level
keys and counts:

```bash
# Count items in each section
node -e "const d = require('./src/lib/data/tracker-data.json'); console.log('Old:', Object.keys(d).map(k => k + ': ' + (Array.isArray(d[k]) ? d[k].length : typeof d[k] === 'object' ? Object.keys(d[k]).length : d[k])).join(', '))"
node -e "const d = require('./pipeline/output/tracker-data.json'); console.log('New:', Object.keys(d).map(k => k + ': ' + (Array.isArray(d[k]) ? d[k].length : typeof d[k] === 'object' ? Object.keys(d[k]).length : d[k])).join(', '))"
```

Historical counts are diagnostic only. Add and run assertions for 295 parsed files, 12 ordered
almanac categories, four ordered museum wings, nine skills, 11 renown ranks, “Fishing and Diving”,
known multi-category item precedence, both bonsai values, representative store requirements, store
cosmetics, and direct quest item rewards. Assert no processed display name is a localization path
and no processed value expression remains a string. Restore fields remain outside this PR.

- [ ] **Step 4: Verify the app loads the new data**

```bash
pnpm run dev
```

Open the app in a browser. Check:

- All 9 category pages load without errors
- Item names display correctly (no slash-paths, no undefined)
- Exact fixture invariants above remain satisfied
- No console errors

- [ ] **Step 5: Commit the new tracker data**

```bash
git add src/lib/data/tracker-data.json pipeline/output/
git commit -m "Update tracker data for Fields of Mistria v1.0.2"
```

---

### Task 10: Documentation & cleanup

Update docs to reflect the new pipeline and its checked-in fixture.

**Files:**

- Modify: `AGENTS.md` (pipeline command docs)
- Modify: `CONTRIBUTING.md` (pipeline section)
- Modify: `README.md` (pipeline section)
- Modify: `.gitignore` (keep the checked-in fixture visible)
- Delete if present: `pipeline/input/__fiddle__.json`
- Delete if present: `pipeline/input/localization.json`

- [ ] **Step 1: Update AGENTS.md**

Change the pipeline command docs:

```
- **Pipeline**: `pnpm run pipeline -- input/assets` (regenerates `tracker-data.json` from the checked-in game TOML fixture)
```

- [ ] **Step 2: Update README.md pipeline section**

Update the pipeline section to describe the new TOML-based workflow:

- Input is the checked-in `pipeline/input/assets/` fixture (not a single JSON file)
- The CLI may still accept another assets directory for local comparison
- Describe the pipeline steps (parse → evaluate → extract → assemble)

- [ ] **Step 3: Update CONTRIBUTING.md**

Same pipeline command update.

- [ ] **Step 4: Retain the fixture and remove only obsolete flat inputs**

Keep `pipeline/input/assets/`. Remove only obsolete `pipeline/input/__fiddle__.json` and
`pipeline/input/localization.json` if they still exist, and update `.gitignore` without excluding
the fixture.

- [ ] **Step 5: Commit**

```bash
git add -A -- AGENTS.md CONTRIBUTING.md README.md .gitignore pipeline/input
git commit -m "Update docs for the TOML pipeline fixture"
```
