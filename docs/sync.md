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

- **Watching.** A dropped `.sav` stores its file handle. `FileSystemObserver` bursts are coalesced,
  an “unknown” event triggers a recheck, & a swapped file re-resolves the handle.
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
  shows the PC’s error. It also reads the current save when it starts & when it shows the code, &
  uploads it if its hash differs from the last upload or the mailbox answers “empty”, so an expired
  envelope fills again even when the save hasn’t changed, & a tracker update after a game update
  catches up without waiting for the game to save. Nothing waits for a follower, so a device that
  follows later gets the latest save straight away.
- **Applying here.** The PC’s own tracker applies each save the courier reads, through the same
  receiver path as a follower (see [Followers](#followers)) but without the relay, skipping a save
  whose hash matches its receipt. Check-offs on the PC stay on the PC, like any device’s.
- **One courier per profile.** Web Locks allow a single courier per browser profile; a second window
  says “Your save file is already syncing in another window”.
- **Errors.** A parse failure after a game update shows an error on the PC.
- **App updates.** A waiting update reloads the courier at its own safe moment, for example right
  after an upload (see [App updates](#app-updates)).
- **Firefox** is expected to need the save re-dropped or re-picked per session; each drop uploads &
  applies like a watched change. Its current behavior is still to be confirmed (#130).

## The relay

Built in #132, a separate Worker with Durable Objects (they cannot live in a Pages project) with its
own `wrangler.toml`, in a directory that is not yet decided (relay/ or workers/relay/, #132), on
Workers Free until usage says otherwise. It is reachable under the site’s origin or listed in
`connect-src` (with `wss:`).

### The follow link

The link is `https://mistria.fyi/sync#<key>`, where the key is 32 random bytes in base64url, made by
the PC when the player first drops a save. The fragment never reaches a server. HKDF-SHA-256 over
the key derives two values:

- **The mailbox ID** (128 bits, info `mistria-follow v1 id`), the only part the relay sees.
- **The sealing key** (256 bits, info `mistria-follow v1 seal`), for AES-GCM.

The PC also makes a random 256-bit write token. The key & token stay on the PC in the progress key’s
device-only `local` section, which exports & restores leave out. The link alone can read; only the
token writes.

Version 1 pins HKDF-SHA-256 & AES-GCM, with a random 96-bit nonce per envelope & the protocol
version & mailbox ID as authenticated data, with no negotiation. A different suite means a new
protocol version.

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

- **Creation** needs a Turnstile token, passes the Worker’s rate-limiting binding (a few creations
  an hour per client IP address, which the relay never logs or stores), & is capped at about 200 a
  day account-wide by a singleton object.
- **Each mailbox** caps uploads at about one a minute & 60 a day, & envelopes at 256 KB.
- **The budget.** An upload costs a few Durable Object row writes. A typical session uploads a save
  per in-game day, about every half hour, so Workers Free’s 100,000 row writes a day cover thousands
  of players, but only a few hundred mailboxes uploading at the cap (estimates). There’s no runtime
  budget check; the kill switch covers abuse, & tighter caps or Workers Paid come first if real
  usage approaches the limit.
- **Expiry.** An envelope is deleted 30 days after it was uploaded. A mailbox with no upload for a
  year becomes a tombstone, like a retired one, & tombstones are never deleted, since each is a few
  bytes; the PC’s next upload, finding its own code retired, makes a new code & says so
  (`sync_link_expired`). That copy is only for this one-year case.

### Operations

- **Kill switch.** A flag in the singleton object, flipped by an authenticated admin request (a
  dashboard variable would be dropped by the next deploy). It carries an end time (a day by default;
  the maintainer can extend it), so it lifts by itself. `sync_paused_*`, which says so, applies to
  uploads & creation on the next request, while reads & retiring still go through, & the courier
  uploads its latest save once it lifts. Manual tracking still works.
- **Logging.** Request logging stays off.
- **Takedown.** [takedown.md](takedown.md) gains a relay section.
- **Tests** run the Durable Object in Miniflare. Deploying needs the maintainer’s Cloudflare login.
- **CSP.** The relay’s `wss:` origin must be allowed by the delivered CSP
  (`src/lib/security/csp-directives.ts`). Checking this on a branch preview is a sync acceptance
  criterion, independent of the prerendering spike (#108) & its rollout (#109).

## Following

Built in #133. Planned location (not yet created): src/lib/sync/follow.ts. The UI is in
[sync-setup.md](sync-setup.md) (#131). See
[the decision record](decisions/2026-10-28-sync-follow-the-save.md).

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
  the computer at once, from its current save). “Stop syncing” removes only the receipt, the lane, &
  the key, keeping progress & history, which are then tracked by hand. Both keep `farmSwitchBackup`,
  which no export carries, & any pending retire. Restoring a backup & a new farm stay inside a lane.
  See [sync-setup.md](sync-setup.md#lanes).
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

Built in #135. Planned location (not yet created): src/lib/sync/receiver.ts. It sits on top of the
apply rules (#129) & the single write path (#127), & serves the sharing PC’s own tracker as well as
every follower.

- **One tab leads** (Web Locks).
- **It never applies** while its store is quarantined or in the “newer data” state, & never uses
  manual import’s unlock path; on the sharing PC the courier still uploads. In the newer-data state,
  “Export backup” returns the stored blob verbatim (the choice in PR #158 for #106, provisional
  until it merges), so a blocked device still gives the player a copy.
- **One write path.** Progress, provenance, resolved diffs, the farm-switch backup, & a “last
  applied” receipt (the mailbox ID, the envelope’s counter, & the save’s hash), plus the lane & the
  follow key, share one storage key. Every writer (auto-save, sync, restore, reset, migration) goes
  through one function (#127), serialized by a Web Lock that re-reads & validates before writing.
  The pagehide flush keeps today’s compare-before-write. The receipt never goes into exports or
  restores.
- **Each apply is one immediate write** through that function, & the receipt advances only through
  that write.
- **The latest save wins.** An envelope is skipped only when its mailbox ID matches the receipt’s &
  its counter isn’t above the receipt’s, so a new code’s envelopes always apply; the PC’s own
  applies skip by the save’s hash. Either way, so a repeated or replayed save changes nothing. A
  newer envelope that arrives while a question waits replaces the save the question was about.
- **Recomputed questions.** If progress or the save changed while a question waited, the diff is
  recomputed & the question asked again where its effect changed.
- **Crashes.** A crash before the write applies the latest envelope again on the next open; one
  after it skips that envelope by the receipt.
- **A save it can’t read** (after a game update, the computer can’t read it either) shows
  `sync_unreadable_away_title` here & keeps progress as it is; followers get no other notice from
  the PC, only the freshness slip.
- **Extraction** returns values, per-field completeness, & diagnostics together, telling
  known-but-untracked IDs from unknown ones (#125).

### Freshness

A follower’s sync panel shows when the last save file came & its in-game date (`sync_panel_*` in
[sync-setup.md](sync-setup.md#copy)), & it learns the typical gap between saves. When it opens after
an abnormally long gap, a slip says so (`sync_status_gap`). There are no push notifications.
Describe sync as best effort until real sessions prove it.

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
  one stored document, the backup under `local.farmSwitchBackup` as `{ backup, farmName }` in the
  restorable backup format, replacing any earlier one; it returns `null` when the backup wouldn’t
  restore, & the switch doesn’t happen.
- Switching back is a restore. Multi-farm profiles stay later.
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

Expect iteration from real situations (#137). The feedback form can attach a sync log: app build,
protocol version, game version, recent sync events with `playtime`, which fields were unknown (with
their IDs), & which policy fired. Names are stripped & the farm number is hashed, because feedback
becomes a public issue; a test proves no player or farm name reaches the payload. The game’s own
`log.txt` records every save path & load.

## Privacy

The privacy page splits into “Without sync” (unchanged) & “With sync” (#136). “With sync” states
that it is opt-in; end-to-end encrypted, including against the relay; that the relay keeps only the
latest save per link, deleted 30 days after it was sent; that anyone holding the follow link can
read the shared saves until the player makes a new link, so it’s worth keeping off stream; that
Cloudflare processes IP addresses to deliver it & the app does not log them, & that link creation is
rate-limited by address without storing it; that there is no account; & the provider’s 30-day
storage recovery, plainly. The rewrite ships before or with sync, in all locales.

## Fallbacks

- Firefox is expected to need the save re-dropped or re-picked per session, through the same relay &
  rules (to be confirmed in #130).
- No sync at all means manual check-offs.
- QR transfer is deprecated once sync ships (#138); backup export & restore moves check-offs to a
  new device. Remove the codec, its tests, & the transfer promise in
  [app-architecture.md](app-architecture.md#7-public-contract), & leave no orphaned messages. Keep
  the camera scanner, which following reuses.

## Build order

1. **Groundwork that needs no network:** the extraction contract (#125), provenance & ordering
   (#126), the single write path (#127), save identity (#128), then the apply rules (#129).
2. **Feasibility & design:** the hardware checks (#130) & the setup UX design (#131).
3. **The network pieces:** the relay (#132), following (#133), the courier (#134), the receiver
   (#135).
4. **Launch work:** the privacy rewrite (#136) before launch, diagnostics (#137), then deprecating
   QR transfer (#138).
