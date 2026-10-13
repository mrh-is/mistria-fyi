# Progress transfer format

The device-transfer QR code contains the text `MFGT` (`TRANSFER_MAGIC`) followed by an unpadded
base64url envelope. The marker identifies the code as a Mistria Field Guide transfer code, so an
unrelated QR code is never mistaken for one. The envelope’s first four bytes are a big-endian CRC-32
fingerprint of the app version that created it, and the next four are a big-endian CRC-32 integrity
checksum of the raw (pre-compression) payload. The remaining bytes are a raw-DEFLATE stream
containing the packed progress fields.

Transfers merge decoded progress additively. They are not backups and never replace the recipient’s
state.

## Build binding

A code decodes only on the exact app build that created it. The fingerprint covers SvelteKit’s
`version` from `$app/env`, which production builds derive from the commit date and SHA (local
development builds all report `dev`). The transfer card passes it to `encodeTransferPayload` and
`decodeTransferPayload`; the engine never reads it itself.

Note: the fingerprint is 32 bits, so two builds can share one (about one chance in 2^32 per pair).
Only builds live at the same time matter, and a collision still has to pass the length, field, and
checksum validation below, so the codec accepts that risk rather than carrying the full commit.

The packed layout derives from live tracker-data orderings and the codec as built, so there is no
transfer version, compatibility window, or historical fixture. Changing an ordering or an encoded
field needs no version bump or compatibility review: every outstanding code from the previous build
already reads as `version-mismatch`. See
[the build-binding decision](decisions/2026-10-13-transfer-build-binding.md).

## Validation contract

Decoding is all-or-nothing. The decoder validates these boundaries before returning any progress:

- The payload starts with `MFGT`. Anything else is not a transfer code, whatever its contents.
- The envelope uses canonical, unpadded base64url characters and contains a complete build
  fingerprint.
- The fingerprint matches the decoding build.
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
decompressed data, trailing decompressed data, and a different build reject explicitly. Missing
bytes are never interpreted as zero-valued progress.

Every rejection is a `TransferDecodeError` whose code the UI localizes:

- `not-transfer-code`: the payload doesn’t start with the marker.
- `version-mismatch`: a different build created the payload. The fingerprint is checked before the
  checksum, so a code damaged inside its fingerprint also reads as a mismatch.
- `corrupt`: any other failure above.

## Version skew

Two devices on different app builds (for example, one on a stale PWA cache, or a deploy landing
mid-transfer) can’t transfer until both update. This is acceptable for a live device-to-device
channel. A hash can’t say which device is older, so the `version-mismatch` panel tells the player to
update both devices, choosing “Refresh” on the update prompt if one appears, then create and scan a
new code. It offers a copyable version of those steps to relay to the other device.

After the layout is decoded, mine floor, renown, skill levels, and heart levels are clamped to their
real domain maxima (from tracker data and `MAX_SKILL_LEVEL`/`MAX_HEART_LEVEL`) always. Every scalar
field’s on-wire representation reserves more bit width than its domain uses (for example mine floor
is one byte but the real maximum is under 256), so an encoded value at the bit-width maximum is not
necessarily in-domain; clamping always applies, so a payload can never merge an out-of-domain value.

## Test fixtures

`src/lib/engine/transfer.test.ts` round-trips a fixed representative `ProgressState` spanning
scalar, enum, and positional fields, and keeps two immutable foreign payloads:

| Payload      | Origin                                     | Expectation                                               |
| ------------ | ------------------------------------------ | --------------------------------------------------------- |
| Unmarked     | Last pre-launch layout, before the marker  | Reject as `not-transfer-code` before interpreting fields. |
| Version byte | Launch layout, with a one-byte version `1` | Reject as `version-mismatch`.                             |

Two devices on the same build may run different locales, so the tests also pin that every ordering
encodes identically under several collations.
