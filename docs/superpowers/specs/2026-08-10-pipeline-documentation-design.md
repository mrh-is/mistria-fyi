# Pipeline documentation & type clarity

## Goal

Make PR #43’s TOML pipeline understandable to a maintainer with no prior knowledge. The work will
document the pipeline’s architecture, vocabulary, invariants, normalization rules, omissions, and
known limitations. Runtime behavior and generated data must remain unchanged.

## Scope

The documentation pass covers the pipeline introduced or materially changed by PR #43:

- Project-level pipeline instructions in `README.md`, `CONTRIBUTING.md`, and `AGENTS.md`.
- A new `pipeline/README.md` that serves as the authoritative maintainer guide.
- Current quest-gate documentation in `pipeline/QUEST-GATES.md`.
- Status corrections in the pipeline v2 design and implementation-plan documents.
- Module contracts and selective invariant comments throughout `pipeline/src/`.
- Descriptive internal TypeScript names where the current names obscure domain meaning.
- Test names and comments that currently contradict their assertions or overstate coverage.

This pass will not add validation, change fallback behavior, alter output schemas, add tests for new
behavior, or regenerate `tracker-data.json` unless a type-only edit unexpectedly changes formatting.
Behavioral defects and improvement opportunities will be documented as recommendations.

## Documentation layers

### Project orientation

The root documentation will remain concise. It will explain prerequisites, the required input
directory shape, commands, generated artifacts, and the distinction between committed output and
locally supplied game assets.

Current statements that call `pipeline/input/assets/` a checked-in fixture will be corrected. The
directory is ignored, contains licensed game assets, and is absent from a fresh clone. The docs will
state that a developer must provide an assets root containing `fiddle/` before running the pipeline
or fixture-backed tests.

The command documentation will consistently use pnpm. Version-specific facts, such as the v1.0.2
fixture’s 295 processed TOML files, will be labeled as fixture invariants rather than general parser
requirements.

### Pipeline maintainer guide

`pipeline/README.md` will be the durable source of truth. It will include:

- The end-to-end flow: CLI input, TOML parsing, provenance attachment, in-place expression
  evaluation, extraction, quest-gate attachment, assembly, and output writing.
- A glossary for assets root, fiddle root, dotted root path, provenance, primitive requirement,
  named requirement, requirement expression, acquisition source, restriction, and quest gate.
- A file map describing each processor and extractor’s ownership.
- The parser namespace mapping, `.meta.toml` exclusion, collision policy, and ancestor-based source
  lookup.
- Expression grammar, dependency resolution, recipe-value rules, mutation, and failure conditions.
- Requirement normalization and the lossy projection from Boolean expressions to flat source
  restrictions.
- Extractor inclusion, normalization, fallback, and omission policies.
- Every generated artifact, including diagnostic readable files and the nondeterministic
  `generatedAt` field.
- A concise recommendations section separating current behavior from possible future changes.

The guide will describe the actual implementation, even where it differs from the original design.

### Source documentation

Every pipeline module will receive a short module-level contract when its role or boundaries are not
obvious from its exports. Exported orchestration and transformation functions will receive JSDoc
when callers need to know about mutation, accepted roots, failure behavior, or lossy conversion.

Inline comments will be reserved for decisions a maintainer could otherwise change accidentally:

- Why provenance is stored under a non-enumerable symbol and resolved by ancestor lookup.
- Why expression evaluation mutates the parsed tree and requires globally unique item IDs.
- Why recipe valuation prefers bin value, falls back to store value, and preserves zero.
- How empty, sibling, `or`, `invert`, named, and unknown requirements are normalized.
- Which Boolean requirement branches and predicate details are discarded by restriction projection.
- Why extractor order affects source order and structural deduplication preserves the first entry.
- Which records are intentionally excluded, normalized, or silently skipped.
- Why current quest gates represent direct finished-item rewards rather than inferred availability.

Comments that merely repeat a loop, condition, log message, or function name will be removed or
avoided.

## Type refinements

Internal pipeline types will be renamed where their present names conceal the represented domain.
Planned refinements include:

- `FiddleData` to a name describing the parsed TOML namespace tree.
- `ParsedFiddle` to a name describing the parser result and its provenance index.
- `DataContext` and its fields to source-location vocabulary used in diagnostics.
- `RequirementExpr`, `RequirementRegistry`, and resolver state fields to normalized-requirement and
  named-definition vocabulary.
- `SourceMap` to an acquisition-target source index.
- `ItemsRegistry` to an item metadata index, clarifying that it includes named items beyond visible
  almanac rows.
