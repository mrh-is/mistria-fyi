# Data pipeline

The pipeline converts Fields of Mistria’s native TOML namespaces into the smaller `TrackerData`
model consumed by Harvest Helper. It deliberately ignores game domains the tracker does not claim,
but many claimed fields are normalized or omitted according to extractor-specific rules documented
below.

## Setup & commands

The input argument is an assets root containing `fiddle/`, not the `fiddle/` directory itself. Game
assets are ignored by Git and are not present in a fresh clone.

```sh
pnpm run pipeline -- /path/to/assets
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
pnpm run pipeline -- /path/to/assets --parse-only
pnpm exec vitest run pipeline/
```

`--parse-only` currently enforces the v1.0.2 fixture’s 295 non-metadata files and three
representative paths, so it is not a version-agnostic validator.

## Data flow

```text
assets root
  → parse TOML into a dotted namespace tree + non-enumerable provenance
  → evaluate item value expressions in place
  → project claimed namespaces through domain extractors
  → attach direct-reward quest gates
  → assemble TrackerData
  → write committed and diagnostic JSON artifacts
```

The parser walks `fiddle/` recursively, maps each non-metadata TOML file to its relative dotted
namespace, and excludes files ending in `.meta.toml`. It rejects duplicate destinations, including
an ancestor and descendant collision. Provenance records each parsed file’s relative path under a
non-enumerable symbol, so diagnostic JSON does not serialize it. `sourceFileFor` finds the nearest
ancestor namespace with provenance, which lets a nested field report its source file.

The evaluator indexes every item ID before resolving values. It mutates `value.bin` and
`value.store` in the parsed tree, resolves dependencies recursively, rejects duplicate IDs, cycles,
missing dependencies, malformed recipes, unsupported expressions, and unresolved strings. The
supported forms are `self.recipe * multiplier` and `item_id.store * count`. Recipe valuation uses an
ingredient’s `bin` value first, then its `store` value, and preserves a numeric zero.

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

| Module                      | Input ownership                                                           | Output                            | Important normalization or omission                                                                                                                                                                                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                   | CLI arguments, `MISTRIA_ASSETS`, parsed tree                              | `TrackerData` and files           | Requires an assets root containing `fiddle/`; parse-only stops before evaluation, extraction, and writes.                                                                                                                                                                                                                                      |
| `parse-fiddle.ts`           | Assets root and TOML below fiddle root                                    | Namespace tree, count, provenance | Excludes `.meta.toml`; rejects duplicate, colliding, and invalid nested destinations; provenance is non-enumerable.                                                                                                                                                                                                                            |
| `evaluate.ts`               | Parsed `items` and provenance                                             | In-place numeric item values      | Resolves two expression forms, rounds recipe multipliers, skips time and essence recipe entries, and fails with source context on invalid dependencies.                                                                                                                                                                                        |
| `requirements.ts`           | Requirement definitions and an object                                     | Boolean expression                | Empty input becomes `all: []`; siblings become `all`; `or` becomes `any`; `invert` becomes `not`; unknown keys remain predicates.                                                                                                                                                                                                              |
| `data-shapes.ts`            | Extractor values with source context                                      | Array guards                      | Throws errors for malformed arrays used by extractors.                                                                                                                                                                                                                                                                                         |
| `localize.ts`               | Parsed tree and optional language                                         | No production data                | Retained stub. English strings are inline, and all calls throw.                                                                                                                                                                                                                                                                                |
| `extractors/almanac.ts`     | Items, almanac UI, fish                                                   | Almanac and item registry         | Skips defaults, chests, unreviewed, nameless, and localization-path items; assigns first menu-order tag category; collapses colorways by recipe key and name.                                                                                                                                                                                  |
| `extractors/animals.ts`     | `ranching.animals`                                                        | Animal registry                   | Skips defaults and unacquirable variants; falls back to IDs; strips species names from cosmetics; default-unlocked variants become tier one.                                                                                                                                                                                                   |
| `extractors/cosmetics.ts`   | `player_assets` and customization UI                                      | Cosmetic registry                 | Skips defaults, maps aliases, infers slots from IDs, then falls back to `top`; maps or title-cases subcategories.                                                                                                                                                                                                                              |
| `extractors/mines.ts`       | Dungeons and spells                                                       | Floors, biomes, spells            | Requires numeric maximum floors and a biome array; derives ends from next starts; falls back to positional floors and names.                                                                                                                                                                                                                   |
| `extractors/museum.ts`      | Museum wings and UI ordering                                              | Ordered wings and sets            | Prefers UI order, falls back to object order, skips unknown ordered IDs and wings without sets, and validates item arrays.                                                                                                                                                                                                                     |
| `extractors/npcs.ts`        | NPCs                                                                      | NPC registry                      | Skips defaults and NPCs without name, Boolean `dateable`, or complete birthday.                                                                                                                                                                                                                                                                |
| `extractors/quests.ts`      | Six named quest groups                                                    | Quest groups                      | Includes only supported groups, skips defaults, and falls back to quest IDs for names.                                                                                                                                                                                                                                                         |
| `extractors/renown.ts`      | Renown                                                                    | Ranks and levels per rank         | Falls back to 10 levels per rank and `Unknown` rank names.                                                                                                                                                                                                                                                                                     |
| `extractors/skills.ts`      | Skills                                                                    | Skill names                       | Skips defaults and title-cases IDs without a name.                                                                                                                                                                                                                                                                                             |
| `extractors/sources.ts`     | Stores, wildlife, items, forageables, monsters, quests, festivals, renown | Acquisition-target source index   | Source order follows extractor order. Structural deduplication preserves the first identical JSON representation. Targets include items, cosmetics, and other game object IDs. Scroll entries are counted and discarded. `all` requirements flatten, while `any`, `not`, unsupported predicates, and reached-date day precision are discarded. |
| `extractors/quest-gates.ts` | Supported quest groups and extracted registries                           | Direct-reward index and mutations | Every allowlisted `rewards[].item` ID is indexed. Applicators attach only IDs that match extracted item, animal, or spell records; recipe scrolls and animal, spell, store, & progression inference are deferred.                                                                                                                              |

