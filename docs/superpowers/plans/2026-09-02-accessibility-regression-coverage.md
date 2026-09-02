# Accessibility regression coverage implementation plan

**Goal:** Add measured, CI-owned browser accessibility coverage for every route and high-risk
interactive state, plus automated regression issue reporting and a reusable manual
assistive-technology release matrix.

**Architecture:** Playwright drives a production preview in Chromium. Shared support modules prepare
deterministic application state, run axe, format violations, and diagnose geometry. Small focused
specifications cover route scans, stateful scans, semantics, keyboard and focus, geometry, and
browser preferences. A separate GitHub Actions workflow runs the suite in parallel with ordinary
verification and synchronizes one deduplicated issue for scheduled failures on trusted `main`.

**Tech stack:** Node.js 26, pnpm, TypeScript 6, SvelteKit 2, Playwright Test, axe-core, Vitest,
GitHub Actions, GitHub CLI

**Spec:** `docs/superpowers/specs/2026-09-02-accessibility-regression-coverage-design.md`

## Global constraints

- Use pnpm exclusively.
- Keep Playwright specifications outside `src/` and outside Vitest discovery. Pure formatter,
  geometry, and issue-monitor unit tests intentionally remain discoverable by `pnpm run test`.
- Do not add the browser suite to `pnpm run test` or the routine local verification matrix.
- Prefer accessible roles, names, text, and browser-observable state over implementation selectors.
- Never hand-edit `src/lib/data/tracker-data.json` or vendored files under `src/lib/components/ui/`.
- Do not contact production services, use real camera hardware, or depend on a system clipboard.
- Pull-request workflows retain read-only permissions. Issue-writing permission is available only to
  trusted scheduled execution.
- Fail on serious and critical axe violations. Keep lower-impact results visible and narrowly
  document any exception.
- Optimize for agent efficiency: install Chromium once, reuse one local preview server across
  focused runs, use concise reporters, inspect full traces only after failures, and avoid repeating
  unchanged route matrices.
- Run only the affected support test or Playwright specification during each task. Run the complete
  browser suite and repository verification matrix once at the delivery checkpoint; let CI perform
  subsequent exhaustive reruns unless a failure requires focused local diagnosis.
- Every commit includes `Co-Authored-By: Codex <codex@openai.com>`.

---

### Task 1: Add the isolated browser-test runner

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Create: `playwright.config.ts`
- Create: `tests/accessibility/routes.ts`
- Create: `tests/accessibility/smoke.spec.ts`

- [ ] **Step 1: Add the Playwright and axe dependencies**

Use `pnpm add -D @axe-core/playwright @playwright/test`. Add scripts for the complete browser suite
and a critical subset, but do not change the existing `test` script.

- [ ] **Step 2: Define the browser configuration**

Configure one Chromium project with a deterministic locale, desktop viewport, trace and screenshot
capture on failure, HTML and GitHub reporters in CI, JSON output for scheduled issue reporting, and
a SvelteKit preview web server. Block service workers so a previous build cannot mask current code.
Use CI-safe retries and worker counts without concealing repeatable failures.

The baseline `pnpm run build` and `pnpm run preview` probe serves the Cloudflare-adapted application
successfully. The root SvelteKit TypeScript configuration already includes `tests/**/*.ts` and
`scripts/**/*.ts`; verify that adding Playwright types preserves `pnpm run check` rather than
creating a redundant TypeScript project.

- [ ] **Step 3: Add the canonical route inventory and first failing smoke test**

List `/`, `/almanac`, `/animals`, `/cosmetics`, `/mines`, `/museum`, `/npcs`, `/quests`, `/recipes`,
`/renown`, `/skills`, `/all`, `/privacy`, and `/settings` in one typed constant. The initial test
visits every route and asserts a successful page response, one main landmark, and one level-one
heading. Run it before the preview configuration is complete to confirm the expected infrastructure
failure, then finish the minimum configuration and rerun it green.

