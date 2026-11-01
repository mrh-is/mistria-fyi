# Sync relay

A standalone Cloudflare Worker, separate from the Pages app. `Mailbox` & `RelayControl` use
SQLite-backed Durable Objects; their class names & the singleton name are persistent identities.
Never replace their namespaces or remove their storage during a routine deployment. The design is
[save-driven sync](../docs/sync.md#the-relay); the hourly cap adaptation is recorded in
[the relay decision](../docs/decisions/2026-10-29-sync-relay.md).

## Local checks

Run `pnpm exec vitest run relay/worker.test.ts` from the repository root. Tests transpile the
production module into Miniflare’s workerd runtime, use SQLite storage, mock only the external
Siteverify service, & provide placeholder secrets. Test-only subclasses expose storage aging & alarm
invocation inside the local namespace; neither the production module nor its public router contains
those controls. Tests cover hibernation, eviction, & a runtime restart with persistent SQLite
storage.

Run `pnpm exec wrangler dev --local --config relay/wrangler.toml` for an interactive local server.
No remote bindings or credentials are required. Without local placeholder bindings, creation & the
admin endpoint fail closed. Never put secrets in `wrangler.toml` or commit a `.dev.vars` file.

## Wire contract

The courier & followers use `https://relay.mistria.fyi`. There are no cookies or accounts;
cross-origin responses allow `*` without credentials. The mailbox ID is the 22-character base64url
encoding of the 128-bit derived ID. A write token is the 43-character base64url encoding of 256
random bits, supplied only as `Authorization: Bearer <write-token>`. Query strings are rejected.

| Request                                         | Body & headers                                                                                                                         | Result                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/mailboxes/<id>`                       | Write token; JSON `{ "turnstile": "<token>" }`, up to 4,096 bytes                                                                      | `201 { "state": "live" }`; same-owner retry `200`; different owner `409`; retired `410`                                                           |
| `PUT /v1/mailboxes/<id>/envelope`               | Write token; `Content-Type: application/octet-stream`; `X-Sync-Version: 1`; `X-Sync-Counter: <positive safe integer>`; binary envelope | `200 { "state": "stored" }`; stale or conflicting counter `409`; cap `429`; oversized body `413`                                                  |
| `GET /v1/mailboxes/<id>`                        | No token; optional `If-None-Match`                                                                                                     | Binary envelope with version, counter, & ETag; matching ETag `304`; live without envelope `200 { "state": "empty" }`; absent `404`; retired `410` |
| `GET /v1/mailboxes/<id>` with WebSocket upgrade | No token                                                                                                                               | Hibernating socket; initial state, then updates; retirement sends `retired` & closes                                                              |
| `DELETE /v1/mailboxes/<id>`                     | Write token                                                                                                                            | `200 { "state": "retired" }`; subsequent attempts `410`, which is also a terminal retirement acknowledgment                                       |
| `PUT /v1/admin/pause`                           | `Authorization: Bearer <ADMIN_TOKEN>`; JSON `{}` or `{ "until": <Unix milliseconds> }`                                                 | `{ "until": <Unix milliseconds> }`; defaults to one day; a past end time resumes writes                                                           |

All responses carry `Cache-Control: no-store`. Missing or malformed write authorization is `401`; a
wrong token is `403`. A missing secret, upstream verification failure, or unexpected runtime failure
returns `503` without error details. A paused relay returns `503` with state `paused`, its end time,
& `Retry-After`. Only retirement bypasses the pause; new reads & WebSocket handshakes are paused
too. An admin request may pause at most seven days ahead; a past end time resumes the relay.
Existing WebSockets remain connected. Preflight responses allow a 7,200-second cache. Rate-limited
responses include `Retry-After` in seconds, using the relevant minute, UTC hour, or UTC day
deadline. Same-owner creation retries skip Siteverify & creation quotas after the short-window edge
check; a fresh create needs a fresh Turnstile token with action `sync-create` & the configured
hostname.

The binary envelope is a 12-byte AES-GCM nonce followed by ciphertext & its 16-byte authentication
tag, with a total cap of 262,144 bytes (256 KiB). The relay treats it as opaque bytes. Clients must
authenticate the protocol version, mailbox ID, & counter as AES-GCM additional data; the relay
cannot validate that authentication tag. The exact client encoding of additional data belongs to the
courier/follower crypto implementation; both must use the same encoding. No file name, modification
time, playtime, follow key, or sealing key goes in headers or cleartext metadata.

Counters never reset. A same-counter retry succeeds only for byte-identical content; it does not
renew expiry, consume upload quota, or broadcast. An expired envelope keeps its counter & digest;
the courier reads `empty` & sends its current save with a higher counter. ETags include both the
counter & ciphertext digest. WebSocket messages are JSON, with the binary envelope encoded in
standard base64:

```json
{ "state": "envelope", "version": 1, "counter": 1, "envelope": "<base64>" }
{ "state": "empty" }
{ "state": "retired" }
```

Client messages close the socket as read-only. No delivery receipts exist.

## Caps & storage

The creation edge binding allows three attempts per minute, keyed by canonical IPv4 address or IPv6
/64, approximately per Cloudflare location. IPv4-mapped IPv6 shares the IPv4 budget. The singleton
additionally admits at most three successful fresh creates per UTC hour per rotating 16-bit HMAC
bucket, & 200 per UTC day across the account. HMAC input includes the hour & prefix; only its first
two bytes reach storage. Each bucket combines many possible addresses, so knowledge of the secret
cannot recover a unique address. Collisions share a budget; a different hour changes the assignment.
The dedicated secret stays out of storage, & an alarm clears buckets after the hour. Cloudflare’s
recovery can retain old bucket counts for 30 days. Raw addresses, prefixes, & full HMACs never reach
a Durable Object, log, or Siteverify request. Clock-hour windows can admit six creations across a
boundary. Failed verification uses the edge attempt budget but no singleton quota; an admission
followed by a failed mailbox storage operation conservatively consumes singleton quota.

Public reads & WebSocket handshakes share a separate 60-attempt-per-minute binding per IPv4 address
or IPv6 /64, checked before any object access. The singleton pause gate then runs before mailbox
access. A pause protects mailbox requests but still costs singleton & Worker requests; bindings
cannot prevent Worker request exhaustion, & distributed traffic can defeat per-client limits. The
zone WAF rule below is a required launch step, not configured by this repository.

Each mailbox accepts one fresh upload per 60 seconds & 60 per UTC day. The Worker bounds & buffers
network bodies before forwarding them, so a slow uplink holds no mailbox lock. A fresh counter’s
upload caps are checked before reading or hashing that buffer inside the mailbox; equal-counter
retries still check byte identity without consuming quota. Reads write no application storage.
Alarms delete envelopes after 30 days & replace mailboxes after 365 days without an upload (or after
creation for never-uploaded mailboxes) with permanent tombstones. Reads apply the same deadlines
without deleting anything, so a delayed alarm cannot serve expired content. Retirement atomically
removes the envelope, owner hash, & other metadata, retaining only the tombstone.

## Maintainer launch

1. Keep this Worker separate from the Pages project. Review its name, binding namespace IDs `132`
   (creation) & `133` (reads), SQLite migrations, & the existing account’s usage before deployment.
   Choose unique rate-limit namespace IDs if either is already used by another binding in the
   account.
2. Create a dedicated invisible Turnstile widget for the site; configure the client action as
   `sync-create` & keep `TURNSTILE_HOSTNAME` aligned with the verified hostname. For a preview test,
   use an isolated relay/widget with that exact preview hostname, not a permissive hostname match.
3. Using the maintainer’s existing Cloudflare authentication, provision `TURNSTILE_SECRET`,
   `ADMIN_TOKEN`, & `IP_RATE_SECRET` as Worker secrets with
   `pnpm exec wrangler secret put <NAME> --config relay/wrangler.toml`. Generate independent random
   admin & HMAC secrets outside the repository. No production secrets have been created by the
   implementing agent.
4. The maintainer deploys the standalone Worker & attaches the custom domain `relay.mistria.fyi`.
   `workers_dev = false` & `preview_urls = false` keep alternate public origins disabled. Preserve
   the class names, migration history, & singleton name on every update. Leave invocation logs,
   observability, tail consumers, & Logpush disabled; platform-level Cloudflare security processing
   still occurs.
5. Verify the Pages branch preview’s delivered CSP allows `https://relay.mistria.fyi` &
   `wss://relay.mistria.fyi`; test an actual browser subscription against the isolated relay, then
   creation, upload, read, retirement, & a pause that expires automatically. Confirm the privacy
   page update (#136) ships before enabling sync for players, including Cloudflare’s recovery
   retention. Follow [the relay takedown procedure](../docs/takedown.md#sync-relay) for withdrawal.
6. The zone WAF rate-limiting rule is configured (2026-10-30). The Free plan allows one, so it is
   shared with feedback: expression
   `(http.request.uri.path eq "/api/feedback") or starts_with(http.request.uri.path, "/v1/")`,
   counted by IP & Cloudflare location, blocking 10 seconds above 10 requests per 10 seconds. It
   runs before the Worker & covers OPTIONS, absent IDs, & upgrade requests. Verify it before
   enabling sync by sending more than 10 requests in a burst & checking “Security”, then “Events”,
   for its blocks. Keep an emergency hostname block available; bindings, the WAF limit, & the pause
   are layered mitigations, not a hard daily request-budget guarantee. See
   [the shared edge rate rule](../docs/decisions/2026-10-30-shared-edge-rate-rule.md).

## Cloudflare sources

Checked on 2026-10-29 against official documentation:

1. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) &
   [pricing](https://developers.cloudflare.com/workers/platform/pricing/): Free includes 100,000
   requests/day, 10 ms CPU per Worker request, & 128 MB memory. Workers Paid starts at $5/month.
2. [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/):
   Free requires SQLite, with 100,000 requests/day, 13,000 GB-s/day, five million rows read/day,
   100,000 rows written/day, & 5 GB account storage. Free exhaustion fails operations rather than
   automatically charging overages. Alarms & deletes count as row writes; hibernation avoids idle
   duration charges. On Paid, included SQLite storage is 5 GB-month, then $0.20/GB-month; excess
   writes cost $1/million rows & reads $0.001/million rows.
3. [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/):
   SQLite key/value combinations & SQL rows can be up to 2 MB, above this relay’s envelope cap.
4. [Pages Durable Object bindings](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects):
   a Durable Object must be deployed in a separate Worker. The relay uses its own custom domain, so
   Pages needs CSP origins rather than a cross-project binding.
5. [Rate-limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
   only 10- & 60-second windows, approximate per location; this is why hourly admission also lives
   in the singleton.
6. [Turnstile Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/):
   mandatory server validation, five-minute token lifetime, single use, & hostname/action checks.
7. [WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/):
   `acceptWebSocket` & hibernation handlers retain subscriptions across object eviction.
8. [SQLite storage recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/):
   point-in-time recovery can restore data from the past 30 days, which the privacy disclosure &
   takedown procedure must state.
