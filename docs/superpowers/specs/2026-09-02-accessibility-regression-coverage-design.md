# Accessibility regression coverage

**Issue:** #158

**Goal:** Add a rendered-browser accessibility gate that detects semantic, keyboard, contrast,
reflow, motion-preference, forced-colors, and focus regressions, plus a reusable manual
assistive-technology matrix for accessibility-focused releases.

## Context

The September 1, 2026 audit exercised all 14 routes at desktop and 320-pixel widths and found both
axe-detectable failures and manual failures that a default scan missed. Issues #154 through #161
have since corrected those findings and added focused unit or component tests. The repository still
lacks a browser-level test runner capable of checking complete rendered routes, computed styles,
geometry, focus movement across DOM removal, or browser preference emulation.

Issue #147 remains responsible for broad interactive Svelte component coverage in jsdom. Issue #158
adds the complementary rendered-page layer. It does not duplicate every component interaction in a
browser.

The audit requested proof that its automated violations failed before their fixes landed. Those
fixes are already merged, so new tests cannot honestly demonstrate that chronology. Instead, every
original violation class will map to a named regression case with the audited revision and related
fix issue recorded in test or documentation metadata.

## Test architecture

The repository gains Playwright Test and the Playwright integration for axe-core. Chromium is the
automated browser because it supports the required color-scheme, reduced-motion, forced-colors, and
viewport emulation in one CI environment. Cross-browser and assistive-technology behavior remains
part of the manual matrix.

Browser tests live outside `src/` so Vitest never discovers them. A dedicated Playwright
configuration starts the built application through the preview server, uses deterministic locale and
viewport defaults, blocks service workers where they could retain stale application code, and
captures traces, screenshots, and an HTML report on failure.

`pnpm run test:accessibility` exposes the complete suite for optional local diagnosis. It is not
added to `pnpm run test` or the routine local verification contract. GitHub Actions owns its
automatic execution.

Shared browser helpers may provide:

- the canonical list of 14 routes;
- deterministic user-state and theme initialization before application code runs;
- named setup functions for interactive states;
- axe execution and actionable violation formatting;
- visible-control geometry collection; and
- horizontal-overflow diagnostics that identify offending elements.

Helpers must describe user-observable states and must not become a second application API. Tests
prefer roles, accessible names, visible text, and browser state over implementation selectors.

## Axe coverage

The complete matrix scans every route in explicit light and dark modes. Theme setup writes the
application preference before navigation and verifies the resolved document theme before scanning;
browser color-scheme emulation alone is insufficient because the application also persists its own
preference.

Scans target WCAG 2.2 Level A and AA rules supported by axe. Serious and critical violations fail
the gate. Minor and moderate findings remain visible in reports and may be promoted to assertions by
targeted tests.

Any accepted exception must be narrow and reviewable. The allowlist records the axe rule, route,
state, impact, exact target, rationale, reviewer, date, and tracking issue. Blanket rule or route
disables are prohibited. An unmatched allowlist entry also fails so stale exceptions are removed.

Failure output includes the route, theme, prepared state, rule, impact, help text, target, failure
summary, and documentation URL. The Playwright report retains the page trace and screenshot needed
to reproduce the failure.

## Interactive states

Initial-route scans are supplemented by named scenarios that prepare and scan the states missed by
the original audit:

- expanded category sections and disclosures;
- the visibility, search, and feedback panels;
- populated and empty search results;
- feedback and settings validation errors;
- spoiler-hidden and spoiler-revealed content;
- completed tracker rows with completed items both shown and hidden;
- import success, warning, and failure results;
- transfer generation, validation, success, and failure results; and
- dialogs in their open and actionable states.

Scenarios use deterministic fixtures and intercept external work where necessary. They do not send
feedback, require camera hardware, depend on a clipboard implementation, or contact a production
service.

## Semantic assertions

Targeted tests supplement axe with assertions for the regressions in #154 through #161:

- headings and landmarks provide the expected route structure;
- repeated controls have unique accessible names that retain their visible label;
- progress indicators identify their category and expose intelligible values;
- NPC relationships, steppers, mine floors, skills, and renown expose names, bounds, values, and
  selected state;
- feedback, import, transfer, and restore expose invalid, busy, status, and alert relationships;
- search result counts and tracker updates are represented as status messages; and
- toggles, disclosures, tabs, and selectable controls expose checked, pressed, expanded, or current
  state as appropriate.

Small accessibility-tree snapshots may cover stable landmarks or focused control groups. Full-page
snapshots are excluded because unrelated copy and tracker-data changes would make them brittle.

## Keyboard and focus

Browser keyboard tests cover:

- logical toolbar and primary-content focus order;
- opening, containing focus within, closing, and restoring focus from dialogs and panels;
- disclosure operation with Enter and Space;
- search entry, result navigation, clearing, and return to the invoking control;
- tracker-row completion when the focused row leaves the rendered result set;
- Undo discovery and activation without pointer input; and
- focus preservation after validation errors and dynamic result changes.

Assertions name the expected destination or region. They do not merely assert that focus is not on
the document body.

## Reflow and targets

Every route receives a 320 CSS-pixel reflow check. The assertion compares the page scroll width to
the viewport and, on failure, reports visible elements crossing either viewport edge. Stateful
panels and representative expanded content receive the same check.

