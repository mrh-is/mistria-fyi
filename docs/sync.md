# Save-driven sync

tl;dr: “Sync from game” watches the save file on the gaming PC, ships a pruned, end-to-end encrypted
copy through a small Cloudflare relay, & lets one paired phone run the importer on it. There are no
logins & no readable player data on a server. This document is the design for implementers; the
tracking epic is #123, each section below names the issues that build it, & the reasons behind the
main forks are in [the decision record](decisions/2026-10-20-save-driven-sync.md).

Status: designed & reviewed, not built. The design survived four review rounds (two cross-model).
Treat each choice as decided; reopen one only with a concrete failure sequence, & record the outcome
in the decision record.

## Why sync

Tabbing between a fullscreen game & a browser on the same PC is not workable, so the tracker is a
second screen on a phone. Progress has to cross from the gaming PC to the phone with no accounts &
no server that can read it. Sync only ever moves a save from the game to one device. Manual ticks
never travel between devices.

## What the probe found

A Windows laptop with Chrome 155 & Edge, on 2026-10-16:

- The folder picker, the file picker, & dragging the folder are all refused with “can’t open this
  folder because it contains system files”. Chromium blocks everything under `%LOCALAPPDATA%`.
- Dragging one `.sav` onto the page works & yields a real file handle. The handle survived the game
  rewriting the file in place, & `FileSystemObserver` exists, so no polling is needed.
- After a reload the browser offered “Allow this time” or “Allow on every visit”.
- The game wrote its save on loading & on sleeping at the end of an in-game day (about 31 real
  minutes later, one data point).
- With the game fullscreen on a single screen, Chrome never reported the tab hidden, & the sleep
  save arrived on time.

