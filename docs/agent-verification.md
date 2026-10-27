# Agent verification guide

Read the relevant heading before behavioral, contract, visual, pipeline, high-risk, or verification
work. Focused checks are every agent’s default. CI owns the full matrix; local full-suite commands
require an exception.

## Focused checks

- Run only the test covering your change: `pnpm exec vitest run path/to/file.test.ts`. This works
  for every test file, including `*.client.test.ts` & `*.cold.test.ts`; Vitest picks the project.
- Run `pnpm run check` after a TypeScript or Svelte contract edit.
- Run `pnpm run lint:fix` before committing. Lint must produce zero errors and zero warnings; a
  warning that needs an `oxlint-disable`, `eslint-disable`, or `stylelint-disable` comment gets the
  narrowest possible disable with a justification.
- Documentation-only changes: `pnpm run lint:fix && pnpm run lint` only.

## CI coverage

The steps CI runs are listed in one place, `STEPS` in [scripts/verify.ts](../scripts/verify.ts):
each step names the `ci.yml` job that runs it, & each job runs its steps with
`pnpm run verify -- --step=<name>` (the audit job, which installs nothing, uses
`node scripts/verify.ts --step=audit`). The `knip` step fails on unused files, exports, &
dependencies; its reviewed exceptions live in `knip.jsonc`. Some steps are not in the local matrix:
the audit, the budgeted test run (the complete asset-independent suite with per-file & wall-time
budgets; the cleanup test runs only when its script changes), & the stale-translation check (pull
requests that touch `messages/` only). The accessibility and PWA suites run against the build job’s
output when `src/`, `static/`, `tests/`, or their tooling change. The “CI passed” job aggregates
every result. Coverage runs nightly & remains reported, not gated. Timing ceilings are documented in
[the development workflow](development-workflow.md#vitest-time-budgets). A PR merges only when it
passes; fix CI failures on the branch rather than merging around them (see agent-workflow.md’s CI
monitoring rule).

## Full verification

`pnpm run verify` is read-only & runs CI’s non-browser matrix (the steps `STEPS` in
[scripts/verify.ts](../scripts/verify.ts) marks as default); run `pnpm run lint:fix` first. Add
`-- --assets` for `test:pipeline:assets`, `--browser` for the Playwright suites, or `--all` for
both; `-- --step=<name>` runs one step. Run it once, when commit-ready, only when:

- The change regenerates `tracker-data.json` or touches the pipeline parser, evaluator, extractors,
  or shared tracker contract. CI has no game assets, so `pnpm run test:pipeline:assets` and the
  pipeline run are local-only checks; see
  [docs/development-workflow.md §4](development-workflow.md#4-test-first-development--test-matrix).
- The change touches a high-risk surface listed in Review selection below.
- A CI failure cannot be reproduced with a focused test.
- The change edits a check CI does not run for that change (release scripts, browser suites outside
  their trigger paths).

If a step fails, fix it and rerun only that step, then rerun `pnpm run verify` once. After it
passes, don’t rerun it unless you make further code changes. For CI failures, prefer
`gh run view <id> --log-failed` once; preserve the command’s exit status using Exit status below.

## Exit status

Hooks are conveniences, not evidence. Run the documented commands directly & confirm zero status.
Keep output compact without hiding the command’s exit code. Prefer a log file & inspect its tail:

```sh
log_file=$(mktemp)
pnpm exec vitest run path/to/file.test.ts >"$log_file" 2>&1
check_status=$?
tail -30 "$log_file"
rm "$log_file"
exit "$check_status"
```

Run this in a subprocess shell if `exit` would terminate a persistent interactive shell. A bare
`command | tail` reports `tail`’s status; use `set -o pipefail` if piping instead. A truncated log
alone proves neither success nor failure. Inspect enough of the log to diagnose any nonzero status.

## Visual checks

When a task changes `.svelte` files, CSS, layout, or routes, verify visually before declaring done.
Screenshot accumulation is expensive; use a bounded checklist, not exploratory browsing.

### Visual checklist

1. Start the dev server and navigate to every changed route. From a worktree, start it by URL &
   confirm it serves the branch’s code
   ([Preview from a worktree](development-workflow.md#preview-from-a-worktree)).
2. Screenshot at desktop width (~1280) and mobile width (~390).
3. Exercise every changed interaction and one reversal or undo path.
4. Check light mode and dark mode.
5. Check relevant states: empty, loaded, error, disabled.
6. Check browser console for errors.

Note: feedback runs as a dry run everywhere except production, including branch previews & local
servers. Submitting it checks the form & Turnstile, files no issue, & shows a “Preview build”
notice. That notice, not a GitHub issue, is the expected result
([Feedback credentials](app-architecture.md#8-feedback-credentials)).

### Screenshot limits

- Cap at **10 screenshots** per PR. One per materially changed state, not one per interaction step.
- If a design reference exists (Figma file, existing page to match), screenshot both and compare.
- Record what was **not** visually verified in the PR description under a “Not verified” section.

### Visual exemptions

Documentation-only changes, pipeline-only changes, and test-only changes do not need visual
verification. Changes to engine logic (`src/lib/engine/`) do not need visual verification unless
they affect rendered output.

## Review selection

For most PRs, review your own diff in a fresh context before requesting human review. A subagent
reading the diff cold catches mistakes the implementing context has normalized.

### High-risk surfaces

PRs that touch these surfaces need full local verification and an especially careful review. Who or
what reviews (another agent, another model, a human) is the contributor’s choice:

- Engine logic, state machines, or transfer encoding
- Data pipeline extractors or schema changes
- Store persistence or save/import/export flows
- Authentication, abuse controls, or security boundaries
- Changes spanning 5+ files with cross-cutting concerns

Use one review pass with a deterministic target (the merge-base diff). Do not run spec reviews, plan
reviews, and implementation reviews as separate passes. If the review finds high-severity issues
that require substantial changes, one re-review is justified; otherwise, fix and move on.

### Review prompts

Keep review prompts compact: the base commit, the changed files, the relevant invariants, and the
requested severity threshold. Do not restate the full plan or spec in the review prompt.

For browser commands, current-build reuse, pipeline real-data checks, and timing budgets, read
[development-workflow.md](development-workflow.md#5-verification-matrix). Service-worker changes
also require [pwa-verification.md](pwa-verification.md) & `pnpm run test:pwa`.
