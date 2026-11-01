---
id: 2026-11-01-gate-production-on-ci
status: current
summary: >-
  Production deploys only after “CI passed” succeeds for a push to `main`. A CI job calls a
  Cloudflare Pages deploy hook, so Cloudflare still does the build. The hook URL is the one secret
  any workflow may reference, held in a `production` environment that only `main` can use.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/325
  - .github/workflows/ci.yml
  - tests/ci-workflow.isolated.test.ts
  - tests/workflow-hardening.test.ts
  - docs/development-workflow.md#production-deployment
relationships: []
---

# Gate production on CI

## Context

Cloudflare Pages built every push to `main` without waiting for GitHub CI, and its build command
runs no tests. The owner saw a successful deployment for a commit whose CI had failed (#325).

Merge checks don’t cover the gap. The “Protect main” ruleset doesn’t require a pull request to be up
to date, so the merged combination may never have been tested. Pull requests also skip the browser,
relay, & scripts suites when path filters say they’re unaffected, while `main` always runs them.

Players keep saved progress, & a build that changes persisted state can’t always be rolled back
safely, so a bad deployment can cost more than the time to redeploy.

The cost is real too. On 2026-11-01, 5 of the latest 38 finished runs for pushes to `main` had
failed, not counting cancelled runs, & none was known to be an application bug. At least three were
infrastructure failures, including the one that prompted #325. Successful runs took about 4 minutes.

## Decision

The owner chose to gate production on CI. Automatic production deployments are off, & a “Deploy
production” job that needs “CI passed” calls a Pages deploy hook for pushes to `main`. Branch
previews keep building on every push.

The hook builds `main`’s tip rather than a named commit, so the job calls it only when its own
commit is still the tip. A small window remains between that check & Cloudflare’s checkout, and a
newer commit could ship unverified inside it. We accept that window: the newer commit’s own run
still reports its result, & a build-identical artifact would cost far more to set up.

This narrows the rule in `tests/workflow-hardening.test.ts` that no workflow references secrets. The
exception is one exact line, in one job that checks out no code & uses no actions, on an environment
that only `main` can use. Fork pull requests don’t receive secrets, & the environment’s branch rule
keeps the secret from same-repository branches that edit the workflow.

## Alternatives

- **Keep Cloudflare’s integration & rely on merge checks:** rejected; it leaves the stale-branch &
  skipped-suite gaps open, with no extra setup as its only advantage.
- **Upload from CI with `wrangler pages deploy`:** rejected for now. It ships the exact build CI
  tested, but it needs a Cloudflare token with edit access. A build outside Pages also has no
  `CF_PAGES_BRANCH`, which would silently put production feedback into its dry run, & Cloudflare’s
  build variables would need copying to GitHub.
- **Require branches to be up to date before merging:** rejected as a substitute; it closes only the
  stale-branch gap, & every merge would force the other open pull requests to rerun.
- **A separate workflow triggered by `workflow_run`:** rejected; the hardening rules ban that
  trigger.

## Revisit if

Cloudflare’s hooks stop working with automatic production deployments off, which its documentation
doesn’t address. Also revisit if flaky failures routinely hold up releases, or if a deployment ever
ships a commit that CI hadn’t verified, which would favor the exact-build `wrangler` route.
