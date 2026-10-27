# Sync setup & pairing

tl;dr: “Sync from game” is a new first card in Data › Field kit, on both the PC & the phone. The PC
card walks through two steps (drop the save, then pair a phone), and the phone card scans the PC’s
code. The PC confirms the phone that answers before pairing completes, and the code starts covered
so a streamer can’t show it by accident. This document is the UI & copy for #131; the protocol is in
[sync.md](sync.md), whose rules this design follows. The mockups live on the
[design canvas](https://claude.ai/artifact/UhDfkQVf4Csu7eN9RcBStx) (private; ask the maintainer for
access).

Status: proposed, awaiting maintainer approval on #131.

## Where it lives

- **One card, both devices.** “Sync from game” sits first under Data › Field kit, above “Import from
  Save File”. The same card shows the courier setup on a PC and the scanner on a phone.
- **Which side shows first.** A device that can hold a file handle (`showOpenFilePicker` & drag
  handles exist, and the pointer is fine) opens on the PC steps with “Scan a code instead” below. A
  touch device opens on the scanner with “Set up this device as the PC” below. Neither side is
  locked, since a tablet or a Steam Deck can be either.
- **Freshness on home.** A paired phone shows a one-line stamp under the home title that links to
  the card. An unpaired device shows nothing.
- **Visual language.** The existing data-card style, with Field Guide touches: photo-mount corners
  on the drop box & the QR, roman-numeral steps, a dotted ledger for paired details, and slightly
  rotated paper for sheets & toasts. No new tokens are needed; status colors use the existing
  `--color-status-*` roles.

## PC flow

1. **Drop the save (step 1 of 2).** The card explains sync in two sentences, shows
   `%LOCALAPPDATA%\FieldsOfMistria\saves` as copyable text for Explorer’s address bar, and offers a
   drop box. It states the two rules every player needs: sync goes one way, from the game to one
   phone, and one PC means one browser profile.
2. **Pair a phone (step 2 of 2).** A strip confirms the watched farm & when it last saved, with “Use
   a different save”. The QR starts covered by a paper flap; “Show code” reveals it and starts the
   two-minute countdown, and “Hide code” covers it again. The stream hint sits beside the code. An
   install tip (“Install”, optional) closes the card.
3. **A phone answered.** The PC asks “Is this your phone?”, naming the device and when it answered.
   When a phone is already paired, it says which one this replaces. “Yes, sync to this phone”
   accepts; “No, make a new code” rejects and issues a fresh offer. Acceptance shows the “Paired
   with {device}” toast.
4. **Paired.** The card shows “On”, the phone’s name, and a ledger: the save (farm & file name),
   last sent (with whether the phone received it), & phone last seen. “Pair a different phone”
   returns to step 2. “Unpair” asks once, in place, then tells the relay (queued if offline).

## Phone flow

1. **Not paired.** The card says to start on the PC and offers “Scan the code”, noting that the
   camera app works too. It repeats the one-phone & ticks-stay-put rules in the phone’s terms.
2. **Scanned, waiting.** A sheet names the PC and says to finish there. If the phone already syncs
   from another PC, a line says this pairing replaces it. “Cancel” abandons the answer.
3. **Paired.** The card shows “On”, the PC’s name, and a ledger: farm, last synced, & the learned
   usual gap. A line sets expectations: sync runs only while the PC page is open, and it is best
   effort. The “Paired with {device}” toast confirms the pairing.
4. **Home.** The stamp reads “Synced from game {time_ago}”, turns amber after an abnormally long
   gap, and reads “Sync is paused” under the kill switch. Opening after an abnormally long gap shows
   the long-gap toast once.
5. **iOS outside the app.** A scanned code opened in Safari shows “Scan this from the tracker app”
   with three steps and an “Add to Home Screen” hint. The page strips the offer and doesn’t answer
   it, so the same code still works from the app until it expires.

## Decisions for review

