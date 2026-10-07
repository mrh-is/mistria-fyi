# Progress transfer format

The device-transfer QR code contains the text `MFGT` (`TRANSFER_MAGIC`) followed by an unpadded
base64url envelope. The marker identifies the code as a Mistria Field Guide transfer code, so an
unrelated QR code is never mistaken for one from another version. Pre-launch codes had no marker, so
the launch layout restarted at version 1 without colliding with them. The envelope’s first decoded
byte is the transfer version, and the next four bytes are a big-endian CRC-32 integrity checksum of
the raw (pre-compression) payload. The remaining bytes are a raw-DEFLATE stream containing the
packed progress fields. `TRANSFER_VERSION` in `src/lib/engine/transfer.ts` identifies the current
encoder.

Transfers merge decoded progress additively. They are not backups and never replace the recipient’s
state. The broader compatibility review for tracker-data changes is defined in
[the game-version update protocol](game-version-update-protocol.md).

## Validation contract

Decoding is all-or-nothing. The decoder validates these boundaries before returning any progress:

- The payload starts with `MFGT`. Anything else is not a transfer code, whatever its contents.
- The envelope uses canonical, unpadded base64url characters and contains a version byte.
- The version is `MIN_SUPPORTED_TRANSFER_VERSION` through the current `TRANSFER_VERSION`.
- The envelope contains a complete four-byte checksum, and the decompressed payload’s CRC-32 matches
  it. This catches corruption (such as a single bit-flip) that happens to decompress cleanly to the
  expected length but produces different content.
- The body is a complete raw-DEFLATE stream.
- The decompressed byte count is exactly the layout length.
- Every enumerated field contains a defined code, including quest state, spouse index, relationship
  state, and child choice.
- Every reserved or unused bit is zero, including bitfield padding, spell padding, progression
  flags, and relationship padding.

Malformed encoding, corrupt or truncated compressed data, a missing or mismatched checksum, short
decompressed data, trailing decompressed data, and unsupported versions reject explicitly. Missing
bytes are never interpreted as zero-valued progress.

Every rejection is a `TransferDecodeError` whose code the UI localizes:

- `not-transfer-code`: the payload doesn’t start with the marker.
- `outdated`: a marked payload older than `MIN_SUPPORTED_TRANSFER_VERSION`. Version 0 was never
  issued, but it reads as `outdated` so tests can reach this path before a v2 exists.
- `newer-version`: a marked payload newer than `TRANSFER_VERSION`.
- `corrupt`: any other failure above.

## Version skew

Orderings derive from live tracker data, so a game-data update that shifts an ordering bumps the
transfer version and invalidates every outstanding code. Two devices on different app versions (for
example, one on a stale PWA cache) can’t transfer until both update, which takes a page reload. This
is acceptable for a live device-to-device channel. The `outdated` message tells the player to reload
the device that created the code; the `newer-version` message tells them to reload the scanning
device.

When v2 ships, confirm that a real v1 payload reads as `outdated` and replace the v0 test payloads
with it.

After the layout is decoded, mine floor, renown, skill levels, and heart levels are clamped to their
real domain maxima (from tracker data and `MAX_SKILL_LEVEL`/`MAX_HEART_LEVEL`) always. Every scalar
field's on-wire representation reserves more bit width than its domain uses (for example mine floor
is one byte but the real maximum is under 256), so an encoded value at the bit-width maximum is not
necessarily in-domain; clamping always applies, so a payload can never merge an out-of-domain value.

## Compatibility fixtures

`src/lib/engine/transfer.test.ts` keeps immutable fixtures with these expectations.

| Version  | Purpose                                                                           | Compatibility expectation                                                                    |
| -------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Unmarked | Last pre-launch layout, before the marker                                         | Reject as `not-transfer-code` before interpreting any field.                                 |
| v1       | Fixed representative `ProgressState` spanning scalar, enum, and positional fields | Encode to the immutable golden payload and decode that payload to the pinned progress state. |

The codec also pins `TRANSFER_ORDERING_HASH` beside `TRANSFER_VERSION`. The hash covers every ID
array whose position determines an on-wire bit, using code-unit ordering only. A tracker-data change
that shifts an ordering must update the compatibility decision, transfer version when required,
ordering hash, and golden fixture together.

Every change to a transfer ordering or encoded field must follow the game-version update protocol.
If a layout’s meaning changes, bump the transfer version and add a fixture for the preceding format.
