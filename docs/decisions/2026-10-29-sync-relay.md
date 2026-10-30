---
id: 2026-10-29-sync-relay
status: current
summary: >-
  The standalone SQLite relay supplements Cloudflare’s minute-only rate binding with rotating hourly
  shared 16-bit HMAC buckets & prefix read limits, preserving address privacy & permanent
  retirement.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/132
  - relay/README.md
  - relay/worker.ts
relationships: []
---

# Sync relay admission

## Context

The follow-code relay requires a few creations per hour per client address without storing that
address, plus about 200 creations per day account-wide.
[Cloudflare’s rate-limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
supports only 10- & 60-second periods, with approximate enforcement per location. The approved
design’s hourly requirement cannot be configured directly in that binding.

The
[adversarial review](https://github.com/mrh-is/mistria-fyi/pull/281#pullrequestreview-5695873965)
triggered the previous record’s “Revisit if” conditions: it rejected the full HMAC adaptation &
identified its inconsistency with the privacy wording. A secret holder could enumerate IPv4
addresses against stored full HMACs, including recovery snapshots. Unthrottled public reads also
left the quota vulnerable after a pause.

## Decision

Use the binding for three attempts per minute, then the existing account-wide singleton for three
successful creations per UTC hour per rotating 16-bit HMAC bucket & 200 per UTC day. Both binding
keys & HMAC inputs normalize IPv4 addresses & IPv6 /64 prefixes; mapped IPv4 uses its IPv4 budget.
HMAC input includes the hour, a purpose label, & the prefix; it uses an independent Worker secret.
Only the first two HMAC bytes & count enter storage, so each bucket deliberately combines many
possible addresses, even for a secret holder enumerating IPv4. An alarm clears old buckets; recovery
can retain bucket counts for 30 days. Raw addresses, prefixes, & full HMACs never reach a Durable
Object, Siteverify, or application logs. Rare collisions share the three-create budget. Fixed
windows can admit six creations near an hour boundary; the account-wide daily ceiling stays strict.

Limit public reads & WebSocket handshakes together to 60 attempts per minute per prefix at the edge,
before any object request, then apply the singleton pause before mailbox access. Retirement bypasses
the pause. Existing sockets remain connected; pausing does not require a mailbox inventory or
write-on-read behavior. Cap each pause request at seven days ahead, retaining one day as the default
& repeat requests for extension. Require a zone WAF rate rule at launch because a binding or
singleton pause still consumes Worker requests, & a pause gate consumes object requests too.

Keep the Worker at `relay.mistria.fyi`, independently deployed from Pages, with explicit HTTPS & WSS
CSP sources. SQLite-backed objects store the latest opaque binary envelope separately from its
ownership, counter, digest, & quota metadata, so envelope expiry preserves ordering. Retire replaces
all metadata with one permanent tombstone. Client cryptography owns the AES-GCM additional data
encoding; the relay checks the pinned protocol & counter syntax but cannot inspect its tag.

Give only `relay/worker.test.ts` a 30-second file budget in the existing timing check. The measured
local runtime suite takes 21 seconds, including five-second eviction waits & a ten-second socket
close wait. It exercises actual SQLite persistence & hibernation rather than replacing the runtime
with fakes. Ordinary file ceilings & the suite’s wall-time budget stay unchanged; synthetic tests
prove that this file still fails above 30 seconds & that other files retain their existing ceiling.

Start the relay integration first within its Vitest pool, retaining the default sequencer’s order
for every other file. Its runtime waits can then overlap ordinary tests, including on a cold timing
cache. Even so, four-CPU CI runs reached 95 seconds against the 90-second wall ceiling, so that
ceiling rises to 120 seconds, matching two-CPU runners, until #13 shortens the suite. Worker counts
stay unchanged.

## Alternatives

1. A rate binding with a 3,600-second period is invalid. A minute-only cap permits 180 creations an
   hour per address & misses the intended protection.
2. Raw addresses, unkeyed hashes, & full hourly HMACs violate the privacy requirement: hashes are
   enumerable, & a secret holder can enumerate full HMACs. A shared 16-bit bucket preserves hourly
   admission without a recoverable per-address handle. Dropping hourly admission would weaken the
   approved creation cap; rare bucket collisions are the narrower tradeoff.
3. A separate limiter object per address adds namespaces & durable identity without helping the
   existing singleton’s account-wide accounting.
4. Hosting Durable Object classes in Pages is unsupported; a separate origin keeps the relay’s
   lifecycle & secrets independent of the application build.
5. Omitting runtime eviction checks to fit ordinary unit-test timing would leave a required
   persistence boundary untested. Raising every file’s ceiling would hide unrelated regressions.
6. Relying on Vitest’s timing cache to start the relay early does not cover a new file’s first CI
   run. Explicitly prioritizing this one integration file keeps the existing suite budget intact.
7. Preserving public reads during a pause leaves mailbox quota exposed to the reported attack.
   Disconnecting existing sockets would require a broader control mechanism; blocked uploads &
   handshakes stop new data & connections without it.

## Revisit if

Cloudflare adds longer binding windows; legitimate users hit the caps; address-linked pseudonyms
become inconsistent with the published privacy policy; the independent review rejects this
adaptation; or real usage approaches Workers Free’s request, storage, or row-write limits.