Checks still open before the network pieces are built (#130, owner hardware): the “every visit”
grant across a browser restart & in the installed app; early-game & late-game v1.0.8 field presence
(record it in [save-file-format.md](save-file-format.md)); Steam Deck save access; current Firefox
behavior; Android opening the installed app from a scanned URL; & `FileSystemObserver` when the game
replaces the file instead of rewriting it. Record the results in this document & flag any failed
assumption on #123.

## Shape

1. **Setup** (flow still to be designed, #131). Drag your save onto the tracker once. The page shows
   the save folder’s path as copyable text for Explorer. It encourages installing the app & keeping
   its window open, but requires neither. The feature is named for what it does, “Sync from game”.
2. **The PC tab is a courier.** It watches the save, prunes it, encrypts it, & writes it to the
   relay.
3. **The relay holds one encrypted bundle per pairing** until the phone confirms it.
4. **The phone runs the importer** with its own tracker data, on one paired device per PC.
5. **Freshness is visible.** The phone shows when it last synced.

## The courier

Built in #134, in `src/lib/sync/courier.ts`.

- **Watching.** A dropped `.sav` stores its file handle. `FileSystemObserver` bursts are coalesced,
  an “unknown” event triggers a recheck, & a swapped file re-resolves the handle.
- **Pruning.** The courier drops the three sections the importer never needs (`game_stats`,
  `date_photos`, `farm`: 161 KB compressed for a late-game farm, 79 KB for a new one) & keeps the
  save’s own container format, so the phone reuses its parser.
- **Envelope.** The file name, modification time, & `playtime` travel inside the ciphertext, never
  beside it.
- **One courier per profile.** Web Locks allow a single courier per browser profile; a second window
  says “Already syncing in another window”.
- **Errors.** A parse failure after a game update shows an error on the PC.
- **App updates.** A waiting update reloads the courier at its own safe moment, for example right
  after a send (see [App updates](#app-updates)).
- **Firefox** has no usable file handle, so it re-drops or re-picks the save per sync, through the
  same relay & rules.

## The relay

Built in #132, a separate Worker with Durable Objects (they cannot live in a Pages project) with its
own `wrangler.toml`, on Workers Free until usage says otherwise. It is reachable under the site’s
origin or listed in `connect-src` (with `wss:`).

### Slots & sequences

- One slot per pairing. Only the PC holds a write token.
- An upload is accepted only with a higher sequence than the stored one; an identical retry
  succeeds.
- The slot is deleted only when a confirmation names the stored bundle’s sequence & ciphertext hash,
  so a stale confirmation deletes nothing.
- The relay keeps its high-water mark after the slot empties. The phone also rejects any bundle
  whose sequence does not increase.
- `playtime` is not checked at the relay, because new games & older saves legitimately lower it.

### Caps & expiry

- Pairing creation is gated by Turnstile (server-side Siteverify) & capped account-wide (about 50 a
  day) by a singleton object.
- Each pairing caps its own writes (about one a minute, 60 a day). The caps are sized so the worst
  case (about 3,000 uploads & 9,000 Durable Object row writes a day, an estimate) fits Workers
  Free’s 100,000 row writes with room to spare, so no separate budget check exists. Raise the caps
  if usage ever warrants it.
- Bundles are capped at 256 KB.
- The slot empties once the phone confirms, with a 48-hour expiry as the backstop. An expired bundle
  is never served, & its deletion retries.
- A pairing record unseen for 14 days is dropped, & the PC shows “last seen”. “Unpair” on either
  side tells the relay, queued if offline.
- The phone receives bundles over a hibernating WebSocket instead of polling. Persisted state
  survives eviction & deploys.

### Operations

- **Kill switch.** A flag in the singleton object, flipped by an authenticated admin request (a
  dashboard variable would be dropped by the next deploy). “Sync is paused” applies on the next
  request, while confirmations, unpairing, & cleanup still go through. Manual tracking still works.
- **Logging.** Request logging stays off.
- **Takedown.** [takedown.md](takedown.md) gains a relay section.
- **Tests** run the Durable Object in Miniflare. Deploying needs the maintainer’s Cloudflare login.
- **CSP.** The relay’s `wss:` origin must be allowed by the delivered CSP
  (`src/lib/security/csp-directives.ts`). Checking this on a branch preview is a sync acceptance
  criterion, independent of the prerendering work (D1).

## Pairing

Built in #133, in `src/lib/sync/pairing.ts`, with the UI from #131. Exactly one device pairs per PC;
pairing a new device replaces the old one & names the device it replaces.

### The offer

The QR is a URL whose fragment carries a single-use offer: a one-time ID, the PC’s ephemeral P-256
public key, & a random 128-bit secret. The QR expires after a couple of minutes & disappears once
paired. The phone strips the offer from its address bar.

### Handshake

The phone answers through the relay. Both sides mix the secret into the key derivation, & the reply
carries a MAC under it, so not even the relay can sit in the middle.

Version 1 pins the suite, with no negotiation:

- ECDH on P-256 only.
- HKDF-SHA-256, with the secret mixed in.
- HMAC-SHA-256 over the whole handshake.
- AES-GCM with a unique nonce per message, & the protocol version, pairing generation, & sequence as
  authenticated data.

### Stages & generations

- The relay records each offer’s stage (offered, answered, accepted), so either side can retrieve it
  again until the QR expires. The phone shows “Paired” only once the PC accepts.
- Expiry blocks new answers, but an accepted result stays retrievable for the pairing’s life.
- Every pairing has a generation. Tokens, counters, confirmations, & unpairing carry it, so messages
  from an old pairing are ignored.

### Device state & copy

- Pairing keys & counters stay on each device, outside stored progress & backups.
- A “Paired with {device}” toast, “Unpair” on both sides, & a “Don’t show this on stream” hint
  complete the flow.
- On iOS outside the installed app, the page says “Scan this from the tracker app” instead of
  pairing, because Safari’s storage is separate.
- “One PC” means one browser profile. Two profiles are two couriers, & pairing either replaces the
  phone’s pairing; the setup copy says so, & nothing enforces it.

Tests cover a substituted relay key, a replayed offer, & a reply lost across a relay restart.

## The phone

Built in #135, in `src/lib/sync/receiver.ts`, on top of the apply rules (#129) & the single write
path (#127).

- **One tab leads** (Web Locks).
- **It never applies or confirms** while its store is quarantined or in the “newer data” state, &
  never uses manual import’s unlock path. In the newer-data state, “Export backup” returns the
  stored blob verbatim (the choice made in #106), so a blocked phone still gives the player a copy.
- **One write path.** Progress, provenance, resolved diffs, the farm-switch backup, & a “last
  applied” receipt share one storage key. Every writer (auto-save, sync, restore, reset, migration)
  goes through one function (#127), serialized by a Web Lock that re-reads & validates before
  writing. The pagehide flush keeps today’s compare-before-write. The receipt never goes into
  exports or restores.
- **Each apply is one immediate write** through that function. The replay counter advances only
  through that write, & the phone confirms only after reading back exactly what it meant to write.
- **Recomputed questions.** If progress changed while a question waited, the diff is recomputed &
  the question asked again where its effect changed.
- **Crashes.** A crash before the write re-applies the bundle, which stays in the slot until
  confirmed. A crash after it re-confirms on an exact match of generation, sequence, & hash, without
  re-applying.
- **Extraction** returns values, per-field completeness, & diagnostics together, telling
  known-but-untracked IDs from unknown ones (#125).

### Freshness

The phone shows “Last synced from game {time ago}” & learns the typical gap between syncs. When it
opens after an abnormally long gap, a toast says so. There are no push notifications. Describe sync
as best effort until real sessions prove it.

## Applying a bundle

The pure core lives in `src/lib/engine/sync-apply.ts` (#129): given stored progress & an extracted
save, it computes each difference’s policy & the resulting state. Each difference falls into one
policy: apply silently, apply & tell, ask first, or keep local & tell, chosen by a table keyed by
provenance (including `unknown`) & fact kind.

### Provenance

Stored progress gains per-fact provenance (`manual`, `inferred`, `save`) with a timestamp (#126),
through a storage migration (see
[app-architecture.md](app-architecture.md#3-persistence--serialization)).

- This also covers the B4 amendment: “record prerequisites” writes become `inferred`.
- Facts stored before provenance existed get `unknown`, treated like manual ones. A save may add
  them, or agree & promote them to `save`. A disagreeing save asks once per category, not per fact.
- Unticks are stamped manual facts too.
- Backups carry provenance & resolutions; restoring an older backup migrates forward.

### Ordering without clocks

- A manual tick records the `playtime` of the last applied save & beats any save with that
  `playtime` or lower. A newer save wins & tells.
- Within a farm, a lower `playtime` asks.
- Accepting an older save at `playtime` P resets the baseline & re-stamps every manual fact stamped
  above P to P, so ticks survive the rollback itself & the next disagreeing save wins & tells.
  Rollback is supported but rare, so nothing more elaborate.

### Resolved diffs

A memory of resolved diffs makes “keep mine” stick until the save’s value changes. Editing that
field by hand clears it.

### Completeness

- An absent or malformed field is `unknown`, never empty or zero, & `unknown` never replaces
  anything.
- An unrecognized ID or unreadable entry makes its field `unknown` for removals (it may still add),
  & the sync log records the unknown IDs.
- Any level decrease, or a removal of more than a handful of facts in one bundle, goes to “ask
  first” regardless of the table. This doubles as an early warning that a game update renamed
  something.
- Quest states are replaced only for quest kinds the game reliably lists as completed.
- Household facts stay manual until public #6 extracts them (the fields exist in `player`; a married
  save is still needed). They then follow the same rules, breakups & divorce included.

Property & scenario tests cover the rollback, untick, renamed-ID, farm-switch, & pre-provenance
cases.

## Farm identity

The game names saves `game-<number>-<autosave or slot>.sav`, drawing the number at random (31 bits)
when a game starts (`Serialization/Serde/SaveManager.gml`, `LoadState.gml`). Identity is that number
plus `info.creation_version`, parsed tolerantly (#128).

- Names are not identity: players can rename themselves & the farm.
- Manual save slots exist. The courier watches the autosave, & loading a manual save shows up as an
  older save.
- The first bundle onto unidentified progress asks once: “Is this the farm you’ve been tracking?”
- Switching farms automatically keeps a backup of the outgoing farm (“We saved a backup of {old
  farm}”) on the phone beside progress, in the same write as the switch. There is one backup, never
  nested. If the backup cannot be written, the switch does not happen & the phone says why.
- Switching back is a restore. Multi-farm profiles stay later.
- Manual import stores the same identity & shows “last imported {time ago}”. Player & farm names
  stay out of the feedback snapshot.

## Versions

The envelope carries a protocol version, & both sides are strict: the phone accepts only its own
version & otherwise shows “Update the tracker on your PC”, which a reload fixes. App builds do not
matter. (Transfer QR codes, by contrast, bind to the exact app build; see
[transfer-format.md](transfer-format.md).)

## App updates

Updates never reload a page mid-task. The service worker keeps the previous version’s cache until no
page runs that version, so a new version can activate whenever it is ready, & each page reloads at
its own safe moment: when it is not busy (no sync apply, open form, or dialog), or on its next
navigation. Tabs already open at the first release that ships this reload once under the old
behavior, which is acceptable. This amends the update flow recorded in
[the app update detection decision](decisions/2026-10-16-app-update-detection.md) (public #71).

## Diagnostics

Expect iteration from real situations (#137). The feedback form can attach a sync log: app build,
protocol version, game version, recent sync events with `playtime`, which fields were unknown (with
their IDs), & which policy fired. Names are stripped & the farm number is hashed, because feedback
becomes a public issue; a test proves no player or farm name reaches the payload. The game’s own
`log.txt` records every save path & load.

## Privacy

The privacy page splits into “Without sync” (unchanged) & “With sync” (#136). “With sync” states
that it is opt-in; end-to-end encrypted, including against the relay; held until the phone confirms,
or deleted after 48 hours with retries; that Cloudflare processes IP addresses to deliver it & the
app does not log them; that there is no account; & the provider’s 30-day storage recovery, plainly.
Limits stay per pairing, not per IP. The rewrite ships before or with sync, in all locales.

## Fallbacks

- Firefox re-drops or re-picks the save per sync, through the same relay & rules.
- No sync at all means manual check-offs.
- QR transfer is deprecated once sync ships (#138); backup export & restore moves progress to a new
  device. Remove the codec, its tests, & the transfer promise in
  [app-architecture.md](app-architecture.md#7-public-contract), & leave no orphaned messages.

## Build order

1. **Groundwork that needs no network:** the extraction contract (#125), provenance & ordering
   (#126), the single write path (#127), save identity (#128), then the apply rules (#129).
2. **Feasibility & design:** the hardware checks (#130) & the setup UX design (#131).
3. **The network pieces:** the relay (#132), pairing (#133), the courier (#134), the phone receiver
   (#135).
4. **Launch work:** the privacy rewrite (#136) before launch, diagnostics (#137), then deprecating
   QR transfer (#138).
