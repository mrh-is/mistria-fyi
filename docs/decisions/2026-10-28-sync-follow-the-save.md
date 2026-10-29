---
id: 2026-10-28-sync-follow-the-save
status: current
summary: >-
  Devices follow the PC’s save through one long-lived link; only the save travels, so pairing, PC
  roles, & carried progress are gone.
evidence:
  - docs/sync.md
  - docs/sync-setup.md
  - https://github.com/mrh-is/mistria-fyi/pull/251
relationships: []
---

# Follow the save, not a pairing

## Context

The first setup design for #131 ([#251](https://github.com/mrh-is/mistria-fyi/pull/251)) went
through three adversarial review rounds. It grew a role for the PC’s browser (tracker, self-updating
tracker, or relay), a single-use pairing confirmed by a six-digit match code, a carried-progress
transfer with its own state machine, & delete-on-confirm delivery with lapses & re-uploads. Each
piece answered a real finding, but they multiplied: roles needed transitions & fencing, single-use
offers needed reservations & spent-offer copy, the carry needed exactly-once claims, & one device
per PC needed a separate flow for every device move. The maintainer asked for a fundamentally
simpler direction (2026-10-28).

That PR’s account-less record had already named the way out as its first fallback, an account-less
sync key, but assumed a key needs a multi-device merge. It needs none when only the save travels:
each device applies the same save to its own progress, & check-offs never leave the device they were
made on.

## Decision

- **A follow link replaces pairing.** The PC makes one long-lived link whose fragment holds a random
  key. Any device that opens it follows the save. HKDF splits the key into the mailbox ID, which the
  relay sees, & the AES-GCM key, which it never sees. There’s no handshake, offer, or match code.
- **Only the save travels.** Every follower runs the importer & `applySync` on the latest save.
  Check-offs stay on the device where they were made, the PC included; the PC’s progress isn’t
  carried, & backup & restore moves it once for a player who wants it.
- **Any number of followers.** One device per PC kept manual edits from needing conflict rules
  between devices. Followers never exchange edits, so a new phone, a second phone, or the iPhone app
  just opens the link again.
- **The relay is a mailbox.** It keeps the latest envelope per link, overwritten by each newer
  upload (a high-water counter refuses older ones) & deleted 30 days after it was sent. There are no
  confirmations, delivery states, or lapses. Only the PC’s write token writes; followers never
  authenticate.
- **Three lanes, one per device.** A device’s save is on this computer, its save is on another
  device, or it tracks by hand. The computer with the save shares it, & its own tracker updates from
  the same save, applied locally, without being told it “follows itself”. Nothing is read-only.
- **Starting to sync erases; stopping doesn’t.** A following lane starts only on empty progress,
  with a backup offered first, so following never merges into existing progress & doesn’t ask which
  farm it is on a fresh start. Leaving a syncing lane for tracking by hand keeps progress, since
  it’s already on the device. For v1 that’s simpler than any carry or merge, & the maintainer
  accepted the cost (2026-10-28).
- **A leaked link is accepted.** Anyone holding it can read saves until the PC makes a new link,
  which retires the old one for every follower. A save holds progress & the player’s & farm’s names,
  nothing close to personal data, so perfect secrecy isn’t a goal. A follower can’t write: the code
  appears only after its mailbox exists under the PC’s token.

## Alternatives

- **Single-use pairing with a six-digit match** (#251). Rejected: it defends against a viewer racing
  the player for a single-use offer, a threat that doesn’t exist when nothing is consumed, & its
  lifecycle (covered offers, stages, reservations, link extensions, spent-offer copy) dominated the
  design.
- **Carrying the PC’s progress at pairing** (#251). Rejected: a transfer state machine, a barrier, &
  a farm check on the PC, for progress that backup & restore already moves.
- **Roles for the PC’s browser** (#251). Rejected: transitions, fencing, a read-only mirror, &
  hidden Data actions, all to stop PC check-offs from silently not reaching the phone. The copy now
  says check-offs stay on their device.
- **Holding each bundle until the phone confirms**
  ([save-driven sync](2026-10-20-save-driven-sync.md)). Rejected: it needs the phone to authenticate
  to the relay & a delivery state per bundle, while each save is a full snapshot, so the latest one
  is all a follower needs.
- **Accounts.** Still rejected, as on #251: an auth system & its liabilities, for device moves that
  following now covers without one.
- **Ephemeral keys with forward secrecy.** Rejected: the data isn’t sensitive enough to pay for a
  handshake.

## Revisit if

- Leaked links cause real trouble: players report strangers following, or a game update puts
  something sensitive in the save.
- Players need check-offs to travel between devices, which brings back a merge.
- Abuse outgrows Turnstile, the per-link caps, the daily creation cap, & the kill switch.
- #130 shows the courier can’t watch the save reliably.
