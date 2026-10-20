# Date Inspiration migration

## Context

Issue #147 removes the standalone Dates checklist, which duplicates Date Inspiration entries in the
Almanac and inflates its counts. Players can have manually recorded `progress.dates` that save
import cannot rebuild. The “Revisit if” conditions in the launch-contract & no-pre-rename-migration
decisions now apply: a post-launch field is being removed, and its progress cannot reliably be
recovered through save import.

## Decision

Write storage & JSON backups as version two. Use the numbered migration registry in
`progress-storage.ts` to map each known version-one date to its `date_inspiration` source item and
union those items into existing Almanac progress; ordinary normalization canonicalizes them. Apply
the same migration to local hydration & strict backup restore. Unknown date IDs remain in
`progress.legacyDates`, outside counted progress, consistent with the storage owner’s unknown-ID
retention policy. Malformed legacy dates still reject the blob. Pre-launch formats remain
unsupported.

Remove Dates from mutable progress, merge counts, and the transfer payload. Transfers already bind
to the exact app build, so they need no legacy layout reader. Keep the native date registry because
acquisition descriptions & the migration use it; remove the standalone section’s visibility gate &
UI messages.

## Alternatives

Dropping old Dates progress with a version bump was authorized, but preserving it through the
explicit native unlock-item mapping avoids unnecessary loss. Keeping an invisible duplicate
checklist would retain unused state & its inflated totals. Broadly deleting the native date registry
would break acquisition sources that name dates. Recreating serialization inside the store would
reverse the storage-migrations decision, so this change uses its registry, Valibot schemas, retained
entries, and version fixtures.

## Revisit if

The game changes the relationship between a date & its inspiration item, or a future storage
migration removes the native IDs needed to interpret version-one backups. Preserve a stable
historical mapping before removing those IDs.
