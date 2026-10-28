---
id: 2026-10-07-ci-browser-image
status: needs-review
summary: >-
  Run both browser jobs in `mcr.microsoft.com/playwright:v1.63.0-noble`, matching the installed
  Playwright version, with `--ipc=host`. Use the image's pinned Chromium and system libraries;
  remove browser installation & caching. Keep build-artifact reuse, local Chromium selection, all
  test assertions, workers, retries, and merge gates. A workflow contract test requires the image
  version to match the installed Playwright package. Trust only the Actions checkout path for Git
  metadata reads inside the container.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-07-ci-browser-image.md#decision
relationships: []
---

# CI browser image

## Context

Issue [mrh-is/mistria-fyi-private#688](https://github.com/mrh-is/mistria-fyi-private/issues/688)
removes Chromium system-dependency installation from accessibility & PWA jobs. The apt step still
runs on browser-cache hits & causes variable delays and installation timeouts
([mrh-is/mistria-fyi-private#675](https://github.com/mrh-is/mistria-fyi-private/issues/675)). The
repository is private, so the maintainer approved measuring on its two-vCPU hosted runners while
leaving the public-runner comparison pending.

## Decision

Run both browser jobs in `mcr.microsoft.com/playwright:v1.63.0-noble`, matching the installed
Playwright version, with `--ipc=host`. Use the image's pinned Chromium and system libraries; remove
browser installation & caching. Keep build-artifact reuse, local Chromium selection, all test
assertions, workers, retries, and merge gates. A workflow contract test requires the image version
to match the installed Playwright package. Trust only the Actions checkout path for Git metadata
reads inside the container.

## Alternatives

Runner Chrome avoids apt & image initialization but had a higher initial ten-attempt total-job p90
(394 seconds versus the container's 341 seconds) & two accessibility timeout failures. Both options
ran the same full accessibility & PWA suites with zero test retries. The container had one preview
startup timeout, recorded separately in
[mrh-is/mistria-fyi-private#698](https://github.com/mrh-is/mistria-fyi-private/issues/698). The
benchmark jobs are retained in PR
[mrh-is/mistria-fyi-private#696](https://github.com/mrh-is/mistria-fyi-private/pull/696)'s history;
its description records completed-suite timings & the diagnostic rerun.

Cached host Chromium had a 334-second p90 in the same benchmark, but still depends on apt, the
failure class this change removes. The image is selected for the lower p90 of the two apt-free
options; this is not a claim that it beats the host baseline on these private runners.

## Revisit if

Rebenchmark runner Chrome & the matching pinned image on public four-vCPU runners after the
repository cutover. Revisit the image if that comparison favors Chrome, startup failures recur, or
Playwright changes its supported browser/image versions. Do not infer public-runner performance from
these private-runner measurements.
