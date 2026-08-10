# Pipeline v2: TOML-based data processing

## Context

Mistria switched engines from GameMaker to a Rust-based engine between v0.13.4 and v1.0.2. The game
data format changed from a single flat `fiddle.json` (slash-delimited path keys) to 295 non-metadata
TOML files organized in a directory tree under `assets/fiddle/`. The v1.0.2 fixture is checked in at
`pipeline/input/assets/`. The existing TypeScript pipeline in `harvest-helper/pipeline/` needs to be
updated to read TOML instead of flat JSON.

**This is not a rewrite.** The existing pipeline structure remains, but the migration must add
strict shape validation, source-file provenance, expression evaluation, and a reusable requirements
parser before updating extractors. This PR adds a recipe domain for direct quest acquisition while
preserving finished-item ownership semantics. Non-quest recipe sources and comprehensive inferred
quest gating remain follow-up work.

## Current pipeline (in harvest-helper)

```
pipeline/
  src/
    main.ts              # Entry point: parse → localize → extract → assemble
    parse-fiddle.ts      # Parses flat slash-key JSON → nested dict (REPLACE)
    localize.ts          # Resolves slash-path localization keys (SIMPLIFY)
    extractors/
      almanac.ts         # Item classification via almanac tags (UPDATE)
      sources.ts         # Where items come from (UPDATE)
      museum.ts          # Museum wings & sets (UPDATE)
      quest-gates.ts     # Quest progression gates (UPDATE)
      quests.ts          # Quest data (UPDATE)
      animals.ts         # Animal variants & cosmetics (UPDATE)
      cosmetics.ts       # Player cosmetics (UPDATE)
      mines.ts           # Dungeon biomes & spells (UPDATE)
      npcs.ts            # NPC data (UPDATE)
      renown.ts          # Renown ranks (UPDATE)
      skills.ts          # Skill definitions (UPDATE)
  input/                 # Currently expects __fiddle__.json + localization.json
  output/                # Produces tracker-data.json
```

The pipeline runs with `tsx` via `pnpm run pipeline` and outputs a single `tracker-data.json` that's
copied to `src/lib/data/` for the SvelteKit app.

## What changes

### 1. Input: flat JSON → TOML directory walk

**Replace `parse-fiddle.ts` entirely.**

The old parser converts flat slash-delimited keys (`"npcs/holt/name": "npcs/holt/name"`) into nested
objects. The new data is already nested TOML files in a directory tree.

New behavior:

- Accept a path to the `assets/fiddle/` directory (not a single JSON file)
- Walk the directory, skipping `.meta.toml` files (engine asset metadata)
- Parse each `.toml` file with a TOML parser (e.g., `smol-toml` or `@iarna/toml` — both pure JS, no
  native deps)
- File path → dict key: `items/furniture/basic_set.toml` → `data.items.furniture.basic_set`
- Return `ParsedFiddle`, containing the same enumerable `FiddleData` shape the extractors already
  expect plus a map from every dotted root path to its relative source filename
- Attach that same map to `ParsedFiddle.data` under a non-enumerable symbol. Evaluation and every
  extractor continue to accept `FiddleData`, but resolve error filenames through the attached parser
  provenance; processors must not discard it or substitute hard-coded filenames
- Wrap TOML parse failures with the relative filename
- Reject duplicate file paths, file/directory key collisions, and attempts to replace a previously
  assigned path

The old `SKIP_PATTERNS` and `SKIP_SECTIONS` lists in `parse-fiddle.ts` filtered out visual/audio
data from the flat JSON. In the new format, this data lives in separate asset directories
(`assets/atlases/`, `assets/audio/`, etc.) and is not included in `assets/fiddle/` at all, so no
filtering is needed. However, some fields within fiddle TOML files still contain sprite/animation
references (e.g., `icon_sprite`, `animation`). These can be kept — the extractors already ignore
fields they don't use.

