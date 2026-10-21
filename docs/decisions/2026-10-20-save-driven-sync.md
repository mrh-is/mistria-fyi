# Save-driven sync

## Context

Players run Fields of Mistria fullscreen on a gaming PC, so the tracker has to be a second screen on
a phone. Sync must cross from the PC to the phone with no logins & no readable player data on a
server. A probe on Windows (Chrome 155 & Edge, 2026-10-16) showed that a dragged `.sav` yields a
file handle that survives the game rewriting the file, so a browser tab on the PC can watch the
save. The design in [sync.md](../sync.md) went through four review rounds (two cross-model); this
record keeps the forks that shaped it so a later agent does not reopen them without a reason.

## Decision

- **A courier, not build-bound sync.** The PC tab only prunes, encrypts, & sends the save; the phone
  runs the importer with its own tracker data. The envelope carries a protocol version & both sides
  are strict about it, so app builds do not matter. Progress-transfer QR codes bind to the exact app
  build; sync does not.
- **One device per browser profile.** Pairing a new device replaces the old pairing & names it. Sync
  only ever moves a save from the game to one device; manual ticks never travel between devices. Two
  browser profiles are two couriers, & nothing enforces otherwise.
- **P-256 only.** Version 1 pins ECDH on P-256, HKDF-SHA-256, HMAC-SHA-256, & AES-GCM, with no
  negotiation. A different suite means a new protocol version.
- **No global update lock.** The service worker keeps the previous version’s cache until no page
  runs that version, so a new version can activate whenever it is ready, & each page reloads at its
  own safe moment (not mid-sync, form, or dialog). Nothing coordinates updates across tabs.
- **Smaller relay caps instead of a budget check.** Pairing creation is capped at about 50 a day &
  each pairing at about one write a minute & 60 a day. The worst case (about 3,000 uploads & 9,000
  Durable Object row writes a day, an estimate) fits Workers Free’s 100,000 row writes, so the relay
  carries no runtime budget accounting. A kill switch in a singleton object covers surprises.
- **Also fixed in the same design:** end-to-end encryption including against the relay, a relay that
  holds one bundle per pairing until the phone confirms (48-hour backstop), provenance & `playtime`
  ordering for conflicts, farm identity from the save’s file number & `creation_version`, & no push
  notifications (sync is best effort until real sessions prove it).

## Alternatives

Rationale is marked where it is stated in #123 or its sub-issues & where it is inferred, so a later
reader can tell a recorded reason from this record’s reading of the design.

- **Sync bound to the exact app build** (as the transfer QR is): rejected. Inferred, not stated in
  #123: the PC tab & the phone update independently, so a build mismatch would stop sync for a
  reason players cannot act on. Stated: “App builds don’t matter”; the strict protocol version is
  the only gate.
- **Several devices per PC, or ticks that travel between devices:** rejected. Stated: pairing
  replaces the old device; manual ticks never travel between devices. Inferred, not stated in #123:
  more than two parties would need conflict rules between manual edits.
- **Negotiable cipher suites, or X25519:** rejected for version 1. Stated: the suite is pinned to
  P-256. Inferred, not stated in #123: a pinned suite leaves nothing to downgrade, & P-256 is
  available everywhere the feature runs (unverified; check WebCrypto support in the target browsers
  when building #133).
- **A global lock that serializes app updates across tabs:** rejected. Stated in #111: tabs from
  older builds do not know the lock, & a dialog left open overnight would block updates forever. The
  cache-retention rule (the worker keeps the previous cache until no page runs that version) is what
  makes a lock unnecessary.
- **A runtime budget check on the relay:** rejected. Stated: smaller caps are sized so the worst
  case fits Workers Free with room to spare, so no separate budget check is needed. Inferred, not
  stated in #123: a check would add state & failure modes to the security boundary.
- **Polling the save, or a folder picker:** rejected by the probe, as stated: Chromium refuses
  everything under `%LOCALAPPDATA%`, & `FileSystemObserver` exists, so no polling is needed.
- **Accounts or a server that can read progress:** rejected by the design constraint (no logins & no
  readable user data on a server), which is why the relay holds only ciphertext.

## Revisit if

Stated in #123 or #130:

- A hardware check in #130 fails an assumption (the “every visit” grant does not survive a restart,
  or `FileSystemObserver` misses a replaced file).
- Real usage approaches Workers Free’s limits; the epic says to raise the caps if usage warrants it.

Inferred, not stated in #123:

- The caps block legitimate play.
- A second device per PC, or farm-switching across profiles, becomes a requirement (the epic defers
  multi-farm profiles & says nothing enforces one device per profile).
- WebCrypto support or a security finding calls for another suite (bump the protocol version).
- Cross-tab update reloads cause a real problem that the cache-retention rule does not cover.
