---
id: 2026-11-01-two-accessibility-shards
status: current
summary: >-
  CI runs accessibility in two duration-balanced shards plus a separate PWA job, trading about nine
  seconds of median turnaround for 18% less all-job runner time.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/13
  - https://github.com/mrh-is/mistria-fyi/issues/335
  - https://github.com/mrh-is/mistria-fyi/issues/379
  - docs/browser-ci-benchmark.md
  - .github/workflows/ci.yml
relationships: []
---

# Run accessibility in two CI shards

## Context

Each browser job repeats its setup before any test runs. With four accessibility shards, the
separate PWA job was the longest browser job in every sample, so the extra shards added runner time
without shortening the wait by much. The [benchmark](../browser-ci-benchmark.md) compared four
shards, two shards, & one combined job, with three warm-cache samples each on the same commit.

## Decision

Every CI event runs accessibility in two duration-balanced shards, plus the separate PWA job. The
median all-job runner time falls from 844 to 690 seconds. Median turnaround moves from 206 to 215
seconds, which is within the variation between runs. Test coverage, assertions, worker counts,
retries, the shard-completeness safeguard, & the blocking `CI passed` check are unchanged.

The sample can't show a reliability improvement, so this decision doesn't claim one.

## Alternatives

Four shards has the shortest measured median turnaround, but repeats two more browser setups. A
combined job saves the most runner time, but its 282-second median turnaround and 201-second browser
job miss the [#13](https://github.com/mrh-is/mistria-fyi/issues/13) direction of running the full
browser suite on PRs only if it fits in about two minutes.

## Revisit if

The accessibility suite shrinks enough for one job to fit that two minutes, or a repeat benchmark
under comparable conditions shows two shards adding materially more turnaround than four. A single
slow run isn't enough: the benchmark used manual dispatches, and individual main pushes can already
run longer than its range.
