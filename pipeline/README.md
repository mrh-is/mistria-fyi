# Data pipeline

The pipeline converts Fields of Mistria’s native TOML namespaces into the smaller `TrackerData`
model consumed by Mistria Field Guide. It deliberately ignores game domains the tracker does not
claim, but many claimed fields are normalized or omitted according to extractor-specific rules
documented below.

## Setup & commands

The full pipeline takes an extracted assets root containing `fiddle/` and `localization/`. The
real-asset integration suite and the narrow villager-sprite command also accept `assets.zip`
directly (see below). Game assets are ignored by Git and are not present in a fresh clone.

```sh
pnpm run pipeline -- input/assets --version=1.0.5
pnpm run pipeline -- /path/to/assets
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
pnpm run pipeline -- /path/to/assets --parse-only
pnpm run pipeline -- /path/to/assets --parse-only --parse-profile=v1.0.5
pnpm run pipeline:assets -- --version=1.0.5
```

`pnpm run pipeline:assets` is the local-development shortcut for the ignored `pipeline/input/assets`
directory. Pass pipeline flags after `--`; it avoids a shell environment assignment and is the
preferred command for routine regeneration in a configured worktree.

With no path argument and no `MISTRIA_ASSETS`, the pipeline falls back to Fields of Mistria's
default Steam install location (Steam is the only platform the game ships on):

```text
C:\Program Files (x86)\Steam\steamapps\common\Fields of Mistria
```

so the integration suite and `pnpm run pipeline -- --villager-sprites-only` work with no
configuration on a stock Windows dev machine that owns the game. Full tracker-data regeneration
still requires an extracted structured-assets root.

The pipeline reads `FieldsOfMistria.exe`'s Product Version beside the archive automatically. On
macOS and Linux, pass `--version=X.Y.Z` when the assets omit a native version value.

That directory contains `assets.zip` rather than an extracted `fiddle/`. The real-asset integration
suite temporarily materializes only `fiddle/` and `localization/`; it never expands the archive's
multi-gigabyte animation and audio trees. The full pipeline does not yet use that adapter: `main.ts`
still requires an on-disk `fiddle/` and builds its `Localizer` from the on-disk `localization/`
tables. Sprite extraction (`extractors/sprites.ts`) can read PNGs directly from `assets.zip`.

`--villager-sprites-only` (alias: `pnpm run sprites:villagers`) is the narrowest of these: it parses
only `fiddle.npcs` and regenerates villager sprites alone, skipping `tracker-data.json`, locale
chunks, and every other output. It is the right command for “just get me fresh villager icons”,
including straight off a bare Steam install with nothing extracted. Item sprite regeneration uses
the full pipeline because producing `iconSpritesByItemId` also requires almanac and localization
extraction; pass an extracted structured-assets root together with `--sprites`.

`--parse-only` checks that at least one non-metadata TOML file parses and that every parsed root has
matching provenance. It accepts an extracted `fiddle/` directory or an `assets.zip` archive, and
does not require version or localization metadata. Add `--parse-profile=v1.0.5` to check the
canonical fixture’s 297 files and three representative paths. Unknown or duplicate CLI flags fail
before assets are read.

Supporting a new Fields of Mistria version is a reviewed application release, not a routine
regeneration. Follow the [game version update protocol](../docs/game-version-update-protocol.md)
before changing version-specific fixtures or committing generated data from different game assets.

### Test tiers

The default pipeline suite uses synthetic fixtures and passes in a fresh clone without game assets.
CI runs it as part of `pnpm run test` on every pull request:

```sh
pnpm run test:pipeline
```

The canonical v1.0.5 integration suite is an explicit local check that CI cannot run, because
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

`main.ts` is the CLI and owns every file read & write; `assemble.ts` (`assembleTrackerData`) owns
the transformation from an evaluated fiddle to validated tracker data & locale chunks, and reads no
files. A full run proceeds in these stages:

