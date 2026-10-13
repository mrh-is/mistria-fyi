# Transfer codes bind to the exact app build

## Context

The device-transfer QR code carried a manually bumped `TRANSFER_VERSION`, a pinned ordering hash,
and an immutable golden fixture. Its layout derives from tracker-data orderings, so every game-data
update forced a judgment call about whether an ordering shift needed a version bump, and a wrong
call would silently misread progress. Transfer is a live device-to-device channel on a website, so
both devices can be online and current at the moment of transfer (#61).

## Decision

A transfer code starts with a four-byte CRC-32 fingerprint of the app version that created it
(SvelteKit’s `version`, which embeds the commit date & SHA in production). The scanner rejects any
code whose fingerprint differs from its own build as `version-mismatch` and tells the player to
update both devices. There is no transfer version, compatibility window, or decoding path for
another build’s layout. Backups & save import keep their explicit versions; they’re long-lived
artifacts, unlike a QR code.

## Alternatives

- **Keep the manual version.** It’s the status quo’s error-prone review, and it buys only the
  ability to transfer across deploys, which a reload provides anyway.
- **Fingerprint only the layout inputs** (orderings plus a codec schema). Codes would survive
  unrelated deploys, but a codec layout change still needs a manual bump, which is the ritual this
  removes.
- **Encode the raw commit SHA prefix.** It’s the same size and readable when debugging, but local
  development builds have no commit (their version is `dev`), and the fingerprint needs no parsing
  of the version string.

## Revisit if

Transfer becomes asynchronous (a code shared to be scanned later, or offline-first use where a
device can’t update), or deploys become frequent enough that mid-transfer mismatches are a real
complaint.
