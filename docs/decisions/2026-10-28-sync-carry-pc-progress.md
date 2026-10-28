# Carry the PC’s progress over sync

## Context

A player who has been tracking on the PC, by hand or from imports, & then pairs a phone has progress
the save doesn’t carry: manual check-offs & their provenance. Sync moves only the save, so that
progress stayed behind. The setup design (#131) first moved it with a backup export on the PC & a
restore on the phone, then with the transfer QR. Both add a step & a second code to the happy path,
restore replaces whatever the phone already had, & the transfer QR is deprecated once sync ships
(#138). The maintainer proposed sending it through the sync channel the pairing has just opened.

## Decision

- **Pairing carries it.** When the PC holds progress, pairing shows “Send this PC’s progress too”,
  checked. After the phone confirms the pairing, the PC sends its stored progress once, as the
  pairing’s first bundle, in the restorable backup format, encrypted like any save bundle.
- **The phone merges it additively,** keeping manual provenance, before the first save applies. It
  never replaces. The courier holds the first save until the phone confirms the progress bundle.
- **The phone decides about its own progress** before scanning: keep it (the PC’s adds on top) or
  start fresh (erase this phone first). The PC can’t see the phone’s data before pairing, so it
  doesn’t ask.
- **The PC’s stored progress stays untouched** while it relays.

## Alternatives

- **Backup export on the PC & restore on the phone.** Two extra steps & a file to carry between
  devices; restore replaces the phone’s progress, so a phone with progress needed a “which side to
  keep” question & its own backup first.
- **The transfer QR.** Additive & no file, but a second code to show & scan, on a format that binds
  to the exact build & is deprecated once sync ships (#138).
- **Only the save.** Simplest, but silently drops everything checked off by hand on the PC, which
  the player would discover later on the phone.

## Revisit if

- Several trackers per relay arrive, which would need progress to flow between peers, not once from
  the PC.
- The backup format stops migrating forward, or a late-game backup nears the relay’s 256 KB cap.
- Players report duplicate or surprising check-offs from the merge.
