# Agent documentation cleanup

Issue: #169. Approved 2026-09-19.

## Goals

- One verification contract: agents run focused checks locally; GitHub Actions runs the complete
  matrix on every pull request.
- Explicit exceptions where the full matrix must still run locally.
- Remove stale commands, workflow names, & "planned CI" language.
- One home for each rule; other documents link to it.
- A durable review trail: findings & resolutions live on the PR or issue, not in agent sessions.

## Verification contract

Local, during implementation:

- The specific test covering the change: `pnpm exec vitest run <file>`.
- `pnpm run check` after any TypeScript or Svelte contract edit.
- `pnpm run lint:fix` before committing.

CI, on every pull request (`ci.yml`): `lint`, `check`, `check:i18n`, `test`, `build`,
`check:routes`. `browser-tests.yml` adds accessibility & PWA suites when `src/`, `static/`, or
`tests/` change.

Full local matrix (`pnpm run verify`) is required only when:

- The change regenerates `tracker-data.json` or touches the pipeline parser, evaluator, extractors,
  or shared tracker contract; CI has no game assets, so `test:pipeline:assets` & the pipeline run
  are local-only.
- The change is high-risk & cross-cutting (the §9 cross-agent review list).
- A CI failure cannot be reproduced from a focused test.
- The change edits a check CI does not run (release scripts, browser suites outside the trigger
  paths).

`check:i18n` moves into the CI lint job so `verify.sh` & CI run the same set.

## Review trail

An agent asked to review posts its findings as a PR review (or an issue comment when there is no PR)
using a fixed shape per finding: severity, finding, impact, suggested fix. It does not fix anything
unless asked. When asked to address findings, it replies in the same thread with the resolution for
each one, including "won't fix" with a reason. Documentation guidance is derived later from
repeated, resolved findings, never from a single review opinion.

## Edits

| File                                   | Change                                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                            | §7 rewritten to the contract above; §9 review trail; §10 routing collapsed to a link; Wrangler `pnpx` exception in §4                                                             |
| `docs/development-workflow.md`         | §2 manual worktree steps become a fallback; §4/§5 aligned with contract; drop "issue #90 planned CI"; fix `pipeline -- input/assets --version=1.0.2` ×2; hook-bypass note aligned |
| `pipeline/README.md`                   | Drop "planned CI" language                                                                                                                                                        |
| `docs/accessibility-testing.md`        | `accessibility.yml` → `browser-tests.yml`; shard artifact names                                                                                                                   |
| `docs/pwa-verification.md`             | `pwa.yml` → `browser-tests.yml`                                                                                                                                                   |
| `docs/localization.md`                 | `check:i18n` described as a CI check                                                                                                                                              |
| `docs/icon-pipeline.md`                | §5 points at the contract instead of listing three commands                                                                                                                       |
| `docs/game-version-update-protocol.md` | Names the full local matrix as a required exception                                                                                                                               |
| `.agents/DELEGATION.md`                | Session-lifecycle section links to `AGENTS.md` §10 instead of restating it                                                                                                        |
| `scripts/verify.sh`                    | Header comment matches the contract                                                                                                                                               |
| `.github/workflows/ci.yml`             | `pnpm run check:i18n` added to the lint job                                                                                                                                       |
| `CONTRIBUTING.md`                      | Command table gains `verify`, `check:i18n`, `check:routes`                                                                                                                        |

User-level files (`~/.claude/CLAUDE.md`, `~/.agents/AGENTS.md`) are out of scope for this PR;
proposed trims are listed in the PR description for separate approval.
