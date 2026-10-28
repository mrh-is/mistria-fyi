# Hand off progress between trackers

## Context

Things checked off by hand live on the tracker where they were checked off. Once a PC becomes a
relay, that is the phone, so pairing a new phone from the PC would leave the player’s manual
progress on the old phone. The review on #251 found this, along with two related gaps: moving from
an iOS browser to the installed app relied on exporting & restoring a backup file, and the transfer
QR that once moved progress between devices binds to the exact build, drops provenance, & leaves
with #138.

## Decision

- **A one-time handoff code moves progress between trackers.** The sender shows a code (or “Copy
  link”), the receiver scans or pastes it, both show the same six-digit match code, & the sender
  sends its progress once, encrypted, & keeps its own copy. It reuses pairing’s offer, handshake, &
  match, & the progress bundle from
  [carrying the PC’s progress](2026-10-28-sync-carry-pc-progress.md).
- **A new phone starts with it.** “Pair a different phone” opens with “New phone? Bring your
  progress first”, then moves progress from the old phone before pairing the new one, with a quieter
  skip.
- **The iPhone app uses it too,** by link, since both copies are on one device. The app’s first
  launch leads with sync setup; bringing Safari’s progress over is a secondary link.
- **“Move to Another Device” replaces “Transfer to Another Device”** in Data, in the same place.
- **A relay’s re-pairing shows “Send this PC’s progress too” unchecked,** since that progress is
  stale.

## Alternatives

- **Backup export & restore.** Works today, but carries a file between devices or apps, & restore
  replaces whatever the receiver had.
- **Keep the transfer QR.** Familiar & no file, but build-bound, without provenance, & already
  slated for removal once sync ships.
- **Send the relay’s stored progress to the new phone.** Simple, but stale: it misses everything
  checked off on the old phone since pairing.

## Revisit if

- Several trackers per relay arrive, which would need ongoing sync between trackers, not a one-time
  handoff.
- Players report the handoff as more work than the progress it saves, for example because most have
  little manual progress on their phones.
- The receiver merge from the carry decision proves unsafe, which would limit handoffs to empty
  receivers.