**The `input/` directory model changes.** Instead of dropping `__fiddle__.json` into
`pipeline/input/`, the pipeline reads an assets directory passed as a CLI argument or environment
variable. The canonical v1.0.2 test fixture at `pipeline/input/assets/` is checked into the repo for
tests, validation, and documentation. Alternate assets directories used for local comparison stay on
the developer's machine and are not checked into the repo.

### 2. Localization: slash-path resolution → already done

**Simplify `localize.ts` dramatically.**

The old localizer resolved self-referencing slash-path strings (`name: "npcs/holt/name"`) by looking
them up in a `localization.json` file. In the new TOML format, **English strings are already
inline**: `name = "Turnip"`, `description = "A fast growing spring crop..."`. There's nothing to
resolve for English.

New behavior for English: the localize step becomes a no-op (or is removed from the pipeline
entirely).

For future i18n support: the new localization system uses `assets/localization/l10n.meta.toml` which
defines a `fiddle_renames` mapping specifying which TOML paths contain localizable fields:

```toml
[asset_properties.fiddle_renames]
    "items/" = ["*/name", "*/description"]
    "npcs/" = ["name", "job"]
    "quests/" = ["*/name", "*/description", "*/stages/*/objective_description"]
    stores = ["*/name"]
    # ... etc
```

Translation files are in `assets/localization/source_caches/{lang}.meta.toml` (English source
strings by path) and `assets/localization/translations/{lang}.meta.toml` (translated strings). These
are large (~5-6 MB each). Only the selected language should be loaded.

**Initial implementation ships English only.** The localize step can accept an optional language
parameter that errors with "not yet supported" for non-English.

Inline strings are not universal. `ui.menus.sub_menus.almanac.categories` still uses
`local_key = "misc_local/fishing_and_diving"` for the fish category. `local_key` is an identifier,
not display text. English-only extraction uses an explicit `fish: "Fishing and Diving"` override and
otherwise falls back to the category key. Generated display names must not match localization-path
syntax.

### 3. Value expression evaluation (NEW)

The new TOML data uses string expressions for some numeric fields. The pipeline needs a new
`evaluate.ts` module (or function within the parser) to resolve these.

**Three expression patterns exist:**

**Pattern 1: `self.recipe * <multiplier>`** Used for `value.bin` on items with recipes. The
multiplier varies by star level:

| Stars | Multiplier | Restoration multiplier |
| ----- | ---------- | ---------------------- |
| 1     | 1.1        | 3.0                    |
| 2     | 1.15       | 3.5                    |
| 3     | 1.2        | 3.75                   |
| 4     | 1.25       | 4.0                    |
| 5     | 1.3        | 4.25                   |

These multipliers are defined in `restoration.toml` (under `[[stars]]`). Resolution: `self.recipe` =
sum of each recipe ingredient's `value.bin * count`. The result is rounded to the nearest integer.

Note: some recipe ingredients may themselves have expression values (e.g., refined stone's value
depends on ore_stone). The evaluator uses depth-first resolution with `unvisited`, `visiting`, and
`resolved` states. Encountering `visiting` again is a cycle and stops the pipeline with the complete
dependency chain.

Recipe ingredient cost uses `value.bin` when numeric. If `value.bin` is absent, it uses numeric
`value.store`; this is required for `sapling_lemon` and `sapling_cherry`, whose bonsai recipes would
otherwise silently omit 400 tesserae. A missing ingredient, malformed recipe entry, or ingredient
with neither value is fatal. Zero is never an implicit fallback.

**Pattern 2: `<item_id>.store * <count>`** Used for bundle store prices. Known instances:

- `basic_wood.store * 20` / `* 100`
- `ore_stone.store * 20` / `* 100`

Resolution: look up the referenced item's `value.store`, multiply.

**Pattern 3: `value_expr` in `restoration.toml`** Per-star-level formula templates for dish bin
prices. These are metadata, not inline values.

**Error handling**: Unknown expression patterns or unresolvable references stop the pipeline with an
error. No silent fallbacks.

### 4. Dish restore calculation (deferred)

