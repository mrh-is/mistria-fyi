# Save-driven sync

tl;dr: The gaming PC watches the game’s save file & shares each new save, pruned & end-to-end
encrypted, through a small Cloudflare relay. Any device that opens the PC’s follow link follows the
save: it runs the importer on each one with its own tracker data. Only the save travels; check-offs
stay on the device where they were made. There are no logins & no readable player data on a server.
This document is the design for implementers; the tracking epic is #123, each section below names
the issues that build it, & the reasons behind the main forks are in
[the save-driven sync record](decisions/2026-10-20-save-driven-sync.md) &
[the follow-the-save record](decisions/2026-10-28-sync-follow-the-save.md). The setup journey,
screens, & copy are in [sync-setup.md](sync-setup.md).

Status: designed, not built. Following replaced the earlier pairing design (#251) on 2026-10-28.
Treat each choice as decided; reopen one only with a concrete failure sequence, & record the outcome
in a decision record.

## Why sync

Tabbing between a fullscreen game & a browser on the same PC is not workable, so the tracker is a
second screen on a phone. Progress has to cross from the gaming PC to the phone with no accounts &
no server that can read it. Sync only ever moves the game’s save, to every device that follows it.
Check-offs made by hand never travel between devices, so followers never need to agree with each
other.

## What the probe found

A Windows laptop with Chrome 155 & Edge, on 2026-10-16:

- The folder picker, the file picker, & dragging the folder are all refused with “can’t open this
  folder because it contains system files”. Chromium blocks everything under `%LOCALAPPDATA%`.
- Dragging one `.sav` onto the page works & yields a real file handle. The handle survived the game
  saving, & `FileSystemObserver` exists.
- After a reload the browser offered “Allow this time” or “Allow on every visit”.
- The game wrote its save on loading & on sleeping at the end of an in-game day (about 31 real
  minutes later, one data point).
- With the game fullscreen on a single screen, Chrome never reported the tab hidden, & the sleep
  save arrived on time.

The gaming PC with Chrome 156, Edge 156, & Firefox 159, & an iPhone on iOS 18.7, on 2026-10-31
(#130, through the probe in PR #239):

- **The “every visit” grant survives a browser restart.** In a tab, a handle granted with “Allow on
  every visit” read on load with no prompt after Chrome quit completely, & likewise in Edge; no
  browser process was left running either time. In the installed app, Chrome & Edge both read the
  handle on load with no prompt after the browser quit completely & the app was relaunched.
- **The installed app needed no prompt.** After the site’s permissions were reset & the handle
  forgotten, a save dropped into the newly installed app read as `granted` when the app reopened, in
  both Chrome & Edge, where `prompt` was expected. The probe can’t tell whether the reset left the
  tab’s grant in place or the app kept the drop’s grant.
- **Pasting is a keyboard path to the live save.** In Chrome, selecting the autosave in File
  Explorer, pressing Ctrl+C, & pressing Ctrl+V on the page yields a real file handle, & the observer
  watches it. Typing the save folder into the file picker’s “File name” box is refused with “can’t
  open files in this folder because it contains system files”, & typing the autosave’s full path
  opens Windows’s “Select an app to open this .sav file” dialog instead. Pasting wasn’t tried in
  Edge.
- **The game replaces its save rather than rewriting it.** The save at the end of the day arrived as
  an `appeared` event for the file, not `modified`, & the held handle read the new save at once. The
  observer kept running afterward. The event arrived while the game was fullscreen in front of the
  installed app’s window.
- **Loading the farm didn’t write the save this time.** No event & no change seen by the probe’s
  10-second poll came on loading; the only write came about 22 minutes after watching began, when
  the day ended. The 2026-10-16 run saw a write on loading.
- **A file that disappears stops the observer.** Renaming the autosave away gave `disappeared`, then
  `errored`, & the observer reported nothing after that, including the file’s return. The handle
  read the file again as soon as it was back under its name, with no new grant.
- **Firefox gives no handles, but its picker opens the save folder.** It has no drop handles, no
  file picker API, & no `FileSystemObserver`, so a drop or a pick yields a `File` only. Its file
  input opened the save folder from a typed path & picked the live autosave, so Firefox needs no
  Desktop copy. A reload drops the held file, so the save is dropped or picked again each session.
- **Firefox’s held file reads new contents under old metadata.** After the game saved, reading the
  held `File` again gave the new save’s contents (its checksum matched a fresh pick) but still
  reported the size & modification time from when it was picked. One data point: only a read can
  show a change there.
- **An iOS Camera scan opens the default browser with the fragment intact.** With Firefox as the
  default browser, the Camera opened the scanned link in a Firefox tab, with the fragment & no
  referrer.
- **The home screen app’s scanner works.** In the tracker added to the home screen from Safari,
  “Scan the code” opened the camera & read a code, then said that link wasn’t a follow link, as
  expected for the probe’s link.

Two checks wait for hardware: Android opening the installed app from a scanned URL (#341), & Steam
Deck save access, the SD card, & Flatpak Steam (#238). Launch doesn’t wait for them (see
[the decision record](decisions/2026-10-31-courier-probe-findings.md)): a failure there changes
which device or browser a player is told to use, not the courier, relay, or envelope. Record the
results in this document & flag any failed assumption on #123. Early- & late-game v1.0.8 field
presence is recorded in
[save-file-format.md](save-file-format.md#field-presence-early-vs-late-game-v108): every key the
importer reads is present in both, with early progress as empty lists.

## Shape

1. **Setup** (#131, [sync-setup.md](sync-setup.md)). Drag your save onto the tracker on the PC once.
   The page shows the save folder’s path as copyable text for Explorer, applies the save to the PC’s
   own tracker, & offers to share it: “Show code” reveals the follow link as a QR code (player copy
   calls it a code), & “Copy link” copies it. Opening the link on another device follows the save.
   The page encourages installing the app & keeping its window open, but requires neither.
2. **The PC is a courier & a tracker.** It watches the save, prunes it, encrypts it, & uploads it, &
   its own tracker applies the same save locally.
3. **The relay holds the latest encrypted save per link,** for any number of followers.
4. **Each follower runs the importer** with its own tracker data.
5. **Freshness is visible.** A follower shows when the last save came.

## The courier

Built in #134. Planned location (not yet created): src/lib/sync/courier.ts.

- **Watching.** A dropped or pasted `.sav` stores its file handle. The game replaces its save rather
  than rewriting it (see [What the probe found](#what-the-probe-found)), so an `appeared` record for
  the watched file counts as a change, like `modified`. Bursts of records are coalesced into one
  read, & an `unknown` record triggers a recheck. A `disappeared` record changes nothing by itself:
  the courier keeps its observer & waits for the file to come back under its name. An `errored`
  record ends that observer for good, so the courier starts a new one at the next successful read.
  The held handle read the replacement directly in the probe, so nothing re-resolves it.
- **The backstop poll.** While watching, the courier checks the file once a minute & reads it when
  its size or modification time differs from the last successful read. That catches what an observer
  misses, including the gap after `errored`. A read’s hash, not its metadata, decides whether the
  save changed.
- **A missing file.** A read that finds no file stays silent & waits for the next poll, since the
  game’s replacement leaves a brief gap. After two failed polls in a row, the PC shows the
  moved-file notice (`sync_moved_*`); the next successful read clears it & starts a new observer.
  Permission loss (`NotAllowedError`) shows the access-lost notice at once instead.
- **Pruning.** The courier drops the three sections the importer never needs (`game_stats`,
  `date_photos`, `farm`) & keeps the save’s own container format, so each follower reuses its
  parser. The epic gives the compressed size of the pruned save: about 161 KB for a late-game farm &
  79 KB for a new one (the full late-game save is about 290 KB compressed, per
  [save-file-format.md](save-file-format.md#size-profile-v102-late-game-save)). A 2026-10-22
  measurement on v1.0.8 autosaves gave 181,618 bytes (177 KiB) for a late-game farm, from 340,523
  (333 KiB), & 84,339 bytes (82 KiB) for an early one, from 109,379 (107 KiB). The method: inflate
  the save, drop the three entries, rebuild the u64 container (entry count, then each name length,
  name, data length, & data) with the remaining entries in their original order, & compress it with
  Node’s `zlib.deflateSync` at the default level. Confirm the figures on the courier’s own pruned
  container, before encryption; the relay’s 256 KB envelope cap sits above them, with less headroom
  for a late-game farm than the epic’s figure suggests.
- **Envelope.** The file name, modification time, & `playtime` travel inside the ciphertext, never
  beside it. The protocol version & a counter travel beside it as authenticated data with the
  mailbox ID (see [The follow link](#the-follow-link)), so the relay can order uploads. The counter
  rises with each upload & never resets, even across new codes.
- **Sharing starts with the code.** The first “Show code” or “Copy link” creates the link’s mailbox,
  & the code appears only once creation succeeds, so nobody can hold a code whose mailbox someone
  else could claim. A create on an ID that already exists under the same token counts as success,
  which covers a lost response. One under another token means the PC silently makes a fresh key,
  since nobody has seen the code yet. A failed create keeps the code hidden & says why
  (`sync_unreachable_*`, `sync_paused_setup`, `sync_too_many`). A wrong file, or “No thanks, I’ll
  track here”, creates nothing.
- **Uploading.** Once sharing, the courier uploads every save it reads & can prune, whatever its own
  tracker does with it: a question waiting behind the fullscreen game, a quarantined or newer-data
  store, or an apply that failed never holds an upload back. A save it can’t prune uploads nothing &
  shows the PC’s error. It also reads the current save when it starts (loading the farm doesn’t
  always write it) & when it shows the code, & uploads it if its hash differs from the last upload
  or the mailbox answers “empty”, so an expired envelope fills again even when the save hasn’t
  changed, & a tracker update after a game update catches up without waiting for the game to save.
  Nothing waits for a follower, so a device that follows later gets the latest save straight away.
- **Applying here.** The PC’s own tracker applies each save the courier reads, through the same
  receiver path as a follower (see [Followers](#followers)) but without the relay, skipping a save
  whose hash matches its receipt. Check-offs on the PC stay on the PC, like any device’s.
- **One courier per profile.** Web Locks allow a single courier per browser profile; a second window
  says “Your save file is already syncing in another window”.
- **Errors.** A parse failure after a game update shows an error on the PC.
- **App updates.** A waiting update reloads the courier at its own safe moment, for example right
  after an upload (see [App updates](#app-updates)).
- **Firefox** gives no handles, so the save is dropped or picked again each session; each one
  uploads & applies like a watched change. Its file input opens the save folder from a typed path &
  picks the live autosave, so Firefox needs no Desktop copy. A held `File` keeps its old size &
  modification time, so the courier never polls one (see
  [What the probe found](#what-the-probe-found)).

## The relay

Built in #132, a separate Worker with SQLite-backed Durable Objects (they cannot live in a Pages
project), configured in `relay/wrangler.toml`, on Workers Free until usage says otherwise. Its
planned origin, `relay.mistria.fyi`, is listed in `connect-src` for HTTPS & WSS. The
[wire contract & launch steps](../relay/README.md) define its API; the
[admission decision](decisions/2026-10-29-sync-relay.md) explains the hourly cap adaptation to
Cloudflare’s minute-only binding. Deployment & secrets remain maintainer steps.

### The follow link

The link is `https://mistria.fyi/sync#<key>`, where the key is 32 random bytes in base64url, made by
the PC when the player first drops a save. The fragment never reaches a server. HKDF-SHA-256 over
the key derives two values:

- **The mailbox ID** (128 bits, info `mistria-follow v1 id`), the only part the relay sees.
- **The sealing key** (256 bits, info `mistria-follow v1 seal`), for AES-GCM.

The PC also makes a random 256-bit write token. The key & token stay on the PC in the progress key’s
device-only `local` section, which exports & restores leave out. The link alone can read; only the
token writes.

Version 1 pins HKDF-SHA-256 (empty salt) & AES-GCM, with a random 96-bit nonce per envelope & the
protocol version, mailbox ID, & counter as authenticated data, with no negotiation. A different
suite means a new protocol version. The byte layouts are in
[the format record](decisions/2026-10-30-follow-envelope-format.md).

### Mailboxes

One Durable Object per mailbox ID.

- **Create.** Creates the mailbox with the write token’s hash, redeeming a Turnstile token
  (server-side Siteverify), run invisibly on the PC. Creating an existing ID succeeds when the token
  hash matches & fails otherwise; a tombstone never accepts a create.
- **Upload.** Needs the write token. The mailbox keeps a high-water counter: a higher counter
  replaces the stored envelope & is pushed to subscribers, an identical retry succeeds without
  replacing anything, & a lower counter is refused, so a late retry never replaces a newer save.
- **Read.** Anyone with the ID gets the latest envelope (with an ETag), or subscribes over a
  hibernating WebSocket. A live mailbox with no envelope (expired, or nothing uploaded yet) answers
  “empty”, distinct from a tombstone’s “retired”. Reads need no token & write nothing. Persisted
  state survives eviction & deploys.
- **Retire.** Deletes the envelope with the write token & leaves a tombstone, so the ID can never be
  created again. “Make a new code” creates & shows the new code first & retires the old one after;
  if creation fails, the old code keeps working & the PC says so (`sync_new_code_failed`). A retire
  the relay hasn’t confirmed stays pending in `local` (the mailbox ID & token) & retries like an
  upload, through “Stop syncing” or an erase. Every follower holds the sealing key, so a follower
  that could recreate a retired ID with its own token could write saves to the others.
- **Nothing else.** No confirmations or delivery states; the high-water counter is the relay’s only
  ordering. A follower that misses a save loses nothing, since the next one is a full snapshot.

### Caps & expiry

- **Creation** needs a Turnstile token & passes the Worker’s three-attempt-per-minute binding, keyed
  by IPv4 address or IPv6 /64. The singleton admits three successful creations per UTC hour per
  rotating 16-bit HMAC bucket & 200 per UTC day account-wide. Buckets deliberately combine many
  addresses; a collision can share a creation budget. No raw address, prefix, or full HMAC enters
  application storage or logs. Buckets are cleared after the hour; provider recovery can retain old
  bucket counts for 30 days.
- **Public reads & WebSocket handshakes** share a 60-attempt-per-minute binding per IPv4 address or
  IPv6 /64, before any Durable Object request. Both bindings are approximate per Cloudflare
  location. Reads still write no application storage.
- **Each mailbox** caps uploads at about one a minute & 60 a day, & envelopes at 256 KB.
- **The budget.** An upload costs a few Durable Object row writes. A typical session uploads a save
  per in-game day, about every half hour, so Workers Free’s 100,000 row writes a day cover thousands
  of players, but only a few hundred mailboxes uploading at the cap (estimates). There’s no runtime
  budget check. The kill switch stops new mailbox reads & writes, but its singleton gate still costs
  object requests, & rejected traffic still costs Worker requests. A zone WAF rate rule, shared with
  feedback at 10 requests per 10 seconds per address, protects the relay before the Worker runs
  ([decision](decisions/2026-10-30-shared-edge-rate-rule.md)); distributed abuse can still exhaust
  Free quotas. Tighter caps, an edge block, or Workers Paid come first if usage approaches the
  limit.
- **Expiry.** An envelope is deleted 30 days after it was uploaded. A mailbox with no upload for a
  year becomes a tombstone, like a retired one, & tombstones are never deleted, since each is a few
  bytes; the PC’s next upload, finding its own code retired, makes a new code & says so
  (`sync_link_expired`). That copy is only for this one-year case.

### Operations

- **Kill switch.** A flag in the singleton object, flipped by an authenticated admin request (a
  dashboard variable would be dropped by the next deploy). It carries an end time (a day by default;
  each request may set at most seven days ahead; the maintainer can extend it with another request),
  so it lifts by itself. `sync_paused_*`, which says so, applies to uploads, creation, public reads,
  & new WebSocket handshakes on the next request, while retiring still goes through. Existing
  WebSockets remain connected; a pause does not enumerate or disconnect them. The courier uploads
  its latest save once it lifts. Manual tracking still works.
- **Logging.** Request logging stays off.
- **Takedown.** [takedown.md](takedown.md) gains a relay section.
- **Tests** run the Durable Object in Miniflare. Deploying needs the maintainer’s Cloudflare login.
- **CSP.** The relay’s `wss:` origin must be allowed by the delivered CSP
  (`src/lib/security/csp-directives.ts`). Checking this on a branch preview is a sync acceptance
  criterion, independent of the prerendering spike (#108) & its rollout (#109).

## Following

Built in #133: `src/lib/sync/follow.ts` (keys, link, envelope, & relay client) &
`src/lib/sync/sharing.ts` (the writes around them). The UI is in [sync-setup.md](sync-setup.md)
(#131), on `/sync` & Data's sync card. See
[the decision record](decisions/2026-10-28-sync-follow-the-save.md); the envelope's byte layout is
in [the format record](decisions/2026-10-30-follow-envelope-format.md). Until launch (#291), every
sync entry point is hidden on the production site behind `src/lib/sync/enabled.ts`.

- **Lanes.** Each device is in exactly one lane: its save is on this computer (the courier), its
  save is on another device (a follower), or it tracks by hand, the default. Joining a syncing lane
  erases the device’s progress, so a following lane starts only on empty progress; leaving one for
  tracking by hand keeps progress as it is. The lane & the follow key live in the progress key’s
  device-only `local` section, so the lane change & the erase are one write. A following lane is
  recorded only in the write that erases progress & applies the first save; until then the key lives
  only in the page, so a setup that fails, finds no save, or is abandoned leaves nothing behind. The
  computer lane is recorded at “Yep!”, in the write that applies its first save. Leaving the
  computer lane retires its code only after that leaving write lands, never at a confirmation.
- **The erase, the reset, & the stop.** Joining a syncing lane writes fresh progress & history &
  removes any old receipt, lane, & key. Data’s reset in a syncing lane writes fresh progress &
  history & removes the receipt but keeps the lane & key, so the latest save file applies again (on
  the computer at once, from its current save). “Stop syncing” removes only the receipt, freshness,
  the lane, & the key, keeping progress & history, which are then tracked by hand. Both keep
  `farmSwitchBackup`, which no export carries, & any pending retire. Restoring a backup & a new farm
  stay inside a lane. See [sync-setup.md](sync-setup.md#lanes).
- **Opening a link.** A device opens the link, scans its QR code with the tracker’s own scanner (the
  one the transfer card uses), or pastes it. The page strips the fragment from its address bar,
  holds the key in the page (see Lanes), & fetches the latest envelope. An “empty” mailbox shows
  `sync_waiting` & changes nothing; a “retired” one shows `sync_retired_*`.
- **Nothing is spent.** Opening a link only reads, so a chat app’s link preview or a stream viewer
  can’t take anything from the player. A leaked link can read saves until the PC makes a new one;
  that’s accepted, since a save holds nothing close to personal data.
- **One link per device.** A follower follows one link at a time; opening another asks first,
  offering a backup, since a farm switch replaces the one farm-switch backup; the next save applies
  with the usual rules. “Stop syncing” returns the device to tracking by hand, keeping its progress.
  A retired code says the PC isn’t sharing on it anymore & keeps all progress until the player stops
  syncing.
- **The courier’s computer has no link to open.** Its tracker already applies its own saves (see
  [The courier](#the-courier)); a link opened there says the save is already on this computer.
  Leaving the lane there also retires its code (see Lanes).
- **iOS & iPadOS.** Links, including Camera scans, open in the default browser, never in the home
  screen app, & that browser follows like any other device. Following in the home screen app means
  opening the link there; check-offs made in the browser move by backup & restore, since their
  storage is separate.
- **“One PC” means one browser profile.** Two profiles make two links, & a device follows one.

Tests cover the HKDF derivation against fixed vectors, a tampered envelope, an envelope replayed
under another mailbox ID, an upload without the write token, recreating a retired ID, a create on an
existing ID under another token, a lower counter after a higher one, an older envelope served again,
an empty mailbox, “Make a new code” during the kill switch, a retire that lands only after a retry,
& a following setup whose first fetch fails before any write.

## Followers

Built in #135: `src/lib/sync/receiver.ts`, with its page state in `receiver-state.svelte.ts`. It
sits on top of the apply rules (#129) & the single write path (#127), & serves the sharing PC’s own
tracker (`applyLocalSave`, which the courier in #134 calls) as well as every follower.

- **One tab leads** (Web Locks): it holds `mistria-fyi:sync-receiver` for as long as it runs, &
  other tabs queue, so one takes over when the leader’s page goes away. The lock is let go on
  `pagehide`, so a page in the back/forward cache never keeps the lead. Other tabs show the leader’s
  status & send their answers & retries to it over a `BroadcastChannel`, so a question waiting in a
  hidden tab can be answered from the one in front. A browser without Web Locks never leads, so it
  never applies; the writer’s synchronous fallback isn’t enough for two long-lived receivers.
- **It listens** on the mailbox’s WebSocket, & reads the mailbox once each time it connects, giving
  each read 30 seconds, since reads & applies take turns. A closed socket retries from 5 seconds,
  doubling up to 5 minutes; coming back into view or online retries at once.
- **It never applies** while its store is quarantined or in the “newer data” state, & never uses
  manual import’s unlock path; on the sharing PC the courier still uploads. In the newer-data state,
  “Export backup” returns the stored blob verbatim (the choice in PR #158 for #106, provisional
  until it merges), so a blocked device still gives the player a copy. `sync_blocked` shows only
  when the block starts while the page is open. A page that loads blocked can’t read its lane from
  the blob, so it shows no sync surfaces, & the persistence warning speaks for it.
- **One write path.** Progress, provenance, resolved diffs, the farm-switch backup, & a “last
  applied” receipt (the mailbox ID, the envelope’s counter, & the save’s hash), plus the lane & the
  follow key, share one storage key. Every writer (auto-save, sync, restore, reset, migration) goes
  through one function (#127), serialized by a Web Lock that re-reads & validates before writing.
  The pagehide flush keeps today’s compare-before-write. The receipt never goes into exports or
  restores.
- **Each apply is one immediate write** through that function (`userState.applySyncedSave`), which
  settles the save inside the lock, against the progress as it stands then, & the receipt advances
  only through that write. A lane’s first save writes its receipt in the write that starts the lane.
- **The latest save wins.** An envelope is skipped only when its mailbox ID matches the receipt’s &
  its counter isn’t above the receipt’s, so a new code’s envelopes always apply; the PC’s own
  applies skip by the save’s hash. Either way, so a repeated or replayed save changes nothing. A
  newer envelope that arrives while a question waits replaces the save the question was about. One
  it can’t use (unreadable, another protocol version, or a retired code) leaves the question up, &
  its notice shows once the question settles.
- **Recomputed questions.** If progress or the save changed while a question waited, the diff is
  recomputed & the question asked again where its effect changed. Answering is what recomputes,
  since every answer goes back through the write; so does the tracker coming back into view.
- **A cancelled question** keeps the status button’s dot & a note on Home, & opens again from there,
  when a recompute changes it, or the next time the tracker opens. Nothing is written until it’s
  answered.
- **Tells** wait for a tab the player can see, & whichever tab says them clears them from the
  others. They live only in the page, so one that never reached a visible tab goes when the page
  does.
- **Crashes.** A crash before the write applies the latest envelope again on the next open; one
  after it skips that envelope by the receipt.
- **A save it can’t read** (after a game update, the computer can’t read it either) shows
  `sync_unreadable_away_title` here & keeps progress as it is; followers get no other notice from
  the PC, only the freshness slip. An envelope that fails authentication shows the same note. It
  isn’t read again until the next envelope or page load, so a new build can pick it up.
- **Extraction** returns values, per-field completeness, & diagnostics together, telling
  known-but-untracked IDs from unknown ones (#125).

### Freshness

A follower’s sync panel shows when the last save file came (the file’s own modification time) & its
in-game date (`sync_panel_*` in [sync-setup.md](sync-setup.md#copy)), read from `gamedata.date`, &
it learns the typical gap between saves. The last 32 gaps are kept in `local.syncFreshness`, which
the apply write advances beside the receipt (`src/lib/engine/sync-freshness.ts`). A gap is abnormal
at three days or twice the longest gap remembered, whichever is longer, since sessions run half an
hour apart but days can pass between them. When it opens after an abnormally long gap, a slip says
so (`sync_status_gap`). There are no push notifications. Describe sync as best effort until real
sessions prove it.

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

Dependent household differences are the exception to per-field grouping: one fact question uses
`field: "household"`, while each difference retains its actual field. This keeps one answer atomic
across relationships, the break-ups setting, child choice, & pregnancy quests. The question & all
its differences use the strongest dependent reason: `many-removals` takes precedence over
`local-disagrees`, so the renamed-ID warning survives grouping. Its ID includes that reason & every
dependent difference; a changed reason or effect requires a new answer.

### The table

- A save or inference is superseded by the save: an addition applies silently, a removal applies &
  tells. An `inferred` fact is promoted to `save` when the save agrees.
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
- Household facts use the same provenance table: relationships, the break-ups setting, positive
  child evidence, & pregnancy quests. Complete explicit statuses can replace relationships; missing
  or unrecognized statuses remain partial. A valid childless save leaves child choice unknown, so it
  cannot remove a manual refusal. The explicit Mistmare reveal fact & readable animal variant lists
  make mount appearances complete.
- Household differences settle together: an ordered manual fact that wins keeps the dependent
  changes local; any question covers the whole household difference. “Keep mine” holds for the whole
  difference until a dependent save value changes. A candidate with competing spouses or fiancés, or
  romances forbidden by its break-ups setting, stays local & tells; sync never invents a cascade
  over manual facts. This covers incomplete relationship evidence too. A manual import still merges
  additively through `mergeHousehold`; backup restore still replaces. See
  [the household decision](decisions/2026-10-29-household-save-facts.md).

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
  With lanes, that happens only after restoring an older backup inside a syncing lane, since a lane
  starts on empty progress. This & “We saved a backup of {old farm}” are apply-time copy owned by
  #135.
- Switching farms automatically keeps a backup of the outgoing farm (“We saved a backup of {old
  farm}”) on the device beside progress, in the same write as the switch. There is one backup, never
  nested. If the backup cannot be written, the switch does not happen & the device says why.
  `compareFarms` (`src/lib/engine/save-identity.ts`) decides same, different, or unidentified; a
  creation version only one side could read doesn’t make farms differ. `applySync` returns the
  outgoing state as `farmSwitch.backup` & starts the new farm from the receiver’s fresh state.
  `serializeFarmSwitch` (`src/lib/stores/progress-storage.ts`) writes the new farm & the backup into
  one stored document, the backup under `local.farmSwitchBackup` as `{ backup, farmName, savedAt }`
  in the restorable backup format, replacing any earlier one; it returns `null` when the backup
  wouldn’t restore, & the switch doesn’t happen.
- A switch that would replace an existing backup says so first (`sync_replace_*`), offering to save
  the old one; nothing changes until it’s answered. A switch whose backup can’t be written leaves
  everything as it was, keeps the receipt where it was, & says why (`sync_switch_failed_*`).
- Switching back is a restore: Data’s backup card offers the backup by name (“Backup of {farm}, from
  {date}”), the date being when the switch happened, & it stays there after restoring. Multi-farm
  profiles stay later.
- Manual import stores the same identity & shows “last imported {time ago}”. Player & farm names
  stay out of the feedback snapshot.

## Versions

The envelope carries a protocol version, & both sides are strict: a follower accepts only its own
version. An older envelope says the tracker on the computer needs a refresh, & a newer one that this
tracker does (`sync_update_computer` & `sync_update_here` in [sync-setup.md](sync-setup.md#copy)); a
reload fixes either. App builds do not matter. (Transfer QR codes, by contrast, bind to the exact
app build; see [transfer-format.md](transfer-format.md).)

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

The feedback form can optionally attach a previewable sync log (#137): app build, protocol version,
the device's lane, the save's current numeric game version (`info.version`), recent outcomes,
unknown fields with their IDs, & counts of each policy by field. It stays behind the sync switch
until launch. The receiver collects at most 20 events & 24 KiB in memory in the current tab; reloads
clear it. Unknown IDs are limited to 20 per field & 100 per event. Old events are dropped to fit the
byte limit, & again if the finished issue would pass GitHub's body limit.

Feedback never carries exact `playtime` values: they only grow, so matching values would link
reports that the session salt keeps apart, & the game's save slot data keeps it beside the player's
names. The app still uses it for sync. The log leaves it out, & the progress attachment replaces
`lastSavePlaytime` & each fact's provenance `playtime` with `[redacted]`, preserving the fact that
the value was present. The preview & API use the same projection.

Privacy follows the
[source-based feedback redaction decision](decisions/2026-10-31-source-based-feedback-redaction.md).
The collector projects selected fields before retaining events. Names, paths, raw saves, fact
values, question IDs, follow keys, write tokens, & mailbox IDs stay out of events. Unknown IDs come
from game-owned unlock lists, type keys, & quest IDs; keep them readable without guessing personal
information from date or phone-number shapes. Player-entered child & pet names elsewhere in the save
are not ID sources, & their objects are never attached.

As a defensive check, known-private matches inside IDs become `[redacted]`. The collector checks
character & farm names from both `player` & `header`, the outgoing farm's names & number, & sync
credentials. Names ignore case, accents, & separators; character-name words also count. Names
shorter than three characters require word boundaries, including capitals, acronyms, & digits. The
collector remembers these comparison patterns privately for the tab session & rechecks buffered &
asynchronously prepared events as new values become known. The comparison text has a separate 16 KiB
budget, never enters the payload or persistent storage, & clears on reload. If it fills, all IDs are
redacted rather than forgetting private values.

The incoming farm number is SHA-256 hashed with a random, unexported session salt. That hash can
correlate events & submissions within one tab session without exposing a small enumerable number.
The API checks a closed, size-limited schema before formatting the public issue; the schema is not a
general anonymizer. Privacy tests cover the source projection, payload, & receiver path, with the
switch on & off. The game's own `log.txt` records every save path & load; it is never attached.

## Privacy

The privacy page splits into “Without sync” (unchanged) & “With sync” (#136). “With sync” states
that it is opt-in; end-to-end encrypted, including against the relay; that the relay keeps only the
latest save per link, deleted 30 days after it was sent; that anyone holding the follow link can
read the shared saves until the player makes a new link, so it’s worth keeping off stream; that
Cloudflare processes IP addresses to deliver it & the app does not log them, & that link creation is
rate-limited by IPv4 address or IPv6 /64 without storing the address or prefix in application
storage. Hourly admission stores only a rotating 16-bit shared bucket & count, which cannot identify
one address even with the secret; provider recovery can retain these counts for 30 days. State that
there is no account, & explain the provider’s 30-day storage recovery plainly, including the
per-code record that outlives a deleted save & the tombstone left after it. It also references
Cloudflare’s Turnstile Privacy Addendum, a condition of the invisible mode the creation check uses.
The rewrite ships before or with sync, in all locales.

## The sync switch

Until launch (#291), every sync surface checks `syncSwitchOn` (`src/lib/sync/sync-switch.ts`), which
hides it on the production site & shows it on branch previews, local builds, dev, & tests. It comes
from the same `CF_PAGES_BRANCH === "main"` check as the feedback dry run, so renaming the Pages
production branch would reveal sync. Launch removes the module & its call sites.

## Fallbacks

- Firefox needs the save re-dropped or re-picked per session, through the same relay & rules.
- No sync at all means manual check-offs.
- QR transfer is deprecated once sync ships (#138); backup export & restore moves check-offs to a
  new device. Remove the codec, its tests, & the transfer promise in
  [app-architecture.md](app-architecture.md#7-public-contract), & leave no orphaned messages. Keep
  the camera scanner, which following reuses.

## Build order

1. **Groundwork that needs no network:** the extraction contract (#125), provenance & ordering
   (#126), the single write path (#127), save identity (#128), then the apply rules (#129).
2. **Feasibility & design:** the hardware checks (#130, #238, #341) & the setup UX design (#131).
3. **The network pieces:** the relay (#132), following (#133), the courier (#134), the receiver
   (#135).
4. **Launch work:** the privacy rewrite (#136) before launch, diagnostics (#137), then deprecating
   QR transfer (#138).
