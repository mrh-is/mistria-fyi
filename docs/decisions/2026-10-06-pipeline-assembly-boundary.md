---
id: 2026-10-06-pipeline-assembly-boundary
status: needs-review
summary: >-
  `assemble.ts` exports `assembleTrackerData(fiddle, localizer, options)`, which turns an evaluated
  fiddle into validated tracker data, locale chunks, & sprite indexes without reading or writing
  files. `main.ts` keeps argument parsing, input resolution, staging, & publishing.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-pipeline-assembly-boundary.md#decision
relationships: []
---

# Pipeline assembly boundary & injected localizer

## Context

`pipeline/src/main.ts` was both the CLI and the only home of tracker-data assembly, and it ran the
pipeline on import, so assembly had no unit tests. Localization read TOML through a module-global
cache keyed by an `assetsDir` threaded through every extractor, and 15 extractor test files mocked
`localize.js` to escape the filesystem
([mrh-is/mistria-fyi-private#408](https://github.com/mrh-is/mistria-fyi-private/issues/408)).

## Decision

`assemble.ts` exports `assembleTrackerData(fiddle, localizer, options)`, which turns an evaluated
fiddle into validated tracker data, locale chunks, & sprite indexes without reading or writing
files. `main.ts` keeps argument parsing, input resolution, staging, & publishing.

Extractors receive a `Localizer` instead of an assets path. `createAssetsLocalizer(assetsDir)` reads
the game’s tables with a per-instance cache; tests use `createMemoryLocalizer` (real key derivation
over in-memory tables) or `stubLocalizer` (a recording English-passthrough double) from
`test-helpers.ts`, never `vi.mock` of `localize.js`. Reviewed overrides & reviewed diagnostics are
injectable options that default to the installed game’s lists, so a synthetic fiddle can pass
validation. `makeFiddle` attaches provenance so `sourceFileFor` resolves in fixtures.

## Alternatives

Keeping assembly in `main.ts` behind an import guard would leave the CLI & domain logic entangled.
Passing a raw table-loading function to extractors would leak key derivation into every caller.
Typing fixtures as `DeepPartial<ParsedGameData>` adds nothing while `ParsedGameData` is an untyped
`Record<string, unknown>`.

## Revisit if

`ParsedGameData` gains a structural type (then type fixtures as its deep partial), the full pipeline
needs to read localization straight from `assets.zip`, or a stage must run & publish independently
of full assembly.
