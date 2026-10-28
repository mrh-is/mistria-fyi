# Carry the PC’s progress over sync

## Context

A player who has been tracking on the PC, by hand or from imports, & then pairs a phone has progress
the save doesn’t carry: manual check-offs & their provenance. Sync moves only the save, so that
progress stayed behind. The setup design (#131) first moved it with a backup export on the PC & a
restore on the phone, then with the transfer QR. Both add a step & a second code to the happy path,
& the transfer QR is deprecated once sync ships (#138). The maintainer proposed sending it through
the sync channel the pairing has just opened.

The first version of this decision merged the carried progress into whatever the phone held, through
a new per-fact `mergeProgress`. Round two of the design review on #251 showed what that costs: a
household merge that can drop a romance, ties that discard a deliberate uncheck, resolutions that
outlive the values they covered, a farm switched twice in one setup, & a “Start fresh” choice that
could fire at an unrelated bundle. That machinery served a rare player (one with check-offs on both
devices for the same farm) who has other workarounds, so the merge was cut (changed after review).

## Decision

- **Pairing carries it.** When the PC holds progress, pairing shows “Send this PC’s progress too”,
  checked on the PC’s first pairing & unchecked on re-pairs, except after “My old phone’s gone”,
  which checks it. The PC sends its stored progress once, as the pairing’s first bundle, in the
  restorable backup format, encrypted like any save bundle.
- **The phone takes it whole or not at all.** An empty phone takes it without asking. A phone with
  progress asks right after pairing: “Use my PC’s” replaces its progress & keeps it as the
  farm-switch backup; “Keep this phone’s” declines the transfer. Nothing merges.
- **The PC checks the farm first.** It sends its progress only after the save is connected, & only
  when its stored farm matches the save’s; unidentified progress asks on the PC, & a different farm
  stays behind. Carried progress is therefore always the farm being played, so a setup switches
  farms at most once.
- **One terminal state per transfer.** The relay records claimed, declined, or skipped, first come
  first served; the phone claims before applying, & records the transfer ID as applied in the same
  write as the progress, so a transfer applies exactly once.
- **This narrows the original sync decision.** The
  [save-driven sync record](2026-10-20-save-driven-sync.md) says manual check-offs never travel
  between devices; the PC’s stored progress now travels once, at pairing, & check-offs made on the
  phone still never travel back.
- **The PC’s stored progress stays untouched** while it relays.

## Alternatives

- **Merge into the phone’s progress** (the first version). Keeps both sides’ check-offs, but needs a
  rule per fact kind, a deferred “Start fresh”, & farm handling for two incoming streams, each of
  which review found unsafe in a different way.
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
- Players report losing check-offs because they had to pick one side, which would justify a merge
  with its own design & review.
- The backup format stops migrating forward, or a late-game backup nears the relay’s 256 KB cap.
