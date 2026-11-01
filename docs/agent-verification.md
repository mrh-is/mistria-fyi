# Agent verification guide

Read the relevant heading before you change behavior, a contract, visuals, the pipeline, or a
high-risk surface, and before any verification work. Every agent defaults to focused checks. CI runs
the full matrix; running full-suite commands locally needs one of the exceptions in “Full
verification”.

## Focused checks

- Run only the test that covers your change: `pnpm exec vitest run path/to/file.test.ts`. This works
  for every test file, including `*.client.test.ts` & `*.cold.test.ts`, because Vitest picks the
  project from the path.
- After a TypeScript or Svelte contract edit, run `pnpm run check`.
- Before committing, run `pnpm run lint:fix`. Lint must report zero errors & zero warnings. If a
  warning needs an `oxlint-disable`, `eslint-disable`, or `stylelint-disable` comment, use the
  narrowest possible disable and justify it.
- A documentation-only change needs only `pnpm run lint:fix && pnpm run lint`.

### Oracle checks

A test’s oracle is the assertion that decides whether it passes. These rules keep an oracle from
passing by accident:

- **Check the target set first.** In a test that claims something is selected or enforced, assert
  that the target set is nonempty, or exactly what you expect, before checking its members.
- **Exercise the failure path.** In the same kind of test, run the existing gate’s failure path, not
  only its success. An ordering comparison alone can pass when `indexOf` returns `-1`.
- **Derive expectations independently.** Build the expected projections from a small semantic
  fixture or an independent input, not from the helper under test.
- **Isolate module mocks.** Keep fixtures that mock modules in their own test file.
- **Make pipeline drift fixtures realistic.** Encode them the way the production collector reads
  them. Show that the collector picked up the source before expecting the exclusion to reject it.
- **Prove each regression test fails.** For each gap you repair, temporarily remove the guard or
  feed in the faulty input. Confirm the test fails for the intended reason, then restore the guard
  or remove the faulty input before delivery.
- **Record each probe & its scope.** Note what each probe establishes. A Node process test doesn’t
  establish behavior in workerd, on a physical device, or in an installed PWA.

## CI coverage

`STEPS` in [scripts/verify.ts](../scripts/verify.ts) is the one list of the steps CI runs. Each step
names the `ci.yml` job that runs it, and each job runs its steps with
`pnpm run verify -- --step=<name>`. The audit job installs nothing, so it uses
`node scripts/verify.ts --step=audit` instead.

The `knip` step fails on unused files, exports, & dependencies. Its reviewed exceptions live in
`knip.jsonc`.

These CI steps aren’t in the local matrix:

- the dependency audit, which blocks pull requests & main pushes only when `package.json`,
  `pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `.github/workflows/ci.yml` changes (manual dispatches
  always audit),
- the budgeted test run, which is the complete asset-independent suite with per-file timing limits
  (its cleanup test runs only when the cleanup script changes),
- the stale-translation check, which runs only on pull requests that touch `messages/`.

The accessibility & PWA suites run against the build job’s output when `src/`, `static/`, `tests/`,
or their tooling change. The “CI passed” job aggregates every result. Coverage runs nightly; it’s
reported but doesn’t gate merges. The nightly report also records moderate-or-higher dependency
advisories after accepted exceptions. Advisories don’t fail the scheduled run; an audit that can’t
run or returns unusable JSON fails the report job. An incomplete report never closes its issue.
[The development workflow](development-workflow.md#vitest-time-budgets) documents the timing
ceilings.

A PR merges only when CI passes. Fix CI failures on the branch instead of merging around them (see
“Monitor CI” in agent-workflow.md).

### Remote setup retry

Remote CI setup has one retry exception: an agent may run `gh run rerun <id> --failed` once when the
logs identify a transient network or service problem, such as a registry download timeout. Merely
failing before tests is insufficient. Missing credentials, incompatible runtimes, & broken
configuration remain stop-&-report conditions. Test, lint, type-check, & build failures never
qualify. Record the original failure, rerun link, & outcome on the PR. If the retry fails, stop
dependent work & follow the existing reporting procedure. This exception does not apply to local
tooling failures or authorize installation, authentication, or runtime changes.

## Full verification

`pnpm run verify` runs CI’s non-browser matrix: the steps that `STEPS` in
[scripts/verify.ts](../scripts/verify.ts) marks as default. It’s read-only for tracked source files,
though its `check` & `build` steps write generated output & caches. Run `pnpm run lint:fix` first.
These flags change what it runs:

- `pnpm run verify -- --assets` adds `test:pipeline:assets`.
- `pnpm run verify -- --browser` adds the Playwright suites.
- `pnpm run verify -- --all` adds both.
- `pnpm run verify -- --step=<name>` runs one step.

Run it once, when the change is ready to commit, and only in these cases:

- The change regenerates `tracker-data.json` or touches the pipeline parser, evaluator, extractors,
  or shared tracker contract. CI has no game assets, so `pnpm run test:pipeline:assets` & the
  pipeline run are local-only checks; see
  [docs/development-workflow.md §4](development-workflow.md#4-test-first-development--test-matrix).
- The change touches a high-risk surface listed under “Review selection” below.
- A CI failure doesn’t reproduce with a focused test.
- The change edits a check that CI doesn’t run for that change, such as release scripts or browser
  suites outside their trigger paths.

If a step fails, fix it and rerun only that step. Then rerun `pnpm run verify` once. After it
passes, don’t rerun it unless you change code again. For a CI failure, prefer running
`gh run view <id> --log-failed` once, and keep the command’s exit status as “Exit status” below
describes.

## Exit status

Hooks are conveniences, not evidence. Run the documented commands directly & confirm each exits with
status 0. Keep output short without hiding the command’s exit code. Prefer writing a log file &
inspecting its tail:

```sh
log_file=$(mktemp)
pnpm exec vitest run path/to/file.test.ts >"$log_file" 2>&1
check_status=$?
tail -30 "$log_file"
rm "$log_file"
exit "$check_status"
```

Run this in a subprocess shell if `exit` would close a persistent interactive shell. A bare
`command | tail` reports the status of `tail`, not of the command; if you pipe, use
`set -o pipefail`. A truncated log alone proves neither success nor failure. When the status isn’t
zero, read enough of the log to diagnose it.

## Visual checks

When a task changes `.svelte` files, CSS, layout, or routes, verify it visually before calling it
done, unless it meets a [visual exemption](#visual-exemptions). Screenshots add up quickly, so
follow the bounded checklist below instead of browsing around.

### Visual checklist

1. Start the dev server and navigate to every changed route. From a worktree, start it by URL &
   confirm it serves the branch’s code
   ([Preview from a worktree](development-workflow.md#preview-from-a-worktree)).
2. Screenshot at desktop width (~1280) & mobile width (~390).
3. Exercise every changed interaction & one reversal or undo path.
4. Check light mode & dark mode.
5. Check the relevant states: empty, loaded, error, & disabled.
6. Check the browser console for errors.

Note: feedback runs as a dry run everywhere except production, including branch previews & local
servers. Submitting it checks the form & Turnstile (Cloudflare’s bot check) but files no issue.
Instead, the page shows a “Preview build” notice, and that notice is the expected result
([Feedback credentials](app-architecture.md#8-feedback-credentials)).

### Screenshot limits

- Take at most **10 screenshots** per PR: one per materially changed state, not one per interaction
  step.
- The cap counts the screenshots attached to the PR. Choose that set so a reviewer can judge layout
  & spacing without running the preview.
- If a design reference exists, such as a Figma file or an existing page to match, screenshot both &
  compare them.
- List what you did **not** check visually under a “Not verified” section in the PR description.

### Visual exemptions

Documentation-only, pipeline-only, & test-only changes don’t need visual verification. Changes to
engine logic (`src/lib/engine/`) don’t either, unless they affect rendered output.

Accessibility-only changes don’t need visual checks or screenshot attachments when visible content,
layout, focus behavior, & interactions stay unchanged. For example, adding a variant to a checkbox’s
`aria-label` needs a test of its accessible name, not desktop & mobile screenshots. Use focused
tests to verify the affected accessible names, roles, states, & behavior. Changes that also affect
visible content or keyboard focus still need the relevant visual checks.

## Review selection

For most PRs, review your own diff in a fresh context before asking for human review. A subagent
reading the diff cold catches mistakes that the implementing context has come to accept.

### High-risk surfaces

PRs that touch these surfaces need full local verification & an especially careful review. The
contributor chooses the reviewer: another agent, another model, or a human.

- Engine logic, state machines, or transfer encoding
- Data pipeline extractors or schema changes
- Store persistence or save, import, & export flows
- Authentication, abuse controls, or security boundaries
- Changes spanning five or more files with cross-cutting concerns

Persistence, sync-apply, & PWA or update changes need tests for the relevant sequences below. Reuse
tests that already prove a sequence. Give each new or strengthened regression test a controlled
failure witness: a controlled probe, such as temporarily removing the fix, that shows the test fails
without it.

- A failed storage read versus an absent key, followed by edits & a fresh load
- A queued auto-save versus an explicit restore, including durable storage & a fresh load
- Another tab’s write, with its storage event withheld
- Successive sync bundles whose incoming value returns to its default between disagreements
- Cancellation or a failed recovery followed by a reload or readback, keeping the last recoverable
  data
- An update that waits through asynchronous transfer decoding & merge, until it completes or is
  cancelled

Review once, against a deterministic target: the merge-base diff (the branch’s changes since it left
its base branch). Don’t run separate spec, plan, & implementation reviews. If the review finds
high-severity issues that need substantial changes, one re-review is justified. Otherwise, fix them
& move on.

### Review records

Keep findings & resolutions in the PR’s existing review threads, or in issue comments when there’s
no PR. Don’t edit the original text. This section defines a record format; it doesn’t add a review
or approval gate.

- **Posting:** a request to review is a request to post, so post every review without being asked.
  Use a PR review (`gh pr review <number> --comment --body-file <file>`), or an issue comment when
  there’s no PR. Reviews from a subagent, another model, or a review command count too: the agent
  that requested the review posts the result. A reply in the session alone isn’t a review record.

- **Finding IDs:** give each finding an ID unique within the PR, such as `F1`. Keep the ID across
  reposts & re-reviews, and never reuse it for a different finding.
- **Finding contents:** each finding includes:
  - its severity,
  - the invariant or location it affects,
  - its impact,
  - a proposed repair,
  - evidence, as a reproduction or a trace through the source.

  The review also names the base & head commits it covered.

- **Resolutions:** reply in the finding’s existing thread with its ID & one disposition:
  - **fixed**, with a commit link & how you verified it,
  - **refuted**, with evidence,
  - **accepted risk**, with a link to the owner’s explicit authorization,
  - **deferred**, with a follow-up issue & its owner.

  A finding without such a reply stays **unresolved**. A missing resolution never implies a fix.

- **No-finding reviews:** a review without findings states its scope & limits. It creates no finding
  ID.
- **Reposts:** a repost cites the existing ID & its source record instead of reporting the finding
  as new. Leave older prose findings unclassified, unless someone appends an explicit mapping backed
  by evidence.
- **Attribution:** reviews & resolution replies keep the final `Agent:` line that
  [agent-workflow.md](agent-workflow.md#agent-attribution) requires.

A collector script that aggregates findings across PRs is
[deferred](decisions/2026-10-28-review-record-format.md). It waits until a second survey shows that
this format isn’t enough for aggregation.

### Review prompts

Keep review prompts compact. Give the reviewer:

- the base commit,
- the changed files,
- the relevant invariants,
- the severity threshold you want reported.

Don’t restate the full plan or spec in the review prompt.

For browser commands, reusing the current build, real-data pipeline checks, & timing budgets, read
[development-workflow.md](development-workflow.md#5-verification-matrix). Service-worker changes
also need [pwa-verification.md](pwa-verification.md) & `pnpm run test:pwa`.
