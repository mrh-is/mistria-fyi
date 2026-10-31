---
id: 2026-10-31-dependency-audit-follows-the-diff
status: current
summary: >-
  Block dependency audits only on dependency or workflow changes. Track new advisories in the
  nightly report, independently of timing samples; failed audits stay red & never close the issue.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/326
  - .github/workflows/ci.yml
  - scripts/nightly-report.ts
relationships: []
---

# Dependency audits follow the diff

## Context

Dependency advisories failed six CI runs over 10 days on pull requests that didn’t change
dependencies. A scheduled audit also failed without assigning anyone to the finding. The timing
decision established that a check should fail a pull request only when its author can fix the
problem in that diff; issue #326 applies that rule to dependency audits.

The existing nightly report returned early with fewer than three timing samples. Its issue also
closed as soon as timing findings cleared, so simply adding an advisory finding after the timing
check could hide advisories or close an unresolved issue.

## Decision

Pull requests & main pushes run the blocking audit only when they change `package.json`,
`pnpm-lock.yaml`, `pnpm-workspace.yaml`, or `.github/workflows/ci.yml`. Main uses the same filter
because the nightly report covers newly published advisories. Manual dispatches keep their
unconditional audit, so a maintainer can request a full check. The existing opt-in local audit step
stays unchanged.

Scheduled runs report moderate-or-higher dependency advisories in the existing “Nightly CI report”
issue. They use pnpm’s filtered advisory entries, because metadata counts still include accepted
exceptions. The captured pnpm 11.28.2 fixture confirms this distinction for the accepted deepmerge
advisory.

An audit that can’t run or returns unusable JSON fails the report job before it writes to the issue.
An advisory alone doesn’t fail the scheduled job. Missing timing data cannot suppress advisories:
the report publishes them with an incomplete-timing note, then preserves the existing timing failure
behavior. With insufficient samples, it never closes the issue. The report closes only when both
checks complete & find nothing.

When a report updates advisories without complete timing data, it retains the last known timing
warnings under the incomplete-timing note. Fresh advisory findings replace old advisory findings, &
old status notes do not accumulate. A complete timing check replaces the retained warnings.

## Alternatives

Keeping the audit unconditional blocks unrelated work whenever an advisory is published. Removing
the blocking audit altogether would allow dependency changes with known moderate-or-higher
advisories. Failing scheduled runs on advisories leaves findings in CI logs instead of maintaining
one actionable issue.

Using raw vulnerability totals would report accepted exceptions again. Treating every nonzero audit
exit as an infrastructure failure would also reject successful audits that found advisories. The
report accepts pnpm’s advisory exit code, then validates the JSON before using it.

## Revisit if

The nightly issue stays open without anyone addressing advisories, new dependency inputs require
additional filter paths, or pnpm changes its audit JSON or accepted-exception behavior.
