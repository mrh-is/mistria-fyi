---
id: 2026-10-31-tooling-tests-follow-the-diff
status: current
summary: >-
  Pull requests run the relay & most scripts/ tests only when they change those tests’ inputs or a
  shared input. Tests coupled to the browser suites always run, and main runs everything.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/328
  - .github/workflows/ci.yml
  - vite.config.ts
  - docs/development-workflow.md#vitest-time-budgets
relationships: []
---

# Tooling tests follow the diff

## Context

On `main`, the `scripts/` tests & `relay/worker.test.ts` take about 71 s of the suite’s 153 s of
file time, on a job with about two workers. A product pull request can’t usually break them, and the
relay test’s one flake failed an unrelated lint pull request (#13). The cleanup test was already
gated on its own script, which set the pattern.

A skipped test can hide a real failure, so a skip has to be the exception that a filter proves safe.
The import graph of each `scripts/` test showed four that reach outside `scripts/`:

- `machine-doctor` imports `pipeline/src/game-version.ts`.
- `stylelint-config` imports `stylelint.config.js`.
- `playwright-satoshi` imports `src/lib/asset-origin.ts`.
- `sprites/sprite-manifest` imports the generated tracker data & copies `tests/browser/fixtures/`.

A read of each test’s file access found more. `playwright-allocation` lists the real accessibility
specs, which import `src/lib/` & `tests/browser/` modules. The policy tests read `package.json`,
every workflow, the Husky hooks, `.claude/settings.json`, `.codex/hooks.json`, the Playwright
configs, & `.node-version`. The relay test reads only `relay/`.

## Decision

The CI change detector emits `relay` & `scripts` outputs. On pull requests they start `false`:

- `relay` turns `true` for `relay/**`, `scripts/vitest-relay-sequencer.ts`,
  `scripts/vitest-wrangler-env.ts`, or a shared input. The Vitest config loads those two files for
  the relay test.
- `scripts` turns `true` for `scripts/**`, `pipeline/**`, `.github/workflows/**`, `.husky/**`,
  `.claude/settings.json`, `.codex/hooks.json`, `playwright*.config.ts`, `stylelint.config.*`, or a
  shared input.

The shared inputs are `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.node-version`,
`vite.config.*`, `tsconfig*`, & `.github/workflows/ci.yml`. Other events always run both groups.
`vite.config.ts` drops a group only when its variable is exactly `false`, so local runs keep
everything. Pipeline tests are never gated.

The three tests coupled to the browser suites (`playwright-allocation`, `playwright-satoshi`, &
`sprites/sprite-manifest`) always run. They cost about 4 s on `main`.

## Alternatives

Adding the browser-coupled tests’ app paths to the `scripts` trigger would save those 4 s. That list
would go stale the first time an accessibility spec imports another `src/` module, and the filter
would then skip a test that the change can break. An always-run list fails toward running.

Skipping on an allowlist of product paths (run unless every file is under `src/`, `static/`, or
`docs/`) is equivalent for today’s tree. The issue asked for explicit triggers, and a trigger list
reads as the dependency it records.

Leaving both groups unconditional keeps the time cost & the unrelated flake.

## Revisit if

A new `scripts/` test reads app or test files, the browser-coupled tests grow slow, or a pull
request merges green & `main`’s next push shows a gated test failing.