- [ ] **Step 4: Ignore browser artifacts**

Ignore Playwright reports, traces, screenshots, and test-result directories without ignoring source
fixtures or accessibility documentation.

- [ ] **Step 5: Run the focused smoke test**

Run `pnpm exec playwright test tests/accessibility/smoke.spec.ts`. Expect all 14 routes to pass.

- [ ] **Step 6: Commit the runner foundation**

Commit the dependency, configuration, script, ignore, route-list, and smoke-test changes.

---

### Task 2: Build deterministic accessibility support

**Files:**

- Create: `tests/accessibility/support/application-state.ts`
- Create: `tests/accessibility/support/axe.ts`
- Create: `tests/accessibility/support/axe.test.ts`
- Create: `tests/accessibility/support/geometry.ts`
- Create: `tests/accessibility/support/geometry.test.ts`
- Create: `tests/accessibility/support/violations.ts`

- [ ] **Step 1: Write failing formatter and exception tests**

Create synthetic axe results proving that `violations.ts`, exercised through `axe.test.ts`, formats
route, theme, prepared state, rule, impact, help, target, failure summary, and documentation URL.
Test exact-match exceptions, rejection of broad exceptions, failure for an unmatched serious or
critical violation, and failure for stale allowlist entries.

- [ ] **Step 2: Implement axe execution and violation policy**

Run supported WCAG 2.2 A and AA tags, preserve all findings in reports, and fail the assertion for
unexcepted serious or critical results. Define the empty initial exception list with a type
requiring rule, route, state, impact, exact target, rationale, reviewer, date, and tracking issue.

- [ ] **Step 3: Write failing geometry diagnostic tests**

Use synthetic rectangles to prove overflow diagnostics identify the selector, accessible label, left
edge, right edge, and viewport width. Cover the 24-pixel size-or-spacing rule, accepted inline text
exceptions, and the selected 44-pixel control contract.

- [ ] **Step 4: Implement geometry collection and diagnostics**

Collect only visible interactive elements. Return structured results that browser specifications can
assert and that CI can render without requiring a screenshot to identify the offender.

- [ ] **Step 5: Add deterministic application initialization**

Provide helpers that clear application storage, set `mistria-fyi-theme` before navigation, install
serialized `mistria-fyi-v1` fixtures, and verify the resolved theme. Keep fixtures minimal and based
on the existing serialized-state contract.

- [ ] **Step 6: Run focused support tests and type checking**

Run
`pnpm exec vitest run tests/accessibility/support/axe.test.ts tests/accessibility/support/geometry.test.ts`
and `pnpm run check`.

- [ ] **Step 7: Commit the support layer**

Commit application-state, axe, exception, and geometry support together.

---

### Task 3: Add the complete route and theme matrix

**Files:**

- Create: `tests/accessibility/routes.spec.ts`
- Modify if a new regression is found: non-vendored route or shared component files under `src/`
- Modify if needed: focused tests adjacent to any corrected application file

- [ ] **Step 1: Generate the 28 route cases**

For each canonical route, initialize an explicit light or dark application preference, navigate,
wait for the main landmark and stable document state, verify the resolved theme, and run axe.

- [ ] **Step 2: Confirm historical regression coverage**

Name or annotate the relevant cases for the original unnamed progress bars, NPC buttons, mine input,
and light-theme contrast findings. Record audited revision `c166673` and the correcting issue number
without claiming the test was authored before the fix.

- [ ] **Step 3: Run the full route matrix**

Run `pnpm exec playwright test tests/accessibility/routes.spec.ts`. If a new failure appears, retain
the failing test, add the smallest non-vendored fix, add an adjacent focused test when useful, and
rerun until green. Do not weaken the axe policy to accommodate a production defect.

- [ ] **Step 4: Commit the route matrix**

Commit route scans and any test-first production correction as one reviewable change.