```text
assets root
  → parse TOML into a dotted namespace tree with non-enumerable provenance
  → evaluate item value expressions in place
  ┌ assembleTrackerData(fiddle, localizer, options)
  → extract registries & per-locale names (extractors/)
  → collect acquisition sources into accumulators (acquisition/)
  → apply reviewed overrides, then attach sources to items, cosmetics, animals, & pets
  → extract quest chains & heart-level changes (extractors/visibility/)
  → assemble TrackerData
  → stamp & assign entity visibility
  └ validate the assembled tracker data against reference registries
  → stage tracker data, the locale manifest, locale chunks, & diagnostic JSON in memory
  → extract & stage sprites, if --sprites is passed
  → publish every staged file & sprite
```

Nothing is written until the final step. `main.ts` stages every output it will write as in-memory
content; with `--sprites`, sprite extraction (`extractors/sprites.ts`) converts the needed item and
villager sprites to webp in memory as well. Villager sprites resolve their source PNG from each
NPC’s own `icon_sprite` field, the same way items do, under `animations/UI NEW/Generic/Icons/NPC/`.
A thrown error, a failed validation, or a missing sprite exits before publishing, so a regeneration
leaves the previous outputs untouched on transformation or validation failure. Publishing writes
files sequentially; an I/O failure during that step can leave partially updated outputs. Sprites are
uploaded to `assets.mistria.fyi` with `pnpm run sprites:upload` (see
[docs/sprite-assets.md](../docs/sprite-assets.md)); they are not committed to Git.

Validation runs last because visibility assignment rewrites `sources` arrays and injects hard-coded
quest gates (store, villager, spell, & barn unlocks). The validator walks every emitted collection
that carries sources or visibility, so those gates resolve against the same registries as
acquisition sources.

### Reference registries

Every ID a source, visibility condition, almanac entry, museum set, or quest names must resolve in a
registry built from one of three inputs. Acquisition sources never contribute IDs, so an override
that misspells a quest or monster fails instead of validating itself.

- **Extracted registries:** items, cosmetics, recipes, animals, biomes, festivals, perks, skills,
  stores, villagers, museum wings, and the emitted quest types.
- **Parsed game tables** (`acquisition/native-references.ts`): locations, monsters, letters, quests
  & cutscenes, dates (including unlisted ones), placeable stations, treasure chest tiers, fish water
  types, and festival activities whose backing `misc` table exists. No table enumerates dialogue
  choices or dungeon loot groups, so any reference to either is unresolved.
- **Reviewed non-native IDs** (`acquisition/reviewed-references.ts`): the few IDs overrides use
  deliberately although no table defines them. An entry the game later defines throws as obsolete.

### Parser & evaluator

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

| Term                   | Meaning                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Assets root            | The caller-supplied directory that contains `fiddle/` and `localization/`.                                                                |
| Fiddle root            | The `fiddle/` directory beneath the assets root. It is the parser’s recursive input root.                                                 |
| Dotted root path       | A file’s relative path without `.toml`, with directory separators replaced by dots, such as `items.other.cooked_dishes`.                  |
| Provenance             | The non-enumerable mapping from a dotted root path to its TOML source file. Ancestor lookup provides source context for nested data.      |
| Claimed data           | A game namespace that an extractor deliberately projects into `TrackerData`. Other namespaces remain parsed, but are not app data.        |
| Primitive predicate    | A requirement definition with an empty object body. It becomes a predicate carrying its use-site value.                                   |
| Named requirement      | A non-empty requirement definition referenced only with Boolean `true`; the resolver expands and caches it.                               |
| Requirement expression | The normalized Boolean tree of `all`, `any`, `not`, and predicate nodes produced from a requirements object.                              |
| Acquisition source     | A discriminated `Source` record (`src/lib/types/acquisition.ts`) describing one way to obtain an item, cosmetic, recipe, or pet cosmetic. |
| Source accumulator     | A per-target collection that deduplicates sources by canonical JSON and records where each one came from.                                 |
| Reviewed override      | A hand-written source, with wiki evidence, for an acquisition path no native data table encodes.                                          |
| Visibility             | A condition stamped on an entity that tells the app when the player can know it exists (spoiler gating).                                  |

## Processor map

Paths are relative to `pipeline/src/`. Colocated `*.test.ts` files cover most modules.

### Input & orchestration

