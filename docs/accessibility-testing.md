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

The Playwright configuration builds the app once, starts one preview server, and reuses it across
the selected cases. Chromium is the only installed automated browser. Cross-browser and
assistive-technology behavior belongs in the manual matrix.

## CI behavior

`.github/workflows/accessibility.yml` is separate from ordinary CI. It runs for pull requests, at
03:17 UTC nightly, and through manual dispatch. Pull-request jobs have read-only repository access.
Failed runs upload `accessibility-report`, containing the HTML and JSON reports, traces, and
screenshots. A trusted scheduled job has narrowly scoped issue-write permission and synchronizes one
open GitHub issue for accessibility-test failures. Setup failures remain workflow failures and do
not create misleading regression issues. Recovery adds a comment and closes the automated issue.

The initial local measurement and the GitHub Actions median are recorded in the pull request. The
approved budget is no more than two minutes of additional merge-ready wall time. If the measured
GitHub Actions median exceeds that budget, pull requests use the stable `@critical` contract while
the complete route-and-theme matrix remains nightly and manually dispatchable.

## Violation policy

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