---

### Task 4: Scan interactive and result states

**Files:**

- Create: `tests/accessibility/fixtures/import/empty-player.json`
- Create: `tests/accessibility/fixtures/import/progress-player.json`
- Create: `tests/accessibility/support/scenarios.ts`
- Create: `tests/accessibility/states.spec.ts`
- Modify if a new regression is found: relevant non-vendored application files and focused tests

- [ ] **Step 1: Add minimal import and transfer fixtures**

Build the smallest synthetic save JSON that produces both a no-new-data result and a populated
success or warning result. Generate transfer payload and QR image data through the existing transfer
contract in test code rather than committing opaque binary fixtures.

- [ ] **Step 2: Add named state preparation functions**

Prepare expanded category disclosures; visibility, search, and feedback panels; populated and empty
search; feedback validation errors; spoiler hidden and revealed rows; completed rows shown and
hidden; import success, warning, and failure; transfer generation, success, and failure; backup
restore failure; and open dialogs.

Use route interception or browser stubs for feedback submission, clipboard, camera denial, and QR
image scanning. Never call an external endpoint.

- [ ] **Step 3: Write and run stateful axe cases**

Each named scenario asserts that preparation succeeded before scanning. Run
`pnpm exec playwright test tests/accessibility/states.spec.ts` and preserve actionable output for
any failure.

- [ ] **Step 4: Correct newly exposed regressions test-first**

For each production defect, keep the browser reproduction red, add the smallest implementation fix,
and add a focused component test where the browser case alone would be expensive to diagnose.

- [ ] **Step 5: Commit stateful coverage**

Commit fixtures, scenario support, scans, and any resulting correction.

---

### Task 5: Lock semantic, keyboard, and focus behavior

**Files:**

- Create: `tests/accessibility/semantics.spec.ts`
- Create: `tests/accessibility/keyboard.spec.ts`
- Modify if a new regression is found: relevant non-vendored application files and focused tests

- [ ] **Step 1: Add semantic regression cases**

Assert route headings and landmarks; unique names for repeated controls; named progress values; NPC,
mine, skill, renown, and stepper values and bounds; validation relationships; busy, status, and
alert semantics; search-result announcements; tracker updates; and control state for checked,
pressed, expanded, and current values.

Use small accessibility-tree snapshots only for stable landmark or control-group structures.

- [ ] **Step 2: Add keyboard and focus cases**

Cover toolbar-to-content focus order; feedback dialog containment, closure, and restoration;
visibility-panel restoration; Enter and Space disclosure operation; search entry, clearing, result
navigation, and closure; completed-row removal; validation focus; and keyboard activation of Undo.

Every focus assertion identifies the expected destination or labeled region. Waiting only for focus
to leave the document body is insufficient.

- [ ] **Step 3: Run the focused browser cases**

Run
`pnpm exec playwright test tests/accessibility/semantics.spec.ts tests/accessibility/keyboard.spec.ts`.

- [ ] **Step 4: Correct newly exposed regressions test-first**

Preserve each failing browser test, implement the smallest correction outside vendored UI, and add
focused component coverage where it improves failure localization.

- [ ] **Step 5: Commit semantic and keyboard coverage**

Commit the browser tests and any corresponding application fixes.

---

### Task 6: Add reflow, target, and preference coverage

**Files:**

- Create: `tests/accessibility/geometry.spec.ts`
- Create: `tests/accessibility/preferences.spec.ts`
- Modify if a new regression is found: relevant non-vendored application files and focused tests

- [ ] **Step 1: Test every route at 320 CSS pixels**

Check document overflow for all 14 routes, then repeat for representative expanded settings,
visibility, search, NPC relationship, and tracker-source states. Report each element crossing the
viewport rather than only the page width.

- [ ] **Step 2: Test interactive target geometry**

