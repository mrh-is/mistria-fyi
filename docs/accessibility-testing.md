# Accessibility testing

Mistria Field Guide treats WCAG 2.2 Level AA as its release floor. The automated browser suite
checks rendered pages with Chromium, axe-core, semantic assertions, keyboard and focus workflows,
320-pixel reflow, target geometry, reduced motion, and forced colors. It complements unit and
component tests; it does not replace testing with assistive technology.

## Efficient agent workflow

Agents and contributors should run the smallest browser test that covers an active change. This
keeps local feedback fast and avoids repeatedly spending compute and agent tokens on unaffected
routes. CI owns the complete matrix on every relevant pull request, nightly, and when manually
dispatched.

```bash
# One affected file
pnpm exec playwright test tests/accessibility/keyboard.spec.ts

# Stable critical contract
pnpm run test:accessibility:critical

# Complete matrix, normally left to CI
pnpm run test:accessibility
```

Tag individual tests for the critical subset with `critical` or `criticalWhen(...)` from
`tests/accessibility/support/tags.ts`; never tag a whole `describe`. Keep it to one or two cases per
feature. Build stored-state fixtures with `createStoredState`, which follows the store's current
serialized type, and read geometry through `requireBox` & `settledBox` rather than sleeping.

The Playwright configuration builds the app once, starts one preview server, and reuses it across
the selected cases. Chromium is the only installed automated browser. Cross-browser and
assistive-technology behavior belongs in the manual matrix.

## Run isolation

Two mechanisms keep a run deterministic and pinned to its own checkout (#330).

**Hydration signal.** The root layout sets `data-hydrated="true"` on `<html>` from `onMount`, which
fires once every child component has mounted. `gotoApplication` in
`tests/accessibility/support/application-state.ts` waits for that attribute after network idle, so
no test clicks a server-rendered control before its handler exists. Route the initial navigation of
every interaction test through that helper; the route journey asserts the attribute on each route.

**Preview ownership.** Each checkout derives its preview port from its own path, and
`scripts/playwright-preview.ts` stamps the checkout path into the build output as
`playwright-owner.json` before serving. When the config loads, it probes the port:

- Nothing listening: the run starts its own preview.
- A preview stamped by another checkout: the run fails at once and names that checkout.
- A preview stamped by this checkout: the run fails and reports when the leftover started.
- Anything else: the run fails and says the server is not a Playwright preview.

`reuseExistingServer` stays `false`, so a run never adopts a server it did not start. Set
`PLAYWRIGHT_PORT` to move a run to a free port rather than stopping an unrelated process.
`PLAYWRIGHT_SKIP_BUILD=true` serves the existing build output, which CI uses after downloading the
shared build artifact.

## CI behavior

The `accessibility` job in `.github/workflows/ci.yml` runs in parallel shards against the `build`
job's output, inside the official Playwright image for the locked Playwright version. It runs for
pull requests that touch `src/`, `static/`, `tests/`, or their configs, main pushes, 03:17 UTC
nightly, and manual dispatch. Playwright splits shards by test count, not duration, so keep any
single test well under a shard's runtime; split a long loop into one test per locale or route.
Pull-request jobs have read-only repository access. Failed shards upload
`accessibility-report-<index>`, containing the HTML and JSON reports, traces, and screenshots. A
trusted scheduled job has narrowly scoped issue-write permission and synchronizes one open GitHub
issue for accessibility-test failures. Setup failures remain workflow failures and do not create
misleading regression issues. Recovery adds a comment and closes the automated issue.

The initial local measurement and the GitHub Actions median are recorded in the pull request. The
approved budget is no more than two minutes of additional merge-ready wall time. If the measured
GitHub Actions median exceeds that budget, pull requests use the stable `@critical` contract while
the complete route-and-theme matrix remains nightly and manually dispatchable.

### Initial local measurement

Measured September 2, 2026, on macOS 27 arm64 with Chromium already installed:

| Operation                         | Wall time |
| --------------------------------- | --------- |
| Production build                  | 6.68 s    |
| Complete matrix, reused preview   | 19.43 s   |
| Critical contract, reused preview | 12.1 s    |

Browser installation was cached and is therefore excluded rather than presented as a meaningful
install benchmark. The complete matrix contains 93 tests and is locally inexpensive. The workflow
initially keeps it on pull requests; the GitHub Actions median remains the deciding evidence because
runner provisioning and browser installation determine merge delay there.

### GitHub Actions measurement and policy

Three completed pull-request attempts produced these job durations:

| Attempt | Browser accessibility | Ordinary CI |
| ------- | --------------------- | ----------- |
| 1       | 3m24s                 | 3m59s       |
| 2       | 3m17s                 | 4m01s       |
| 3       | 3m20s                 | 4m10s       |
| Median  | 3m20s                 | 4m01s       |

The complete browser job’s median finishes 41 seconds before ordinary CI. It therefore adds zero
minutes to merge-ready wall time and remains on every pull request. The `@critical` command remains
available for efficient affected-test work, but CI does the full route-and-theme lifting. The
nightly and manual triggers provide repeatability and scheduled issue synchronization, not a place
to defer coverage that is already inexpensive on the pull-request critical path.

## Violation policy

### Route journeys

`routes.spec.ts` navigates once per route, checks hydration, the main landmark, & the single named
page heading, then runs full axe in light mode. With the system theme preference active, it switches
the OS color scheme to dark in place & scans only `color-contrast`, the theme-sensitive rule within
our WCAG tags. This preserves the rendered DOM & works on standalone pages without a tracker
toolbar. The keyboard suite also exercises explicit dark/light choices through Quick settings. Real
focus behavior remains covered by keyboard & forced-colors tests; axe does not provide a WCAG-tagged
focus-visible rule.

`populated-records.spec.ts` uses the same full-light/dark-contrast pattern. Its separate navigation
is intentional: populated progress & revealed spoilers expose controls missing from the initial
route DOM. `states.spec.ts` retains full scans for distinct dialogs, expanded controls, search
results, completed/spoiler rows, & import/transfer/restore results. Result assertions there wait for
the assembled DOM before axe; their value & error semantics also have colocated component tests. The
former smoke & semantics route loops are folded into the journey. Progress values, decorative marks,
input bounds, selected controls, & input-alert associations are asserted in component tests.

Axe runs WCAG 2.2 A and AA rules. Serious and critical findings fail. Minor and moderate findings
remain visible in reports and may receive targeted assertions. Failures report the route, theme,
prepared state, rule, impact, target, explanation, documentation link, and reproduction command.

Exceptions are intentionally rare. Any accepted exception must identify all of the following:

- axe rule, route, theme, and prepared state;
- exact target and impact;
- rationale and compensating coverage;
- reviewer and review date; and
- tracking issue.

Blanket route or rule disables are not acceptable. An unused exception must fail so obsolete entries
are removed.

## Release evidence

Before an accessibility-focused release, copy [the manual matrix](accessibility-manual-matrix.md),
identify the release and tester, and record each combination that was actually exercised. Leave
unavailable combinations explicitly marked “Unavailable” or “Not run”. Never infer a pass from
automated coverage.

Existing unit coverage for the web app manifest protects the unlocked display orientation, while
celebration tests protect the reduced-motion decision for confetti. The browser preference suite
adds rendered coverage without duplicating those pure contracts.
