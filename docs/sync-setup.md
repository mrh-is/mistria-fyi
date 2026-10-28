# Sync setup

tl;dr: Setup is one file & maybe one QR code. On the gaming computer, the player copies a folder
path, drags their autosave in, confirms it’s their farm, & (by default) shows a code for their
phone. Every device is in one of three lanes: its save file is on this computer, its save file is on
another device, or it tracks by hand. Only the game’s save file syncs; anything checked off by hand
stays on the device where it was checked off. Switching lanes erases the device, so syncing always
starts fresh. This document is the journey, the screens, & the copy for #131; the protocol is in
[sync.md](sync.md), & the reasons are in
[the decision record](decisions/2026-10-28-sync-follow-the-save.md).

Status: journey & copy rewritten in the maintainer’s voice on #131; mockups are still to come. This
replaces the pairing design explored on #251.

## Mental model

1. **The game** writes a save file on the gaming computer each time you sleep (and when you load
   in).
2. **Syncing your save file** reads it & updates the tracker. The gaming computer reads its own save
   file & shares a code; any other device can scan the code & sync the same save file.
3. **Only the save file syncs.** Anything you check off by hand stays on the device where you
   checked it off. It’s never sent anywhere.

The easiest pattern, which the copy nudges toward without enforcing: track on one device (usually
the phone), & let the gaming computer just read the save file.

## Voice

A chill friend helping with a two-minute job: casual, warm, a little goofy, & never technical. Most
players upload one file & maybe scan a code, so no screen should feel like a technical journey. The
maintainer’s samples on #131 set the tone, & [voice.md](voice.md) now holds it for the whole app.
For sync in particular:

- **Speak as “we”,** & talk to the player directly. Contractions & loose spellings are fine
  (“gonna”, “wanna”).
- **Be honest about effort, then reassure.** “Gonna be honest, this is the trickiest part. But once
  you’re done here, it’s smooth sailing!”
- **Explain the why** in a sentence when it helps. Longer & kinder beats terse & cryptic.
- **Playful asides** belong in parentheses & button subtitles (“the way my ancestors did it”).
- **Use the player’s world:** their farmer, their farm, _Fields of Mistria_.
- **“Sync” always travels with “save file”** (“sync your save file”, “only the game’s save file gets
  synced”), so every mention reinforces what syncs & what doesn’t. Never “pair”, “relay”, “follow”,
  or “link” in player copy, except “Copy link” for computers with no camera.
- **Reassure on errors in this order:** nothing is lost, it isn’t your fault, here’s what happens
  next. Never promise a precise time.
- **Remind the gaming computer to stay open,** often: at success, in its status, & on its errors.
- **“Check off”, not “tick”,** matching the rest of the app.

## Lanes

| Lane                        | Where                           | Progress comes from                              | Check-offs by hand        |
| --------------------------- | ------------------------------- | ------------------------------------------------ | ------------------------- |
| Save file on this computer  | The computer that runs the game | Its own save file, watched (or dropped in again) | Allowed; stay on this one |
| Save file on another device | Any other device                | The latest save file from the gaming computer    | Allowed; stay on this one |
| By hand (default)           | Any device                      | Check-offs, one-time imports, & backups          | Everything                |

- **One lane per device.** “Device” means one browser profile, or one installed app on iPhone, since
  iOS keeps those apart.
- **Every device starts by hand,** which is today’s tracker.
- **Switching lanes erases the device.** Syncing starts from the save file, so a device with
  progress erases it first; leaving a syncing lane erases too. The dialog offers a backup every
  time. This is the v1 rule, chosen over merging or carrying progress between lanes.
- **A lane starts when the first save file applies.** The erase lands in the same write, so backing
  out before then changes nothing.
- **Within a lane, nothing is lost.** Scanning a different code, a new farm, & restoring a backup
  all stay in the lane; the next save file applies with the usual rules (a new farm switches with a
  backup of the old one).
- **What a syncing lane hides.** Data’s “Import from Save File” & the transfer card, since the save
  file already arrives by itself. Backup & restore, & check-offs by hand, stay.

### What stays by hand

The save file fills every category the tracker has. A few things it can’t settle, so syncing never
removes them, & the player sets them by hand:

