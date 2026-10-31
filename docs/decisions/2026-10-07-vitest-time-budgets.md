---
id: 2026-10-07-vitest-time-budgets
status: amended
summary: >-
  Retain every cleanup safety scenario with deterministic command snapshots & one real-Git
  integration case. Publish test & hook durations for all files, gate whole-command wall time
  separately, & collect coverage only on scheduled runs. At the maintainer’s request, CI runs the
  cleanup test only when its corresponding shell script changes; focused local runs remain available
  for test-only edits.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-07-vitest-time-budgets.md#decision
relationships:
  - type: amended-by
    target: 2026-10-31-timing-limits-follow-the-diff
    scope: partial
    portion: >-
      Gating on whole-command wall time & on every file’s time: timing now fails only a pull request
      that changes a slow test file.
    evidence:
      - docs/decisions/2026-10-31-timing-limits-follow-the-diff.md
---

# Vitest timings & nightly coverage

## Context

Issue [mrh-is/mistria-fyi-private#689](https://github.com/mrh-is/mistria-fyi-private/issues/689)
asks for a faster cleanup test, published file timings, enforced time budgets, & coverage off the PR
path unless it measures as free on four-CPU runners. The current repository is private, so its
ubuntu-latest runners have two CPUs.

## Decision

Retain every cleanup safety scenario with deterministic command snapshots & one real-Git integration
case. Publish test & hook durations for all files, gate whole-command wall time separately, &
collect coverage only on scheduled runs. At the maintainer’s request, CI runs the cleanup test only
when its corresponding shell script changes; focused local runs remain available for test-only
edits.

Bound the timed command to half the available CPUs (at least one worker, capped at four), leaving
headroom for files that launch CLI subprocesses. The first two-worker run on a two-CPU CI runner
took 118.13 seconds overall, but pushed the allocation & lint-ownership files beyond their 10-second
budgets. Reduce contention rather than widening the runner-class ceilings documented in the
development workflow.

## Alternatives

Repeated real repositories & process scans dominate local cleanup tests. Keeping coverage on every
PR relies on local measurements that do not establish its CI cost. A single local timing ceiling
ignores the slower private runner class.

## Revisit if

Same-class CI measurements establish that coverage is free on four-CPU runners, or the suite’s
measured steady-state cost supports tighter budgets after the remaining
[mrh-is/mistria-fyi-private#687](https://github.com/mrh-is/mistria-fyi-private/issues/687) changes.