- Evaluator state fields to explicit item-index, source-root, dependency-stack, and resolution-state
  names.

These changes are compile-time refactors only. The app-facing `TrackerData` schema will not be
redesigned in this pass. In particular, the inaccurate item-only key type for `sources`, the
polymorphic `Source.location`, and the permissive `Restriction` interface will be documented as
future type-model recommendations because changing shared app types exceeds the approved internal
pipeline scope.

## Historical documents

The pipeline v2 design and implementation plan will remain as historical design artifacts. Each will
receive a clear status notice pointing readers to `pipeline/README.md` for current behavior. False
current-tense scope statements will be corrected where they would otherwise mislead maintainers,
especially around recipe tracking, localization, fixture distribution, unknown requirement keys, and
strict processed-data validation.

`pipeline/QUEST-GATES.md` will be rewritten as a current-state document. It will distinguish direct
item-reward evidence from deferred animal, spell, store, progression, and recipe inference, and it
will link to the follow-up quest-gate design for future work.

## Behavioral recommendations

The maintainer guide will record the following implementation-ready briefs without acting on them in
this pass. Each brief identifies the current behavior, affected code, desired result, constraints,
and evidence required for a later agent to complete it independently.

### Make tests portable

- **Current behavior:** `.gitignore` excludes `pipeline/input/`, but parser, evaluator, and
  requirement tests read `pipeline/input/assets/`. A fresh clone therefore cannot run the complete
  pipeline test suite. The local v1.0.2 assets occupy roughly 972 MB and cannot be assumed to be
  distributable.
- **Affected files:** `.gitignore`, `pipeline/src/*.test.ts`, pipeline test helpers, and the
  pipeline setup documentation.
- **Desired result:** Either add a small, synthetic, distributable fixture containing only the TOML
  relationships each test exercises, or add an explicit asset-provisioning mechanism that skips
  fixture-dependent tests with an actionable message when assets are absent. Prefer synthetic
  fixtures for unit contracts and reserve real game assets for an opt-in integration test.
- **Constraints:** Do not commit licensed game assets. Do not weaken the existing 295-file
  integration assertion when the v1.0.2 assets are available.
- **Verification:** `pnpm exec vitest run pipeline/` passes in a fresh clone without private assets,
  and an explicitly documented integration command validates the complete v1.0.2 fixture.

### Preserve requirement logic

- **Current behavior:** `pipeline/src/requirements.ts` produces a Boolean expression tree, but
  `pipeline/src/extractors/sources.ts` flattens `all`, discards complete `any` and `not` subtrees,
  drops unsupported predicates, and reduces `reached_date` objects to season only. The resulting
  restrictions can understate store availability conditions.
- **Affected files:** `pipeline/src/requirements.ts`, `pipeline/src/extractors/sources.ts`,
  `src/lib/types/tracker-data.ts`, availability consumers, restriction badges, and new extractor
  tests.
- **Desired result:** Preserve the normalized Boolean expression, or introduce an equally expressive
  app-facing acquisition-condition model. Every supported predicate must retain its complete value;
  unsupported predicates must remain representable rather than disappearing.
- **Constraints:** Treat this as a schema migration. Update every app consumer and generated-data
  fixture together; do not reinterpret existing flat arrays as logically equivalent to Boolean
  trees.
- **Verification:** Tests cover nested `all`, `any`, and `not`; named requirements; unknown
  predicates; full reached-date values; UI rendering; and availability evaluation.

### Model acquisition identities

- **Current behavior:** `TrackerData.sources` is typed as `Record<ItemId, Source[]>`, although the
  generated index also contains cosmetics and acquisition targets absent from both item and cosmetic
  registries. `Source.location` can mean a store, quest, monster, festival vendor, or joined water
  type depending on `Source.type`.
- **Affected files:** `pipeline/src/extractors/sources.ts`, `src/lib/types/tracker-data.ts`, source
  lookup and display consumers, and generated-data contract tests.
- **Desired result:** Introduce a truthful acquisition-target identifier and a discriminated source
  union with source-specific identity fields such as `storeId`, `questId`, or `monsterId`.
- **Constraints:** Inventory every current source key and location interpretation before changing
  the schema. Preserve targets that are useful even when they are not almanac items.
- **Verification:** A generated-data contract test classifies every source target and proves that
  every source variant carries the identifier required by its discriminator.

### Strengthen restriction types

- **Current behavior:** `Restriction` is one permissive interface with optional fields, so
  impossible combinations type-check. Several generated restriction variants are informational
  because the availability engine and badge UI do not consume them.
