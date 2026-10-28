---
id: 2026-10-08-shared-module-registries
status: needs-review
summary: >-
  Historical scope: Shared module registries for Vitest. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-08-shared-module-registries.md#decision
relationships: []
---

# Shared module registries for Vitest

## Context

The Vitest step was the CI critical path
([mrh-is/mistria-fyi-private#707](https://github.com/mrh-is/mistria-fyi-private/issues/707)): 113 s
on two-CPU runners against
[mrh-is/mistria-fyi-private#687](https://github.com/mrh-is/mistria-fyi-private/issues/687)’s 60 s
target, while test bodies summed to 56 s. Per-file isolation re-imported tracker data, both name
locales, & Svelte for each of the `app` project’s 102 files; import & setup were most of its time.
Locally at two workers, `app` took 12.1 s isolated and 2.7 s without isolation.

## Decision

The `app`, `client`, `pipeline`, & `node` projects run with `isolate: false`, so each worker reuses
one module registry. Spies, stubbed globals, & stubbed environment variables still reset per test.
App tests that call `vi.mock()`, `vi.doMock()`, `vi.unmock()`, `vi.doUnmock()`, or
`vi.resetModules()` use the `*.isolated.test.ts` suffix and run in a new `isolated` project with the
app’s setup. Plain-Node tests under `eslint-rules/`, `scripts/`, & `tests/` use the same suffix and
a `node-isolated` project. Happy-dom tests use `*.isolated.client.test.ts` and a `client-isolated`
project; because `client` files also share a happy-dom document, the client setup empties
`document.body` after each file. `tests/vitest-isolation.test.ts` fails when a shared-registry file
uses those calls.

## Alternatives

- **Keep isolation everywhere:** leaves the largest phase untouched.
- **Keep `client` isolated:** sharing all 41 files failed on every shuffled seed, but every failure
  came from the 12 files that mock or reset modules or from one test that left nodes in
  `document.body`. Without those, sharing cut the other 29 files from 5.8 s to 1.3 s locally.
- **Opt files into sharing instead of out of it:** would rename about 240 files rather than 19, and
  forgetting the suffix would only cost speed, so nothing would enforce it.
- **Select isolated files by scanning for mocks in `vite.config.ts`:** hides a file’s project behind
  config-time logic; a suffix shows it in the path, like `.cold` & `.client`.

## Revisit if

- A shared-registry file fails only in some orders or worker assignments; shuffle it
  (`--sequence.shuffle`) before moving it to `isolated`.
- Vitest gains per-file isolation control, or module mocks stop leaking across files without it.
- Isolated runs become cheap enough (for example, through a faster import path) that the speed
  difference no longer matters.