| Module                 | Responsibility                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`              | CLI, asset-root resolution, stage order, staging, and publishing. `--parse-only` stops after parsing; `--villager-sprites-only` runs villager sprites alone.            |
| `cli-options.ts`       | Validates CLI arguments and rejects unknown or conflicting flags before asset reads.                                                                                    |
| `parse-smoke.ts`       | Checks generic parsed structure, with an explicit strict v1.0.5 fixture profile.                                                                                        |
| `assemble.ts`          | `assembleTrackerData`: extraction, source attachment, visibility, & validation with an injected `Localizer`. Reviewed overrides & diagnostics are injectable for tests. |
| `parse-fiddle.ts`      | Parses `fiddle/` from disk or straight out of `assets.zip` into one namespace tree. Excludes `.meta.toml`; rejects duplicate and colliding destinations.                |
| `evaluate.ts`          | Resolves `value.bin` and `value.store` expressions in place (grammar below).                                                                                            |
| `requirements.ts`      | Normalizes native requirement objects into requirement expressions and expands named requirements.                                                                      |
| `assets-zip.ts`        | Locates `assets.zip`, the default Steam install, and the installed executable’s version for `main.ts`.                                                                  |
| `asset-input.ts`       | Materializes only `fiddle/` and `localization/` from `assets.zip` for the real-asset test suite (`assets-test-setup.ts`).                                               |
| `data-shapes.ts`       | Array guards that throw with field and source-file context.                                                                                                             |
| `extractor-helpers.ts` | Shared traversals & parsers: `forEachItem`, `forEachQuest`, `forEachStockEntry`, `firstRequiredItemId`, `minesBiomeId`, `scrollTargetOf`, and the tracked quest groups. |
| `localize.ts`          | The `Localizer` extractors receive: resolves a classified text field to every locale through translation tables; falls back to English.                                 |
| `locale-codes.ts`      | Maps game language codes to BCP 47 tags and throws when the game adds or drops a language.                                                                              |

### Extractors

Each extractor projects one claimed domain into a registry plus per-locale names. Names are emitted
only in locale chunks (`src/lib/data/locales/<locale>/<category>.json`), never in
`tracker-data.json`.

| Module                    | Input                                 | Output & notable rules                                                                                                                                      |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `almanac.ts`              | Items, almanac UI, fish, translations | Almanac rows and the item registry. Collapses colorways by recipe key and English name; the canonical ID is the alphabetically first member.                |
| `animals.ts`              | `ranching.animals`                    | Animal species with variant tiers. Skips templates and unacquirable variants; default-unlocked variants land in tier one.                                   |
| `cosmetics.ts`            | `player_assets`, customization UI     | Cosmetic registry and slot order. Throws unless `ui_slot` and `ui_sub_category` name an entry of `ui/character_customization.toml`.                         |
| `dates.ts`                | `dates`                               | Date registry.                                                                                                                                              |
| `festivals.ts`            | `festivals`                           | Festival registry.                                                                                                                                          |
| `mines.ts`                | `dungeons`, `spells`                  | Floors, biomes, and spells. Throws without a numeric `dungeons.misc.max_floors`.                                                                            |
| `museum.ts`               | Museum wings and UI ordering          | Wings and sets in UI order, falling back to object order.                                                                                                   |
| `pets.ts`                 | `pets`, items                         | Pet cosmetic sets and pet skins.                                                                                                                            |
| `quests.ts`               | The six tracked quest groups          | Quests by app quest type. Throws when a cooking or fetch quest has no `has_item` requirement.                                                               |
| `recipes.ts`              | Items                                 | Recipe identities, native defaults, `recipeIdByItemId`, names, and member maps. Groups items by `recipe_key ?? itemId` (details below).                     |
| `renown.ts`               | `renown`                              | Town ranks. Defaults to 10 levels per rank; throws when a rank has no English name.                                                                         |
| `skills.ts`               | `skills`, `perks`, skill menu UI      | Skills, perk tiers, and perk names. Throws when the skill menu names a perk without a name.                                                                 |
| `stores-meta.ts`          | `stores`                              | Store registry.                                                                                                                                             |
| `treasure-chest-tiers.ts` | `fishing.chest_tables`                | Treasure chest tiers.                                                                                                                                       |
| `ui-strings.ts`           | `misc_local`                          | The `ui` locale chunk: category names, seasons, quest types, almanac labels, and `tier_<n>`. Collapses gendered markup to `<they>`; throws on other markup. |
| `villagers.ts`            | `npcs`                                | Villager registry and icon-sprite index. Throws when a villager lacks `icon_sprite`.                                                                        |
| `sprites.ts`              | `assets.zip` or extracted PNGs        | Stages webp conversions for items and villagers; `publishSprites` writes them.                                                                              |

### Acquisition

The `acquisition/` modules build the `sources` arrays attached to items, recipes, cosmetics, animal
cosmetics, pet cosmetic sets, and pet skins. One reward, store, or exploration walker emits all
relevant target kinds from each native table.

| Module                                      | Responsibility                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `source-accumulator.ts`                     | Per-target accumulators that deduplicate by canonical JSON, sort output deterministically, and record provenance.                                  |
| `recipe-target.ts`                          | Resolves a scroll product item to its recipe key, accepts known recipe IDs, and diagnoses unknown targets.                                         |
| `recipe-products.ts`                        | Adds a `recipe` source to every item a recipe produces.                                                                                            |
| `collectors/natural.ts`                     | Fish, bait, bugs, dives, crops, trees, forageables, monster drops, animal products, perks, and fish traps.                                         |
| `collectors/rewards.ts`                     | Quest, letter, museum, chicken statue, festival, renown, date, and relationship rewards.                                                           |
| `collectors/stores.ts`                      | Store stock, with requirements projected through `availability.ts`.                                                                                |
| `collectors/exploration.ts`                 | Mines, artifact digs, treasure chests, the wishing well, the artifact replicator, and equipment.                                                   |
| `collectors/recipe-only.ts`                 | Perks, dragon-forged defaults, and reviewed recipe-only exceptions that have no parallel item-acquisition table.                                   |
| `availability.ts`                           | Projects requirement expressions into the app’s availability conditions.                                                                           |
| `reviewed-overrides.ts`                     | Hand-reviewed item and cosmetic sources plus default (starting) sources. An override that duplicates a native source throws as obsolete.           |
| `exclusions.ts`                             | Cosmetics deliberately dropped from the registry (internal assets and unreleased content), each with evidence.                                     |
| `native-references.ts`                      | Reads reference registries from parsed game tables only (see “Reference registries”).                                                              |
| `reviewed-references.ts`                    | The explicit, reviewed IDs no parsed table defines.                                                                                                |
| `reference-index.ts`, `validate-sources.ts` | Index the registries, then throw `AcquisitionSourceValidationError` on unknown references, bad fields, or recipe cycles in the final tracker data. |

### Data-quality diagnostics

Recipe scroll targets, letter triggers, recipe defaults & ID collisions, almanac categories, Mines
forageable mappings, and reviewed override targets feed one run-scoped `PipelineDiagnostics` list.
`assembleTrackerData` validates it before returning, so `main.ts` never stages invalid output;
standalone extractors validate before returning. Missing targets & obsolete acquisition overrides
are always fatal.

`reviewed-diagnostics.ts` contains exact exceptions keyed by kind, field path, target ID, & message,
each with a reason & native-data evidence. Unknown diagnostics fail; exceptions no longer observed
also fail, so game updates cannot silently retain stale suppressions. The current exception is Void
Herb’s biome-less tag in `items/other/materials.toml`, whose existing reviewed override provides its
Mines acquisition source. Beta localization fallbacks remain separate from data-quality diagnostics.

### Visibility

The `extractors/visibility/` modules compute spoiler gating.

| Module                       | Responsibility                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutscene-quest-map.ts`      | Maps cutscenes to the quests that trigger them.                                                                                               |
| `quest-chains.ts`            | Story prerequisites, heart-level chains, crown, Stillwell, & Tali order, and raw fetch-quest requirements; includes reviewed story overrides. |
| `requirement-resolver.ts`    | Resolves requirement expressions into visibility conditions.                                                                                  |
| `availability-projection.ts` | Converts availability conditions into visibility conditions.                                                                                  |
| `entity-visibility.ts`       | Hardcoded store, villager, and category gates; heart-level changes; and visibility for items, recipes, cosmetics, animals, spells, & quests.  |

