# Progress transfer format

The device-transfer QR code contains an unpadded base64url envelope. Its first decoded byte is the
transfer version. From v9, the next four bytes are a big-endian CRC-32 integrity checksum of the raw
(pre-compression) payload; earlier versions have no checksum. The remaining bytes are a raw-DEFLATE
stream containing version-specific packed progress fields. `TRANSFER_VERSION` in
`src/lib/engine/transfer.ts` identifies the current encoder.

Transfers merge decoded progress additively. They are not backups and never replace the recipient’s
state. The broader compatibility review for tracker-data changes is defined in
[the game-version update protocol](game-version-update-protocol.md).

## Validation contract

Decoding is all-or-nothing. The decoder validates these boundaries before returning any progress:

- The envelope uses canonical, unpadded base64url characters and contains a version byte.
- The version is one through the current `TRANSFER_VERSION`.
- From v9, the envelope contains a complete four-byte checksum, and the decompressed payload’s
  CRC-32 matches it. This catches corruption (such as a single bit-flip) that happens to decompress
  cleanly to the expected length but produces different content.
- The body is a complete raw-DEFLATE stream.
- The decompressed byte count is exactly the layout length expected for that version.

Malformed encoding, corrupt or truncated compressed data, a missing or mismatched checksum, short
decompressed data, trailing decompressed data, and unsupported versions reject explicitly. Missing
bytes are never interpreted as zero-valued progress.

After the layout is decoded, mine floor, renown, skill levels, and villager levels are clamped to
their real domain maxima (from tracker data and `MAX_SKILL_LEVEL`/`MAX_VILLAGER_LEVEL`) regardless
of transfer version. Every scalar field's on-wire representation reserves more bit width than its
domain uses (for example mine floor is one byte but the real maximum is under 256), so an encoded
value at the bit-width maximum is not necessarily in-domain; clamping applies to every version,
including historical fixtures, so a payload can never merge an out-of-domain value.

## Compatibility fixtures

`src/lib/engine/transfer.test.ts` keeps immutable fixtures with these expectations:

| Version | Purpose                                                                                 | Compatibility expectation                                                                                           |
| ------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| v1      | Earliest layout, before perks and later progression fields                              | Decode the original floor, villager level, and renown; default later fields to empty or their initial value.        |
| v5      | Historical pre-v6 almanac ordering                                                      | Accept its historical 790-byte raw layout and normalize renamed almanac canonical IDs.                              |
| v8      | Historical pre-checksum fixture with bit-width-maximum (out-of-domain) scalar values    | Decode without a checksum and clamp its out-of-domain scalars to the real domain maxima.                            |
| v9      | Current boundary fixture with in-domain maximum scalar values, marriage, and one recipe | Decode with a valid checksum, without loss, and remain byte-for-byte reproducible while tracker data is compatible. |

Every change to a transfer ordering or encoded field must follow the game-version update protocol.
If a layout’s meaning changes, bump the transfer version and add a fixture for the preceding format.
