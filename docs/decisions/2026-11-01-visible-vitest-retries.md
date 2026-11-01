---
id: 2026-11-01-visible-vitest-retries
status: current
summary: >-
  CI retries a failing Vitest test once, warns when it recovers, & records every retry for nightly
  reporting. Local tests do not retry by default.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/329
  - scripts/vitest-timings.ts
  - scripts/nightly-report.ts
relationships: []
---

# Keep Vitest retries visible

## Context

An intermittent test failure can block an unrelated pull request. Browser tests already retry in CI,
while Vitest previously stopped at its first failure. A silent retry could conceal product races, so
recovery must leave evidence for investigation.

## Decision

Every Vitest project retries a failing test once when `CI` is set. Local runs keep the default of
zero retries. A second failure still fails the run; suite setup or collection failures remain
failures too.

The timing reporter uses Vitest's test diagnostics to record the project, file, full test name,
retry count, & final result in `timings.json`. Recovered tests produce GitHub warning annotations,
and the job summary lists every retry, including unsuccessful ones. The nightly report lists any
retry in its recent main-push artifacts, without requiring the three samples used for timing
medians. Artifacts without retry data remain readable. Incomplete updates retain previous findings;
a complete check refreshes them.

Vitest's file duration includes all attempts & their hooks. A file with retries therefore warns
instead of failing the changed-file timing limit, while still reporting its full duration. Other
files keep the existing limits. Wall time & nightly medians still include retries. This avoids
turning a recovered test into a timing failure without estimating how much time to subtract.

## Alternatives

No retries leave intermittent failures blocking unrelated PRs. Unreported retries hide useful
evidence. Retrying a whole suite reruns passing tests & obscures which test recovered. Subtracting
retry time would require additional hook accounting & would change the meaning of file timings.

## Revisit if

The report shows recurring retries without follow-up, or retries materially increase CI time.
