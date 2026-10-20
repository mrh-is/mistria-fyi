# Serialized progress writes

## Context

localStorage has no locking. Auto-save, the pagehide flush, & other paths each read, compared, &
wrote on their own, so a second tab could slip a stale state in between another tab's read & write
and overwrite a result the player had just confirmed. Sync will add a device-local receipt, a
farm-switch backup, provenance, & resolved diffs, all of which must live beside progress without
leaking into backups.

## Decision

- **One write function, one lock.** `writeProgress(intent)` is the only code that writes the
  progress key. Auto-save (including the rewrite of a migrated or repaired blob) and explicit
  replaces (restore, reset, save import, & sync apply later) request it under the
  `mistria-fyi:progress-write` Web Lock. Inside the lock it re-reads & validates the stored value: a
  newer build's data blocks the write, an auto-save adopts another tab's write, and an explicit
  replace overwrites it once an unreadable value is safely in quarantine. Explicit replaces skip the
  300 ms debounce, not the lock.
- **pagehide stays synchronous.** A page being hidden can't await a lock, so the flush calls the
  same function directly and keeps today's compare-before-write: it adopts another tab's value
  rather than overwriting it.
- **One key.** The stored blob gains an optional `local` section for this device: `syncReceipt` &
  `farmSwitchBackup` slots, carried through as stored until sync defines their shapes. It is left
  out while empty, so stored data stays byte-identical to a backup and needs no version bump yet.
  Exports (including the newer-data verbatim export) never include it; the strict restore schema
  strips it, and a restore keeps this device's. Provenance & resolved diffs belong in `progress`
  (#126), so they travel with backups.

### Without Web Locks

Browsers without Web Locks (older Safari before 15.4, or an insecure context) and a lock request
that fails run the write synchronously. The re-read, validation, & write then happen in one
uninterrupted turn of this tab's event loop, so this tab can't interleave with itself. The race that
remains is two tabs in separate processes reaching the read-and-write at the same instant; the
window is the time between one `getItem` & one `setItem`. That's the same exposure every write had
before this change, and an auto-save that loses it is corrected by the storage event that follows.

## Alternatives

- **A `BroadcastChannel` leader that owns all writes.** Rejected: leader election adds a protocol &
  failure modes for a race Web Locks already closes.
- **Separate keys for the receipt & farm-switch backup.** Rejected: two keys can't be written
  atomically, so a crash between them could pair a receipt with progress it doesn't describe.
- **Run pagehide under the lock too.** Rejected: the page may be frozen before the lock is granted,
  losing the last edits outright.
- **Bump the storage version for `local`.** Deferred: the section is empty until sync fills it; the
  first feature that stores data there adds the migration.

## Revisit if

- Sync defines the receipt or farm-switch backup shapes, which then need their own validation & a
  migration.
- Web Locks stop being available on a platform the app supports.
- The blob grows near the 5 MB localStorage quota (the issue's estimate: progress plus one backup is
  2–3 MB at most).
