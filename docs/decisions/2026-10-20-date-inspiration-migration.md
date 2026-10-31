---
id: 2026-10-20-date-inspiration-migration
status: needs-review
summary: >-
  Historical scope: Duplicate Dates checklist removal. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-20-date-inspiration-migration.md#decision
relationships: []
---

# Duplicate Dates checklist removal

## Context

Issue #147 removes the standalone Dates checklist, which duplicates Date Inspiration entries in the
Almanac and inflates its counts. The redundant checklist was manually tracked; the canonical Date
Inspiration entries are correctly tracked from save import. The maintainer explicitly approved
silently dropping the duplicate facts in PR #175 rather than mapping them into Almanac progress.

## Decision

Write storage & JSON backups as version 4, following main's import-metadata & provenance versions.
Use the numbered registry in `progress-storage.ts` to discard `progress.dates` and its provenance &
resolutions. Do not infer inspiration-item acquisitions from those manually recorded facts. Apply
the same removal to local hydration & strict backup restore; obsolete values, including malformed or
unknown Dates, are silently dropped. Preserve canonical Almanac progress & history, other progress,
import metadata, and the retention policy for unknown IDs in supported fields. No `legacyDates`
field is retained. Pre-launch formats remain unsupported.

Remove Dates from mutable progress, merge counts, and the transfer payload. Transfers already bind
to the exact app build, so they need no legacy layout reader. Keep the native date registry because
acquisition descriptions use it; remove the standalone section’s visibility gate & UI messages. The
shared Almanac projection counts only canonical section membership.

## Alternatives

Mapping old Dates into inspiration items was rejected by the maintainer: the bug's manually tracked
facts need no preserving migration. Keeping an invisible duplicate checklist would retain unused
state & its inflated totals. Broadly deleting the native date registry would break acquisition
sources that name dates. Removing the field without a version bump would let an older build
overwrite the new format, so the removal still uses the existing numbered registry & version
fixture.

## Revisit if

Date Inspiration can no longer be reliably recovered from save import, or the game introduces a
separate date-completion checklist that the tracker intentionally supports.
