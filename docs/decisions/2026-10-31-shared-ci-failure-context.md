---
id: 2026-10-31-shared-ci-failure-context
status: current
summary:
  Failed pull requests receive informational context when the same job also fails on main; required
  check results remain unchanged.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/330
  - .github/workflows/ci.yml
  - scripts/ci-failure-context.ts
relationships: []
---

# Shared CI failure context

## Context

A failing job on `main` can also fail a pull request. Authors need that context before investigating
an inherited failure, but matching job names do not prove matching causes.

## Decision

The “CI passed” job reports matching failures before it evaluates the existing required results. It
compares exact job names, including matrix shard names, against `main`’s latest completed,
non-cancelled CI push. A newer successful run prevents an older failure from being reported.

Reporting & its setup are best-effort, with read-only permissions. A missing API response or a
failed summary write never changes the aggregate result. The existing result check remains last.

## Alternatives

A separate reporting job would need the same dependencies & add another check to every pull request.
Treating matching failures as passing would hide unrelated regressions in the same job.

## Revisit if

The aggregate job needs other diagnostic steps, or comparing job names produces misleading context
often enough to justify comparing individual failing checks.
