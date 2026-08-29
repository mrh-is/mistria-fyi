# Portable pipeline tests

**Issues:** #128, prerequisite for #90

**Goal:** Make the default verification matrix pass in a fresh clone without licensed game assets,
while preserving an explicit local integration suite that validates the canonical real-data fixture.

## Context

Issue #90 proposes credential-free GitHub Actions CI that runs `pnpm run lint`, `pnpm run check`,
`pnpm run test`, & `pnpm run build`. Its assertion that the test suite is asset-independent is not
currently true. `parse-fiddle.test.ts`, `evaluate.test.ts`, & `requirements.test.ts` read
`pipeline/input/assets` directly. The recipe extractor also has real-data coverage, but correctly
skips that block when assets are unavailable.

The game assets are local, ignored, & available on the maintainer’s development computer. Remote
storage and CI regeneration would add credentials, distribution concerns, & maintenance without
improving the current development workflow. Issue #128 therefore establishes a testing boundary; it
does not provision assets to CI or automate data regeneration.

## Test boundary

The pipeline has two test tiers.

### Default suite

`pnpm run test` and `pnpm run test:pipeline` contain all deterministic behavioral tests. They run in
a fresh clone with no `pipeline/input` directory and form part of issue #90’s public CI matrix.

Every behavior presently demonstrated only through the canonical fixture receives a focused
synthetic replacement:

- parser assembly, representative nested paths, provenance lookup, collisions, & malformed TOML;
- value-expression resolution for referenced store values, recipe multipliers, ingredient counts,
  complete resolution, & failure cases;
- requirement-definition classification and named-requirement resolution.

Synthetic parser inputs use temporary directories created by test helpers. Evaluator and extractor
tests use the existing in-memory `makeFiddle` helper when filesystem parsing is not the behavior
under test. Fixtures include only the fields needed to establish the contract under examination.

### Asset suite

Canonical-fixture assertions move to files named `*.assets.test.ts`. The suite retains checks that
are meaningful only against the installed game version, including:

- the v1.0.2 count of 295 parsed files and its representative paths;
- fixture-wide expression evaluation with no unresolved supported values;
- the expected scale and source-family coverage of extracted recipes; and
- the real requirements registry’s scale and representative named resolution.

The root Vitest configuration excludes `*.assets.test.ts` from every default command. A dedicated
Vitest configuration includes only those files, and `pnpm run test:pipeline:assets` invokes it. That
command resolves assets from `MISTRIA_ASSETS`, falling back to `pipeline/input/assets` for the
standard local checkout. It fails immediately with an actionable message if the selected directory
does not contain `fiddle/`; it never reports a successful integration run after silently skipping
the suite.

## Fixture helpers

`pipeline/src/test-helpers.ts` remains the home for reusable pipeline test construction. It gains a
temporary TOML asset-tree helper with explicit cleanup ownership. Tests that create directories
register them for removal in `afterEach`, so failed assertions do not leave writable fixtures in the
repository.

Real-data path resolution is also centralized for the asset suite. Asset test files do not each
invent their own environment fallback or availability check.

The helper layer never reads or copies the game assets during default-suite discovery. Merely
importing a normal test file therefore cannot make a fresh-clone run depend on local state.

## Interaction with CI

Issue #90 remains a single, sequential GitHub-hosted job:

```text
lint -> check -> test -> build
```

The job does not receive secrets, download private files, invoke `pnpm run pipeline`, or run
`pnpm run test:pipeline:assets`. The existing generated-data invariant tests continue validating the
committed `src/lib/data/tracker-data.json`; CI does not claim to prove that the committed output
matches a locally installed game version.

Pipeline and data-contract changes retain the local verification obligations:

```text
pnpm run test:pipeline:assets
pnpm run pipeline -- pipeline/input/assets
git diff -- src/lib/data/tracker-data.json
```

The development documentation distinguishes the public CI matrix from these local real-data checks.
Issue #90 should depend on #128 and remove asset upload or secret provisioning from its
investigation scope.

## Error handling

- Default tests fail if any normal test attempts to read missing game assets; no global shim creates
  or downloads them.
- The asset suite reports the resolved assets path when `fiddle/` is missing.
- Parse and evaluation failures retain source-file provenance from the synthetic or real fixture.
- Real-data expectations remain version-specific. A future game version updates or adds a named
  fixture profile deliberately rather than weakening the canonical v1.0.2 assertions.

## Documentation

`pipeline/README.md` documents both tiers, their commands, the `MISTRIA_ASSETS` override, & the
reason CI excludes regeneration. `docs/development-workflow.md` states that the ordinary matrix is
fresh-clone-safe and lists the asset suite plus regeneration as additional checks for pipeline or
schema changes.

Issue #128’s GitHub title and body should be updated to describe portable pipeline tests. Issue #90
should record #128 as a prerequisite. Those issue edits happen when the implementation is delivered,
after the repository changes and their final command names are verified.

## Acceptance criteria

- `pnpm run test` and `pnpm run test:pipeline` pass after `pipeline/input` is absent.
- The default suite contains behavioral replacements for every removed real-data assertion.
- `pnpm run test:pipeline:assets` runs all canonical-fixture assertions when local assets exist.
- `pnpm run test:pipeline:assets` fails clearly when assets are absent.
- The canonical 295-file v1.0.2 parser assertion remains intact in the asset suite.
- No game assets enter Git history, generated test fixtures, CI caches, or Actions artifacts.
- Documentation accurately separates public CI checks from local asset-backed verification.
- The complete project verification matrix passes before delivery.

## Non-goals

- Uploading, encrypting, mirroring, or otherwise provisioning game assets for CI.
- Running the full data-generation pipeline on GitHub-hosted runners.
- Automatically committing or opening pull requests for regenerated tracker data.
- Implementing issue #90’s GitHub Actions workflow in issue #128.
- General parser, evaluator, extractor, or generated-data contract changes unrelated to test
  portability.
