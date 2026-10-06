# Progress transfer format

The device-transfer QR code contains the text `MFGT` (`TRANSFER_MAGIC`) followed by an unpadded
base64url envelope. The marker, added in v11, identifies the code as a Mistria Field Guide transfer
code, so an unrelated QR code is never mistaken for one from another version; earlier versions have
no marker. The envelope’s first decoded byte is the transfer version, and the next four bytes are a
big-endian CRC-32 integrity checksum of the raw (pre-compression) payload. The remaining bytes are a
raw-DEFLATE stream containing the packed progress fields. `TRANSFER_VERSION` in
`src/lib/engine/transfer.ts` identifies the current encoder.

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
- `outdated`: a marked payload older than `MIN_SUPPORTED_TRANSFER_VERSION`.
- `newer-version`: a marked payload newer than `TRANSFER_VERSION`.
- `corrupt`: any other failure above, including a version byte of zero.

After the layout is decoded, mine floor, renown, skill levels, and villager levels are clamped to
their real domain maxima (from tracker data and `MAX_SKILL_LEVEL`/`MAX_VILLAGER_LEVEL`) always.
Every scalar field's on-wire representation reserves more bit width than its domain uses (for
example mine floor is one byte but the real maximum is under 256), so an encoded value at the
bit-width maximum is not necessarily in-domain; clamping always applies, so a payload can never
merge an out-of-domain value.

## Compatibility fixtures

`src/lib/engine/transfer.test.ts` keeps immutable fixtures with these expectations. Versions older
than v11 are deliberately unsupported: v1 through v9 because their positional layouts no longer
match the current tracker data, and v10 because it predates the marker. v11 has v10’s layout.

| Version | Purpose                                                                           | Compatibility expectation                                                                    |
| ------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| v1      | Earliest layout, before perks and later progression fields                        | Reject as `not-transfer-code` (no marker) before decompression.                              |
| v5      | Historical pre-v6 almanac ordering                                                | Reject as `not-transfer-code` (no marker) before interpreting obsolete almanac positions.    |
| v8      | Final pre-checksum layout                                                         | Reject as `not-transfer-code` (no marker) before interpreting obsolete positions.            |
| v9      | Preceding checksummed layout                                                      | Reject as `not-transfer-code` (no marker) before interpreting obsolete positions.            |
| v10     | Last unmarked layout, identical to v11’s fields                                   | Reject as `not-transfer-code` before interpreting any field.                                 |
| v11     | Fixed representative `ProgressState` spanning scalar, enum, and positional fields | Encode to the immutable golden payload and decode that payload to the pinned progress state. |

The codec also pins `TRANSFER_ORDERING_HASH` beside `TRANSFER_VERSION`. The hash covers every ID
array whose position determines an on-wire bit, using code-unit ordering only. A tracker-data change
that shifts an ordering must update the compatibility decision, transfer version when required,
ordering hash, and golden fixture together.

Every change to a transfer ordering or encoded field must follow the game-version update protocol.
If a layout’s meaning changes, bump the transfer version and add a fixture for the preceding format.