- Household choices: relationship changes like a break-up, the break-ups setting, & choosing not to
  have children (only wanting them leaves evidence). Sync doesn’t compare household facts yet
  ([sync.md](sync.md#completeness)).
- The Mistmare’s appearance, which the save shows only through one cutscene.

The erase dialog & the “only the save file syncs” notes can say “nearly everything” honestly.
Improving the reader for these is #277.

## What the app detects

Four checks. They choose which options & copy appear; none of them picks a lane for the player.

| Check                         | How                                                                                                          | Effect                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| A computer, not a phone       | User-Agent Client Hints `mobile` where supported, else no iOS or Android in the user agent, & a fine pointer | Shows “My save file is on this computer”; picks computer or phone copy        |
| A Mac                         | `Macintosh` in the user agent without touch                                                                  | Downplays that option to a quiet link, since the game has no Mac build        |
| Can this browser watch a file | Feature checks for `FileSystemObserver` & drop handles                                                       | “Every time you sleep”, or “Drop it in again after you play” & the Chrome tip |
| iPhone or iPad browser        | iOS user agent, or `Macintosh` with touch, & not standalone                                                  | The home screen question before syncing                                       |

The computer check is a heuristic, so the sync page keeps “On a computer?” & “On a phone?” overrides
at the bottom.

## Getting started

- **Home’s welcome card** asks “Ready to get started?” with two whole-card buttons, each with a
  subtitle:
  - “Sync from my farm automagically” (“set up in 2 minutes, plus phone sync” on a computer, “set up
    in 2 minutes from your gaming computer” on a phone), which opens `mistria.fyi/sync`.
  - “I’ll track it all by hand” (“the way my ancestors did it”), which dismisses the card, as today.
- **The sync page,** which Data also links to, asks “Where’s your save file?” on a computer:
  1. “My save file is on another device”: scan a code from the gaming computer.
  2. “My save file is on this computer”: read it here, & share it with your phone. On a Mac it’s a
     quiet link under the cards instead, “The game runs on this Mac”, for CrossOver & Whisky.
  3. “I’ll track it all by hand”.
- **On a phone** there’s only one way to sync, so the page goes straight to its steps, with “I’ll
  track it all by hand” at the bottom.
- **Next to the choices,** always visible, the only-the-save-file note, worded for the device (see
  [Copy](#copy)).
- **A device with progress** asks first, as a tag dialog: “FYI, this is a fresh start”, with “Make a
  backup”, “I’m ready to start anew”, & “Cancel”.

## On the gaming computer

1. **Find your save file.** The step admits it’s the trickiest part & promises smooth sailing after.
   - **Copy the folder.** The path (Windows by default; “On Linux, Steam Deck, or a Mac?” shows the
     others) with a Copy button. The drop box below looks inactive until the path is copied, by the
     button or by a manual copy (a `copy` event whose selection is inside the path). The gate is
     only visual: a save file dropped anyway still works, since it proves the player found it.
   - **Open it.** “Now open File Explorer and paste that into the address bar at the top.” It should
     show files like `game-[numbers]-autosave.sav`.
   - **Drag in the autosave.** Drag only where the save file is watched, since Windows refuses the
     file picker under `%LOCALAPPDATA%` & a picked file can’t be watched. “Can’t drag? Choose the
     file instead” switches to dropping it in again after each session, with that copy.
   - **Can’t find it?** A collapsed section, safest first: check the path was pasted into the
     address bar, not the search box; on Linux & Steam Deck, the Steam library fallback; then
     Windows key + R with the same path, noting it’s safe here because it only opens a folder, &
     never to paste anything else into Run.
2. **Is this your farm?** After the save file reads: “Perfect! Looks like that save file is for
   {farmer} on {farm}, is that right?” with “Yep!” & “Hmm, no, try that again”, which goes back to
   the drop box & mentions picking the file ending in `autosave`. Unnamed farmers & farms get their
   own variants, never filler text. “Yep!” applies the save file here.
3. **Wanna track this on your phone?** The default next step. “Show code” reveals the QR code (it
   starts covered, with the stream note), & “Copy link” covers a computer with no camera. “No
   thanks, I’ll track here” is the quieter choice & finishes setup.

- **Success says to keep the tab open:** “While this tab’s open, we’ll sync your save file every
  time you sleep.” A browser that can’t watch files says to drop it in again after playing instead.
- **The Chrome tip.** In a browser that can’t watch a file & isn’t Chrome or Edge, a “Field tip”
  above the steps says “Let Chrome do this for you”, with “Copy this page’s link”.
- **Showing the code again** is one tap from Data or the status button.

### Save folders

| Platform                   | Folder                                                                                                              | How the step opens it                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Windows                    | `%LOCALAPPDATA%\FieldsOfMistria\saves`                                                                              | Paste into File Explorer’s address bar, press Enter   |
| Linux & Steam Deck, Proton | `~/.local/share/Steam/steamapps/compatdata/2142790/pfx/drive_c/users/steamuser/AppData/Local/FieldsOfMistria/saves` | In the file manager, press Ctrl+L, paste, press Enter |
| Mac, CrossOver             | `~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/AppData/Local/FieldsOfMistria/saves` | In Finder, press Shift-Command-G, paste, press Return |

Fields of Mistria’s Steam app ID is 2142790. The Proton & CrossOver paths, Steam Deck’s browser, an
SD card’s library, & Flatpak Steam are unverified; #130 checks them. The Linux row adds “Not there?
Look in your Steam library’s steamapps/compatdata/2142790 folder.”

Note: the
[Steam Cloud manager](https://store.steampowered.com/account/remotestorageapp/?appid=2142790) also
lets a player download a save file. Setup doesn’t offer it, since a downloaded copy can’t be
watched, but it’s a handy way to grab a save file for development.

## On another device

1. **Scan the code** with the tracker’s scanner, or “Or paste a link”. Before a code exists, the
   step says to open `mistria.fyi/sync` on the gaming computer in Chrome or Edge. A code scanned
   with the Camera opens the page the same way.
2. **It applies at once,** since the gaming computer already shared a save file: “Got it! Your farm
   as of {time}. We’ll keep up from here.”, with the only-the-save-file note.

- **iPhone & iPad browsers** get one question first, as a tag dialog: sync here, or in the home
  screen app, since Safari can clear a site’s data after a week away & the app keeps it. “I’ll use
  the app” explains Share › “Add to Home Screen”, then opening the app & scanning there.
- **A device already syncing** from another code asks “Sync this save file instead?”; the next save
  file applies with the usual rules.
- **The gaming computer** that scans or opens its own code says “Your save file is already on this
  computer.” & stays as it is.
- **A code that doesn’t parse** says so & keeps scanning & pasting.

## Living with it

Syncing devices have a quiet status button beside settings & feedback. Its panel says where the save
file comes from & when the last one came, with “Show code” on the gaming computer & a reminder to
keep the tab open there. It speaks up with a dot & a short slip only when something is late or
wrong. Its accessible name is “Save file sync: {status}”.

| Stage            | The gaming computer                             | Another device                                                       |
| ---------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Playing          | Syncs each time you sleep, while the tab’s open | Updates a moment later                                               |
| Away for a while | Nothing                                         | A slip after an unusually long gap                                   |
| Browser restart  | Asks to read the save file again (one click)    | Nothing                                                              |
| Game update      | Can’t read the save file: the notice below      | “Your computer is having trouble reading your save file”             |
| App update       | Reloads itself at a safe moment                 | Same; “Update the tracker on your computer” or “Update this tracker” |
| New farm         | Drop the new save file in                       | Switches to the new farm & backs up the old one                      |
| New phone        | Show the code again                             | The new phone scans it; the old one keeps syncing until it stops     |
| Non-Chrome       | Drop the save file in again after each session  | Updates whenever it’s dropped in                                     |
| New code         | “Make a new code” in Data                       | “Your computer stopped sharing this save file”; scan the new code    |
| Paused           | “Sync’s taking a nap”, hairline                 | Same; checking off by hand still works                               |

Check-offs made by hand on a phone stay on that phone, so a new phone starts with only what’s in the
save file. A player who wants them moves them with backup & restore, which stays in the lane.

## Leaving a lane

Data’s sync card has “Stop syncing”, which opens a tag dialog that erases the device & returns it to
tracking by hand, offering a backup first.

- **On the gaming computer,** stopping also retires the code, so other devices say the computer
  stopped sharing & keep what they have until they stop too.
- **“Make a new code”** stays in the lane: it retires the old code & shows a new one, for when the
  old one ended up on stream.
- **A device that can’t sync** (its stored progress is quarantined or from a newer build) can’t
  start a lane & points to Data first.

## Trouble

- **The save file can’t be read** after a game update. The gaming computer gets the full notice:
  nothing is lost, it isn’t your fault, we’re on it, & the next read applies everything since, so
  keep the tab open. Other devices get a short version pointing back to the computer.
- **The save file moved or access lapsed:** an amber field note with the drop box & folder again.
- **Sync can’t be reached:** “We can’t reach the sync service right now” with “Try again”, on either
  side. Uploads retry by themselves.
- **Taking a nap** (the kill switch): a hairline note on both sides; nothing to do.
- **Too many new codes:** a friendly “slow down” on the gaming computer.
- **Another tab is already syncing** on the gaming computer: says so & points to the other window.

## Accessibility

- **Focus follows the step.** When a step completes, focus moves to the next step’s title; a step
  that fails keeps focus on its own title with the error inside it. A tag dialog focuses its title &
  returns focus to the control that opened it.
- **One polite live region** announces step results, & an assertive one an error that blocks a step,
  once. Field notes already on a page at load are plain content.
- **The copy gate** is announced: the drop box has `aria-disabled` & a description (“Copy the folder
  first”) until the path is copied, & dropping or choosing a file still works.
- **Targets** are at least 44 px tall on phones & 24 px elsewhere. The drop box has the keyboard
  path described above.

## Visual direction

The screens reuse the app’s own pieces: the 512 px column, the Home header, DataCard, the tag
dialog, field notes, the toolbar & its panels, & ui/button. Steps are cards numbered in lowercase
roman numerals; photo-mount corners frame the code & the drop box. #251’s canvas has drawn versions
of most of these pieces to borrow from.

## Copy

Keys are new inlang messages. `{farmer}`, `{farm}`, `{time}`, `{days}`, & `{browser}` are
parameters; `_device` variants use inlang’s `match` on computer or phone. Text in parentheses after
a button is its subtitle. Line breaks in a body are paragraphs.

### Getting started

| Key                         | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync_home_title`           | Ready to get started?                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sync_home_body`            | Let’s get you set up to keep track of all that hard work. How do you wanna work?                                                                                                                                                                                                                                                                                                                                                                       |
| `sync_home_sync`            | Sync from my farm automagically                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sync_home_sync_sub_device` | Computer: set up in 2 minutes, plus phone sync. Phone: set up in 2 minutes from your gaming computer.                                                                                                                                                                                                                                                                                                                                                  |
| `sync_home_hand`            | I’ll track it all by hand                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sync_home_hand_sub`        | the way my ancestors did it                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sync_where_title`          | Where’s your save file?                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `sync_where_other`          | My save file is on another device                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sync_where_other_sub`      | like my gaming PC                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sync_where_here`           | My save file is on this computer                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `sync_where_here_sub`       | I play right here                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sync_where_here_mac`       | The game runs on this Mac                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sync_where_hand`           | I’ll track it all by hand                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sync_only_save_device`     | Computer: Heads up: only the game’s save file gets synced; anything you check off by hand on this computer stays here. Easiest is to track on one device, like your phone, and let your gaming computer just read the save file. Phone: Heads up: only the game’s save file gets synced; anything you check off by hand on this phone stays here. Easiest is to do all your tracking right here, and let your gaming computer just read the save file. |
| `sync_override_computer`    | On a computer?                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `sync_override_phone`       | On a phone?                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `sync_fresh_title`          | FYI, this is a fresh start                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sync_fresh_body`           | You’ll be starting fresh by syncing your save file, which means anything you’ve tracked on this device will be cleared. Your save file will check off nearly everything on its own, but you can make a quick backup first if you’d like.                                                                                                                                                                                                               |
| `sync_fresh_backup`         | Make a backup                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `sync_fresh_confirm`        | I’m ready to start anew                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `sync_fresh_cancel`         | Cancel                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### On the gaming computer

| Key                        | Text                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_find_title`          | Find your save file                                                                                                                                                                         |
| `sync_find_intro`          | Gonna be honest, this is the weirdest part of the setup. But once you’re done here, it’s smooth sailing!                                                                                    |
| `sync_find_copy_lead`      | First, copy this folder location:                                                                                                                                                           |
| `sync_find_copy`           | Copy                                                                                                                                                                                        |
| `sync_find_copied`         | Copied!                                                                                                                                                                                     |
| `sync_find_other_os`       | On Linux, Steam Deck, or a Mac?                                                                                                                                                             |
| `sync_find_open`           | Now open File Explorer and paste that into the address bar at the top. It should take you to a folder with files like `game-[numbers]-autosave.sav`. Drag that autosave file into this box: |
| `sync_find_drop`           | Drop your autosave here                                                                                                                                                                     |
| `sync_find_drop_locked`    | Copy the folder first, and this box will wake up.                                                                                                                                           |
| `sync_find_cant_drag`      | Can’t drag? Choose the file instead                                                                                                                                                         |
| `sync_find_help`           | Can’t find it?                                                                                                                                                                              |
| `sync_find_help_bar`       | Make sure you pasted it into the address bar at the very top of File Explorer, not the search box.                                                                                          |
| `sync_find_help_run`       | Still nothing? Press the Windows key + R, paste the same folder location, and press Enter. (That only opens a folder. Never paste anything else into that box, from us or anyone.)          |
| `sync_farm_title`          | Perfect! Looks like that save file is for {farmer} on {farm}, is that right?                                                                                                                |
| `sync_farm_title_unnamed`  | Perfect! We found a farm in that save file. Is it yours?                                                                                                                                    |
| `sync_farm_yes`            | Yep!                                                                                                                                                                                        |
| `sync_farm_no`             | Hmm, no, try that again                                                                                                                                                                     |
| `sync_farm_no_hint`        | No worries! Pick the newest file that ends in “autosave”.                                                                                                                                   |
| `sync_phone_title`         | Wanna track this on your phone?                                                                                                                                                             |
| `sync_phone_body`          | Or another device. Scan this code with it, and it’ll sync your save file from here on out.                                                                                                  |
| `sync_phone_show`          | Show code                                                                                                                                                                                   |
| `sync_phone_copy_link`     | Copy link                                                                                                                                                                                   |
| `sync_phone_copy_link_sub` | for a computer with no camera                                                                                                                                                               |
| `sync_phone_stream`        | Live on stream? Maybe don’t show this bit.                                                                                                                                                  |
| `sync_phone_no`            | No thanks, I’ll track here                                                                                                                                                                  |
| `sync_done_title`          | Nice, you’re all set!                                                                                                                                                                       |
| `sync_done_watched`        | While this tab’s open, we’ll sync your save file every time you sleep. So leave it open while you play!                                                                                     |
| `sync_done_redrop`         | Whenever you’re done playing, drop your save file in again and we’ll sync it.                                                                                                               |
| `sync_tip_chrome`          | Let Chrome do this for you                                                                                                                                                                  |
| `sync_tip_chrome_body`     | In Chrome or Edge, we can sync your save file every time you sleep, no dropping it in again.                                                                                                |
| `sync_tip_chrome_copy`     | Copy this page’s link                                                                                                                                                                       |

### On another device

| Key                  | Text                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sync_scan_title`    | Scan the code from your gaming computer                                                                           |
| `sync_scan_body`     | On your gaming computer, open {url} in Chrome or Edge and follow along there. When it shows a code, scan it here. |
| `sync_scan`          | Scan the code                                                                                                     |
| `sync_scan_paste`    | Or paste a link                                                                                                   |
| `sync_scan_bad`      | Hmm, that link doesn’t look quite right. Try scanning the code instead?                                           |
| `sync_got_it_title`  | Got it!                                                                                                           |
| `sync_got_it_body`   | Your farm as of {time}. We’ll keep up from here.                                                                  |
| `sync_ios_title`     | Quick question: here, or the home screen app?                                                                     |
| `sync_ios_body`      | Safari can clear a site’s data if you don’t visit for a week. The home screen app hangs on to it.                 |
| `sync_ios_here`      | Sync in {browser}                                                                                                 |
| `sync_ios_app`       | I’ll use the app                                                                                                  |
| `sync_ios_app_steps` | Tap Share, then “Add to Home Screen”. Open the tracker from your home screen and tap “Scan the code” there.       |
| `sync_switch_title`  | Sync this save file instead?                                                                                      |
| `sync_already_here`  | Your save file is already on this computer.                                                                       |

### Living with it

| Key                     | Text                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sync_status_ok`        | Last save file from your game: {time}                                                                                |
| `sync_status_keep_open` | Keep this tab open while you play so we can sync your save file.                                                     |
| `sync_status_gap`       | Haven’t heard from your game in {days} days                                                                          |
| `sync_stop`             | Stop syncing                                                                                                         |
| `sync_stop_title`       | Stop syncing and start over?                                                                                         |
| `sync_stop_body`        | This clears everything on this device, including anything you checked off by hand. Wanna make a quick backup first?  |
| `sync_stop_confirm`     | Clear it and stop                                                                                                    |
| `sync_new_code`         | Make a new code                                                                                                      |
| `sync_new_code_body`    | Showed your code on stream? No problem. A new code stops the old one, so your other devices will need to scan again. |
| `sync_retired`          | Your computer stopped sharing this save file. Scan its new code to keep syncing.                                     |
| `sync_reallow`          | Mind letting us read your save file again? Your browser asks after a restart.                                        |
| `sync_moved`            | We lost track of your save file. Drop it in again and we’re back in business.                                        |
| `sync_unreachable`      | We can’t reach the sync service right now. We’ll keep trying, or you can try again.                                  |
| `sync_paused`           | Sync’s taking a nap. Checking things off by hand still works.                                                        |
| `sync_too_many`         | Whoa, that’s a lot of new codes! Give it a few minutes and try again.                                                |
| `sync_other_window`     | Your save file is already syncing in another window.                                                                 |
| `sync_update_computer`  | The tracker on your computer needs a refresh to keep syncing.                                                        |
| `sync_update_here`      | This tracker needs a refresh to keep syncing.                                                                        |
| `sync_blocked`          | Before we can sync your save file, this device’s data needs a look. Head to Data to sort it out.                     |

### The save file can’t be read

On the gaming computer (title, then three paragraphs):

| Key                       | Text                                                                                                                                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sync_unreadable_title`   | Hmm, we can’t read your save file                                                                                                                                                                                                                                                            |
| `sync_unreadable_safe`    | Number one: nothing is lost. Your progress is totally safe.                                                                                                                                                                                                                                  |
| `sync_unreadable_why`     | Number two: this isn’t anything you did. It can happen when _Fields of Mistria_ releases an update. Rest assured that we’re on the case, and this field guide should be updated shortly. When it is, it’ll read your save file again and catch up on everything you’ve done in the meantime. |
| `sync_unreadable_for_now` | For now, just leave this tab open, and enjoy… whatever is in the new update!                                                                                                                                                                                                                 |

On other devices:

| Key                          | Text                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- |
| `sync_unreadable_away_title` | Your computer is having trouble reading your save file                            |
| `sync_unreadable_away_body`  | Your progress is safe! For more info, check Mistria Field Guide on your computer. |

## Decisions so far

- Three lanes, one per device, with an erase to switch, so syncing never merges into existing
  progress (maintainer, 2026-10-28).
- The gaming computer reads its own save file without being told it “follows itself”; sharing with a
  phone is the default next step, with “No thanks” (maintainer).
- The lane question asks where the save file is, with tracking by hand as the third option; “on this
  computer” appears only on a computer & is a quiet link on a Mac (maintainer).
- Detection only shows, hides, or words options, with overrides, & never picks a lane.
- The erase lands in the same write as the first save file, so an abandoned setup loses nothing.
- Restore & a new farm stay inside a lane; only switching lanes erases.
- The voice is a chill friend that speaks as “we”, & “sync” always travels with “save file”
  (maintainer).
- Copying the folder path gates the drop box visually, never functionally (maintainer).
- The farm confirmation (“Is this your farm?”) follows the first read, to catch a wrong file early
  (maintainer).
- Windows key + R comes after the safe instructions, with a warning against pasting anything else,
  since Run is a common scam vector (maintainer).
- “Shortly” stays in the unreadable-save notice; it’s a soft promise, & a fix takes about an hour
  once the maintainer reaches the gaming computer (maintainer).