### Recipes

`extractRecipes` builds the recipe registry from item identities. It first groups items into recipe
identities by `recipe_key ?? itemId`. Only items with a `recipe` array or a `recipe_key` field are
included; items with `recipe_is_default` but neither (such as `ore_gold`) are excluded with a
diagnostic log, and `recipe_is_default` must agree across a group.

Assembly then collects recipe acquisition alongside item acquisition from quest and letter rewards,
store and festival stock, museum rewards, the chicken statue, fishing chests, the wishing well,
mines chests, scroll bundles, renown, perks, dragon-forged defaults, and a short exception list.
Standalone `extractRecipes` calls invoke those same collectors. Recipe scroll targets resolve from
the product item to its recipe key, or from an existing recipe ID; an unknown target is fatal.
Source identity includes both availability and visibility. When the same path has different gates,
each gated source remains a separate acquisition alternative, keeping its availability and spoiler
condition paired. An unconditional path remains a separate alternative, and sorted output is
independent of collector order.

Letter sources use explicit shipping, donation, spouse, or calendar triggers where the native data
provides them. Birthday and other recognized conditional letters retain their requirement tree as
availability, including unknown game predicates, and carry a `letter` source with a birthday or
condition trigger. One recognized trigger is enough to classify a letter; the full requirement
expression, including additional JSON-safe unknown predicates, is preserved. Wholly unrecognized
requirements produce a diagnostic; no default Spring 1 date is inferred.