The TOML uses `restore = "dish"` plus restoration metadata, but this compatibility PR does not
consume restore values in `TrackerData`. It therefore does not claim or evaluate dish restore
fields. Follow-up dish-evaluation work must establish the game semantics independently, including
whether ingredient counts participate and which rounding rule applies, before adding an evaluator
and fixture expectations.

### 5. Extractor updates

Each extractor needs updates for the structural differences between flat-JSON-derived nested objects
and the native TOML structure.

**Key structural changes:**

| Old (flat JSON parsed to nested)                    | New (native TOML)                                    |
| --------------------------------------------------- | ---------------------------------------------------- |
| Arrays become numbered-key objects (`{0: x, 1: y}`) | Arrays are real arrays (`[x, y]`)                    |
| All values are strings or numbers                   | TOML has booleans, arrays, inline tables             |
| Tags stored as numbered-key objects                 | Tags stored as native arrays                         |
| Almanac categories as numbered-key objects          | Almanac categories as native arrays                  |
| Localization keys as self-referencing strings       | English strings inline                               |
| `icon_sprite` fields skipped by parser              | `icon_sprite` fields present (ignored by extractors) |

The v1.0.2 fixture uses native arrays for every sequence consumed by the pipeline. Centralize strict
`expectArray()` and `expectStringArray()` helpers. Once an extractor claims a sequence field, a
non-array value is malformed data. Do not retain numbered-key compatibility in normal v2 processing.

**Per-extractor notes:**

- **`almanac.ts`**: The almanac categories at `ui.menus.sub_menus.almanac.categories` will be a real
  array of objects, not a numbered-key object. The `readAlmanacCategories()` function needs
  updating. Tags on items will be real arrays. Furniture collapses by `(recipe_key, item.name)` so
  one recipe can retain distinct presentation groups.

- **`sources.ts`**: Store categories, seasonal stock, constant stock, and random stock are real
  arrays. Store entries may be strings or inline tables keyed by `item`, `cosmetic`,
  `recipe_scroll`, or `crafting_scroll`. Store recipe-scroll entries are explicitly ignored because
  this PR claims direct quest acquisition only; item and cosmetic entries are processed.
  Requirements use these observed predicates: named requirements such as `repaired_general_store`,
  plus `has_perk`, `reached_skill_level = { ranching = 20 }`, `reached_mines_level`, `is_season`,
  `unlocked_animal`, `seen_cutscene`, `reached_date`, `has_upper_floor`, and `is_dating_someone`.
  Unsupported predicates on processed stock are fatal and name the store, stock kind, entity,
  predicate, and source file.

  ```toml
  { item = "large_pouch", requirements = { repaired_general_store = true } }
  ```

  The requirement key names map to requirement types (defined in `requirements.toml`).

- **`museum.ts`**: Museum wing ordering now lives in `ui/menus/standard_menus.toml` under
  `museum.{wing}_order` arrays. The museum sets themselves are in `museum_wings/`. The extractor
  should use the menu ordering to control display order.

- **`quest-gates.ts`**: Comprehensive quest-gate inference is deferred. `cutscenes.toml` has no
  `progression_unlocks`; the old extractor cannot be ported by field substitution. This PR removes
  the obsolete inference path and preserves only gates with direct, lossless evidence supported by
  the current output model. Recipe rewards are parsed and validated but are not written into item
  gates.

- **`npcs.ts`**: One file per NPC under `npcs/`. Structure is similar but fields are already
  localized. The `children` field and dating data are new.

- **`mines.ts`**: Read the native `dungeons.dungeons.biomes` array and numeric
  `dungeons.misc.max_floors`. Expanded loot/armor tables are unclaimed by this extractor and
  ignored.

- **`animals.ts`**: Animal data is under `ranching/animals/` with one file per animal. Cosmetics and
  variants are sub-tables within each animal file.

### 6. Requirements model

Requirements are Boolean expression trees. `requirements.toml` contains 128 top-level definitions:
71 primitive/control requirements and 57 named requirements. A named requirement may reference
primitive predicates, other named requirements, `or`, `invert`, arrays, inline tables, and dotted
tables. Parsing produces a typed AST without trying to infer a quest:

```typescript
type RequirementExpr =
  | { all: RequirementExpr[] }
  | { any: RequirementExpr[] }
  | { not: RequirementExpr }
  | { predicate: string; value: unknown };
```

The resolver recursively expands named requirements, rejects unknown names and malformed primitive
values, and reports cycles with the full name chain. Sources map the predicates they support into
`Restriction` values. The later quest-gating project can consume the same AST without duplicating
requirement semantics.

### 7. Quest & recipe acquisition

Quest rewards provide the most reliable unlock edges. For example:

```toml
[green_sapling_surprise]
rewards = [{ renown = 100 }, { crafting_scroll = "sapling_beanbag_chair_green" }]
```

The stage query names `green_sapling_surprise_turn_in`, but that value is an NPC conversation ID.
The quest ID is the enclosing table key, `green_sapling_surprise`. The reward unlocks the recipe for
`sapling_beanbag_chair_green`; it does not grant ownership of the crafted chair. The target item has
`recipe_key = "sapling_beanbag_chair"`. Every item with that recipe key is unlocked together, which
produces five colorways for this recipe.

Across the v1.0.2 quest files, 61 direct recipe rewards use `recipe_scroll` for cooking recipes (34)
and `crafting_scroll` for crafting recipes (27). This PR models those quest acquisitions separately
from finished-item ownership.

Other acquisition channels include letter `items = [{ recipe_scroll = "..." }]`, store stock
entries, store item entries with `include_recipe = true`, renown/festival rewards, and cutscene
`given_items`. They remain deferred until the quest-backed model is working.

The current fixture has 35 direct store `recipe_scroll` entries, 12 store `crafting_scroll` entries,
and 242 `include_recipe` occurrences. Letters also grant recipe scrolls through their `items`
arrays. Cutscenes can start or progress quests and grant items, while Stillwell/Tali challenges use
their own registry plus stage turn-in queries. These channels are semantically distinct and must
remain distinct in the acquisition model.

### 8. Recipe groups & presentation

Recipe acquisition is tracked separately from finished-item ownership. A scroll reward names one
item ID, which resolves to a recipe group:

1. Look up the reward target in the complete item registry.
2. Set `recipeId = item.recipe_key ?? itemId`. Cooking recipes generally use the item ID; furniture
   colorways generally share a `recipe_key`.
3. Collect every craftable item whose `item.recipe_key ?? itemId` equals `recipeId`.
4. Group those items by their localized item name for presentation.
5. Attach the quest source to the recipe group, not to any finished-item ownership gate.

All 61 quest recipe rewards resolve to known items. The fixture contains 867 craftable recipe
groups; 267 contain multiple item IDs. Three recipe keys contain more than one item name, so
grouping only by `recipe_key` would incorrectly collapse distinct designs such as single and double
beds. One recipe may therefore have multiple presentation groups that share the same acquisition
source.

```typescript
export type RecipeId = string & { readonly __brand: "RecipeId" };

export interface RecipeData {
  defaultUnlocked: boolean;
  id: RecipeId;
  itemIds: ItemId[];
  presentations: RecipePresentation[];
  sources: RecipeSource[];
}

export interface RecipePresentation {
  itemIds: ItemId[];
  name: string;
}

export type RecipeSource = {
  questId: QuestId;
  questType: string;
  type: "quest";
};
```

`TrackerData` adds `recipes: Record<RecipeId, RecipeData>`. Almanac furniture rows retain the
canonical item ID used for ownership, but also carry their `recipeId` and presentation item IDs.
`recipe_is_default` must agree across every member of a recipe group; disagreement is fatal.

Quest metadata includes `stillwell_challenges` and `tali_challenges` for cross-reference, even if
those groups are not yet shown as sections on the quests page. A quest recipe source must resolve to
an extracted quest name and type.

For the example, the UI renders the collapsed furniture row as:

> Sapling Beanbag Chair  
> 5 colors  
> Unlocked by completing the Stillwell challenge “Green Sapling Surprise”.

