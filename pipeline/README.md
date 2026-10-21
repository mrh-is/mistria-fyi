# Data pipeline

The pipeline converts Fields of Mistria’s native TOML namespaces into the smaller `TrackerData`
model consumed by Mistria Field Guide. It deliberately ignores game domains the tracker does not
claim, but many claimed fields are normalized or omitted according to extractor-specific rules
documented below.

## Setup & commands

The full pipeline takes an extracted assets root containing `fiddle/` and `localization/`. The
real-asset integration suite and the narrow villager-sprite command also accept `assets.zip`
directly (see below). Game assets are ignored by Git and are not present in a fresh clone. For their
structure (folders, the dotted namespace, ID conventions, & quirks) see
[docs/game-asset-format.md](../docs/game-asset-format.md); `pnpm run pipeline:atlas` inventories or
diffs a version’s assets.

```sh
pnpm run pipeline -- pipeline/input --version=X.Y.Z
pnpm run pipeline -- /path/to/assets --version=X.Y.Z
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
pnpm run pipeline -- /path/to/assets --parse-only
pnpm run pipeline -- /path/to/assets --parse-only --parse-profile=canonical
pnpm run pipeline:assets
```

`pnpm run pipeline:assets` is the local-development shortcut for the ignored `pipeline/input`
game-files root, at the canonical game version (`--version=current`, which reads
`CURRENT_GAME_VERSION` in `src/game-version.ts` and picks `pipeline/input/vX.Y.Z/assets`). Pass
other pipeline flags after `--`; it avoids a shell environment assignment and is the preferred
command for routine regeneration in a configured worktree.

`pipeline/input` holds one `vX.Y.Z/assets` folder per release. Given a directory with version
folders and no `fiddle/` of its own, the pipeline reads `vX.Y.Z/assets` for the `--version` you pass
and fails naming the expected path when that folder is missing. A directory that already holds
`fiddle/` or `assets.zip` is used as is.

