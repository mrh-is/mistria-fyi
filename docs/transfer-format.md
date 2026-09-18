# Progress transfer format

The device-transfer QR code contains an unpadded base64url envelope. Its first decoded byte is the
transfer version; the remaining bytes are a raw-DEFLATE stream containing version-specific packed
progress fields. `TRANSFER_VERSION` in `src/lib/engine/transfer.ts` identifies the current encoder.

Transfers merge decoded progress additively. They are not backups and never replace the recipient’s
state. The broader compatibility review for tracker-data changes is defined in
[the game-version update protocol](game-version-update-protocol.md).

## Validation contract

Decoding is all-or-nothing. The decoder validates these boundaries before returning any progress:

- The envelope uses canonical, unpadded base64url characters and contains a version byte.
- The version is one through the current `TRANSFER_VERSION`.
- The body is a complete raw-DEFLATE stream.
- The decompressed byte count is exactly the layout length expected for that version.

Malformed encoding, corrupt or truncated compressed data, short decompressed data, trailing
decompressed data, and unsupported versions reject explicitly. Missing bytes are never interpreted
as zero-valued progress.

## Compatibility fixtures

`src/lib/engine/__tests__/transfer.test.ts` keeps immutable fixtures with these expectations:

| Version | Purpose                                                                       | Compatibility expectation                                                                                    |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| v1      | Earliest layout, before perks and later progression fields                    | Decode the original floor, villager level, and renown; default later fields to empty or their initial value. |
| v5      | Historical pre-v6 almanac ordering                                            | Accept its historical 790-byte raw layout and normalize renamed almanac canonical IDs.                       |
| v8      | Current boundary fixture with maximum scalar values, marriage, and one recipe | Decode without loss and remain byte-for-byte reproducible while tracker-data ordering is compatible.         |

Every change to a transfer ordering or encoded field must follow the game-version update protocol.
If a layout’s meaning changes, bump the transfer version and add a fixture for the preceding format.
