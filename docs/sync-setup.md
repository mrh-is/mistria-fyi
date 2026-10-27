# Sync setup & pairing

tl;dr: Data gets a “Sync to your phone” section that first explains the three-part system (the game
saves, a PC tab spots it, the phone gets it), then walks through two steps: pair your phone, then
sync from save file. Pairing comes first so the player sees success on the phone right away, and the
first save lands on the phone moments after step ii. This document is the UI & copy for #131; the
protocol is in [sync.md](sync.md), whose rules this design follows. The mockups live on the
[design canvas](https://claude.ai/artifact/UhDfkQVf4Csu7eN9RcBStx) (private; ask the maintainer for
access).

Status: proposed, awaiting maintainer approval on #131.

## Voice

Write like a chill, non-judgmental friend helping with a tech setup.

- **Casual & warm.** Contractions, plain words, a little encouragement (“Nice!”, “You’re all set!”).
  Never blame the player.
- **Linear.** Every screen answers “what do I do now?” with numbered steps in order. Explanations
  come first and stay short; anything that isn’t a step or the reason for one gets cut.
- **One mental model, everywhere.** The game writes a save file on the PC, a tracker tab on the PC
  watches it, and that tab sends new saves to one phone. Copy names those three parts consistently
  (“the game”, “this tab” or “the tracker on your PC”, & “your phone”).
- **“Check off”, not “tick”,** matching the rest of the app.

## Data screen

Data is reorganized into three sections:

1. **Sync to your phone.** “How it works” (the three-part diagram), then the two steps as cards:
   **i. Pair your phone** and **ii. Sync from save file**. Step ii stays locked (“After i”) until
   pairing is done. Once both are done, the section becomes a status ledger.
2. **Just this once.** “Import from save file” (bring progress in one time; import again to catch
   up) and “Backup & restore”. The section name tells players manual import won’t update on its own,
   unlike sync.
3. **Reset.** Unchanged.

`mistria.fyi/sync` opens Data with the sync section ready, so either device can tell the player
exactly where to go on the other one. On a phone, the section shows “Pair this phone” with a scanner
instead of a code.

## PC flow

1. **The plan.** Before setup, the section shows “Here’s how it works” with the three parts, the one
   thing to remember (keep this tab open while you play), and the two steps with what each asks of
   the player.
2. **i. Pair your phone.** One instruction (“On your phone, go to mistria.fyi/sync and tap ‘Scan the
   code’”), then the code. The code starts covered; “Show code” reveals it and starts the countdown,
   and the streaming hint sits beside it.
3. **Was that you?** When a device scans, the PC names it and asks. “Yep, that’s me” pairs; “Nope”
   kills the code and shows a fresh one. If another phone is paired, a line says it’ll stop getting
   updates.
4. **ii. Sync from save file.** Step i collapses to “Paired with your Android phone. Nice!” Step ii
   explains in one sentence why the player drags the file in, then three sub-steps: copy the folder
   path, paste it into File Explorer’s address bar, & drag the newest `-autosave.sav` into the box.
5. **You’re all set!** The phone has the save by now, so the PC says to look at it, and repeats the
   one rule. Below it, a ledger lists the phone (with “Change”) and the save file (with “Change”),
   plus “Turn off sync” with an in-place confirmation.

## Phone flow

1. **Before pairing.** A compact “Here’s how it works”, then “Pair this phone”: go to
   `mistria.fyi/sync` on your PC, then tap “Scan the code”.
2. **Nearly there!** After scanning, the phone says to tap “Yep, that’s me” on the PC. If the phone
   already syncs from another PC, a line says this replaces it.
3. **You’re paired!** The phone sends the player back to the PC for step ii and shows “Waiting for
   your first save…”.
