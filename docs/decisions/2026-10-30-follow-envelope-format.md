---
id: 2026-10-30-follow-envelope-format
status: current
summary: >-
  Version 1 envelopes authenticate a fixed 26-byte additional-data layout & carry a length-prefixed
  JSON header before the pruned save; sync stays behind one build-time switch until launch.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/133
  - src/lib/sync/follow.ts
  - src/lib/sync/enabled.ts
relationships: []
---

# Follow envelope format & the sync switch

## Context

The relay treats envelopes as opaque bytes, & its README leaves the exact encoding of the
authenticated data to the courier & follower, which must agree byte for byte. #133 builds the
follower's side first, so it fixes the format the courier (#134) will write. Separately, sync ships
in pieces (#133 to #137) but must appear on the production site all at once (#291).

## Decision

- **Key derivation.** HKDF-SHA-256 over the 32-byte follow key with an empty salt: 16 bytes with
  info `mistria-follow v1 id` for the mailbox ID, & 32 bytes with info `mistria-follow v1 seal` for
  the AES-GCM key. Fixed vectors live in `src/lib/sync/follow.test.ts`.
- **Additional data.** 26 bytes, big-endian: the protocol version as a u16, the mailbox ID's 16 raw
  bytes, then the counter as a u64.
- **Envelope.** A random 12-byte nonce, then the AES-GCM ciphertext & its 16-byte tag, as the relay
  README describes.
- **Plaintext.** A u32 big-endian length, that many bytes of UTF-8 JSON
  (`{ fileName, modified, playtime? }`, validated strictly), then the pruned save in its own
  container format.
- **The switch.** `__SYNC_ENABLED__`, defined in `vite.config.ts` as the inverse of the production
  check, is read only through `src/lib/sync/enabled.ts`. Every sync entry point checks it; the sync
  page redirects to Home when it's off. #291 removes it.

## Alternatives

- **Text additional data** (`1.<id>.<counter>`): readable, but a fixed binary layout leaves no room
  for separator or number-formatting ambiguity between the two sides.
- **A CBOR or MessagePack header:** compact, but adds a dependency for three fields.
- **Leaving `/sync` out of the production prerender:** hides the URL entirely, but needs the build
  to know the switch in two places (prerender entries & bare-path stubs). A redirect keeps one
  switch.

## Revisit if

- The courier needs more metadata than fits a small JSON header, or the save outgrows the envelope
  cap & needs chunking.
- A different cipher suite is needed, which means protocol version 2.
- Launch (#291) removes the switch.
