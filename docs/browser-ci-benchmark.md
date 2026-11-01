# Browser CI layout spike (#335)

This is the record of the #335 experiment, written while its spike PR ran. The owner chose two
shards plus PWA, and [the decision record](decisions/2026-11-01-two-accessibility-shards.md) has the
outcome. The layout input described below only ever existed on the unmerged
[spike branch](https://github.com/mrh-is/mistria-fyi/tree/codex/335-browser-ci-spike).

## Candidates

All candidates use the same commit, lockfile, build steps, `ubuntu-latest` runner class, and pinned
Playwright container (`v1.64.1-noble`). Only manual dispatches select alternatives:

| Dispatch input `browser-layout` | Accessibility                       | PWA                                    |
| ------------------------------- | ----------------------------------- | -------------------------------------- |
| `four` (current)                | Four duration-balanced shards       | Separate job                           |
| `two`                           | Two duration-balanced shards        | Separate job                           |
| `combined`                      | One complete duration-balanced list | Separate step in the accessibility job |

The combined job runs PWA even after an accessibility failure. The suites retain separate output,
reports, traces, and failure outcomes. Either failure blocks `CI passed`. The separate PWA job is
skipped only for the combined candidate. PRs, main pushes, and scheduled runs retain four shards
plus PWA. No browser configuration, assertion, worker count, or retry policy changes.

The allocation integration test enumerates the real Playwright selections with one, two, and four
shards and compares their union with the unsharded inventory. The workflow safety tests execute the
layout selector and require every shard. A controlled probe removing `2/2` failed that safeguard as
expected, then was reverted.

## Sampling and metrics

Run three rounds, rotating candidate order (`four`, `two`, `combined`; then `two`, `combined`,
`four`; then `combined`, `four`, `two`). Dispatch each run after the preceding run finishes, to
avoid benchmark samples competing with each other for runner capacity:

```sh
gh workflow run ci.yml --ref codex/335-browser-ci-spike -f browser-layout=four
```

Manual runs never save pnpm stores; all candidates restore the existing main-branch caches. Record
the actual cache matches from setup logs, including the font cache. Container image layers and
runner provisioning remain outside our cache control. Record setup failures and recovered browser
retries, rather than hiding or discarding them. Do not rerun a failed sample to replace it.

- **Turnaround:** workflow creation to the completion of `CI passed`, including queues. Also record
  the full workflow span if final cleanup ends later.
- **Browser duration:** each browser job's start-to-completion duration; the longest is the browser
  job floor. This includes setup, tests, report uploads, and cleanup, but excludes its queue.
- **Runner time:** sum of start-to-completion durations of all non-skipped jobs, and of browser jobs
  separately. These are elapsed runner seconds, not billing-rounded minutes or CPU utilization.
- **Setup failures:** failures before the suite starts, separated from assertion failures and
  recovered retries.

The sample is intentionally small. Timings can guide a cost-versus-latency choice; three runs cannot
establish an improvement in reliability. Retain individual run links, source commit, runner image
details, and cache observations with the results.

## Results

Recommend **two accessibility shards plus a separate PWA job** for a separately reviewed production
proposal. In this sample it saves 32% of browser runner time and 18% of all-job runner time for a
nine-second increase in median turnaround. That is the best measured compromise for keeping PR
feedback close to its current speed while removing two repeated browser setups.

The combined job saves more runner time, but its median turnaround is 76 seconds longer than the
current layout. Prefer it only if reducing runner consumption outweighs that extra wait. Keep four
shards if the sole priority is shortest turnaround. The nine-second difference between four and two
is smaller than the variation within either sample; it is not evidence of a dependable latency
regression or improvement.

Values below are seconds, shown as **median (minimum–maximum)** over three runs. All nine runs
finished successfully, including the stable `CI passed` check.

| Layout            | CI turnaround | Longest browser job | Browser runner time | All-job runner time |
| ----------------- | ------------: | ------------------: | ------------------: | ------------------: |
| Four shards + PWA | 206 (185–228) |       105 (103–155) |       481 (476–517) |       844 (823–874) |
| Two shards + PWA  | 215 (197–223) |       116 (107–124) |       327 (317–338) |       690 (647–725) |
| Combined          | 282 (247–293) |       201 (178–208) |       201 (178–208) |       570 (559–580) |

Every run covers **86 accessibility tests and 16 PWA tests**. Accessibility has zero recovered
failures. PWA has four recovered test failures in three runs, shown below; the configured one retry
is unchanged. There are **zero setup failures and zero final suite failures**. These observations do
not establish that any topology is more reliable.

### Individual runs

`A` lists the accessibility job durations in shard order; `P` is the separate PWA job. For the
combined candidate, `A` includes both suites. Every row has warm cache restores; the cache group
identifies the actual main-branch snapshots in the next section. Workflow span includes the final
Actions completion update, which can follow `CI passed` by one second.

| Run                                                                           | Layout   | CI turnaround | Browser jobs               | Browser runner | All runner | Workflow span | Cache group | PWA recovered failures |
| ----------------------------------------------------------------------------- | -------- | ------------: | -------------------------- | -------------: | ---------: | ------------: | ----------- | ---------------------: |
| [41328983482](https://github.com/mrh-is/mistria-fyi/actions/runs/41328983482) | four     |           206 | A: 93, 98, 93, 92; P: 105  |            481 |        844 |           206 | A           |                      0 |
| [41329375156](https://github.com/mrh-is/mistria-fyi/actions/runs/41329375156) | two      |           197 | A: 107, 107; P: 103        |            317 |        647 |           198 | A           |                      1 |
| [41329690526](https://github.com/mrh-is/mistria-fyi/actions/runs/41329690526) | combined |           282 | A: 208                     |            208 |        570 |           282 | B           |                      0 |
| [41330137924](https://github.com/mrh-is/mistria-fyi/actions/runs/41330137924) | two      |           223 | A: 107, 124; P: 107        |            338 |        725 |           224 | C           |                      0 |
| [41330473167](https://github.com/mrh-is/mistria-fyi/actions/runs/41330473167) | combined |           293 | A: 201                     |            201 |        580 |           293 | C           |                      0 |
| [41330926124](https://github.com/mrh-is/mistria-fyi/actions/runs/41330926124) | four     |           185 | A: 88, 98, 92, 95; P: 103  |            476 |        823 |           186 | C           |                      0 |
| [41331231642](https://github.com/mrh-is/mistria-fyi/actions/runs/41331231642) | combined |           247 | A: 178                     |            178 |        559 |           248 | C           |                      0 |
| [41331594922](https://github.com/mrh-is/mistria-fyi/actions/runs/41331594922) | four     |           228 | A: 91, 92, 102, 77; P: 155 |            517 |        874 |           229 | D           |                      2 |
| [41331964794](https://github.com/mrh-is/mistria-fyi/actions/runs/41331964794) | two      |           215 | A: 101, 110; P: 116        |            327 |        690 |           216 | E           |                      1 |

The recovered cases are `tests/pwa/update.spec.ts:393` (relaunching offline in a language chosen
while an update installs), in runs `41329375156`, `41331594922`, and `41331964794`; and
`tests/pwa/update.spec.ts:284` (reloading an uncontrolled page despite an old active worker), in run
`41331594922`. The former reports a 10-second `waitForTakeover` predicate timeout before recovering.
Their timings remain in the samples. No retry was hidden, removed, or substituted with a fresh
workflow run.

## Environment and cache record

The samples run on 2026-11-01 at commit
[`b2179268265e9cd93079e394971f0c8c01ff80c7`](https://github.com/mrh-is/mistria-fyi/commit/b2179268265e9cd93079e394971f0c8c01ff80c7).
The report-only follow-up commit is not a candidate. The preceding
[PR validation run](https://github.com/mrh-is/mistria-fyi/actions/runs/41328669329) is also excluded
from the measurements. No sample is a rerun of a failed workflow.

Runner logs resolve `ubuntu-latest` to x64 `ubuntu-26.04`, image version `20261025.179.1`. Every
browser container uses the same effective image digest:

```text
mcr.microsoft.com/playwright:v1.64.1-noble
sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea
```

That fixes the bundled browser binaries as well as Playwright's OS dependencies. All browser jobs
restore warm pnpm snapshots and the same warm Satoshi cache; there are no observed restore-action
cache misses. Main advances during sampling and publishes new snapshots, so the archives are not
identical throughout. Each row below identifies the actual cache group used by a sample. Every
browser job within that sample restores its group's container snapshot.

| Group | Main run, attempt  | Host snapshot suffix                   | Container snapshot suffix              | Packages downloaded per browser install |
| ----- | ------------------ | -------------------------------------- | -------------------------------------- | --------------------------------------: |
| A     | `41328784867`, `1` | `29999a9a-cd45-4adc-ac8e-aa1ae4b8fe3a` | `b68591c8-6a47-4f3b-bedb-3c2ecb7c7fac` |                                       2 |
| B     | `41329502868`, `1` | `b3460c9e-c3c6-406c-bcb0-2371c9e57abf` | `645bb0c5-825a-4a58-9939-8d0e23a476d9` |                                       5 |
| C     | `41329802006`, `1` | `d5ed8771-bece-4b90-aa02-3973b8f41c72` | `eb1a8c65-3f25-458a-9fd6-f27d192079e9` |                                       2 |
| D     | `41331409887`, `1` | `d9f78c94-07f7-4e80-ab15-6170925ffeb1` | `6e13ff53-3751-4f57-8078-14bf9a59c20e` |                                       5 |
| E     | `41331753534`, `1` | `eca22a58-3877-410a-935c-55a3bd672467` | `607d8c18-5f5d-438f-b96f-5a11460874ab` |                                       2 |

Shared cache identities:

| Cache                       | Identity observed in restore logs                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| pnpm lockfile verification  | `pnpm-lockfile-verified-Linux-x64-d848c9970819f494ddd37c26db6e2d5c44999f6a93bd5d3c182b76fe8508269f` |
| Font                        | `satoshi-71b050c097847abb50d92862666196aea66e23d763b66780464d31f0002883ae`                          |
| Vitest (first sample)       | Warm fallback ending `5de9a083b5599eb4ebc3f06026e4d8c2d7472095`                                     |
| Vitest (subsequent samples) | Warm exact key ending `b2179268265e9cd93079e394971f0c8c01ff80c7`                                    |

All pnpm snapshots share lockfile hash
`d848c9970819f494ddd37c26db6e2d5c44999f6a93bd5d3c182b76fe8508269f` and setup hash
`9336c524b9e34cdf1c8f4e7ca49402aad9ab6e9bfbbc00b968387183ed8d0539`. The first sample's Vitest cache
differs, so the all-job runner totals are not a comparison of identical Vitest cache contents. All
candidates have comparable warm restore conditions, but not byte-identical store archives or
identical remaining package-download counts. This limits precision, especially for the small
turnaround difference between four and two shards. No cold-cache performance is measured.

Job and step timestamps come from the Actions run and jobs APIs; cache identities, container
digests, suite counts, and retries come from each run's logs. Browser artifacts retain the real
allocation lists and JSON results; recovered PWA failures also publish their report and traces.
Artifacts expire under the existing 14-day retention policy, so the tables preserve the measured
values and cache observations rather than relying only on artifact availability.

## Limits and delivery

This is three samples per layout on one runner class with warm caches. Runner contention, network
throughput, image provisioning, and build timing are uncontrolled. Neither p90 latency nor a
reliability improvement can be established from this sample. The recovered failures are test
outcomes, not setup failures; their cause and any relationship to topology are unproven.

Local verification: 140 focused workflow and real-allocation tests pass; `pnpm run check` and
`pnpm run lint:fix` pass with zero errors and warnings. Removing shard `2/2` deliberately failed the
completeness check, then was reverted. A fresh-context review of the merge-base diff found no P0–P2
findings; its scope and limits are
[posted on the draft PR](https://github.com/mrh-is/mistria-fyi/pull/356#pullrequestreview-5729217241).
No UI or browser assertion changed, so no visual checks apply. No full local matrix was required for
this workflow, focused-test, and report change.

[The spike PR](https://github.com/mrh-is/mistria-fyi/pull/356) closed unmerged.
[#379](https://github.com/mrh-is/mistria-fyi/issues/379) tracks the separate production change,
which preserves the same blocking suite outcomes.
