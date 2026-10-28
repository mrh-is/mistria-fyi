---
id: 2026-10-28-sync-relay-write-budget
status: current
summary: >-
  The relay keeps a daily write budget in its singleton, granting typed allowances before writes &
  reserving the last 20% for operations that finish what’s started.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/251
  - docs/sync.md#caps--expiry
relationships: []
---

# Budget the relay’s daily writes

## Context

The [save-driven sync record](2026-10-20-save-driven-sync.md) rejected a runtime budget check on the
relay: capping new pairings at about 50 a day & each pairing at about 60 writes a day put the worst
case near 9,000 Durable Object row writes, inside Workers Free’s 100,000. That estimate counted one
day’s new pairings, but the daily cap bounds how many pairings start each day, not how many stay
live. Pairings last until 90 days after the phone last checks in, so the live set grows by up to 50
a day, & at full use it outgrows the free tier within weeks. The setup design (#131, PR #251) also
added offers that are minted on each reveal, carried progress with its own operations, & a promise
that confirmations, unpairing, & cleanup always go through. A fixed cap can’t keep that promise once
the account-wide limit is near.

None of the earlier record’s “Revisit if” conditions holds; its premise was wrong. Real usage hasn’t
approached the limits yet, but the design has to hold when it does.

## Decision

- A singleton Durable Object keeps the day’s write count. Each pairing object asks it for an
  allowance of 30 row writes before spending them, & the singleton counts every grant as spent, plus
  its own writes, so nothing is reported after the fact & no shutdown callback is needed.
- Allowances are typed. An ordinary allowance pays for uploads, offers, & check-ins; a reserve one
  pays only for finishing operations (accepting a minted offer, the transfer’s claim, decline, skip,
  & confirmation, the carry’s first upload, confirmations, check-ins, unpairing, & cleanup).
- Past 80% of the daily row writes, the singleton grants only reserve allowances, & the PC says
  “Sync’s full for today”.
- Pairing objects count the requests they serve against the same allowances, since Workers Free also
  caps requests at 100,000 a day. A day whose Worker requests run out fails everything until the
  reset; nothing is lost, because bundles wait in the courier & receipts make confirmations safe to
  retry.
- The relay moves to Workers Paid, or raises its caps, once rows or requests pass half their daily
  limit on a typical day.

The protocol is in [sync.md](../sync.md#caps--expiry).

## Alternatives

- **Fixed caps only** (the earlier record): rejected. The daily cap doesn’t bound live pairings, so
  the worst case it was sized for undercounts by the pairing’s lifetime.
- **Reporting writes after the fact,** every 20 writes or on hibernation: rejected in review round
  three. Durable Objects have no shutdown callback, so unreported writes could exceed the reserve.
- **Untyped allowances:** rejected in round four. An allowance granted past 80% for a confirmation
  could pay for uploads, spending the reserve on new work.
- **Workers Paid from the start:** deferred. It removes the free tier’s limits for a small monthly
  fee, but nothing yet shows the usage that would need it.

## Revisit if

- Rows or requests pass half their daily limit on a typical day (move to Workers Paid).
- The singleton becomes a hotspot, with allowance requests queuing behind each other.
- Cloudflare changes Workers Free’s row-write or request limits, or adds a shutdown callback to
  Durable Objects.