Enforce the AA 24-pixel size-or-spacing contract across visible controls and the selected 44-pixel
contract for high-frequency tracker controls and primary actions. Model valid inline-link and
spacing exceptions explicitly.

- [ ] **Step 3: Test reduced motion**

Emulate reduced motion before navigation. Exercise completion, disclosure, panel, progress,
validation, and settings-scroll behavior; assert no non-essential animation remains and that status
feedback still appears. Link the existing manifest and celebration unit tests as orientation and
confetti evidence rather than duplicating their pure contracts in Playwright.

- [ ] **Step 4: Test forced colors**

Emulate active forced colors and prepare focused, selected, completed, error, and spoiler states.
Assert semantic state, visible focus indication, and retained boundaries where Chromium exposes a
stable computed result.

- [ ] **Step 5: Run focused geometry and preference cases**

Run
`pnpm exec playwright test tests/accessibility/geometry.spec.ts tests/accessibility/preferences.spec.ts`.

- [ ] **Step 6: Correct newly exposed regressions test-first**

Keep failures as regressions, make the smallest non-vendored fix, and add focused component or CSS
contract tests when useful.

- [ ] **Step 7: Commit geometry and preference coverage**

Commit the tests and any corresponding application fixes.

---

### Task 7: Add secure CI execution and issue synchronization

**Files:**

- Create: `.github/workflows/accessibility.yml`
- Create: `scripts/accessibility-monitor.ts`
- Create: `scripts/accessibility-monitor.test.ts`
- Modify: `tests/ci-workflow.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing workflow contract tests**

Assert that the accessibility workflow supports pull requests, a non-hour-boundary nightly schedule,
and manual dispatch; pins every third-party action by full commit SHA; uses Node.js 26 and pnpm;
installs only Chromium; runs separately from ordinary verification; uploads reports after test
failure; never uses `pull_request_target`; and grants write permission only to the scheduled
issue-synchronization job.

- [ ] **Step 2: Write failing issue-monitor tests**

Using a fake command runner, cover creation when a scheduled accessibility failure has no matching
open issue, commenting instead of duplicating, recovery comments and closure, no mutation for pull
request failures, preservation of actionable report content, and safe argument passing without shell
interpolation.

- [ ] **Step 3: Implement the monitor**

Read the Playwright JSON result, distinguish accessibility-test failure from setup failure, create a
bounded Markdown summary, and synchronize a single open issue identified by a stable hidden marker.
Use `gh` argument arrays and standard input for bodies. Include route, theme, state, assertion or
axe rule, targets, workflow URL, report artifact, and local reproduction command. Add a package
script that invokes the monitor through the existing `tsx` dependency so local and CI execution use
the same command.

- [ ] **Step 4: Implement the workflow**

Run the browser job in parallel with `.github/workflows/ci.yml`. Keep pull-request execution
read-only. Upload HTML, JSON, traces, and screenshots when the browser test fails. On scheduled runs
against trusted `main`, invoke the monitor with `issues: write`; on recovery, close the matching
automated issue. Setup failures remain workflow failures and do not masquerade as accessibility
regressions.

- [ ] **Step 5: Run workflow and monitor tests**

Run `pnpm exec vitest run tests/ci-workflow.test.ts scripts/accessibility-monitor.test.ts`, then run
`pnpm run check` and `pnpm run lint` for the new TypeScript and YAML.

- [ ] **Step 6: Commit CI and monitoring**

Commit the workflow, monitor, tests, and script changes.

---

### Task 8: Document the manual release matrix

**Files:**

- Create: `docs/accessibility-testing.md`
- Create: `docs/accessibility-manual-matrix.md`
- Modify: `README.md` if it contains the appropriate contributor-testing index

- [ ] **Step 1: Document automated coverage**

Explain suite ownership, optional local commands, CI triggers, violation policy, exception schema,
failure artifacts, scheduled issue behavior, and the measured performance decision. State clearly
that automation does not replace assistive-technology testing.

- [ ] **Step 2: Add the reusable manual matrix**

Provide fields for tester, date, revision or release, OS and device, browser and version, assistive
technology and version, route, task, viewport, zoom, text spacing, theme, motion, contrast,
orientation, result, observation, exception, and linked issue.

Include rows or reusable sections for VoiceOver on macOS and iOS, NVDA in Firefox and Chrome,
TalkBack in Chrome, keyboard-only desktop and 320-pixel reflow, speech input, sequential scanning,
200% text zoom, 400% page zoom, WCAG text spacing, reduced motion, light and dark modes, Windows
High Contrast, and installed-PWA portrait and landscape operation.

- [ ] **Step 3: Add release sign-off rules**

Require incomplete or unavailable combinations to remain explicit. Do not mark platforms as tested
during this implementation unless a real recorded run occurred.

- [ ] **Step 4: Format and commit the documentation**

Run Prettier on the changed Markdown files, inspect the rendered tables, and commit the
documentation.

---

### Task 9: Benchmark and select the PR gate

**Files:**

- Modify if needed: `.github/workflows/accessibility.yml`
- Modify: `docs/accessibility-testing.md`
- Modify if needed: `package.json`

- [ ] **Step 1: Run a local timing baseline**

Build once, install the pinned Chromium revision, and record complete-suite duration separately from
browser-install and build time. The local number is diagnostic, not the merge-delay decision.

- [ ] **Step 2: Push a preliminary branch and open the attributed pull request**

Push the complete implementation, open a PR with `Closes #158` and final `Agent: codex`, and apply
`agent: codex`. Keep the issue and PR active-work labels through review.

