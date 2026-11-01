# Browser CI layout spike (#335)

This is an experiment, not an approved production topology change. Keep the PR a draft; do not merge
it to collect measurements. A permanent change needs a separate reviewed proposal.

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

Measurements and the resulting recommendation are recorded after the CI samples complete.
