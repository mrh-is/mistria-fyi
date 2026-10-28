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
no server that can read it. Sync moves saves from the game to one device. The only other thing it
carries is the PC’s stored progress, once, when a phone pairs (see
[Carrying the PC’s progress](#carrying-the-pcs-progress)); check-offs made on the phone never travel
back. Accounts were reconsidered after the setup design review & kept out of v1
([the decision record](decisions/2026-10-28-sync-stay-account-less.md)).

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
grant across a browser restart & in the installed app; Steam Deck save access; current Firefox
behavior; Android opening the installed app from a scanned URL; & `FileSystemObserver` when the game
replaces the file instead of rewriting it. Record the results in this document & flag any failed
assumption on #123. Early- & late-game v1.0.8 field presence is recorded in
[save-file-format.md](save-file-format.md#field-presence-early-vs-late-game-v108): every key the
importer reads is present in both, with early progress as empty lists.

## Shape

1. **Setup** (designed in [sync-setup.md](sync-setup.md), #131). Drag your save onto the tracker
   once. The page shows the save folder’s path as copyable text for Explorer (or the platform’s file
   manager). It encourages installing the app & keeping its window open, but requires neither. Home
   invites with “Get set up” on a PC & “Sync from my PC” on a phone.
2. **The PC tab is a courier.** It watches the save, prunes it, encrypts it, & writes it to the
   relay.
3. **The relay holds one encrypted bundle per pairing** until the phone confirms it.
4. **The phone runs the importer** with its own tracker data, on one paired device per PC.
5. **Freshness is visible.** The phone shows when it last synced.

## The courier

Built in #134. Planned location (not yet created): src/lib/sync/courier.ts.

- **Watching.** A dropped `.sav` stores its file handle. `FileSystemObserver` bursts are coalesced,
  an “unknown” event triggers a recheck, & a swapped file re-resolves the handle.
- **Pruning.** The courier drops the three sections the importer never needs (`game_stats`,
  `date_photos`, `farm`) & keeps the save’s own container format, so the phone reuses its parser.
  The epic gives the compressed size of the pruned save: about 161 KB for a late-game farm & 79 KB
  for a new one (the full late-game save is about 290 KB compressed, per
  [save-file-format.md](save-file-format.md#size-profile-v102-late-game-save)). A 2026-10-22
  measurement on v1.0.8 autosaves gave 181,618 bytes (177 KiB) for a late-game farm, from 340,523
  (333 KiB), & 84,339 bytes (82 KiB) for an early one, from 109,379 (107 KiB). The method: inflate
  the save, drop the three entries, rebuild the u64 container (entry count, then each name length,
  name, data length, & data) with the remaining entries in their original order, & compress it with
  Node’s `zlib.deflateSync` at the default level. Confirm the figures on the courier’s own pruned
  container, before encryption; the relay’s 256 KB bundle cap sits above them, with less headroom
  for a late-game farm than the epic’s figure suggests.
- **Envelope.** The file name, modification time, & `playtime` travel inside the ciphertext, never
  beside it.
- **One courier per profile.** Web Locks allow a single courier per browser profile; a second tab
  says “Another tab’s already the relay”. A self-updating tracker holds the same lock, so its local
  writer & a relay never run at once (see [Roles & transitions](#roles--transitions)).
- **Errors.** A parse failure after a game update shows an error on the PC.
- **App updates.** A waiting update reloads the courier at its own safe moment, for example right
  after a send (see [App updates](#app-updates)).
- **Firefox** is expected to need the save re-dropped or re-picked per sync, through the same relay
  & rules; its current behavior is still to be confirmed (#130).

## The relay

Built in #132, a separate Worker with Durable Objects (they cannot live in a Pages project) with its
own `wrangler.toml`, in a directory that is not yet decided (relay/ or workers/relay/, #132), on
Workers Free until usage says otherwise. It is reachable under the site’s origin or listed in
`connect-src` (with `wss:`).

### Slots & sequences

- One slot per pairing. Only the PC holds a write token.
- An upload is accepted only with a higher sequence than the stored one; an identical retry
  succeeds.
- The slot is deleted only when a confirmation names the stored bundle’s sequence & ciphertext hash,
  so a stale confirmation deletes nothing.
- The relay keeps its high-water mark after the slot empties. The phone also rejects any bundle
  whose sequence does not increase.
- `playtime` is not checked at the relay, because new games & older saves legitimately lower it.
- **Delivery has three states,** & the PC’s copy names the one it knows. _Uploaded_ is a bundle in
  the slot. _Received_ is the phone reporting that it holds that sequence & is waiting on the
  player: a question, or a blocked store. _Applied_ is the confirmation, which the relay records as
  the last applied sequence before it empties the slot. So an empty slot tells an applied bundle
  from an expired one, & “Last sent” never claims more than the PC knows.

### Caps & expiry

- **Offers & pairings are capped separately,** because the PC mints an offer each time the player
  reveals a code, & “No, it doesn’t” or a stream viewer racing codes spends more. Each mint redeems
  its own Turnstile token (server-side Siteverify), run invisibly when the player reveals a code or
  asks for a new one, so no token ages past its five-minute validity. A Cloudflare rate-limiting
  rule allows a few mints per IP address in 10 minutes; Cloudflare applies it at its edge, & the
  relay never sees, logs, or stores the address. Minting is capped account-wide at about 2,000 a
  day. A failed challenge, a client over its rate (“That’s a lot of codes”), & a full day are PC
  states of their own, with no code shown.
- **An offer reserves its pairing.** Accepted pairings, the expensive part, are capped account-wide
  at about 50 a day by a singleton object. Each unexpired offer holds a reservation against that
  cap, so an offer that minted can always be accepted, & the reservation lapses with the offer.
  Minting fails as “Pairing is full for today” once accepted pairings & reservations reach the cap.
- **A daily write budget bounds the rest.** The daily cap doesn’t bound live pairings, since a
  pairing lives until it lapses. Each pairing object reports its Durable Object row writes to the
  singleton in batches (every 20 writes, or when it hibernates), & the singleton keeps the day’s
  approximate total. Past 80% of Workers Free’s 100,000 row writes, pairing objects refuse new
  uploads with a retry hint, & the PC shows “Sync’s full for today” & retries as the hint says.
  Confirmations, unpairing, accepting offers already minted, & cleanup keep the remaining 20%.
- Each pairing also caps its own writes: about one upload a minute & 60 a day, at about three row
  writes each. A typical pairing sends far less (a save per in-game day, a few sessions a week), so
  the budget covers roughly 2,000 active pairings (an estimate). Move to Workers Paid or raise the
  caps if usage approaches it.
- Bundles are capped at 256 KB.
- The slot empties once the phone confirms, with a 48-hour expiry as the backstop. An expired bundle
  is never served, & its deletion retries. A courier that sees its latest bundle expired unapplied
  re-uploads it as a fresh encryption at the next sequence, while the phone has checked in within
  the last 14 days. After that it stops re-uploading & shows “No word from your {device} since
  {calendarDate}”, & resumes when the phone checks in. The game writes a save on loading anyway, so
  the next session resends.
- A pairing lapses 90 days after the phone last checked in. Only the phone’s requests count, so a
  relay left running can’t keep a pairing alive by itself, & the relay holds no ciphertext for a
  phone that’s gone. A record is a few hundred bytes, so a long holiday doesn’t force a re-pair. The
  PC shows when the phone last checked in. “Unpair” on either side tells the relay, queued if
  offline.
- The phone receives bundles over a hibernating WebSocket instead of polling. Persisted state
  survives eviction & deploys.

### Operations

- **Kill switch.** A flag in the singleton object, flipped by an authenticated admin request (a
  dashboard variable would be dropped by the next deploy). “Sync is taking a break” applies on the
  next request, while confirmations, unpairing, & cleanup still go through. Manual tracking still
  works. During setup, a paused relay refuses new offers & answers, & both devices show “Sync is
  taking a break” in place of the code. A relay that can’t be reached, or answers with a server
  error, shows “We couldn’t reach sync” with “Try again”.
- **Logging.** Request logging stays off.
- **Takedown.** [takedown.md](takedown.md) gains a relay section.
- **Tests** run the Durable Object in Miniflare. Deploying needs the maintainer’s Cloudflare login.
- **CSP.** The relay’s `wss:` origin must be allowed by the delivered CSP
  (`src/lib/security/csp-directives.ts`). Checking this on a branch preview is a sync acceptance
  criterion, independent of the prerendering spike (#108) & its rollout (#109).

## Pairing

Built in #133. Planned location (not yet created): src/lib/sync/pairing.ts. The UI is in
[sync-setup.md](sync-setup.md) (#131). Exactly one device pairs per PC; pairing a new device
replaces the old one & names the device it replaces.

### The offer

The QR is a URL whose fragment carries a single-use offer: a one-time ID, the PC’s ephemeral P-256
public key, & a random 128-bit secret. The QR starts covered; the PC mints the offer only when the
player reveals it, so a covered code never counts against the pairing cap. Hiding & showing it again
keeps the same offer & countdown. The offer expires after a couple of minutes & disappears once
paired. The phone strips the offer from its address bar. A receiver that can’t parse an offer (a
truncated or mangled link) contacts nothing & says “That link doesn’t look right”, with scanning &
pasting still offered.

A revealed code also offers “Copy link”, the same URL as text, for a computer with no camera to aim
(#131). The player carries it across however they like & opens or pastes it there. It is answered
like a Camera-opened URL, & the six-digit match guards it the same way, so a link that leaks in a
chat log is no worse than a QR shown on stream. Copying the link extends the unanswered offer to 10
minutes, since carrying a link takes longer than aiming a camera, & the countdown beside “Copy link”
shows the new time. The QR on screen is the same offer, so the longer window is guarded by the same
match.

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
  again within that stage’s window: an unanswered offer until the QR expires, an answered offer
  until its confirmation deadline, & an accepted result for the pairing’s life. The phone shows
  “Paired” only once the PC accepts.
- **Accepting takes a person.** Once a device answers, the PC & that device each show the same
  six-digit code derived from the handshake transcript, & the player confirms the match on the PC.
  “No, it doesn’t” discards the offer & shows a new covered code; revealing it mints a fresh offer.
  See [the decision record](decisions/2026-10-27-sync-pairing-confirm.md).
- **A spent offer says so.** A device that answers an offer someone else already answered gets
  “Someone else got to this code first”, & no code to match, so the player rejects on the PC.
- **Expiry** blocks new answers. An answered offer stays confirmable for two minutes after the
  answer, even past the QR’s own expiry; after that both sides say to start over. An accepted result
  stays retrievable for the pairing’s life.
- Every pairing has a generation. Tokens, counters, confirmations, & unpairing carry it, so messages
  from an old pairing are ignored.

### Carrying the PC’s progress

A PC that already holds progress can send it once when it pairs, so a phone starts with everything
the player checked off on the PC, not only what the save contains (#131,
[the decision record](decisions/2026-10-28-sync-carry-pc-progress.md)). “Send this PC’s progress
too” is checked by default on the PC’s first pairing & unchecked when it re-pairs (except after “My
old phone’s gone”, which checks it), since a relay’s stored progress stops changing once it relays.
The phone takes the progress whole or not at all; nothing merges.

- **Payload.** The PC’s stored progress in the restorable backup format, with provenance,
  resolutions, & farm identity, compressed, then encrypted like any bundle & marked as progress
  inside the ciphertext. The farm-switch backup stays behind. The PC freezes the payload when it
  accepts the match & keeps it until the transfer ends, so every upload carries the same progress.
- **Announced.** The PC’s accept message says whether progress may follow & names it with a transfer
  ID, & both devices persist the ID across reloads.
- **The phone chooses at pairing.** An empty phone takes the progress without asking. A phone with
  progress asks right after “You’re paired!”, while the player is holding it: “Use my PC’s”, which
  replaces this phone’s progress & keeps it as the farm-switch backup, or “Keep this phone’s”, which
  declines the transfer. The answer is stored with the transfer ID & applies to nothing else. A
  quarantined or newer-data phone never gets this far (see [The phone](#the-phone)).
- **Farm first, on the PC.** The PC sends its progress only after the player connects the save, &
  only when its stored farm matches the save’s, through `compareFarms`. Unidentified stored progress
  asks on the PC, “Is this the farm you’ve been tracking?”, with both farms side by side. A
  different farm, or “No”, skips the transfer, sends nothing, & says “This PC’s progress stays
  here”. So carried progress is always the farm the game is playing, & the first save after a carry
  never switches farms.
- **Order.** It is the pairing’s first bundle, & the courier holds saves until the transfer ends
  (see [Slots & sequences](#slots--sequences)). Meanwhile it keeps only the latest save & uploads it
  once the barrier lifts, within the one-a-minute cap. The PC shows the barrier (“Sending your
  progress”, then “Waiting on your {device}…”) with “Skip it”, & so does the relay dashboard once
  setup closes.
- **Ending the transfer.** The relay records one terminal state per transfer ID, whichever comes
  first: _claimed_, _declined_, or _skipped_. The phone claims the transfer before applying the
  bundle & applies only if the claim succeeds; “Keep this phone’s” declines it; “Skip it”, a farm
  the PC keeps back, or a phone reporting it can’t read the bundle, skips it. Once a transfer is
  claimed, “Skip it” is refused & the PC says “Your {device} is already using it”. Once it is
  declined or skipped, the slot empties, a later claim is refused, & a phone waiting on it (empty,
  or one that chose “Use my PC’s”) keeps what it has & says “Your PC didn’t send its progress”. The
  barrier lifts when the transfer is declined, skipped, or applied.
- **Exactly once.** The phone records the transfer ID as applied in the same write as the progress,
  in the “last applied” receipt (see [The phone](#the-phone)). A later envelope naming an applied
  transfer ID is confirmed without applying. A crash after the claim fetches the bundle again, since
  a claim lets that pairing fetch until it confirms. If the bundle expires unclaimed, the PC
  re-uploads the frozen payload as a fresh encryption at the next sequence, under the same transfer
  ID.
- **Versions.** The backup format migrates forward, so a newer phone reads an older PC’s progress.
  An older phone that can’t read it says “Update this phone” & skips the transfer, so the PC’s
  barrier lifts (see [Versions](#versions)).
- **Once.** It travels only when the box is checked. The PC’s own stored progress stays untouched
  while it relays.
- **Size.** A backup is mostly ID lists, so it compresses well below the 256 KB cap. Measuring a
  compressed late-game backup is a #133 acceptance criterion; if one nears the cap, the bundle
  splits under the same transfer ID.

Tests cover an empty phone, a phone that declines, a phone that uses the PC’s progress, a skip that
races a claim in both orders, a crash between claim & confirm, a re-upload after expiry that must
not apply twice, unidentified & different stored farms on the PC, & a phone on an older backup
format.

### New devices

A new phone, or the move from an iOS browser to the installed app, carries progress by backup &
restore: export a backup on the old copy & restore it on the new one, which is empty, so restore
replaces nothing (#131, [sync-setup.md](sync-setup.md#a-new-phone)). Then the new copy pairs,
replacing the old pairing. A player whose old phone is gone pairs with “Send this PC’s progress too”
checked, which carries the PC’s progress from before it started relaying. A one-time handoff over
the relay is deferred to #269
([the decision record](decisions/2026-10-28-sync-progress-handoff.md)).

### Device state & copy

- Pairing keys & counters stay on each device, outside stored progress & backups.
- A “Paired with your {device}” summary, “Unpair” on both sides, & a “Streaming? Keep this off
  screen.” hint complete the flow.
- On iOS & iPadOS, a browser pairs like any phone, even though its storage is apart from the
  installed app. Moving to the app later restores a backup & pairs again from the app, replacing the
  browser’s pairing (#131, [sync-setup.md](sync-setup.md#moving-to-the-installed-app-on-iphone)).
  The system Camera app opens codes in the default browser, never the installed app, so an offer
  that arrives by URL in an iOS browser asks before answering: pair this browser, or open the
  installed tracker & scan there. Pairing the browser stays a deliberate choice.
- Device labels derive locally: a short model name where the browser reports one (“Pixel 8”), else
  the platform (“iPhone”), & on iOS & iPadOS a browser adds its name (“Safari on iPhone”), so the PC
  can tell a browser’s pairing from the installed app’s.
- “One PC” means one browser profile. Two profiles are two couriers, & pairing either replaces the
  phone’s pairing; the setup copy says so, & nothing enforces it.

Tests cover a substituted relay key, a replayed offer, a spent offer answered again, a mismatched
confirmation code, a reply lost across a relay restart, & a reload just after answering that spans
the QR’s expiry.

## Roles & transitions

A PC browser is a tracker, a self-updating tracker, or a relay (the UX is in
[sync-setup.md](sync-setup.md)). The role lives in device state, outside progress & backups, & tabs
learn of a change through a `BroadcastChannel` & re-read it on focus.

- **One writer.** The self-updating tracker & the relay both hold the courier’s Web Lock, so only
  one tab watches the save. Other tabs of a relay are read-only, like the relay itself.
- **Tracker or self-updating tracker → relay.** The commit point is the PC’s acceptance of the
  match. Until then nothing changes, & Back, a reload, or a closed tab leaves the old role in place.
  At acceptance the lock holder stops its local writer, flushes any pending write through the one
  write path, & only then records the relay role & starts sending.
- **Recovering an interrupted switch.** Before accepting, the PC records the pending switch (the
  offer ID & the new role) in device state. On load, a pending switch whose offer the relay reports
  accepted finishes the steps above; any other answer clears it & keeps the old role.
- **Fencing other tabs.** The one write path checks the role inside its Web Lock, so a write another
  tab queued before the switch, & runs after it, is refused instead of landing in the relay’s frozen
  progress. That tab learns the new role & reloads read-only.
- **Self-updating tracker → tracker** (“Stop updating”). The watcher releases the lock & forgets the
  file handle; stored progress stays as it is.
- **Relay → tracker** (“Unpair”). The PC stops sending, records the tracker role, & shows its stored
  progress as it was before relaying, which may be months old. It offers “Fill in from your latest
  save”, a manual import of the watched save through the normal flow.
- **Relay → self-updating tracker** goes through unpairing: the PC becomes a tracker, then “On this
  PC” makes it self-updating, & the first watched save applies onto the progress from before
  relaying through the apply rules, as for any tracker.
- **What a relay hides.** Restore, manual import, reset, & the Danger Zone act on stored progress
  the relay doesn’t show, so Data hides them while relaying & says to unpair first; the Import card
  shows only the relay’s save. “Export backup” stays & says it holds the progress from before
  relaying.
- **A relay doesn’t answer offers.** A pairing link opened or pasted on a relay says to unpair
  first, so a relay never becomes the receiving side.

Tests cover a transition interrupted before acceptance & one interrupted between the relay’s
acceptance & the local role write, a second tab writing while the first becomes the relay, “Stop
updating”, a relay opening a pairing link, & unpairing with a pending mirror.

## The phone

Built in #135. Planned location (not yet created): src/lib/sync/receiver.ts. It sits on top of the
apply rules (#129) & the single write path (#127).

- **One tab leads** (Web Locks).
- **It never applies or confirms** while its store is quarantined or in the “newer data” state, &
  never uses manual import’s unlock path. In the newer-data state, “Export backup” returns the
  stored blob verbatim (the choice in PR #158 for #106, provisional until it merges), so a blocked
  phone still gives the player a copy. A phone in either state doesn’t answer an offer: setup shows
  the state & sends the player to Data before pairing, so a pairing never starts against a store
  that can’t take its first bundle. A paired phone whose store becomes blocked later reports each
  bundle as received but blocked, so the PC says “Your {device} needs a look in Data”, & the phone
  shows a field note sending the player there.
- **Questions** use the same tag dialog during setup as in any later sync. While one waits, the
  phone reports the bundle as received (see [Slots & sequences](#slots--sequences)), & the PC says
  “Waiting on your {device}…” instead of claiming success. Cancelling a question leaves the bundle
  unapplied in the slot until the player answers or a newer save replaces it; the sync button keeps
  its dot, & the question opens again the next time the tracker does.
- **One write path.** Progress, provenance, resolved diffs, the farm-switch backup, & a “last
  applied” receipt (which also lists applied transfer IDs) share one storage key. Every writer
  (auto-save, sync, restore, reset, migration) goes through one function (#127), serialized by a Web
  Lock that re-reads & validates before writing. The pagehide flush keeps today’s
  compare-before-write. The receipt never goes into exports or restores.
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

The phone’s toolbar sync button opens a panel saying when the last save came, & the phone learns the
typical gap between syncs. When it opens after an abnormally long gap, the button gets a dot & a
slip (“No saves in 5 days”). There are no push notifications. Describe sync as best effort until
real sessions prove it.

## Applying a bundle

The pure core is `applySync` in `src/lib/engine/sync-apply.ts` (#129). Given stored progress (its
facts, history, & farm), an extracted save, & the answers so far, it returns either the questions
still open or each difference’s policy & the resulting state. Each difference falls into one policy:
apply silently, apply & tell, ask first, or keep local & tell, chosen by `POLICY_TABLE`, keyed by
provenance (`manual`, `inferred`, `save`, `unknown`, or none) & fact kind (tick, level, quest) in
each direction, then by the guardrails below. The receiver (#135) asks the questions, calls it again
with the answers, & writes the result in one write. See
[the decision record](decisions/2026-10-21-sync-apply-rules.md).

### Questions

Questions come in stages, because each answer changes what follows: whether unidentified progress is
this farm, then whether to roll back to an older save, then every field’s questions at once. Nothing
a question covers changes until all are answered. Fact questions are grouped by field & reason
(`local-disagrees`, `level-decrease`, `many-removals`), and each question’s ID names exactly the
changes it covers, so a question whose effect changed while it waited is asked again. “Keep mine”
records a resolution per fact; an answer that doesn’t fit its question counts as unanswered.

### The table

- A save or inference is superseded by the save: an addition applies silently, a removal applies &
  tells.
- A manual edit is ordered by `playtime` (below). One with no playtime to order by (made before any
  save was applied, or against a save whose playtime couldn’t be read) asks.
- An `unknown` fact lets the save add a fact still at its default & is promoted to `save` when the
  save agrees. Replacing an existing value (raising a level, advancing a quest), removing, or
  lowering asks, once per field.

### Provenance

Stored progress records per-fact provenance (`manual`, `inferred`, `save`, `unknown`) with the
`playtime` of the last applied save (#126), added by storage version 3 (see
[app-architecture.md](app-architecture.md#provenance)).

- “Record prerequisites” writes are `inferred` (#126).
- Facts stored before provenance existed get `unknown`, treated like manual ones. A save may add
  them, or agree & promote them to `save`. A disagreeing save asks once per category, not per fact.
- Unticks are stamped manual facts too.
- Backups carry provenance & resolutions; restoring an older backup migrates forward.

### Ordering without clocks

- A manual tick records the `playtime` of the last applied save & beats any save with that
  `playtime` or lower. A newer save wins & tells.
- Within a farm, a lower `playtime` asks. Keeping current progress applies nothing from that save.
- A save whose `playtime` couldn’t be read can’t be ordered: it doesn’t ask as an older save, but
  every manual edit it disagrees with asks, & the baseline stays where it was.
- Accepting an older save at `playtime` P resets the baseline & re-stamps every manual fact stamped
  above P to P, so ticks survive the rollback itself & the next disagreeing save wins & tells.
  Rollback is supported but rare, so nothing more elaborate.

### Resolved diffs

A memory of resolved diffs makes “keep mine” stick until the save’s value changes. Editing that
field by hand clears it. A complete field also lapses resolutions for facts it reports at their
default, so true, then false, then true again asks again.

### Completeness

- An absent or malformed field is `unknown`, never empty or zero, & `unknown` never replaces
  anything: an absent field is skipped, & an `unknown` field only adds or raises.
- An unrecognized ID or unreadable entry makes its field `unknown` for removals (it may still add),
  & the result lists the unknown IDs by field for the sync log.
- Any level decrease (hearts, skills, the mine floor, renown, the reached season), or a removal of
  more than a handful of facts in one bundle (`REMOVAL_HANDFUL`, 5), goes to “ask first” regardless
  of the table. This doubles as an early warning that a game update renamed something. A manual
  level that beats the save stays as it is without asking.
- Quest states are replaced (lowered by a complete save) only for quest kinds the game reliably
  lists as completed, per `QUEST_KINDS_LISTED_AS_COMPLETED`; other kinds only advance. In v1.0.8
  every tracked kind qualifies: `QuestLog.complete` is the only way into `completed_quests` & out of
  `active_quests`, & a late-game save’s `quest_<id>_complete` facts match its list for every kind.
- Household facts stay manual in sync. The importer extracts relationships, the break-ups setting, &
  the child choice (public #6), & a manual import merges them through `mergeHousehold`, but sync
  doesn’t compare them yet, & pregnancy quests follow the household. Bringing them under the same
  rules, including engagement break-ups, is follow-up work. The v1.0.8 game has no divorce flow.

Property & scenario tests (`sync-apply.test.ts`) cover the rollback, untick, renamed-ID,
farm-switch, & pre-provenance cases.

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
  `compareFarms` (`src/lib/engine/save-identity.ts`) decides same, different, or unidentified; a
  creation version only one side could read doesn’t make farms differ. `applySync` returns the
  outgoing state as `farmSwitch.backup` & starts the new farm from the receiver’s fresh state.
  `serializeFarmSwitch` (`src/lib/stores/progress-storage.ts`) writes the new farm & the backup into
  one stored document, the backup under `local.farmSwitchBackup` as `{ backup, farmName }` in the
  restorable backup format, replacing any earlier one; it returns `null` when the backup wouldn’t
  restore, & the switch doesn’t happen.
- Switching back is a restore. Backup & Restore in Data offers the farm-switch backup by name
  (“Backup of {farm}, from {calendarDate}”), & a switch that would replace an existing backup says
  so first; #135 designs & builds both. Multi-farm profiles stay later.
- Manual import stores the same identity & shows “last imported {time ago}”. Player & farm names
  stay out of the feedback snapshot.

## Versions

The envelope carries a protocol version, & both sides are strict: each accepts only its own. App
builds do not matter. Two versions can disagree, & the message names whichever side is behind:

- **Protocol.** The offer carries the PC’s protocol version. A phone with a different one doesn’t
  answer, so a working pairing is never replaced by one that can’t sync. A lower PC version shows
  “Update the tracker on your PC”; a lower phone version shows “Update this phone”. Each is a
  reload.
- **Backup format,** for carried progress only. Older formats migrate forward on the phone; a format
  newer than the phone knows says “Update this phone” & skips the transfer, so the PC’s barrier
  lifts. (Transfer QR codes, by contrast, bind to the exact app build; see
  [transfer-format.md](transfer-format.md).)

## App updates

Updates never reload a page mid-task. The service worker keeps the previous version’s cache until no
page runs that version, so a new version can activate whenever it is ready, & each page reloads at
its own safe moment: when it is not busy (no sync apply, open form, or dialog), or on its next
navigation. Tabs already open at the first release that ships this reload once under the old
behavior, which is acceptable.

This reverses today’s consent-based update flow, in which a “Refresh” toast waits for the player to
accept the waiting worker (public #71, recorded in
[the app update detection decision](decisions/2026-10-16-app-update-detection.md)). The change is
built in #111, & #111’s PR is the one that supersedes that decision record & updates
pwa-verification.md & the Public contract section of
[app-architecture.md](app-architecture.md#7-public-contract). This document does not edit them.

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
Limits are per pairing, plus one Cloudflare rate-limiting rule on minting pairing codes, which
counts by IP address at Cloudflare’s edge; the relay never sees, logs, or stores the address. The
rewrite ships before or with sync, in all locales.

## Fallbacks

- Firefox is expected to need the save re-dropped or re-picked per sync, through the same relay &
  rules (to be confirmed in #130).
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