1. **The PC confirms the answering phone.** [sync.md](sync.md#stages--generations) requires the PC
   to accept before the phone shows “Paired” but doesn’t say whether a person approves it. This
   design makes it explicit, so a leaked code (a stream, a screenshot) can’t silently redirect
   someone’s sync. Rejecting issues a fresh offer. See
   [the decision record](decisions/2026-10-27-sync-pairing-confirm.md).
2. **The code starts covered.** Showing it is a deliberate click, and the countdown starts then.
   This puts the stream hint into the interaction instead of relying on the hint alone.
3. **Device names come from the browser.** “{platform} · {browser}” (for example “Windows PC ·
   Edge”, “Android phone · Chrome”, “iPhone · tracker app”), derived locally from User-Agent Client
   Hints with a user-agent fallback. Renaming is out of scope for v1.
4. **The protocol mismatch names the device that’s behind.** [sync.md](sync.md#versions) specifies
   “Update the tracker on your PC”; this design adds the mirror case, “Update the tracker on this
   phone”, because a reload on the PC can’t fix a phone that’s behind.
5. **Firefox & Steam Deck copy is drafted, not committed.** Both depend on the #130 hardware checks;
   ship only what those confirm.

## Copy

Keys follow [localization.md](localization.md#adding-a-new-ui-string-agents--humans): `sync_`
prefix, snake_case, & one message per sentence that wraps a link or placeholder. Placeholders are
`{device}` (a device name, built as in decision 3), `{farm}` (the save’s farm name), `{time_ago}`
(from `Intl.RelativeTimeFormat`), `{interval}` & `{duration}` (from `Intl.DurationFormat`), `{date}`
(from `Intl.DateTimeFormat`), `{countdown}` (m:ss), & `{step}` (a number). `{path}`, `{suffix}`,
`{accept}`, & `{scan}` are slots for other messages (`sync_path_data_sync`, the literal
`-autosave.sav`, `sync_pc_confirm_accept`, & `sync_phone_scan_action`), rendered in code style or
quotation marks with `messageParts`. English is final for review; the other seven locales are
machine-translated when the strings land in `messages/`, per the usual flow.

### Card & steps

| Key                        | English                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_card_title`          | Sync from game                                                                                                                                                              |
| `sync_card_summary`        | Send your progress from the game to your phone as you play.                                                                                                                 |
| `sync_step_label`          | Step {step} of 2                                                                                                                                                            |
| `sync_status_on`           | On                                                                                                                                                                          |
| `sync_pc_intro`            | Keep this page open on your gaming PC and your phone stays up to date. Each time the game saves, the tracker sends your progress to one paired phone, end-to-end encrypted. |
| `sync_pc_path_instruction` | Open File Explorer and paste this into the address bar:                                                                                                                     |
| `sync_pc_path_copy`        | Copy                                                                                                                                                                        |
| `sync_pc_path_copied`      | Copied                                                                                                                                                                      |
| `sync_pc_path_why`         | Your browser can’t open this folder itself; Windows treats it as a system folder.                                                                                           |
| `sync_pc_drop_instruction` | Drag the file ending in {suffix} onto the box below. If there are several, take the most recent.                                                                            |
| `sync_pc_drop_target`      | Drop your save here                                                                                                                                                         |
| `sync_pc_drop_local`       | The tracker reads it here, on this PC. Nothing is uploaded yet.                                                                                                             |
| `sync_rule_one_way`        | Sync goes one way: from the game to one phone. Ticks you make by hand stay on the device where you made them.                                                               |
| `sync_rule_one_profile`    | One PC means one browser profile. Set this up in the browser you’ll leave open while you play.                                                                              |
| `sync_pc_watching`         | Watching {farm} · saved {time_ago}                                                                                                                                          |
| `sync_pc_change_save`      | Use a different save                                                                                                                                                        |
| `sync_pc_pair_instruction` | Now pair your phone. Open the tracker on it, go to {path}, and scan this code, or point your phone’s camera at it.                                                          |
| `sync_path_data_sync`      | Data › Sync from game                                                                                                                                                       |
| `sync_pc_code_hidden`      | Code hidden                                                                                                                                                                 |
| `sync_pc_code_show`        | Show code                                                                                                                                                                   |
| `sync_pc_code_hide`        | Hide code                                                                                                                                                                   |
| `sync_pc_code_qr_alt`      | Pairing code for this PC                                                                                                                                                    |
| `sync_pc_code_expires`     | Code expires in {countdown}                                                                                                                                                 |
| `sync_pc_stream_hint`      | Don’t show this on stream. Whoever scans it first can pair with this PC.                                                                                                    |
| `sync_pc_install_tip`      | Tip: install the tracker on this PC and leave its window open while you play. A pinned tab works too.                                                                       |
| `sync_pc_install_action`   | Install                                                                                                                                                                     |
| `sync_scan_instead`        | Scan a code instead                                                                                                                                                         |
| `sync_be_the_pc`           | Set up this device as the PC                                                                                                                                                |

### Confirm, paired, & unpair

| Key                          | English                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `sync_pc_confirm_title`      | Is this your phone?                                                                |
| `sync_pc_confirm_answered`   | answered {time_ago}                                                                |
| `sync_pc_confirm_body`       | A device scanned this PC’s code. Say yes only if you scanned it just now.          |
| `sync_pc_confirm_replaces`   | This replaces {device}, which stops syncing.                                       |
| `sync_pc_confirm_accept`     | Yes, sync to this phone                                                            |
| `sync_pc_confirm_reject`     | No, make a new code                                                                |
| `sync_paired_toast`          | Paired with {device}                                                               |
| `sync_pc_paired_body`        | Syncing to {device}. Keep this page open while you play.                           |
| `sync_pc_ledger_save`        | Save                                                                               |
| `sync_pc_ledger_last_sent`   | Last sent                                                                          |
| `sync_pc_last_sent_received` | {time_ago} · received by your phone                                                |
| `sync_pc_last_sent_pending`  | {time_ago} · waiting for your phone                                                |
| `sync_pc_ledger_last_seen`   | Phone last seen                                                                    |
| `sync_pc_pair_different`     | Pair a different phone                                                             |
| `sync_unpair_action`         | Unpair                                                                             |
| `sync_unpair_confirm`        | Unpair {device}? It stops receiving your progress. Everything already on it stays. |
| `sync_unpair_keep`           | Keep syncing                                                                       |

### Phone

| Key                           | English                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `sync_phone_intro`            | Get your progress straight from the game, every time it saves. Start on your gaming PC: open the tracker there and go to {path}. |
| `sync_phone_scan_prompt`      | When your PC shows a code, scan it here.                                                                                         |
| `sync_phone_scan_action`      | Scan the code                                                                                                                    |
| `sync_phone_camera_app`       | Your phone’s camera app works too.                                                                                               |
| `sync_rule_one_phone`         | One phone per PC. Pairing another phone stops this one syncing.                                                                  |
| `sync_rule_ticks_stay`        | Your ticks stay put. Sync only brings in what the game saved; anything you tick here stays on this phone.                        |
| `sync_phone_waiting_title`    | Finish on your PC                                                                                                                |
| `sync_phone_waiting_body`     | Your PC is asking whether this is your phone. Choose {accept} there.                                                             |
| `sync_phone_waiting_status`   | Waiting for your PC…                                                                                                             |
| `sync_phone_waiting_replaces` | This phone syncs from {device} now. Pairing with this PC replaces it.                                                            |
| `sync_phone_paired_body`      | Syncing from {device}.                                                                                                           |
| `sync_phone_ledger_farm`      | Farm                                                                                                                             |
| `sync_phone_ledger_last`      | Last synced                                                                                                                      |
| `sync_phone_ledger_usual`     | Usually                                                                                                                          |
| `sync_phone_usual_gap`        | every {interval} or so while you play                                                                                            |
| `sync_phone_best_effort`      | Sync runs only while the tracker is open on your PC. It’s best effort: if a sync is missed, the next save catches up.            |
| `sync_home_stamp`             | Synced from game {time_ago}                                                                                                      |
| `sync_home_stamp_stale`       | Last synced from game {time_ago}                                                                                                 |
| `sync_long_gap_toast`         | No sync in {duration}. Is the tracker still open on your PC?                                                                     |
| `sync_ios_title`              | Scan this from the tracker app                                                                                                   |
| `sync_ios_body`               | On iPhone, Safari keeps its own copy of the tracker, apart from the app on your Home Screen. Pair the app instead:               |
| `sync_ios_step_open`          | Open Mistria Field Guide from your Home Screen.                                                                                  |
| `sync_ios_step_go`            | Go to {path}.                                                                                                                    |
| `sync_ios_step_scan`          | Tap {scan} and scan your PC again.                                                                                               |
| `sync_ios_add_hint`           | Not on your Home Screen yet? Tap the Share button, then “Add to Home Screen”.                                                    |

### Errors & notices on the PC

| Key                             | English                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sync_error_permission_title`   | Allow the tracker to read your save                                                                           |
| `sync_error_permission_body`    | Your browser asks again after a restart. Choose “Allow on every visit” so it stops asking.                    |
| `sync_error_permission_action`  | Allow access                                                                                                  |
| `sync_error_parse_title`        | Couldn’t read your latest save                                                                                |
| `sync_error_parse_body`         | If the game just updated, the tracker may need an update too. Your phone keeps everything from the last sync. |
| `sync_error_parse_update`       | Check for an update                                                                                           |
| `sync_error_parse_log`          | Send a sync log                                                                                               |
| `sync_error_missing_title`      | Can’t find your save                                                                                          |
| `sync_error_missing_body`       | It was moved, renamed, or deleted. Drag the newest {suffix} onto this page again.                             |
| `sync_error_wrong_file_title`   | That isn’t a Fields of Mistria save                                                                           |
| `sync_error_wrong_file_body`    | Drop a file ending in .sav from the saves folder.                                                             |
| `sync_error_other_window_title` | Already syncing in another window                                                                             |
| `sync_error_other_window_body`  | Only one window in this browser can sync. Use that window, or close it and reload this one.                   |
| `sync_error_browser_title`      | Sync from game needs Chrome or Edge on your PC                                                                |
| `sync_error_browser_body`       | This browser can’t keep reading a file. Importing a save by hand still works.                                 |
| `sync_error_browser_action`     | Import a save instead                                                                                         |
| `sync_firefox_title`            | Drop your save after you play                                                                                 |
| `sync_firefox_body`             | Firefox can’t keep watching the save, so drop it here again whenever you want your phone updated.             |
| `sync_paused_title`             | Sync is paused                                                                                                |
| `sync_paused_body`              | Sync is switched off for now while we fix a problem. Your progress is safe, and tracking by hand still works. |
| `sync_offline_title`            | Waiting for a connection                                                                                      |
| `sync_offline_body`             | Your latest save goes to your phone once this PC is back online.                                              |
| `sync_pending_title`            | Waiting for your phone                                                                                        |
| `sync_pending_body`             | Your phone picks up the latest save next time it opens the tracker. Saves wait up to 48 hours.                |
| `sync_daily_cap_title`          | Sending paused until tomorrow                                                                                 |
| `sync_daily_cap_body`           | This PC has sent as many saves as it can today. Your phone has the last one; the next goes out tomorrow.      |
| `sync_unseen_title`             | Your phone hasn’t checked in since {date}                                                                     |
| `sync_unseen_body`              | Pairings end after 14 days without a visit. Pair again to keep syncing.                                       |
| `sync_unseen_action`            | Pair again                                                                                                    |
| `sync_unpaired_remote_title`    | {device} unpaired                                                                                             |
| `sync_unpaired_remote_body`     | Pair a phone to start syncing again.                                                                          |
| `sync_unpaired_remote_action`   | Pair a phone                                                                                                  |
| `sync_code_expired_title`       | This code expired                                                                                             |
| `sync_code_expired_body`        | Codes last two minutes. Make a new one when your phone is ready.                                              |
| `sync_code_expired_action`      | New code                                                                                                      |
| `sync_pairing_refused_title`    | Couldn’t start pairing                                                                                        |
| `sync_pairing_refused_body`     | The tracker couldn’t confirm this request, or too many pairings started today. Try again later.               |
| `sync_pairing_refused_action`   | Try again                                                                                                     |

### Errors & notices on the phone

| Key                             | English                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `sync_error_pc_behind_title`    | Update the tracker on your PC                                                           |
| `sync_error_pc_behind_body`     | Your PC is running an older version of sync. Reload the tracker on your PC to catch up. |
| `sync_error_phone_behind_title` | Update the tracker on this phone                                                        |
| `sync_error_phone_behind_body`  | Your PC is running a newer version of sync.                                             |
| `sync_reload_action`            | Reload                                                                                  |
| `sync_error_phone_parse_title`  | Couldn’t read the latest save                                                           |
| `sync_error_phone_parse_body`   | This phone may need a tracker update.                                                   |
| `sync_blocked_title`            | Sync is waiting                                                                         |
| `sync_blocked_body`             | This phone’s saved data needs attention before sync can add to it.                      |
| `sync_blocked_action`           | Go to Data                                                                              |
| `sync_unpaired_by_pc_title`     | Your PC unpaired this phone                                                             |
| `sync_unpaired_by_pc_body`      | Your progress stays here. Scan a new code to sync again.                                |
| `sync_code_used_title`          | This code has expired                                                                   |
| `sync_code_used_body`           | Make a new one on your PC: {path}.                                                      |
| `sync_rejected_title`           | Your PC didn’t pair with this phone                                                     |
| `sync_rejected_body`            | If that was a mistake, make a new code on your PC and scan it again.                    |

## Out of scope

- The farm question (“Is this the farm you’ve been tracking?”), apply-&-tell toasts, & the per-field
  questions belong to the receiver (#135) & the apply rules (#129).
- The privacy page’s “With sync” section is #136.
- The sync log’s contents are #137; this design only places “Send a sync log”.