4. **It worked!** The first save lands: the farm’s name, a few category counts, a sentence on what
   happens from now on, and “Take a look”. Questions from the apply rules (#129, #135), such as “Is
   this the farm you’ve been tracking?”, come before this screen when they apply.
5. **Home.** A one-line stamp under the title: “Updated from your PC {time_ago}”. It turns amber
   after an unusually long gap, and a toast asks once whether the tracker is still open on the PC.
6. **iOS in Safari.** A scanned code opened in Safari says to pair from the home screen version, in
   three steps, with how to add it to the home screen below. Safari doesn’t answer the offer, so the
   code still works from the app until it expires.

## Where problems show

- **PC: a strip & the card.** The PC tab can be on any page while the player plays, so problems that
  stop sync show as a slim strip across the top of every page, linking to the full card in Data. The
  card explains the problem and gives numbered steps. Quiet states (offline, waiting for the phone,
  a timed-out code) show only on the card.
- **Phone: the home stamp & the card.** A problem replaces the home stamp with a notice that opens
  the Data card. Quiet states stay as the stamp.
- Neither ever changes progress on either device.

## Decisions for review

1. **Phone first, then the save.** Pairing first gives an immediate success, and finishing step ii
   makes progress appear on the phone moments later, which demonstrates what sync does.
2. **The overview comes first.** Players see the three parts and both steps before starting, so
   nothing later is a surprise.
3. **Sync & import are split by expectation.** “Sync from save file” lives under “Sync to your
   phone”; “Import from save file” lives under “Just this once”.
4. **`mistria.fyi/sync`.** A short path both devices can name. It needs a route (or a redirect into
   Data) when built.
5. **The PC confirms the scanner.** A leaked code (a stream, a screenshot) can’t silently redirect
   sync. See [the decision record](decisions/2026-10-27-sync-pairing-confirm.md).
6. **The code starts covered,** so showing it is deliberate and the countdown starts then.
7. **Device names come from the browser,** like “Android phone with Chrome”, derived locally from
   User-Agent Client Hints with a user-agent fallback. Renaming is out of scope for v1.
8. **A version mismatch names the device that’s behind.** [sync.md](sync.md#versions) specifies only
   the PC case; a reload on the PC can’t fix a phone that’s behind.
9. **Firefox & Steam Deck copy is drafted, not committed,** pending the #130 hardware checks.

## Copy

Keys follow [localization.md](localization.md#adding-a-new-ui-string-agents--humans): `sync_`
prefix, snake_case, & one message per sentence that wraps a link or placeholder. Placeholders:
`{device}` (decision 7), `{farm}` (the save’s farm name), `{time_ago}` (`Intl.RelativeTimeFormat`),
`{duration}` (`Intl.DurationFormat`), `{date}` (`Intl.DateTimeFormat`), & `{countdown}` (m:ss).
`{url}`, `{suffix}`, `{scan}`, `{accept}`, & `{reject}` are slots filled with `messageParts`: the
literal `mistria.fyi/sync`, the literal `-autosave.sav`, `sync_phone_scan_action`,
`sync_pc_confirm_accept`, & `sync_pc_confirm_reject`. English is final for review; machine
translations for the other seven locales come when the strings land in `messages/`.

### Data & overview

| Key                    | English                                                                           |
| ---------------------- | --------------------------------------------------------------------------------- |
| `sync_section_title`   | Sync to your phone                                                                |
| `once_section_title`   | Just this once                                                                    |
| `import_card_summary`  | Bring your progress in one time. Import again whenever you want to catch up.      |
| `backup_card_summary`  | Save a copy of everything, or bring one back.                                     |
| `sync_how_title`       | Here’s how it works                                                               |
| `sync_how_link`        | How it works                                                                      |
| `sync_how_game_title`  | The game saves                                                                    |
| `sync_how_game_body`   | Every time you sleep, Fields of Mistria writes a save file on this PC.            |
| `sync_how_tab_title`   | This tab spots it                                                                 |
| `sync_how_tab_body`    | This browser tab watches that file and notices each new save.                     |
| `sync_how_phone_title` | Your phone gets it                                                                |
| `sync_how_phone_body`  | The tab sends your progress to your phone, locked so only your phone can read it. |
| `sync_how_remember`    | So the one thing to remember: keep this tab open while you play.                  |
| `sync_how_catch_up`    | If it’s closed for a while, no worries; the next save catches your phone up.      |
| `sync_how_phone_game`  | The game saves on your PC each time you sleep.                                    |
| `sync_how_phone_tab`   | A tracker tab on your PC spots the new save.                                      |
| `sync_how_phone_here`  | It sends your progress here, to this phone.                                       |
| `sync_plan_intro`      | Setting it up takes about two minutes:                                            |
| `sync_step_pair_title` | Pair your phone                                                                   |
| `sync_step_pair_plan`  | You’ll scan a code with your phone.                                               |
| `sync_step_save_title` | Sync from save file                                                               |
| `sync_step_save_plan`  | You’ll drag the game’s save file into this tab. From then on, it’s automatic.     |
| `sync_step_start`      | Start                                                                             |
| `sync_step_locked`     | After i                                                                           |

### Pairing on the PC

| Key                        | English                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `sync_pc_pair_instruction` | On your phone, go to {url} and tap {scan}. Then show it this:        |
| `sync_pc_code_show`        | Show code                                                            |
| `sync_pc_code_hide`        | Hide code                                                            |
| `sync_pc_code_alt`         | Pairing code for this PC                                             |
| `sync_pc_code_expires`     | Good for {countdown}                                                 |
| `sync_pc_stream_hint`      | Streaming? Keep this off screen. Whoever scans it first gets paired. |
| `sync_pc_confirm_title`    | Was that you?                                                        |
| `sync_pc_confirm_body`     | An {device} just scanned the code.                                   |
| `sync_pc_confirm_accept`   | Yep, that’s me                                                       |
| `sync_pc_confirm_reject`   | Nope                                                                 |
| `sync_pc_confirm_replaces` | Heads up: your {device} will stop getting updates.                   |
| `sync_pc_rejected`         | No problem, that code’s dead now. Here’s a fresh one.                |
| `sync_pc_paired_summary`   | Paired with your {device}. Nice!                                     |

Note: `sync_pc_confirm_body` takes the article with the device name in English (“An Android phone
with Chrome”, “A Windows PC with Edge”); the English message picks it per device kind.

### Save file on the PC

| Key                       | English                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `sync_pc_save_intro`      | Now let’s point this tab at your save. Your browser isn’t allowed to open the game’s folder itself, so you’ll drag the file in. |
| `sync_pc_save_copy_step`  | Copy this folder path.                                                                                                          |
| `sync_pc_path_copy`       | Copy                                                                                                                            |
| `sync_pc_path_copied`     | Copied!                                                                                                                         |
| `sync_pc_save_paste_step` | Open File Explorer, paste it into the address bar at the top, and press Enter.                                                  |
| `sync_pc_save_drag_step`  | Drag the newest file ending in {suffix} into this box.                                                                          |
| `sync_pc_drop_target`     | Drop it here                                                                                                                    |

### Done & managing on the PC

| Key                      | English                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_pc_done_title`     | You’re all set!                                                                                                                                 |
| `sync_pc_done_body`      | Take a look at your phone; your progress should be there now. From here on, every time you sleep in the game, your phone catches up on its own. |
| `sync_pc_done_remember`  | Just keep this tab open while you play.                                                                                                         |
| `sync_pc_ledger_phone`   | Phone                                                                                                                                           |
| `sync_pc_phone_seen`     | {device} · checked in {time_ago}                                                                                                                |
| `sync_pc_ledger_save`    | Save file                                                                                                                                       |
| `sync_pc_save_received`  | {farm} · sent {time_ago}, and your phone got it                                                                                                 |
| `sync_pc_save_pending`   | {farm} · sent {time_ago}, waiting for your phone                                                                                                |
| `sync_pc_save_last_good` | {farm} · last good save sent {time_ago}                                                                                                         |
| `sync_change`            | Change                                                                                                                                          |
| `sync_turn_off`          | Turn off sync                                                                                                                                   |
| `sync_turn_off_confirm`  | Turn off sync? Your phone will stop getting updates, but it keeps everything it already has.                                                    |
| `sync_turn_off_yes`      | Turn it off                                                                                                                                     |
| `sync_turn_off_no`       | Keep it on                                                                                                                                      |

### Phone

| Key                         | English                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `sync_phone_pair_title`     | Pair this phone                                                                                                            |
| `sync_phone_pair_intro`     | Grab your PC for this bit.                                                                                                 |
| `sync_phone_pair_step_url`  | On your PC, go to {url}.                                                                                                   |
| `sync_phone_pair_step_scan` | Tap below and scan the code it shows you.                                                                                  |
| `sync_phone_scan_action`    | Scan the code                                                                                                              |
| `sync_phone_waiting_title`  | Nearly there!                                                                                                              |
| `sync_phone_waiting_body`   | Your PC wants to make sure this is really you. Tap {accept} on your PC.                                                    |
| `sync_phone_waiting_cancel` | Cancel                                                                                                                     |
| `sync_phone_replaces`       | Heads up: this phone will stop syncing from your other PC.                                                                 |
| `sync_phone_paired_title`   | You’re paired!                                                                                                             |
| `sync_phone_paired_next`    | One more step, back on your PC: show the tracker your save file. It’ll walk you through it.                                |
| `sync_phone_paired_then`    | As soon as that’s done, your progress shows up right here.                                                                 |
| `sync_phone_waiting_save`   | Waiting for your first save…                                                                                               |
| `sync_phone_arrived_title`  | It worked!                                                                                                                 |
| `sync_phone_arrived_body`   | Your progress from {farm} just landed:                                                                                     |
| `sync_phone_arrived_after`  | From now on, every time you sleep in the game, this phone catches up on its own, as long as the tracker’s open on your PC. |
| `sync_phone_arrived_action` | Take a look                                                                                                                |
| `sync_home_stamp`           | Updated from your PC {time_ago}                                                                                            |
| `sync_home_stamp_stale`     | Last update from your PC {time_ago}                                                                                        |
| `sync_long_gap_toast`       | Nothing new from your PC in {duration}. Is the tracker still open over there?                                              |
| `sync_ios_title`            | Pair from your home screen instead                                                                                         |
| `sync_ios_body`             | On an iPhone, Safari doesn’t share data with the home screen version of a site, so you’ll want to pair that one.           |
| `sync_ios_step_open`        | Open Mistria Field Guide from your home screen.                                                                            |
| `sync_ios_step_data`        | Go to Data and tap {scan}.                                                                                                 |
| `sync_ios_step_scan`        | Scan the code on your PC again. (If it timed out, your PC will offer a new one.)                                           |
| `sync_ios_add_title`        | Not on your home screen yet?                                                                                               |
| `sync_ios_add_body`         | Tap the Share button below, then “Add to Home Screen”. Then start at step i.                                               |

### Problems on the PC

Strip text appears across the top of every page; the title & body appear on the Data card.

| Key                          | English                                                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_strip_link`            | What happened?                                                                                                                                      |
| `sync_permission_strip`      | Sync needs your OK to read the save.                                                                                                                |
| `sync_permission_title`      | Your browser wants to double-check                                                                                                                  |
| `sync_permission_body`       | After a restart, your browser asks again before this tab can read your save. Click below, then pick “Allow on every visit” so it stops asking.      |
| `sync_permission_action`     | Allow access                                                                                                                                        |
| `sync_parse_strip`           | Sync is stuck. This tab couldn’t read your latest save.                                                                                             |
| `sync_parse_title`           | Hmm, this tab couldn’t read your latest save                                                                                                        |
| `sync_parse_body`            | That usually means the game just updated and the tracker needs to catch up. Don’t worry, your phone still has everything up to your last good save. |
| `sync_parse_step_update`     | Check whether there’s a tracker update.                                                                                                             |
| `sync_parse_update_action`   | Check for an update                                                                                                                                 |
| `sync_parse_step_log`        | Still stuck? Send us a sync log and we’ll take a look.                                                                                              |
| `sync_parse_log_action`      | Send a sync log                                                                                                                                     |
| `sync_missing_strip`         | Sync lost track of your save file.                                                                                                                  |
| `sync_missing_title`         | Your save file moved                                                                                                                                |
| `sync_missing_body`          | It was renamed, moved, or deleted, so this tab lost track of it. Drag the newest {suffix} in again.                                                 |
| `sync_wrong_file_title`      | That’s not a save file                                                                                                                              |
| `sync_wrong_file_body`       | Look for a file ending in {suffix} in the saves folder.                                                                                             |
| `sync_other_tab_title`       | Another tab’s already on it                                                                                                                         |
| `sync_other_tab_body`        | Only one tab at a time can sync. You can close this one; the other tab has it covered.                                                              |
| `sync_browser_title`         | This browser can’t keep watching a file                                                                                                             |
| `sync_browser_body`          | Sync needs Chrome or Edge on your PC. You can still import your save here by hand.                                                                  |
| `sync_browser_action`        | Import from save file                                                                                                                               |
| `sync_firefox_title`         | In Firefox, drop your save after you play                                                                                                           |
| `sync_firefox_body`          | Firefox can’t keep watching the save, so drop it in here whenever you want your phone to catch up.                                                  |
| `sync_paused_strip`          | Sync is taking a break.                                                                                                                             |
| `sync_paused_title`          | Sync is taking a break                                                                                                                              |
| `sync_paused_body`           | We switched sync off for a bit while we fix something. Nothing’s lost, and you can keep checking things off by hand.                                |
| `sync_offline_title`         | Waiting for the internet                                                                                                                            |
| `sync_offline_body`          | Your latest save goes to your phone as soon as this PC is back online.                                                                              |
| `sync_daily_cap_strip`       | Sync is resting until tomorrow.                                                                                                                     |
| `sync_daily_cap_title`       | That’s a lot of saves for one day!                                                                                                                  |
| `sync_daily_cap_body`        | This PC hit today’s sending limit. Your phone has the last one, and sync picks back up tomorrow.                                                    |
| `sync_unseen_strip`          | Sync stopped. Your phone needs pairing again.                                                                                                       |
| `sync_unseen_title`          | Your phone hasn’t checked in since {date}                                                                                                           |
| `sync_unseen_body`           | After two weeks without a visit, the pairing expires. Pair it again to pick up where you left off.                                                  |
| `sync_unpaired_remote_strip` | Sync is off.                                                                                                                                        |
| `sync_unpaired_remote_title` | Your phone turned off sync                                                                                                                          |
| `sync_unpaired_remote_body`  | Pair a phone whenever you want to start again.                                                                                                      |
| `sync_code_expired_title`    | That code timed out                                                                                                                                 |
| `sync_code_expired_body`     | Codes only last a couple of minutes. Grab a new one when your phone’s ready.                                                                        |
| `sync_code_expired_action`   | New code                                                                                                                                            |
| `sync_pairing_refused_title` | Pairing didn’t start                                                                                                                                |
| `sync_pairing_refused_body`  | Something on our end said no. Give it a minute and try again.                                                                                       |
| `sync_try_again`             | Try again                                                                                                                                           |

### Problems on the phone

| Key                         | English                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `sync_pc_behind_title`      | Your PC needs a quick refresh                                                                          |
| `sync_pc_behind_body`       | The tracker on your PC is a version behind, so it can’t send updates. Reload that tab and you’re good. |
| `sync_phone_behind_title`   | This phone needs a quick refresh                                                                       |
| `sync_phone_behind_body`    | Your PC is a version ahead. Reload here to catch up.                                                   |
| `sync_reload`               | Reload                                                                                                 |
| `sync_phone_parse_title`    | This phone couldn’t read the latest save                                                               |
| `sync_phone_parse_body`     | It probably needs a tracker update. Reload to check.                                                   |
| `sync_blocked_title`        | Sync is on hold                                                                                        |
| `sync_blocked_body`         | Something’s off with the data saved on this phone, so sync is waiting until that’s sorted out.         |
| `sync_blocked_action`       | Go to Data                                                                                             |
| `sync_unpaired_by_pc_title` | Your PC turned off sync                                                                                |
| `sync_unpaired_by_pc_body`  | Everything that already synced stays here. Pair again whenever you like.                               |
| `sync_phone_code_timed_out` | Codes only last a couple of minutes. Your PC will offer a new one; scan that.                          |
| `sync_phone_rejected_title` | Your PC didn’t pair                                                                                    |
| `sync_phone_rejected_body`  | Someone tapped {reject} on the PC. If that was a mistake, scan the new code it’s showing.              |
| `sync_scan_again`           | Scan again                                                                                             |

## Out of scope

- The farm question, apply-&-tell toasts, & per-field questions belong to the receiver (#135) & the
  apply rules (#129).
- The privacy page’s “With sync” section is #136.
- The sync log’s contents are #137; this design only places “Send a sync log”.