Visible interactive targets must satisfy the WCAG 2.2 AA 24-pixel target-size or spacing rule.
High-frequency tracker controls and primary actions selected by the design retain the project target
of 44 pixels. Tests account for valid inline-link and spacing exceptions instead of imposing a
blanket 44-pixel minimum on every interactive element.

The automated checks complement, but do not replace, manual tests at 200% text zoom, 400% page zoom,
and custom WCAG text spacing.

## Preference coverage

Reduced-motion tests emulate the browser preference before navigation and exercise representative
completion, disclosure, panel, progress, validation, and scrolling interactions. They assert that
non-essential animation does not run while status and completion feedback remain available.

Forced-colors tests use Chromium support to render representative selected, completed, focused,
error, and spoiler states. Semantic state assertions remain the primary automated contract because
forced-color emulation cannot prove the experience of every Windows High Contrast configuration. The
manual matrix retains Windows High Contrast verification.

## CI execution

Accessibility tests run in a separate GitHub Actions job so browser setup and scanning proceed in
parallel with the existing verification job. The initial pull request runs the complete suite and
records both raw suite duration and the change in time before the pull request becomes mergeable.

The measured merge-delay budget is two minutes:

- If the complete job adds no more than two minutes, the complete matrix remains required on every
  pull request.
- If it adds more than two minutes, relevant pull requests run a smaller critical gate containing
  representative route scans and the semantic, keyboard, focus, reflow, and preference regression
  cases. The complete 14-route, two-theme matrix runs nightly and through manual workflow dispatch.

The critical gate is selected by test contract, not by silently skipping whichever cases happen to
be slow. Changes to application UI, styling, routes, browser-test infrastructure, dependencies, or
the accessibility workflow trigger it. Unrelated documentation or pipeline-only changes may record
an explicit successful skip so required-check status remains determinate.

The CI job uses GitHub annotations for immediate failures and uploads the Playwright HTML report,
traces, and screenshots on failure. Browser and dependency caching may reduce setup cost, but the
workflow must remain reproducible after a cold cache.

## Automated issues

Pull-request failures do not create GitHub issues; the failed check and its report remain attached
to the pull request. A scheduled failure against current `main` creates one deduplicated tracking
issue, or comments on the existing open issue for the same regression identity.

The generated issue contains the failing rule or assertion, routes and states, element targets,
first failing commit when known, workflow run, report artifact, and reproduction command. A later
successful scheduled run comments with the recovery evidence and closes the automated issue.

Issue-writing permission is isolated to the scheduled trusted-branch workflow or job. Pull-request
jobs retain read-only repository permissions, and no workflow with issue-writing permission checks
out or executes untrusted pull-request code. The automation uses the repository-scoped
`GITHUB_TOKEN`; it requires no personal token or external service.

## Manual matrix

A reusable checklist under `docs/` records:

- date, tester, release or revision, route, and task;
- operating system, device, browser, and version;
- assistive technology and version;
- viewport, zoom, text spacing, color, motion, and orientation conditions;
- pass, fail, blocked, or not-applicable result;
- observations, known exception, and linked issue; and
- final release sign-off with incomplete coverage called out explicitly.

The matrix covers VoiceOver with Safari on macOS and iOS; NVDA with Firefox and Chrome on Windows;
TalkBack with Chrome on Android; keyboard-only use at desktop and 320-pixel reflow; speech input for
repeated controls; sequential scanning; 200% text zoom; 400% page zoom or equivalent reflow; WCAG
text spacing; reduced motion; light and dark modes; Windows High Contrast; and installed-PWA
portrait and landscape use.

This change delivers the checklist and release procedure. It does not claim that unavailable
platform combinations were executed during implementation. An accessibility-focused release may not
mark the matrix complete until the recorded manual runs are performed.

## Coordination

Issue #147 receives a substantive cross-link explaining that its jsdom suite owns broad component
interaction behavior while #158 owns rendered-route accessibility, geometry, browser preferences,
and assistive-technology release evidence. New coverage should live at the lowest layer that can
prove the behavior without duplicating equivalent assertions.

## Acceptance criteria

- The rendered-browser suite covers all 14 routes in light and dark modes.
- Named state scenarios cover expanded content, panels, dialogs, search, validation, spoilers,
  completion, import, and transfer results.
- Axe failures are actionable, and serious or critical violations fail the gate.
- Every audited violation class maps to a named regression case with historical provenance.
- Focus loss, dynamic announcements, reflow, contrast, reduced motion, orientation, and forced
  colors each have automated regression evidence at the appropriate test layer.
- Keyboard tests cover focus order, containment and restoration, row removal, disclosures, search,
  and Undo.
- The 320-pixel and target-geometry checks report offending elements rather than only dimensions.
- CI execution follows the measured two-minute merge-delay policy and retains failure artifacts.
- Scheduled failures on `main` create or update a deduplicated issue without granting write access
  to pull-request code.
- The manual assistive-technology matrix and release sign-off procedure are documented.
- Issue #147 records the component-test and browser-accessibility boundary.
- The repository verification matrix and the new accessibility CI checks pass before delivery.

## Non-goals

- Reimplementing the fixes from #154 through #161 unless a new regression is discovered.
- Replacing manual assistive-technology testing with axe or Chromium emulation.
- Running every component behavior from #147 in Playwright.
- Supporting production-service feedback submission, real camera scanning, or external clipboard
  integration in CI.
- Requiring the complete browser matrix during routine local agent development.
- Filing a new GitHub issue for each failing pull request or every repeated scheduled failure.
