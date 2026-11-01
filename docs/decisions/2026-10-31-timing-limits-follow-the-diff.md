---
id: 2026-10-31-timing-limits-follow-the-diff
status: amended
summary: >-
  Test timing fails a pull request only when it changes a test file over 15 s. Everything else about
  timing warns, & a nightly report tracks trends in one issue.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/13
  - docs/development-workflow.md#vitest-time-budgets
  - scripts/vitest-timings.ts
  - scripts/nightly-report.ts
relationships:
  - type: amended-by
    target: 2026-11-01-visible-vitest-retries
    scope: partial
    portion: >-
      Files with retried tests warn instead of failing timing limits, & the nightly report also
      tracks every retry in recent main pushes, independently of timing sample counts.
    evidence:
      - https://github.com/mrh-is/mistria-fyi/issues/329
  - type: amended-by
    target: 2026-10-31-dependency-audit-follows-the-diff
    scope: partial
    portion: >-
      The nightly report also tracks dependency advisories. Incomplete timing samples no longer
      suppress advisory findings, & the issue closes only when both checks are clear.
    evidence:
      - https://github.com/mrh-is/mistria-fyi/issues/326
---

# Timing limits follow the diff

## Context

CI failed any run that passed a wall-time ceiling or a 5 s ceiling on any test file. Of the 51
failed runs between October 21 & 31, 22 failed on timing alone with no failed assertion. The
ceilings sat inside runner noise: one file measured 5.1–11.4 s across runs. Agents stop on tooling
failures, so each of these could wait on the owner, & several branches took 33–41 hours to next go
green.

The ceilings did find real problems. A new test file took 20 s & came down to about 2.5 s. They also
shaped tests: one pull request narrowed its routing tests to representative rows to fit.

## Decision

A check fails a pull request only if the author can fix the problem in that diff. For timing, a test
file over 5 s warns, & a pull request fails if it changes a file over 15 s. `relay/worker.test.ts`
keeps its own 30 s line. Wall time never fails a run, & no other event fails on timing.

A nightly job compares medians across recent pushes to `main`, & keeps any findings in one issue
that it edits in place & closes when they clear. This holds the guard against the suite silently
growing without blocking an unrelated pull request.

The per-CPU ceilings & the separate CLI probe invocation are gone, since public runners have four
CPUs.

## Alternatives

Warning only would have let the 20 s test merge unnoticed. Keeping a blocking ceiling & raising it
fails whichever pull request happens to land on a slow runner, including ones that didn’t touch the
slow file. Holding a pull request to the tests its source change affects would need a guess about
which code affects which test, so that case stays with the nightly report.

## Revisit if

The nightly issue stays open with findings nobody acts on, or slow tests keep arriving through
source changes that the changed-file limit can’t see.
