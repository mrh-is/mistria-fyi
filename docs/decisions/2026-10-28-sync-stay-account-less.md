# Keep sync account-less

## Context

Two adversarial review rounds on the sync setup design (#131, PR #251) kept finding problems in the
flows that move progress between devices: carrying the PC’s progress, merging it into a phone that
already had some, handing progress from one tracker to another, & moving to the iPhone app. Round
two led to cutting the merge & deferring the handoff (#269). The maintainer then asked whether the
no-login constraint in the [save-driven sync record](2026-10-20-save-driven-sync.md) was costing
more than it saved, & whether simple accounts were the right answer.

The complexity so far falls into four areas, & accounts change them differently:

1. **Getting the save off the PC** (file watching, Chrome-only support, re-allowing access after a
   restart, the refused file picker, Steam Deck & Flatpak paths): unchanged by accounts, & the
   riskiest part while #130 is open.
2. **Pairing** (offers, match codes, stream leaks, the robot check, caps): accounts remove it, but
   add sign-in, recovery, deletion, signup abuse, email delivery or an OAuth dependency, & a
   rewritten privacy page. A passkey between a Windows PC & an iPhone still means scanning a QR
   code.
3. **Moving progress between devices:** accounts win; a new device signs in, & the server is the
   backup.
4. **Data on both sides:** unchanged at the first sign-in of a device that already has progress, &
   worse after it, since accounts invite check-offs that travel both ways across several devices, a
   harder merge than the one review just cut.

## Decision

- **Sync stays account-less for v1:** no logins & no readable player data on a server, as the
  save-driven sync record already decided.
- **Accounts would mostly trade pairing for an auth system,** while the courier & the merge rules,
  the hardest parts, stay or grow. For one maintainer on a free plan, an account system is also a
  standing liability: breaches, lost-login support, & deletion requests.
- **The layer that would change is small.** Extraction, provenance, the apply rules, farm identity,
  & the courier carry over to any model; only pairing & the relay would be replaced.
- **Moving progress between devices stays backup & restore** in v1, with the handoff in #269.

## Alternatives

- **Simple accounts** (email magic link, passkeys, or OAuth), with progress the server can read.
  Rejected for v1 for the reasons above; it solves device moves, not the hard parts.
- **Accounts with end-to-end encryption.** Keeps the privacy promise but adds key management &
  recovery on top of auth, which is harder than pairing.
- **An account-less sync key:** a long random secret, shown as a QR code or a few words, under which
  the server holds encrypted progress; any device holding the key joins, & losing it loses the
  server copy. It gives the device-move benefit of accounts with no email & nothing readable, but
  needs a multi-device merge. Deferred, not rejected: it’s the first thing to reach for if the
  conditions below hold.

## Revisit if

- Players clearly want to check things off on both the PC & the phone, or on more than one phone.
- Lost progress (to Safari’s storage deletion, or to switching devices) is a common complaint, not
  an edge case.
- #130 shows the courier can’t work reliably. Even then, the next step is uploading the save to a
  server, which needs no accounts.
- Handling device moves by backup & restore, or by #269, proves to be more work than a sync key.
