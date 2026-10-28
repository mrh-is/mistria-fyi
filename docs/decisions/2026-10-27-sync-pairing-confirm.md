---
id: 2026-10-27-sync-pairing-confirm
status: current
summary: >-
  Pairing is confirmed by matching a six-digit, handshake-derived code on both devices; device names
  only label a pairing.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/251
  - docs/sync.md#stages--generations
relationships: []
---

# Sync pairing confirmation

## Context

Pairing (#133) hands a single-use offer to whoever scans the PC’s QR first. Players stream this
game, and a QR shown on stream, or in a shared screenshot, lets a viewer answer the offer before the
player does. [sync.md](../sync.md#stages--generations) said the phone shows “Paired” only once the
PC accepts, but not whether a person takes part in that acceptance. The setup design (#131) had to
choose. A first version asked “Was that you?” with the answering device’s name; both reviews on #251
showed that a browser-derived name (“iPhone with Safari”) can’t tell the player’s phone from a
viewer’s.

## Decision

- **The player matches a code on both screens.** Once a device answers, the PC & the answering phone
  each show the same six-digit code, derived from the handshake transcript (a short authentication
  string). The PC asks whether the phone shows that code. Only the device that completed the
  handshake can show it.
- **A stranger who answers first can’t produce a match.** The offer is single-use, so the player’s
  own phone, scanning second, shows “Someone else got to this code first” instead of a code. The
  player picks “No, it doesn’t”, which discards the offer & shows a fresh one.
- **Device names stay descriptive only.** They label the pairing afterwards (“Paired with your
  Android phone”) and never decide anything.
- **The QR starts covered.** “Show code” mints the offer & starts its countdown; “Hide code” covers
  the same offer without restarting it.

## Alternatives

- **Automatic acceptance after the MAC check.** The MAC proves only that the answerer saw the QR,
  which is exactly what a stream leak gives away. A hijacked pairing sends the player’s progress to
  a stranger & silently unpairs their own phone.
- **“Was that you?” with the device name.** Rejected after review: names collide across phones of
  the same kind, so the player would approve a stranger.
- **A code typed on the PC.** Equally strong, but typing six digits is more work than comparing
  them, on the device the player is least likely to be looking at.
- **The stream hint alone.** Relies on players reading it before they show the code.

## Revisit if

- Players report the comparison as friction & no leaked-code pairing has been reported.
- Pairing moves to a channel a viewer can’t observe (for example, a local connection between the
  devices), which would make the comparison redundant.