- [ ] **Step 3: Measure the GitHub Actions critical path**

Record the accessibility job duration and compare pull-request merge readiness with the ordinary CI
job. Use the median of three completed runs or reruns when runner availability permits, and record
outliers separately. Apply the approved two-minute incremental wall-clock budget to the measured
median rather than one unusually fast or slow runner.

- [ ] **Step 4: Keep or split the PR gate based on evidence**

If merge readiness increases by no more than two minutes, retain the complete matrix on every PR. If
it increases by more than two minutes, define a stable critical project for relevant pull requests
and retain the complete 14-route, two-theme matrix for nightly and manual dispatch. Ensure unrelated
changes produce a determinate successful skip rather than a permanently pending required check.

- [ ] **Step 5: Commit the measured policy**

Record measured durations and the resulting gate in documentation, update workflow tests, rerun the
focused CI contract tests, commit, and push.

---

### Task 10: Verify and deliver

**Files:**

- Modify only if verification exposes a defect: affected files from prior tasks
- GitHub: issue #147, issue #158, and the pull request

- [ ] **Step 1: Run focused browser suites**

Run every Playwright project selected for pull requests and the complete nightly matrix. Confirm the
HTML and JSON reports are generated and failure-only artifacts do not enter Git history.

- [ ] **Step 2: Run the repository verification matrix**

Run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`, and `pnpm run build`.
Require zero lint warnings and errors.

- [ ] **Step 3: Inspect repository state**

Run `git diff --check`, inspect the complete branch diff, confirm generated tracker data is
unchanged, and verify only intended source, test, workflow, documentation, and lockfile changes are
present.

- [ ] **Step 4: Cross-link issue #147**

Add a substantive comment explaining that #147 owns broad jsdom component interaction coverage,
while #158 owns rendered-route axe, browser semantics, keyboard and focus, geometry, preferences, CI
monitoring, and manual release evidence. End the comment with `Agent: codex`.

- [ ] **Step 5: Finalize delivery**

Commit any verification corrections, push the final branch, update the attributed PR body with the
measured CI choice and verification evidence, and confirm the PR retains exactly one agent label.
Leave #158 claimed through review; release its active-work labels only when the PR closes, work is
abandoned, or ownership changes.
