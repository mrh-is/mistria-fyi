# Vitest timings & nightly coverage

## Context

Issue #689 asks for a faster cleanup test, published file timings, enforced time budgets, & coverage
off the PR path unless it measures as free on four-CPU runners. The current repository is private,
so its ubuntu-latest runners have two CPUs.

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
measured steady-state cost supports tighter budgets after the remaining #687 changes.