Name extraction selects one backing item for each recipe’s localized name. English keeps the
established single- and double-bed normalization; every other locale uses the representative item’s
translation directly, so English suffix rules never alter translated strings.

## Artifacts

| Output                                       | Contents                                                              |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/data/tracker-data.json`             | Minified committed app data                                           |
| `src/lib/data/locales.json`                  | Locale manifest generated from `l10n.meta.toml`                       |
| `src/lib/data/locales/<locale>/*.json`       | Per-locale name chunks, one file per category                         |
| `pipeline/output/tracker-data.json`          | Pretty diagnostic copy of the tracker data                            |
| `pipeline/output/fiddle-readable.json`       | Parsed and evaluated namespace tree for inspection                    |
| `pipeline/output/sprites/{items,villagers}/` | Converted webp sprites, with `--sprites` or `--villager-sprites-only` |

Evaluation mutates the parsed tree, and source attachment & visibility mutate the extracted
registries. Outputs contain no generation timestamp. String ordering uses one UTF-16 code-unit
comparator, independent of host locale or ICU; disk and zip TOML inputs register in sorted relative
path order. Sprite extraction compares converted bytes and refreshes changed outputs while skipping
identical ones.

## Reviewed game facts

`src/overrides/` owns the human-reviewed acquisition, exclusion, progression, & display facts. Every
acquisition exception is represented as `{ id, value, evidence, reason }`; the entry validator
rejects missing targets, missing provenance, duplicate IDs, & obsolete native equivalents.
Production pipeline preflight checks unfiltered, evaluated native tables before extraction or
publication. Acquisition collectors additionally compare reviewed item, cosmetic, replacement, &
recipe sources against native source accumulators, because native acquisition equivalence is
determined after collection. Recipe checks snapshot the native accumulator before reviewed additions
so shared recipe variants cannot falsely obsolete each other.

Some values are projections or assertions rather than acquisition exceptions: English store articles
& upgrade wording, festival/category identifier aliases, & ordinal localization names. Their native
targets remain checked; localization assertions deliberately require native English equality through
`Localizer`, rather than treating that equality as an obsolete override. Native schema predicates,
quest naming conventions, & accumulator mechanics remain implementation rules.

Baby presentation cosmetics are discovered from their native ID pattern, & Seridia’s equipment comes
from `misc.seridia_armor`. Runtime wishing-well rewards use `misc.wishing_well.low_price`; neither
prices nor outfit inventories are duplicated in reviewed tables. The crown visibility gate remains
20 pending #638 (private beta).

The #414 migration produces byte-identical game 1.0.5 tracker output & identical locale chunks
compared with its pre-change pipeline run. There are no intentional generated-data changes. The two
post-seal cutscene mappings remain reviewed runtime facts because native quest links do not derive
them; the availability projector & cutscene mapper share their central entries.
