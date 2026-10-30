---
id: 2026-10-30-shared-edge-rate-rule
status: current
summary: >-
  The feedback endpoint & the sync relay share the zone’s one Free-plan rate-limiting rule, at 10
  requests per 10 seconds per IP & Cloudflare location.
evidence:
  - relay/README.md
  - https://github.com/mrh-is/mistria-fyi/issues/291
relationships: []
---

# Shared edge rate rule

## Context

The relay decision required a zone WAF rate rule blocking relay traffic above 60 requests per 10
seconds per client IP before the Worker runs. The `mistria.fyi` zone is on Cloudflare’s Free plan,
which allows one rate-limiting rule, & that rule already limited `/api/feedback` to one request per
10 seconds per IP & Cloudflare location, blocking for 10 seconds.

## Decision

Extend the existing rule to both paths:
`(http.request.uri.path eq "/api/feedback") or starts_with(http.request.uri.path, "/v1/")`, counting
by `ip.src` & `cf.colo.id`, 10 requests per 10 seconds, blocking for 10 seconds. The Pages app
serves no `/v1/` paths, & zone rules also cover the relay’s custom domain. Free rules can filter on
paths only & share one counter per client, so both paths draw from one budget.

Ten requests covers several household devices reconnecting at once behind one address (a follower
connection is a read plus a WebSocket handshake). It loosens feedback from one request to 10 per 10
seconds at the edge; Turnstile’s single-use tokens remain feedback’s spam gate, so the change costs
rejected requests against the Workers quota, not accepted submissions. One address can now send
about 86,000 requests a day, near Workers Free’s 100,000-request daily limit; the worst case is a
quota outage until the daily reset, not a charge.

## Alternatives

1. **Keep one request per 10 seconds for both.** A single follower connection needs two requests, so
   it would block sync.
2. **The relay decision’s 60 per 10 seconds for both.** It loosens feedback sixtyfold & lets one
   address exceed the daily Workers quota several times over.
3. **A separate rule per path.** Requires Pro or above, at about $20 a month.
4. **Workers Paid ($5 a month).** Moves to a monthly request allowance one address can’t exhaust,
   but adds no rule. It remains the next step if quota exhaustion occurs.

## Revisit if

The zone moves to a plan with more rate-limiting rules; legitimate sync clients or feedback senders
hit the shared limit; Workers quota exhaustion occurs; or sync traffic per client grows beyond a few
requests per connection.
