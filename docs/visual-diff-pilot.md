# Visual-diff pilot

Pull requests get before, after, & difference sheets for two representative pages. The pilot is
informational: neither a layout difference nor a capture failure changes “CI passed”. The
independent “Visual-diff pilot” check stays red when setup or capture fails, and its PR comment
reports the failure.

## Baseline & coverage

The baseline is `pull_request.base.sha` at event time; the comparison is `pull_request.head.sha`.
Each app has its own checkout, frozen dependency install, build, & preview server. Both captures run
the PR head’s Playwright harness, local asset fixtures, & state initialization. The report records
both source commits. A later base-branch change requires another PR event to refresh the baseline.

| Route         | State                                            | Selection reason                                                                       |
| ------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `/en`         | Empty progress, all availability windows visible | The home page exercises category strips, overall progress, & navigation.               |
| `/en/almanac` | Empty progress, “Artifacts” expanded             | The almanac exercises an expanded category, item rows, sprites, & completion controls. |

Each route runs at 1280 × 720 & 390 × 720, in light & dark modes. Each state is captured twice in a
fresh browser context. That produces eight comparisons & 32 raw captures. The six attached sheets
combine the states into desktop/mobile columns & light/dark rows; individual captures remain in the
downloadable artifact. The publisher replaces its existing marked comment, keeping six comparison
sheets visible per PR.

## Reproducibility controls

- The pilot inherits the existing Playwright locale, UTC timezone, service-worker blocking,
  readiness checks, & local network fixture. CI pins Chromium through the same Playwright container
  as accessibility tests.
- The fixture verifies & serves the pinned Satoshi font. Missing or changed font bytes fail capture;
  the pilot never measures a silent system-font fallback.
- Sprite requests use the existing synthetic, dimension-matched WebP fixtures. No browser request
  reaches the internet. An unknown sprite fails the network check.
- Both revisions receive the same serialized progress & preferences, explicit theme, fixed clock, &
  reduced-motion setting. Screenshots disable animations & hide the caret.
- Exact RGBA comparison highlights changed pixels in magenta. The larger difference between repeated
  base captures or repeated head captures is reported separately as “Repeat noise”. No tolerance
  hides small changes.

## Permissions & publishing

The capture workflow runs PR code with read-only repository access, no injected secrets, no
persisted checkout credentials, & no saved dependency caches. Its workflow is separate from the
required CI aggregate.

The owner approved a narrowly tested exception to the repository’s `workflow_run` ban for this
publisher. The publisher checks out the default branch & installs no PR dependencies. It downloads
artifacts into runner temporary storage, then reads only known numeric metrics & six bounded PNG
files. It never executes artifact scripts or publishes artifact Markdown. Both the workflow identity
& the PR’s current head are checked before publication. Closed PRs & superseded commits receive no
report.

[GitHub’s event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
describes the separate write-token context & default-branch requirement.

GitHub CLI uploads the sheets directly into a PR comment.
[Attachment uploads need push access](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli),
so only the trusted publisher receives contents-write & pull-request-write permissions. It preserves
unrelated comments & comments by other authors. The publisher workflow starts automatically only
after its file exists on the default branch. Before that first merge, the same script can be
exercised locally against a real capture run with an authenticated CLI.

Local runs use a personal token, but the workflow uses the job’s `GITHUB_TOKEN`, whose attachment
upload hasn’t been proven yet. If GitHub rejects the upload, the publisher posts the metrics table
without sheets and points to the capture run’s downloadable report.

## Local commands

Obtain the font with `pnpm exec tsx scripts/playwright-satoshi.ts`. Prepare a separate baseline
checkout at the exact base SHA & install its dependencies with `pnpm install --frozen-lockfile`;
never share dependencies or build output between the app checkouts.

```sh
VISUAL_REVISION=base VISUAL_APP_DIRECTORY=/absolute/path/to/base pnpm exec playwright test --config playwright.visual.config.ts
VISUAL_REVISION=head pnpm exec playwright test --config playwright.visual.config.ts
VISUAL_BASE_SHA=<base-sha> VISUAL_HEAD_SHA=<head-sha> pnpm exec tsx scripts/visual-diff.ts
```

The results are in `.playwright-artifacts/visual/report/`. A missing capture produces a labeled
placeholder & null metrics, and the report command exits nonzero. A visual difference alone leaves
that command successful.

To exercise publication before the publisher workflow lands, download the real run’s
`visual-diff-report` artifact with
`gh run download <run-id> --name visual-diff-report --dir .playwright-artifacts/visual-download`,
then run:

```sh
GITHUB_REPOSITORY=mrh-is/mistria-fyi VISUAL_RUN_ID=<run-id> node scripts/publish-visual-diff.ts
```

## Cost & limits

Each report records elapsed CI time, including queueing & setup, from the capture run’s timestamps.
The artifact contains Playwright’s JSON timings for each revision & preview build logs, so setup
cost can be separated from capture cost. It is retained for 14 days. Compare repeated runs before
expanding routes or states; investigate any nonzero repeat noise first.

The initial local smoke test made all 16 captures per revision. Head captures took 6.5 seconds using
an existing build; baseline build & captures took 21.3 seconds. All eight base/head comparisons &
all repeat comparisons were pixel-identical. These local measurements do not predict CI cost.

The [first hosted sample](https://github.com/mrh-is/mistria-fyi/actions/runs/41331073115) took 197
seconds overall, including setup & queueing. Base build & captures took 54 seconds; head build &
captures took 53 seconds. All 32 captures passed, and all eight comparisons reported zero changed
pixels & zero repeat noise. This is one cold sample, not evidence for expanding coverage.

The pilot covers only the initial viewport, English, Chromium, empty progress, & one expanded
category. It cannot judge game artwork because sprites are synthetic. It does not cover
below-the-fold content, physical mobile input, populated progress, errors, other browsers, or
accessibility behavior. A changed state selector or storage contract causes a capture failure; that
is reported rather than replaced with a different state. The head serializes the shared state, so
after a storage schema bump the base build rejects it as a newer build’s data. The capture treats
the resulting persistence toast as a failure, not as a visual difference.

The [manual visual checklist](agent-verification.md#visual-checklist), its screenshot cap, existing
accessibility suites, & interaction checks remain required. This pilot does not authorize replacing
any of them.
