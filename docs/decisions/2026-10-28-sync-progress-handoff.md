---
id: 2026-10-28-sync-progress-handoff
status: current
summary: >-
  v1 moves progress to a new device by backup & restore; the tracker-to-tracker handoff is deferred
  to #269.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/251
  - https://github.com/mrh-is/mistria-fyi/issues/269
  - docs/sync.md#new-devices
relationships: []
---

# Hand off progress between trackers

Status: deferred to #269 (changed after review). v1 moves progress to a new device by backup &
restore.

## Context

Things checked off by hand live on the tracker where they were checked off. Once a PC becomes a
relay, that is the phone, so pairing a new phone from the PC would leave the player’s manual
progress on the old phone. The review on #251 found this, along with two related gaps: moving from
an iOS browser to the installed app relied on exporting & restoring a backup file, and the transfer
QR that once moved progress between devices binds to the exact build, drops provenance, & leaves
with #138.

The first version of this decision answered with a one-time handoff code over the relay. Round two
of the design review found that the handoff needed a protocol of its own: a slot a stream viewer
could read or confirm through the offer ID the QR exposes, no proof of completion after a lost
notification, a shared offer budget that abuse could exhaust for pairing too, pairing-specific
failure copy, & a receiver merge that the carry decision has since dropped as unsafe. The record’s
own “Revisit if” named that last condition: the receiver merge proving unsafe.

## Decision

- **Backup & restore moves progress to a new device in v1.** In both cases the handoff served, the
  receiving copy is usually empty; when it isn’t, restore asks “Replace what’s on this phone?” &
  keeps a backup first: a new phone restores the old phone’s backup, & the installed iPhone app
  restores the browser’s. Then the new copy pairs.
- **“Pair a different phone” still starts with your progress,** pointing to those steps, with “My
  old phone’s gone” as the way out: it pairs with “Send this PC’s progress too” checked, carrying
  the PC’s progress from before it started relaying.
- **The installed app’s first launch still leads with sync,** with “Used the tracker in your
  browser? Bring it over” linking to the restore steps.
- **“Transfer to Another Device” stays** until #138 removes it; nothing replaces it in Data.
- **A relay’s re-pairing shows “Send this PC’s progress too” unchecked,** since that progress is
  stale.
- **The handoff is deferred to #269,** which starts from the round-two findings above.

## Alternatives

- **The handoff code** (the first version). No file to carry, but a second offer-and-slot protocol
  with its own security, capacity, & copy surfaces, for a once-per-device move.
- **Keep the transfer QR.** Familiar & no file, but build-bound, without provenance, & already
  slated for removal once sync ships.
- **Send the relay’s stored progress to the new phone.** Simple, but stale: it misses everything
  checked off on the old phone since pairing. It remains the fallback when the old phone is gone.

## Revisit if

- Players report backup & restore as a real chore when moving devices.
- Several trackers per relay arrive, which would need ongoing sync between trackers, not a one-time
  move.