### Source rules

`sources.ts` appends source records in fixed extractor order: stores, fish, bugs, crafting, crop
items, forageables, crop seasons, monster drops, quest rewards, festival cosmetics, then renown
rewards. It deduplicates each target after collection by serializing every source to JSON, retaining
the first structurally identical record. The serialized `TrackerData.sources` type says item IDs,
but the extractor also indexes cosmetics and other game object IDs.

Store processing accepts constant, seasonal, and random stock. It counts and discards
`recipe_scroll` and `crafting_scroll` entries. Store requirements first become Boolean expressions,
then a lossy flat restriction list: `all` branches concatenate; `any` and `not` branches disappear;
unsupported predicates disappear; and `reached_date` retains season but drops day precision.
Supported predicates project to perk, skill, mines-level, season, animal, cutscene, season-seen,
upper-floor, or relationship restrictions.

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

### Make tests portable

- **Current behavior:** `.gitignore` excludes `pipeline/input/`, but parser, evaluator, and
  requirement tests read `pipeline/input/assets/`. A fresh clone cannot run the complete suite. The
  local v1.0.2 assets occupy roughly 972 MB and cannot be assumed distributable.
- **Affected files:** `.gitignore`, `pipeline/src/*.test.ts`, pipeline test helpers, and pipeline
  setup documentation.
- **Desired result:** Add a small synthetic distributable fixture, or an explicit asset-provisioning
  mechanism that skips fixture-dependent tests with an actionable message. Prefer synthetic unit
  fixtures and an opt-in real-assets integration test.
- **Constraints:** Do not commit licensed game assets. Do not weaken the existing 295-file
  integration assertion when v1.0.2 assets are available.
- **Verification:** `pnpm exec vitest run pipeline/` passes in a fresh clone without private assets,
  and a documented integration command validates the complete v1.0.2 fixture.

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

### Tighten expression grammar

- **Current behavior:** `evaluate.ts` matches decimal multipliers with `([\d.]+)` and passes the
  result to `parseFloat`, which can accept a malformed prefix such as `1.2.3`.
- **Affected files:** `pipeline/src/evaluate.ts` and synthetic evaluator tests.
- **Desired result:** Define and enforce the exact numeric literal grammar supported by TOML value
  expressions, rejecting malformed or non-finite multipliers before evaluation.
- **Constraints:** Confirm every supported-fixture expression conforms. Keep the two supported forms
  and rounding semantics unchanged.
- **Verification:** Tests accept fixture integer and decimal multipliers, and reject repeated
  decimal points, empty numeric tokens, non-finite values, and trailing text with source context.