On the gaming PC, `pnpm run game-assets:share` extracts the installed release’s structured assets
and copies the current autosaves to the shared Google Drive `Mistria/vX.Y.Z/` folders. Other
machines symlink `pipeline/input` to that synced Drive folder (see
[Share the extracted assets](../docs/game-version-update-protocol.md#share-the-extracted-assets)).

A relative assets path (argument or `MISTRIA_ASSETS`) resolves against the directory you ran `pnpm`
from, even though the script itself runs inside `pipeline/`.

The game version comes from `--version`, the fiddle's `misc.version`, or (on Windows) the installed
executable. The extracted assets in `pipeline/input` carry none of these, so pass `--version`; use
the `version` of the committed `src/lib/data/tracker-data.json` unless you're importing a new game
release. The pipeline names the committed version when it can't find one.

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
tables. Sprite extraction (`emit/sprites.ts`) can read PNGs directly from `assets.zip`.

`--villager-sprites-only` (alias: `pnpm run sprites:villagers`) is the narrowest of these: it parses
only `fiddle.npcs` and regenerates villager sprites alone, skipping `tracker-data.json`, locale
chunks, and every other output. It is the right command for “just get me fresh villager icons”,
including straight off a bare Steam install with nothing extracted. Item sprite regeneration uses
the full pipeline because producing `iconSpritesByItemId` also requires almanac and localization
extraction; pass an extracted structured-assets root together with `--sprites`.

`--parse-only` checks that at least one non-metadata TOML file parses and that every parsed root has
matching provenance. It accepts an extracted `fiddle/` directory or an `assets.zip` archive, and
does not require version or localization metadata. Add `--parse-profile=canonical` to check the
canonical fixture’s 298 files and three representative paths. Unknown or duplicate CLI flags fail
before assets are read.

Supporting a new Fields of Mistria version is a reviewed application release, not a routine
regeneration. Follow the [game version update protocol](../docs/game-version-update-protocol.md)
before changing version-specific fixtures or committing generated data from different game assets.

### Test tiers

During development, run the colocated test covering the change:
`pnpm exec vitest run pipeline/src/path/to/module.test.ts`. Use broader suites only for the
commit-ready exceptions in [agent-verification.md](../docs/agent-verification.md#full-verification),
including asset checks & regeneration for parser, evaluator, extractor, or shared-contract changes.
The commands below describe available tiers, not a default session baseline.

The default pipeline suite uses synthetic fixtures and passes in a fresh clone without game assets.
CI runs it as part of `pnpm run test` on every pull request:

```sh
pnpm run test:pipeline
```

The canonical integration suite is an explicit local check that CI cannot run, because licensed game
assets are not distributed with the repository. It uses `pipeline/input/vX.Y.Z/assets`, for the
committed tracker data's version, by default or `MISTRIA_ASSETS` when set, and fails with the
resolved missing path instead of silently skipping when assets are unavailable:

```sh
pnpm run test:pipeline:assets
MISTRIA_ASSETS=/path/to/assets pnpm run test:pipeline:assets
```

The asset suite validates the parser profile plus fixture-wide evaluator, requirement, & recipe
contracts. It does not regenerate data; `pnpm run pipeline -- <path>` remains a separate operation.

## Stage boundaries

The complete output contract lives in `src/lib/types/tracker-data-schema.ts` (Valibot); the public
TypeScript entity types derive from it. Assembly validates the final enriched data against that
schema before returning anything for publication. Acquisition checks additionally enforce reference
integrity, source provenance, exclusions, and recipe-cycle rules. Schema failures include the
failing field path. The client consumes the validated generated JSON without runtime validation.

`parse/` owns native TOML input, requirement parsing, & expression evaluation. `extract/` projects
registries & quest facts, `acquisition/` collects sources, `enrich/` assigns visibility, `localize/`
resolves locale text, & `emit/` stages sprites and publishes outputs. The root contains CLI,
assembly, diagnostics, shared shapes, & test infrastructure.

`acquisition/requirement-projector.ts` traverses each native expression once and returns both
`availability` & `spoilerVisibility`. Their leaf policies deliberately differ: acquisition retains
negative, calendar, perk, animal-unlock, & dating gates; spoiler visibility ignores those gates.
Villager discovery conceals spoilers without claiming an evaluable acquisition restriction. Reviewed
cutscene fallbacks apply to acquisition only; native spoiler gates require a cutscene-map entry.
Empty disjunctions remain impossible acquisition conditions & revealable spoiler conditions.

Sources name quests, not cutscenes. A player can act on “start the Find the Weathervane quest”, but
not on “see the reveal_mistmare cutscene”, so map a cutscene back to the quest that triggers it
(through `extract/cutscene-quest-map.ts`, or a reviewed `CUTSCENE_QUEST_ENTRIES` entry) and render
that. A `cutscene` source is the fallback for scenes no quest leads to.
`enrich/availability-projection.ts` converts already-projected availability, not native
requirements.

Store recipe sources carry extraction-time spoiler gates in pipeline-only `stockGate` metadata.
Enrichment consumes that field and writes final `Source.visibility`; public source types never
include `stockGate`. An emit-boundary assertion rejects unconsumed metadata. Source identity
includes the metadata, while sorting preserves the previous gate ordering for canonical output.

## Data flow

`main.ts` is the CLI and owns every file read & write; `assemble.ts` (`assembleTrackerData`) owns
the transformation from an evaluated fiddle to validated tracker data & locale chunks, and reads no
files. A full run proceeds in these stages:

```text
assets root
  → parse TOML into a dotted namespace tree with non-enumerable provenance
  → evaluate item value expressions in place
  ┌ assembleTrackerData(fiddle, localizer, options)
  → extract registries & per-locale names (extract/)
  → collect acquisition sources into accumulators (acquisition/)
  → apply reviewed overrides, then attach sources to items, cosmetics, animals, & pets
  → extract quest chains & heart-level changes (extract/)
  → assemble TrackerData
  → stamp & assign entity visibility
  └ validate the assembled tracker data against reference registries
  → stage tracker data, the locale manifest, locale chunks, & diagnostic JSON in memory
  → extract & stage sprites, if --sprites is passed
  → publish every staged file & sprite
```

Nothing is written until the final step. `main.ts` stages every output it will write as in-memory
content; with `--sprites`, sprite extraction (`emit/sprites.ts`) converts the needed item and
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
- **Parsed game tables** (`acquisition/native-references.ts`): locations, monsters, letters, quests,
  cutscenes (a separate kind, so a cutscene ID can't pass as a quest), dates (including unlisted
  ones), placeable stations, treasure chest tiers, fish water types, and festival activities whose
  backing `misc` table exists. No table enumerates dialogue choices or dungeon loot groups, so any
  reference to either is unresolved.
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

| Module                     | Responsibility                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                  | CLI, asset-root resolution, stage order, staging, and publishing. `--parse-only` stops after parsing; `--villager-sprites-only` runs villager sprites alone.            |
| `cli-options.ts`           | Validates CLI arguments and rejects unknown or conflicting flags before asset reads.                                                                                    |
| `parse/parse-smoke.ts`     | Checks generic parsed structure, with an explicit strict canonical fixture profile.                                                                                     |
| `assemble.ts`              | `assembleTrackerData`: extraction, source attachment, visibility, & validation with an injected `Localizer`. Reviewed overrides & diagnostics are injectable for tests. |
| `parse/parse-fiddle.ts`    | Parses `fiddle/` from disk or straight out of `assets.zip` into one namespace tree. Excludes `.meta.toml`; rejects duplicate and colliding destinations.                |
| `parse/evaluate.ts`        | Resolves `value.bin` and `value.store` expressions in place (grammar below).                                                                                            |
| `parse/requirements.ts`    | Normalizes native requirement objects into requirement expressions and expands named requirements.                                                                      |
| `parse/assets-zip.ts`      | Locates `assets.zip`, the default Steam install, and the installed executable’s version for `main.ts`.                                                                  |
| `parse/asset-input.ts`     | Materializes only `fiddle/` and `localization/` from `assets.zip` for the real-asset test suite (`assets-test-setup.ts`).                                               |
| `data-shapes.ts`           | Array guards that throw with field and source-file context.                                                                                                             |
| `extractor-helpers.ts`     | Shared traversals & parsers: `forEachItem`, `forEachQuest`, `forEachStockEntry`, `firstRequiredItemId`, `minesBiomeId`, `scrollTargetOf`, and the tracked quest groups. |
| `localize/localize.ts`     | The `Localizer` extractors receive: resolves a classified text field to every locale through translation tables; falls back to English.                                 |
| `localize/locale-codes.ts` | Maps game language codes to BCP 47 tags and throws when the game adds or drops a language.                                                                              |

### Extractors

Each extractor projects one claimed domain into a registry plus per-locale names. Names are emitted
only in locale chunks (`src/lib/data/locales/<locale>/<category>.json`), never in
`tracker-data.json`.

Extractors throw on unexpected or missing source data: unrecognized keys, missing names, or values
outside a known set. Never fabricate fallback display text (such as a title-cased internal key) to
cover a gap; missing data usually means the pipeline is assembling something wrong, and a fallback
would leak that into the app. For known-set lookups, list every known value and throw on anything
else, so a new game version surfaces immediately.

| Module                    | Input                                 | Output & notable rules                                                                                                                                      |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `almanac.ts`              | Items, almanac UI, fish, translations | Almanac rows and the item registry. Collapses items into one row per recipe key, as the game does; the canonical ID is the alphabetically first member.     |
| `animals.ts`              | `ranching.animals`                    | Animal species with variant tiers. Skips templates and unacquirable variants; default-unlocked variants land in tier one.                                   |
| `cosmetics.ts`            | `player_assets`, customization UI     | Cosmetic registry and slot order. Throws unless `ui_slot` and `ui_sub_category` name an entry of `ui/character_customization.toml`.                         |
| `dates.ts`                | `dates`                               | Date registry.                                                                                                                                              |
| `festivals.ts`            | `festivals`                           | Festival registry.                                                                                                                                          |
| `mines.ts`                | `dungeons`, `spells`                  | Floors, biomes, and spells. Throws without a numeric `dungeons.misc.max_floors`.                                                                            |
| `mount.ts`                | Horse variants, `misc_local`          | Mistmare appearances: the horse variants marked `acquirable = false`, named by `misc_local/<id>`. Throws on an appearance without a reviewed unlock.        |
| `museum.ts`               | Museum wings and UI ordering          | Wings and sets in UI order, falling back to object order.                                                                                                   |
| `pets.ts`                 | `pets`, items                         | Pet cosmetic sets and pet skins.                                                                                                                            |
| `quests.ts`               | The six tracked quest groups          | Quests by app quest type. Throws when a cooking or fetch quest has no `has_item` requirement.                                                               |
| `recipes.ts`              | Items                                 | Recipe identities, native defaults, `recipeIdByItemId`, names, and member maps. Groups items by `recipe_key ?? itemId` (details below).                     |
| `renown.ts`               | `renown`                              | Town ranks. Defaults to 10 levels per rank; throws when a rank has no English name.                                                                         |
| `skills.ts`               | `skills`, `perks`, skill menu UI      | Skills, perk tiers, and perk names. Throws when the skill menu names a perk without a name.                                                                 |
| `stores-meta.ts`          | `stores`                              | Store registry.                                                                                                                                             |
| `treasure-chest-tiers.ts` | `fishing.chest_tables`                | Treasure chest tiers.                                                                                                                                       |
| `localize/ui-strings.ts`  | `misc_local`                          | The `ui` locale chunk: category names, seasons, quest types, almanac labels, and `tier_<n>`. Collapses gendered markup to `<they>`; throws on other markup. |
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
| `collectors/stores.ts`                      | Store stock, with requirements projected through `requirement-projector.ts`.                                                                       |
| `collectors/exploration.ts`                 | Mines, artifact digs, treasure chests, the wishing well, the artifact replicator, and equipment.                                                   |
| `collectors/recipe-only.ts`                 | Perks, dragon-forged defaults, and reviewed recipe-only exceptions that have no parallel item-acquisition table.                                   |
| `requirement-projector.ts`                  | One native expression traversal projects acquisition availability & spoiler visibility with independent leaf policies.                             |
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

The `enrich/` modules compute spoiler gating from facts extracted in `extract/`.

| Module                                 | Responsibility                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `extract/cutscene-quest-map.ts`        | Maps cutscenes to the quests that trigger them, including setup scenes that gate a quest-starting scene.                                      |
| `extract/quest-chains.ts`              | Story prerequisites, heart-level chains, crown, Stillwell, & Tali order, and raw fetch-quest requirements; includes reviewed story overrides. |
| `acquisition/requirement-projector.ts` | Projects native requirements into both acquisition & spoiler conditions; see the acquisition section.                                         |
| `enrich/availability-projection.ts`    | Converts availability conditions into visibility conditions.                                                                                  |
| `enrich/entity-visibility.ts`          | Hardcoded store, villager, and category gates; heart-level changes; and visibility for items, recipes, cosmetics, animals, spells, & quests.  |

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
Source identity includes availability, internal stock gates, & final visibility. When the same path
has different gates, each gated source remains a separate acquisition alternative, keeping its
availability and spoiler condition paired. An unconditional path remains a separate alternative, and
sorted output is independent of collector order.

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
| `src/lib/data/tracker-data.json`             | Committed app data, pretty-printed so regenerations diff readably     |
| `src/lib/data/locales.json`                  | Locale manifest generated from `l10n.meta.toml`                       |
| `src/lib/data/locales/<locale>/*.json`       | Per-locale name chunks, one file per category                         |
| `pipeline/output/sprites/{items,villagers}/` | Converted webp sprites, with `--sprites` or `--villager-sprites-only` |
| `pipeline/output/asset-atlas/`               | Per-version asset inventories & diffs, from `pnpm run pipeline:atlas` |

Review a regeneration with `pnpm run data:diff [base-ref]`, which compares the committed tracker
data at a Git ref (default `origin/main`) with the working copy and prints each added (`+`), removed
(`-`), or changed (`~`) JSON path, then a count summary. Objects compare by key; arrays of objects
with unique string `id`s compare by id and arrays of unique scalars compare as sets, each with one
order line for a reorder; other arrays compare by index. It exits 0 whenever the comparison runs,
changes or not, and 1 on an error, and needs no game assets.

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
prices nor outfit inventories are duplicated in reviewed tables. The crown visibility gate is Iron
Star (renown level 40), from `Ari.gml`’s crown cooldown. Mount appearance unlocks (the Horse Statue
or the Big Egg) & the Horse Statue’s 100-essence cost come from `obj_horse_statue.gml` &
`AriFsm.gml`; an assets test asserts the cost against the GML.

Early Access used 50. See #638 (private beta).

The #414 migration produces byte-identical game 1.0.5 tracker output & identical locale chunks
compared with its pre-change pipeline run. There are no intentional generated-data changes.
`seals.toml` now derives the fire- & final-seal cutscene mappings. The remaining post-seal mapping,
`destroy_vines_eastern_road`, stays a reviewed runtime fact because no native quest link derives it;
the availability projector & cutscene mapper share its central entry.
