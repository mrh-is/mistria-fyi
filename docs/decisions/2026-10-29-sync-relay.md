---
id: 2026-10-29-sync-relay
status: current
summary: >-
  The standalone SQLite relay supplements Cloudflare’s minute-only rate binding with rotating hourly
  HMAC admission handles, preserving address privacy & permanent mailbox retirement.
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

## Decision

Use the binding for three attempts per minute, then the existing account-wide singleton for three
successful creations per UTC hour per rotating HMAC handle & 200 per UTC day. HMAC input includes
the hour, a purpose label, & the address; it uses an independent Worker secret. Only the opaque
handle & count enter storage, & an alarm clears the previous hour’s handles. Raw addresses never
reach a Durable Object, Siteverify, or application logs. Fixed windows can admit six creations near
an hour boundary; this fits the approximate cap while the account-wide daily ceiling stays strict.

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
cache. The first PR run hit the unchanged 90-second wall ceiling; no suite budget or worker count is
raised by this scheduling change.

## Alternatives

1. A rate binding with a 3,600-second period is invalid. A minute-only cap permits 180 creations an
   hour per address & misses the intended protection.
2. Storing raw IP addresses in the singleton violates the privacy requirement. An unkeyed address
   hash permits offline enumeration; an hourly HMAC needs the private key & cannot link hours by
   comparing stored handles.
3. A separate limiter object per address adds namespaces & durable identity without helping the
   existing singleton’s account-wide accounting.
4. Hosting Durable Object classes in Pages is unsupported; a separate origin keeps the relay’s
   lifecycle & secrets independent of the application build.
5. Omitting runtime eviction checks to fit ordinary unit-test timing would leave a required
   persistence boundary untested. Raising every file’s ceiling would hide unrelated regressions.
6. Relying on Vitest’s timing cache to start the relay early does not cover a new file’s first CI
   run. Explicitly prioritizing this one integration file keeps the existing suite budget intact.

## Revisit if

Cloudflare adds longer binding windows; legitimate users hit the caps; address-linked pseudonyms
become inconsistent with the published privacy policy; the independent review rejects this
adaptation; or real usage approaches Workers Free’s request, storage, or row-write limits.