- **Affected files:** `src/lib/types/tracker-data.ts`, `pipeline/src/extractors/sources.ts`,
  `src/lib/engine/availability.ts`, restriction UI components, and their tests.
- **Desired result:** Replace `Restriction` with a discriminated union whose required payload is
  determined by `type`, then make each variant’s evaluation and presentation policy explicit.
- **Constraints:** Preserve serialized discriminator values unless a coordinated data migration is
  approved. Decide whether unhandled variants are display-only or availability-affecting before
  implementing them.
- **Verification:** Exhaustive TypeScript switches cover every restriction variant, and tests prove
  both availability and badge behavior for each supported type.

### Define validation policy

- **Current behavior:** The design says processed data fails fast, while several extractors silently
  skip missing roots, malformed entries, incomplete NPCs, unknown ordered IDs, unsupported stock
  entries, and other partial shapes.
- **Affected files:** Every file in `pipeline/src/extractors/`, `pipeline/src/data-shapes.ts`,
  parser provenance helpers, and extractor tests.
- **Desired result:** Create a field-by-field policy distinguishing optional data, ignored domains,
  recoverable omissions, and fatal malformed claimed data. Apply shared validators only after the
  policy is explicit.
- **Constraints:** Do not convert a fallback into a fatal error without checking the current fixture
  and at least one newer game-data version. Every fatal diagnostic must include entity, field, and
  source-file provenance where available.
- **Verification:** Synthetic tests exercise each declared omission and failure class; a complete
  fixture run produces no new unexplained skips.

### Version parse-only checks

- **Current behavior:** `pipeline/src/main.ts` makes `--parse-only` require exactly 295 parsed files
  and three v1.0.2 paths, even when the caller supplies another assets version.
- **Affected files:** `pipeline/src/main.ts`, CLI documentation, and parser integration tests.
- **Desired result:** Separate version-agnostic parse validation from named fixture profiles. A
  default smoke test should validate structural invariants; an explicit v1.0.2 profile may retain
  the 295-file and representative-path assertions.
- **Constraints:** Preserve a strict regression check for the canonical v1.0.2 integration fixture.
- **Verification:** Synthetic assets pass the generic parse-only command, the v1.0.2 profile
  enforces 295 files and representative paths, and a mismatched profile fails with an actionable
  message.

### Add contract coverage

- **Current behavior:** Parser tests omit metadata exclusion and provenance serialization; evaluator
  tests mainly cover real-fixture happy paths; requirement tests omit malformed forms; sources and
  quest gates have no focused tests. Two evaluator test names overstate their assertions.
- **Affected files:** Existing `pipeline/src/*.test.ts`, new extractor test files, and shared
  synthetic-fixture helpers.
- **Desired result:** Add small contract tests for parser collisions and provenance, evaluator
  mutation and failures, requirement normalization and malformed input, lossy source projection,
  source deduplication, and direct item-reward quest gates.
- **Constraints:** Tests must not require private game assets unless explicitly marked as
  integration tests. Assert exact representative outputs rather than merely asserting that code does
  not throw.
- **Verification:** Every documented pipeline invariant has a test whose name and assertion describe
  the same behavior, and the unit suite passes without `pipeline/input/assets/`.

### Tighten expression grammar

- **Current behavior:** `pipeline/src/evaluate.ts` matches decimal multipliers with `([\d.]+)` and
  passes the result to `parseFloat`, which can accept a malformed token prefix such as `1.2.3`.
- **Affected files:** `pipeline/src/evaluate.ts` and synthetic evaluator tests.
- **Desired result:** Define and enforce the exact numeric literal grammar supported by TOML value
  expressions, rejecting malformed or non-finite multipliers before evaluation.
- **Constraints:** Confirm every expression in supported fixtures conforms to the grammar. Keep the
  two supported expression forms and existing rounding semantics unchanged.
- **Verification:** Tests accept integer and decimal multipliers used by fixtures and reject
  repeated decimal points, empty numeric tokens, non-finite values, and trailing text with source
  context.

## Verification

Verification will confirm both documentation consistency and behavior preservation:

1. Search for stale fixture, command, localization, recipe, and quest-gate claims.
2. Run pipeline tests with `pnpm exec vitest run pipeline/` when local assets are available.
3. Run `pnpm run check`.
4. Run `pnpm run lint`.
5. Review `git diff` to confirm no generated-data or runtime-semantic changes.

If the fixture-backed tests cannot run in a fresh environment, the final report will distinguish
that environmental limitation from code failures.
