# Vitest timings & nightly coverage

## Context

Issue #689 asks for a faster cleanup test, published file timings, enforced time budgets, & coverage
off the PR path unless it measures as free on four-CPU runners. The current repository is private,
so its ubuntu-latest runners have two CPUs.

## Decision

Retain every cleanup safety scenario with deterministic command snapshots & one real-Git integration
case. Publish test & hook durations for all files, gate whole-command wall time separately, &
collect coverage only on scheduled runs. Bound the timed command to at most four workers (& no more
than available CPUs), so large local hosts do not inflate file times through oversubscription. Use
runner-class ceilings documented in the development workflow.

## Alternatives

Repeated real repositories & process scans dominate local cleanup tests. Keeping coverage on every
PR relies on local measurements that do not establish its CI cost. A single local timing ceiling
ignores the slower private runner class.

## Revisit if

Same-class CI measurements establish that coverage is free on four-CPU runners, or the suite’s
measured steady-state cost supports tighter budgets after the remaining #687 changes.
