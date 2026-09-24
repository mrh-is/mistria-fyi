# Data pipeline

The pipeline converts Fields of Mistria’s native TOML namespaces into the smaller `TrackerData`
model consumed by Mistria Field Guide. It deliberately ignores game domains the tracker does not
claim, but many claimed fields are normalized or omitted according to extractor-specific rules
documented below.

## Setup & commands

The input argument is an assets root containing either an extracted `fiddle/`, or `assets.zip`
itself (Steam's own distribution format — see below). Game assets are ignored by Git and are not
present in a fresh clone.

```sh
pnpm run pipeline -- --version=1.0.5
pnpm run pipeline -- /path/to/assets
pnpm run pipeline -- /path/to/assets.zip
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
pnpm run pipeline -- /path/to/assets --parse-only
```

With no path argument and no `MISTRIA_ASSETS`, the pipeline falls back to Fields of Mistria's
default Steam install location — the only platform the game ships on:

```text
C:\Program Files (x86)\Steam\steamapps\common\Fields of Mistria
```

so `pnpm run pipeline -- --sprites` (or the other commands below) works with no configuration on a
stock Windows dev machine that owns the game.

The pipeline reads `FieldsOfMistria.exe`'s Product Version beside the archive automatically. On
macOS and Linux, pass `--version=X.Y.Z` when the assets omit a native version value.

That directory contains `assets.zip` rather than an extracted `fiddle/`. `parseFiddle` (disk) and
`parseFiddleFromZip` (`parse-fiddle.ts`) both produce the same `ParsedGameData` shape, so every
extractor is source-agnostic: when `assetsDir` has no `fiddle/` on disk, the pipeline reads TOML
entries straight out of `assets.zip` via streaming instead — it never extracts the archive to disk,
so a full run doesn't cost the archive's multiple gigabytes of disk space or the time to unzip it.
Sprite extraction (`extractors/sprites.ts`) has always read PNGs the same way, directly out of
`assets.zip`.

`--sprites-only` (alias: `pnpm run sprites:villagers`) is the narrowest of these: it parses only
`fiddle.npcs` and regenerates villager sprites alone, skipping `tracker-data.json`, locale chunks,
and every other output — the right command for "just get me fresh villager icons," including
straight off a bare Steam install with nothing extracted. Item sprites don't have an equivalent
zip-only-without-extraction mode yet; producing `iconSpritesByItemId` still goes through
`extractAlmanac`, which also does per-locale name lookups that read from disk, so a full item-sprite
regeneration still needs `fiddle/` extracted first and `--sprites` on the full pipeline run.

`--parse-only` currently enforces the v1.0.5 fixture’s 297 non-metadata files and three
representative paths, so it is not a version-agnostic validator.

Supporting a new Fields of Mistria version is a reviewed application release, not a routine
regeneration. Follow the [game version update protocol](../docs/game-version-update-protocol.md)
before changing version-specific fixtures or committing generated data from different game assets.

### Test tiers

The default pipeline suite uses synthetic fixtures and passes in a fresh clone without game assets.
CI runs it as part of `pnpm run test` on every pull request:

```sh
pnpm run test:pipeline
```

The canonical v1.0.2 integration suite is an explicit local check that CI cannot run, because
licensed game assets are not distributed with the repository. It uses `pipeline/input/assets` by
default or `MISTRIA_ASSETS` when set, and fails with the resolved missing path instead of silently
skipping when assets are unavailable:

```sh
pnpm run test:pipeline:assets
MISTRIA_ASSETS=/path/to/assets pnpm run test:pipeline:assets
```

The asset suite validates the parser profile plus fixture-wide evaluator, requirement, & recipe
contracts. It does not regenerate data; `pnpm run pipeline -- <path>` remains a separate operation.

## Data flow

```text
assets root
  → parse TOML into a dotted namespace tree + non-enumerable provenance
  → evaluate item value expressions in place
  → project claimed namespaces through domain extractors
  → attach direct-reward quest gates
  → assemble TrackerData
  → stage committed and diagnostic JSON artifacts (and, with --sprites, converted sprites) in memory
  → extract & validate sprites, if requested
  → publish every staged artifact
```

`main.ts` stages every output it will write, including `tracker-data.json`, the locale chunks, and
the human-readable diagnostic files, as in-memory content rather than writing it immediately. With
`--sprites`, sprite extraction (`extractors/sprites.ts`) similarly converts needed item and villager
sprites to webp in memory without touching `pipeline/output/sprites/items/` or
`pipeline/output/sprites/villagers/`. Villager sprites resolve their source PNG from each npc's own
`icon_sprite` field the same way items do, under `animations/UI NEW/Generic/Icons/NPC/`. Only after
sprite extraction reports no missing sprites does `main.ts` publish everything: it writes every
staged file and sprite in one final step. Sprites are uploaded to `assets.mistria.fyi` with
`pnpm run sprites:upload` (see [docs/sprite-assets.md](../docs/sprite-assets.md)) — they are no
longer committed to Git. If sprite validation fails, the process exits before that step runs and no
tracked output file is modified, so a regeneration either lands as a consistent whole or leaves the
previous outputs untouched.

The parser walks `fiddle/` recursively, maps each non-metadata TOML file to its relative dotted
namespace, and excludes files ending in `.meta.toml`. It rejects duplicate destinations, including
an ancestor and descendant collision. Provenance records each parsed file’s relative path under a
non-enumerable symbol, so diagnostic JSON does not serialize it. `sourceFileFor` finds the nearest
ancestor namespace with provenance, which lets a nested field report its source file.

The evaluator indexes every item ID before resolving values. It mutates `value.bin` and
`value.store` in the parsed tree, resolves dependencies recursively, rejects duplicate IDs, cycles,
missing dependencies, malformed recipes, unsupported expressions, and unresolved strings. The
supported forms are `self.recipe * <multiplier>` and `<item_id>.store * <count>`. The multiplier
accepts unsigned integer (`1`, `10`) and decimal (`1.5`, `0.75`) literals; both sides of the decimal
point are required, so `.5` and `2.` are rejected. Signs (`-2`, `+2`), exponent notation (`1.2e3`),
zero (`0`, `0.0`), negative values, and non-numeric tokens are all rejected. The count in a store
reference accepts unsigned positive integers only. Recipe valuation uses an ingredient’s `bin` value
first, then its `store` value, and preserves a numeric zero.

## Vocabulary

| Term                   | Meaning                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assets root            | The caller-supplied directory that contains `fiddle/`.                                                                                                            |
| Fiddle root            | The `fiddle/` directory beneath the assets root. It is the parser’s recursive input root.                                                                         |
| Dotted root path       | A file’s relative path without `.toml`, with directory separators replaced by dots, such as `items.other.cooked_dishes`.                                          |
| Provenance             | The non-enumerable mapping from a dotted root path to its TOML source file. Ancestor lookup provides source context for nested data.                              |
| Claimed data           | A game namespace that an extractor deliberately projects into `TrackerData`. Other namespaces remain parsed, but are not app data.                                |
| Primitive predicate    | A named requirement definition with an empty object body. It becomes a predicate carrying its use-site value.                                                     |
| Named requirement      | A non-empty requirement definition referenced only with Boolean `true`; the resolver expands and caches it.                                                       |
| Requirement expression | The normalized Boolean tree of `all`, `any`, `not`, and predicate nodes produced from a requirements object.                                                      |
| Acquisition source     | A `Source` record explaining one way an item, cosmetic, or other game object ID is obtained. Its `location` meaning depends on `type`.                            |
| Restriction            | A flat `Restriction` record attached to a source. It models a subset of conditions, such as season, weather, time, skill, or stock.                               |
| Quest gate             | An index from every allowlisted quest’s `rewards[].item` reward ID to quest IDs. Applicators attach only IDs that match extracted item, animal, or spell records. |

## Processor map

The table covers every current extractor, including source and quest-gate extraction. Missing roots
often produce an empty result or fallback rather than an error; the exact behavior below is the
current contract, not a general validation policy.

| Module                      | Input ownership                                                                                                                  | Output                                                    | Important normalization or omission                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                   | CLI arguments, `MISTRIA_ASSETS`, parsed tree                                                                                     | `TrackerData` and files                                   | Requires an assets root containing `fiddle/`; parse-only stops before evaluation, extraction, and writes. Stages every output in memory and publishes it in one step only after sprite extraction (if requested) reports no missing sprites; a sprite failure exits before any tracked file is written.                                                                                                       |
| `parse-fiddle.ts`           | Assets root and TOML below fiddle root                                                                                           | Namespace tree, count, provenance                         | Excludes `.meta.toml`; rejects duplicate, colliding, and invalid nested destinations; provenance is non-enumerable.                                                                                                                                                                                                                                                                                           |
| `evaluate.ts`               | Parsed `items` and provenance                                                                                                    | In-place numeric item values                              | Resolves two expression forms, rounds recipe multipliers, skips time and essence recipe entries, and fails with source context on invalid dependencies.                                                                                                                                                                                                                                                       |
| `requirements.ts`           | Requirement definitions and an object                                                                                            | Boolean expression                                        | Empty input becomes `all: []`; siblings become `all`; `or` becomes `any`; `invert` becomes `not`; unknown keys remain predicates.                                                                                                                                                                                                                                                                             |
| `data-shapes.ts`            | Extractor values with source context                                                                                             | Array guards                                              | Throws errors for malformed arrays used by extractors.                                                                                                                                                                                                                                                                                                                                                        |
| `localize.ts`               | Game translation tables and classified fields                                                                                    | Values for every locale                                   | Derives or overrides translation keys, records explicit English fallbacks for missing locale keys, and rejects unusable override classifications.                                                                                                                                                                                                                                                             |
| `extractors/almanac.ts`     | Items, almanac UI, fish, and translation tables                                                                                  | Almanac, item registry, locale names, and fallback report | Skips defaults, chests, unreviewed, nameless, and localization-path items; assigns first menu-order tag category; collapses colorways by English recipe key and name into structural `AlmanacEntry` objects. The canonical ID is the alphabetically-first member. Item names are emitted only in per-locale chunks, with sorted per-locale fallback IDs and non-localizable items reported deterministically. |
| `extractors/animals.ts`     | `ranching.animals`                                                                                                               | Animal registry                                           | Skips defaults and unacquirable variants; falls back to IDs; strips species names from cosmetics; default-unlocked variants become tier one.                                                                                                                                                                                                                                                                  |
| `extractors/cosmetics.ts`   | `player_assets` and customization UI                                                                                             | Cosmetic registry                                         | Skips defaults; takes `ui_slot` and `ui_sub_category` verbatim and throws unless both name a section and entry of `ui/character_customization.toml`; emits `cosmeticSlots` in the game's menu order and localizes sub-category labels by ordinal into `cosmetics/subcategories` chunks.                                                                                                                       |
| `extractors/mines.ts`       | Dungeons and spells                                                                                                              | Floors, biomes, spells                                    | Requires numeric maximum floors and a biome array; derives ends from next starts; falls back to positional floors and names.                                                                                                                                                                                                                                                                                  |
| `extractors/museum.ts`      | Museum wings and UI ordering                                                                                                     | Ordered wings and sets                                    | Prefers UI order, falls back to object order, skips unknown ordered IDs and wings without sets, and validates item arrays.                                                                                                                                                                                                                                                                                    |
| `extractors/npcs.ts`        | NPCs                                                                                                                             | NPC registry                                              | Skips defaults and NPCs without name, Boolean `dateable`, or complete birthday.                                                                                                                                                                                                                                                                                                                               |
| `extractors/quests.ts`      | Six named quest groups                                                                                                           | Quest groups                                              | Includes only supported groups, skips defaults, and falls back to quest IDs for names.                                                                                                                                                                                                                                                                                                                        |
| `extractors/renown.ts`      | Renown                                                                                                                           | Ranks and levels per rank                                 | Falls back to 10 levels per rank and `Unknown` rank names.                                                                                                                                                                                                                                                                                                                                                    |
| `extractors/ui-strings.ts`  | `misc_local` and requested keys                                                                                                  | `ui` locale chunk                                         | Localizes game UI vocabulary via `misc_local/<key>`: `APP_UI_STRINGS` (category names, seasons, quest types, …), almanac category labels (honoring `local_key`), and `tier_<n>`. Strips leading articles on request, collapses player-gender markup to `<they>`, and throws when English is missing.                                                                                                          |
| `extractors/skills.ts`      | Skills                                                                                                                           | Skill names                                               | Skips defaults and title-cases IDs without a name.                                                                                                                                                                                                                                                                                                                                                            |
| `extractors/sources.ts`     | Stores, wildlife, items, forageables, monsters, quests, festivals, renown                                                        | Acquisition-target source index                           | Source order follows extractor order. Structural deduplication preserves the first identical JSON representation. Targets include items, cosmetics, and other game object IDs. Scroll entries are counted and discarded. `all` requirements flatten, while `any`, `not`, unsupported predicates, and reached-date day precision are discarded.                                                                |
| `extractors/recipes.ts`     | Items (all categories), quests, letters, stores, museum wings, chicken statue, fishing chests, wishing well, festivals, dungeons | Recipe registry, member IDs, and name sources             | Groups items by `recipe_key ?? itemId`; selects a representative backing item for localized display while preserving the established English bed-name normalization; collects and deduplicates acquisition sources; validates recipe ID collisions; and requires `recipe_is_default` agreement across groups.                                                                                                 |
| `extractors/quest-gates.ts` | Supported quest groups and extracted registries                                                                                  | Direct-reward index and mutations                         | Every allowlisted `rewards[].item` ID is indexed. Applicators attach only IDs that match extracted item, animal, or spell records; recipe scrolls and animal, spell, store, & progression inference are deferred.                                                                                                                                                                                             |

### Source rules

`sources.ts` appends source records in fixed extractor order: stores, fish, bugs, crafting, crop
items, forageables, crop seasons, monster drops, quest rewards, festival cosmetics, then renown
rewards. It deduplicates each target after collection by serializing every source to JSON, retaining
the first structurally identical record. The serialized `TrackerData.sources` type says item IDs,
but the extractor also indexes cosmetics and other game object IDs.

Store processing accepts constant, seasonal, and random stock. It counts and discards
`recipe_scroll` and `crafting_scroll` entries; these are handled by the recipe extractor
(`extractors/recipes.ts`) instead. Store requirements first become Boolean expressions, then a lossy
flat restriction list: `all` branches concatenate; `any` and `not` branches disappear; unsupported
predicates disappear; and `reached_date` retains season but drops day precision. Supported
predicates project to perk, skill, mines-level, season, animal, cutscene, season-seen, upper-floor,
or relationship restrictions.

The remaining source processors expose fish, chests, dives, bugs, crafted furniture, cooked food,
seeds, saplings, forageables, monster drops, quest rewards, festival stock, and renown rewards. They
may omit malformed or unsupported entries. Crop records inherit the seed source’s season
restriction; source location can be a store, quest, monster, festival vendor, or joined water type.

### Quest gates

Quest gates are evidence of direct finished-item rewards, not a full availability model.
`extractQuestGates` scans the same six supported quest groups as the quest extractor, records every
reward with an `item` field, and deduplicates quest IDs per item. The main program applies those
gates to the item registry. Animal and spell applicators exist, but their current indexes are empty.
Recipe-scroll tracking and inference from animals, spells, stores, progression flags, requirements,
or cutscenes are deferred.

### Recipes

`extractRecipes` builds a recipe registry in three phases. The first phase scans all items for
`recipe_key` and `recipe_is_default`, grouping items into recipe identities using
`recipe_key ?? itemId`. Only items with a `recipe` array or a `recipe_key` field are included; items
with `recipe_is_default` but no recipe or key (e.g., `ore_gold`) are excluded with a diagnostic log.
Item IDs that collide with recipe keys from other groups produce a warning.

The second phase collects recipe acquisition sources from nine data locations:

| Source type       | Data location                                                             | Pattern                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `quest`           | `quests/{fetch_quests,stillwell_challenges,story_quests,tali_challenges}` | `rewards[].recipe_scroll` or `crafting_scroll`                                                                           |
| `donate_item`     | `letters`                                                                 | `items[].recipe_scroll` with `requirements.donated_item`                                                                 |
| `reach_day`       | `letters`                                                                 | `items[].recipe_scroll` with `requirements.reached_date`                                                                 |
| `ship_item`       | `letters`                                                                 | `items[].recipe_scroll` with `requirements.shipped_item`                                                                 |
| `store`           | `stores[storeId].categories[]`                                            | `constant_stock`, `seasonal`, `random_stock` entries with `recipe_scroll`, `crafting_scroll`, or `include_recipe = true` |
| `museum_donation` | `museum_wings/{archaeology,fish,flora,insect}`                            | `rewards[].entries[].crafting_scroll`                                                                                    |
| `chicken_statue`  | `chicken_statue`                                                          | `common.{small,medium,large}_roll[].recipe_scroll`                                                                       |
| `treasure_chest`  | `fishing`                                                                 | `chest_tables.{tier}.items[]` with `kind = "recipe"` and `value` as target                                               |
| `wishing_well`    | `wishing_well`                                                            | `common.{small,medium,large}_roll[].recipe_scroll`                                                                       |
| `festival`        | `festivals[festivalId].stocks[storeId]`                                   | Stock entries with `recipe_scroll` or `crafting_scroll`                                                                  |
| `mine_zone`       | `dungeons`                                                                | `biomes[].dungeon_delicacies` and `taste_maker` item ID lists                                                            |

After all collectors merge, sources are structurally deduplicated centrally, then sorted by type and
detail fields.

The third phase selects one backing item for each recipe's localized name. English retains the
established single/double-bed normalization; every other locale uses the representative item's game
translation directly, so English suffix rules never mutate translated strings. The extractor also
returns `recipeIdByItemId` and `recipeMemberItems` maps for quest links and acquisition-source
derivation.

## Artifacts & mutation

| Output                                       | Ownership                                      |
| -------------------------------------------- | ---------------------------------------------- |
| `pipeline/output/tracker-data.json`          | Pretty diagnostic output                       |
| `pipeline/output/tracker-data-readable.json` | Duplicate pretty diagnostic output             |
| `pipeline/output/fiddle-readable.json`       | Parsed/evaluated namespace tree for inspection |
| `src/lib/data/tracker-data.json`             | Minified committed app data                    |

Evaluation mutates the parsed tree. Gate applicators mutate extracted registries. No files are
written until every transform succeeds, and `generatedAt` changes on every successful run.

## Recommendations

These are implementation briefs, not current pipeline behavior. They preserve the present contract
until a separately reviewed change adopts them.

### Preserve requirement logic

- **Current behavior:** `requirements.ts` produces a Boolean expression tree, but `sources.ts`
  flattens `all`, discards complete `any` and `not` subtrees, drops unsupported predicates, and
  reduces `reached_date` objects to season only. Restrictions can understate store availability
  conditions.
- **Affected files:** `pipeline/src/requirements.ts`, `pipeline/src/extractors/sources.ts`,
  `src/lib/types/tracker-data.ts`, availability consumers, restriction badges, and new extractor
  tests.
- **Desired result:** Preserve the normalized Boolean expression, or introduce an equally expressive
  app-facing acquisition-condition model. Supported predicates retain complete values, and
  unsupported predicates remain representable.
- **Constraints:** Treat this as a schema migration. Update every app consumer and generated-data
  fixture together; do not reinterpret flat arrays as Boolean trees.
- **Verification:** Tests cover nested `all`, `any`, and `not`; named requirements; unknown
  predicates; full reached-date values; UI rendering; and availability evaluation.

### Model acquisition identities

- **Current behavior:** `TrackerData.sources` is typed as `Record<ItemId, Source[]>`, although the
  index also contains cosmetics and acquisition targets absent from both registries.
  `Source.location` can mean a store, quest, monster, festival vendor, or joined water type
  depending on `Source.type`.
- **Affected files:** `pipeline/src/extractors/sources.ts`, `src/lib/types/tracker-data.ts`, source
  lookup and display consumers, and generated-data contract tests.
- **Desired result:** Introduce a truthful acquisition-target identifier and a discriminated source
  union with source-specific fields such as `storeId`, `questId`, or `monsterId`.
- **Constraints:** Inventory every current source key and location interpretation first. Preserve
  useful targets that are not almanac items.
- **Verification:** A generated-data contract test classifies every source target and proves every
  source variant carries its discriminator’s required identifier.

### Strengthen restriction types

- **Current behavior:** `Restriction` is one permissive interface with optional fields, so
  impossible combinations type-check. Several generated variants are informational because
  availability and badge UI do not consume them.
- **Affected files:** `src/lib/types/tracker-data.ts`, `pipeline/src/extractors/sources.ts`,
  `src/lib/engine/availability.ts`, restriction UI components, and tests.
- **Desired result:** Replace `Restriction` with a discriminated union whose required payload is
  determined by `type`, then make every variant’s evaluation and presentation policy explicit.
- **Constraints:** Preserve serialized discriminator values unless a coordinated migration is
  approved. Decide whether unhandled variants are display-only or availability-affecting first.
- **Verification:** Exhaustive TypeScript switches cover every variant, and tests prove availability
  and badge behavior for each supported type.

### Define validation policy

- **Current behavior:** The design says processed data fails fast, while extractors silently skip
  missing roots, malformed entries, incomplete NPCs, unknown ordered IDs, unsupported stock entries,
  and other partial shapes.
- **Affected files:** Every `pipeline/src/extractors/` file, `pipeline/src/data-shapes.ts`, parser
  provenance helpers, and extractor tests.
- **Desired result:** Create a field-by-field policy for optional data, ignored domains, recoverable
  omissions, and fatal malformed claimed data. Apply shared validators after the policy is explicit.
- **Constraints:** Do not convert fallback into a fatal error without checking the current fixture
  and at least one newer data version. Fatal diagnostics include entity, field, and source-file
  provenance where available.
- **Verification:** Synthetic tests exercise every declared omission and failure class; a complete
  fixture run produces no new unexplained skips.

### Version parse-only checks

- **Current behavior:** `main.ts` makes `--parse-only` require exactly 295 parsed files and three
  v1.0.2 paths, even when another assets version is supplied.
- **Affected files:** `pipeline/src/main.ts`, CLI documentation, and parser integration tests.
- **Desired result:** Separate version-agnostic parse validation from named fixture profiles. The
  default smoke test validates structural invariants; an explicit v1.0.2 profile retains the
  295-file and representative-path assertions.
- **Constraints:** Preserve a strict regression check for the canonical v1.0.2 integration fixture.
- **Verification:** Synthetic assets pass generic parse-only, the v1.0.2 profile enforces 295 files
  and representative paths, and a mismatched profile fails with an actionable message.

### Add contract coverage

- **Current behavior:** Parser tests omit metadata exclusion and provenance serialization; evaluator
  tests mainly cover real-fixture happy paths, with a conditional representative referenced-value
  assertion and fixture-wide multi-count no-throw coverage; requirement tests omit malformed forms;
  sources and quest gates have no focused tests.
- **Affected files:** Existing `pipeline/src/*.test.ts`, new extractor test files, and shared
  synthetic-fixture helpers.
- **Desired result:** Add contract tests for parser collisions and provenance, evaluator mutation
  and failures, requirement normalization and malformed input, lossy source projection, source
  deduplication, and direct item-reward quest gates.
- **Constraints:** Tests must not require private assets unless marked integration tests. Assert
  exact representative outputs rather than merely that code does not throw.
- **Verification:** Every documented invariant has a test whose name and assertion agree, and the
  unit suite passes without `pipeline/input/assets/`.

### ~~Tighten expression grammar~~ _(done — #190)_

Implemented in PR #194. The evaluator now uses strict regexes (`\d+(?:\.\d+)?` for recipe
multipliers, `\d+` for store counts) and rejects zero, negative, non-finite, & malformed literals
with source-context errors. The exact accepted grammar is documented in the evaluator section above.