Use “color”/“colors” only when a presentation contains multiple item IDs with the same name. A
recipe with multiple distinct names produces one almanac row per presentation, with each row
pointing to the same recipe acquisition source. The initial implementation displays acquisition
information; it does not add a separate user-controlled recipe completion state.

### 9. New data domains

The v1.0.2 data includes categories that didn't exist in v0.13.4:

| Domain        | Files                                               | Notes                                                  |
| ------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Children      | `children.toml`                                     | Child characters from marriage                         |
| Spells        | `spells.toml`                                       | Magic spells (already partially handled in `mines.ts`) |
| Cameos        | `cameos/*.toml`                                     | Guest characters (5 files)                             |
| Dating        | `dates.toml`                                        | Date events                                            |
| Songs         | `songs.toml`, `song_crystals.toml`                  | Music collectibles (in almanac as `song_crystal`)      |
| Infusions     | `infusions.toml`                                    | Item infusion system                                   |
| Armor         | `armor.toml`                                        | Equipment items                                        |
| Bell sounds   | `bell_sounds.toml`                                  | Bell instrument sounds                                 |
| Request board | `request_board.toml`                                | Request board quests                                   |
| Challenges    | `stillwell_challenges.toml`, `tali_challenges.toml` | Challenge systems                                      |

Some of these (songs, infusions) are already covered by the almanac tag system. Others (children,
cameos, dating) may need new extractors or `TrackerData` sections depending on what harvest-helper
wants to display.

## Item classification: source of truth

The almanac categories in `ui/menus/sub_menus.toml` are the canonical classification:

```toml
categories = [
    { key = "artifacts", tags = ["archaeology"] },
    { key = "blacksmithing", tags = ["blacksmithing"] },
    { key = "bugs", tags = ["bugs"] },
    { key = "cooked_dishes", tags = ["food"] },
    { key = "crops", tags = ["crop"] },
    { key = "date_inspiration", tags = ["date_inspiration"] },
    { key = "fish", tags = ["fishable", "dive"] },
    { key = "forageables", tags = ["forageable"] },
    { key = "furniture", tags = ["furniture"] },
    { key = "materials", tags = ["material"] },
    { key = "ranching", tags = ["ranching"] },
    { key = "song_crystal", tags = ["song_crystal"] },
]
```

**Tags are the source of truth, not file location.** Critical examples:

- `sesame` is in `items/other/crops_and_forage.toml` but lacks the `crop` tag — not a crop
- `honeycomb` is in `items/other/apiaries_and_terrariums.toml` but has the `crop` tag — IS a crop
- The `fish` category matches two tags: `fishable` and `dive`

**Tag precedence**: Iterate almanac categories in menu order and choose the first category whose tag
set intersects the item's tags. Do not choose the first matching tag in item tag order.

**Process or ignore**: Every piece of game data the pipeline encounters falls into one of two
buckets. Data that at least one extractor knows how to use is **processed** — the pipeline extracts
it and errors loudly if anything is malformed or missing. Data that no extractor claims is
**ignored** silently. The nine tracking domains (almanac, animals, cosmetics, mines, museum, npcs,
quests, renown, skills) plus cross-cutting data (sources, quest-gates) each define their own process
rules. The pipeline errors only when data it's _trying to process_ has bad or missing fields, never
because a TOML file exists that nobody asked for.

**Non-almanac tags are fine**: 259 distinct tags exist; most encode sets/attributes (`basic_set`,
`jam`, `single_bed`). Only almanac-mapped tags drive classification.

Additional structural types (not tag-driven):

- `seed` — items with a `crop_object` field
- `sapling` — items with a `sapling` field

## Museum ordering

The museum menu (`ui/menus/standard_menus.toml`) defines wing display order and per-wing set
ordering:

- **Wings**: `archaeology`, `fish`, `flora`, `insect` (in this order)
- **Per-wing set ordering**: `archaeology_order`, `fish_order`, `flora_order`, `insect_order` arrays
  list set IDs in display order

Example:

```toml
archaeology_order = [
    "common_finds", "prehistoric", "ancient", "alda", "caldosian",
    "aldarian", "oopart", "aquatic", "sunken", "deep_woods",
    "fish_trap", "mine", "upper_mines_artifacts", "tide_caverns",
    "deep_earth", "lava_caves", "dragon", "ritual", "mist",
    "vintage_farm_tools", "metals_of_mistria", "gems_of_mistria",
]
```

The museum extractor should read ordering from this menu data, not rely on insertion order from the
TOML files.

## TOML parser choice

The pipeline runs on `tsx` (via pnpm). Options:

- **`smol-toml`**: Pure JS, small, TOML 1.0 spec compliant. Recommended.
- **`@iarna/toml`**: Pure JS, well-maintained, TOML 0.5. May work but TOML 1.0 is safer for the
  game's files.
- **`@ltd/j-toml`**: TOML 1.0, but larger.

Recommend `smol-toml` for minimal footprint and spec compliance.

## Localization data reference

The `l10n.meta.toml` file defines which fields are localizable via `fiddle_renames`:

```toml
[asset_properties.fiddle_renames]
    "items/" = ["*/name", "*/description"]
    "npcs/" = ["name", "job"]
    "quests/" = ["*/name", "*/description", "*/stages/*/objective_description", ...]
    stores = ["*/name"]
    letters = ["*/local", "*/subject_line"]
    locations = ["*/name"]
    perks = ["*/name", "*/description"]
    festivals = ["*/name"]
    spells = ["*/name", "*/description", "*/type"]
    children = ["*/name"]
    cameos = ["name"]
    songs = ["*/name"]
    # ... etc
```

For non-English: source strings are in `source_caches/{lang}.meta.toml` (keyed by path),
translations in `translations/{lang}.meta.toml`. These are large (~5-6 MB each) — load only the
requested language.

## Summary of work

| Task                      | Effort     | Description                                                |
| ------------------------- | ---------- | ---------------------------------------------------------- |
| Replace `parse-fiddle.ts` | Medium     | TOML directory walker, ~100 lines                          |
| Simplify `localize.ts`    | Small      | No-op for English, stub for i18n                           |
| Add `evaluate.ts`         | Medium     | Cycle-safe value expression resolution                     |
| Add requirements resolver | Medium     | Typed Boolean AST, named expansion, validation, and cycles |
| Update `almanac.ts`       | Small      | Real arrays instead of numbered-key objects                |
| Update `sources.ts`       | Medium     | New requirement system, real arrays                        |
| Update `museum.ts`        | Small      | Read ordering from standard_menus                          |
| Bound `quest-gates.ts`    | Small      | Preserve direct evidence and remove obsolete inference     |
| Update other extractors   | Small each | Array handling, field name changes                         |
| Add quest recipe tracking | Medium     | Recipe groups, colorways, quest sources, and almanac UI    |
| Add new domain extractors | Medium     | Children, cameos, dates, etc. as needed                    |
| Update `main.ts`          | Small      | New CLI args, remove localize step                         |
| Update types              | Small      | TrackerData changes for new fields                         |
| Documentation             | Medium     | README, CLAUDE.md, agent docs                              |

## Dependencies

- `smol-toml` (new, for TOML parsing)
- All existing dependencies remain

## Error handling philosophy

The pipeline uses a **process or ignore** model:

- Every piece of game data either matches a **process rule** (claimed by one of the nine tracking
  extractors, or cross-cutting extractors like sources/quest-gates) or is **ignored silently**. Most
  of the 295 non-metadata TOML files contain data irrelevant to tracking (doors, camera, footsteps,
  barks, etc.) and are simply skipped.
- **Within processed data**, the pipeline fails fast and loud:
  - Malformed data on a processed item → stop with error naming the item, the field, and the file
  - Unresolvable value expression → stop with error showing the expression and what's missing
- Missing cross-reference between processed items → stop with error
- Every error includes the entity ID, field or predicate, and relative TOML filename from parser
  provenance
- **No partial output**: all extractors must succeed before writing anything.

The distinction matters: the pipeline should never stop because an item _exists_ that it doesn't
care about. It stops when an item it's _trying to process_ has bad or missing data.
