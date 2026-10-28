# Sync setup

tl;dr: Every device is in one of three lanes: it follows the save on this PC, follows the save from
another device, or tracks by hand. Following brings over only what’s in the game’s save; anything
checked off by hand stays on the device where it was checked off & is never sent anywhere. Switching
lanes erases the device, so following always starts fresh. Setup is two steps: drag the save in on
the PC, then open its follow link on the phone. This document is the journey, the screens, & the
copy for #131; the protocol is in [sync.md](sync.md), & the reasons are in
[the decision record](decisions/2026-10-28-sync-follow-the-save.md).

Status: journey & copy drafted for review on #131. Mockups are still to come. This replaces the
pairing design explored on #251.

## Mental model

1. **The game** writes a save file on the PC each time you sleep (and when you load in).
2. **Following** reads that save & updates the tracker. The PC follows its own save & shares a
   follow link; any other device can open the link & follow the same save.
3. **Only the save comes across.** Anything you check off by hand stays on the device where you
   checked it off. It’s never sent to your phone, your PC, or anywhere else.

Player-facing words: “the game”, “your save”, “your PC”, “this device”, “follow”, & “check off by
hand”. The page’s own name is “Follow your save”. Avoid “sync”, “pair”, & “relay” in player copy.

## Lanes

| Lane                       | Where                           | Progress comes from                         | Check-offs by hand        |
| -------------------------- | ------------------------------- | ------------------------------------------- | ------------------------- |
| Save on this computer      | The computer that runs the game | Its own save, watched (or dropped in again) | Allowed; stay on this one |
| Save on another device     | Any other device                | The follow link’s latest save               | Allowed; stay on this one |
| By hand, no save (default) | Any device                      | Check-offs, one-time imports, & backups     | Everything                |

The first two are the following lanes; the follow page offers all three as answers to “Where’s your
save file?” (see [Choosing a lane](#choosing-a-lane)).

- **One lane per device.** “Device” means one browser profile, or one installed app on iPhone, since
  iOS keeps those apart.
- **Every device starts by hand,** which is today’s tracker. Nothing changes until the player
  chooses to follow.
- **Switching lanes erases the device.** Following starts from the save, so a device with progress
  erases it first; leaving a following lane erases too. The erase dialog offers “Export a backup
  first” every time. This is the v1 rule, chosen over merging or carrying progress between lanes.
- **A lane starts when following works:** when the PC applies its first save, or when another device
  applies its first save from the link. Backing out before then changes nothing.
- **Within a lane, nothing is lost.** Following a different link, a new farm, & restoring a backup
  all stay in the lane; the next save applies with the usual rules (a new farm switches with a
  backup of the old one).
- **What a following lane hides.** Data’s “Import from Save File” & the transfer card, since the
  save already arrives by itself. Backup & restore, & check-offs by hand, stay.

## What the app detects

Four checks. They choose which options & copy appear; none of them picks a lane for the player.

| Check                         | How                                                                                                          | Effect                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A computer, not a phone       | User-Agent Client Hints `mobile` where supported, else no iOS or Android in the user agent, & a fine pointer | Shows “My save file is on this computer”                                              |
| A Mac                         | `Macintosh` in the user agent without touch                                                                  | Downplays that option to a quiet link, since the game has no Mac build                |
| Can this browser watch a file | Feature checks for `FileSystemObserver` & drop handles                                                       | “Updates every time you sleep”, or “Drop it in again after you play” & the Chrome tip |
| iPhone or iPad browser        | iOS user agent, or `Macintosh` with touch, & not standalone                                                  | The home screen question before following                                             |

The computer check is a heuristic, so the follow page keeps “On a computer?” & “On a phone?”
overrides at the bottom that show or hide the option.

## Choosing a lane

- **Home.** The welcome card offers “Follow your save” (“Your tracker updates itself from the game’s
  save.”) & keeps “I’ll check things off by hand”, which dismisses it, as today.
- **The follow page,** `mistria.fyi/follow`, which Data also links to, asks “Where’s your save
  file?” with up to three whole-card choices:
  1. “My save file is on another device”: “Scan the code or open the link from the computer that
     runs the game.”
  2. “My save file is on this computer”: “Your tracker here updates from it, & you can share it with
     your phone.” Shown only on a computer. On a Mac it’s a quiet link under the cards instead, “The
     game runs on this Mac”, for CrossOver & Whisky players.
  3. “I’ll track by hand, no save file”: “Check things off yourself. You can still import a save now
     & then.” This keeps the device as it is.
- **Under the choices,** always visible: “Following brings over what’s in your save. Anything you
  check off by hand stays on this device & isn’t sent anywhere.”
- **A device with progress** asks before either following lane starts, as a tag dialog: “Start fresh
  to follow?” / “Following starts from your save, so it erases this device’s progress, including
  anything you checked off by hand.” with “Export a backup first”, “Erase & follow”, & “Cancel”. The
  erase happens when the first save applies, in the same write, so a setup abandoned midway leaves
  progress as it was.

## On the PC

1. **Connect your save.** Copy the folder path, open it in File Explorer, & drag the newest save
   onto the drop box. It applies here at once: “Following your save” with the progress counts.
2. **Follow on your phone too** (optional, shown right after step 1). A covered QR code with “Show
   code”, “Copy link” for a computer with no camera, & “Streaming? Keep this off screen.”

- **Drag only where the save is watched.** Windows refuses the file picker under `%LOCALAPPDATA%`, &
  a picked file gives no handle to watch. The watched drop box has “Can’t drag? Choose the file
  instead”, which switches to dropping in again after each session, with that copy.
- **The Chrome tip.** In a browser that can’t watch a file & isn’t Chrome or Edge, a “Field tip”
  above the steps says “Let Chrome do this for you”, with “Copy this page’s link”.
- **Keep the tab open.** The step says the page updates while it’s open & suggests installing the
  app, without requiring either.
- **Showing the code again** is always one tap from Data or the status button, since following is
  never one-time.

### Save folders

| Platform                   | Folder                                                                                                              | How the step opens it                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Windows                    | `%LOCALAPPDATA%\FieldsOfMistria\saves`                                                                              | Paste into File Explorer’s address bar, press Enter   |
| Linux & Steam Deck, Proton | `~/.local/share/Steam/steamapps/compatdata/2142790/pfx/drive_c/users/steamuser/AppData/Local/FieldsOfMistria/saves` | In the file manager, press Ctrl+L, paste, press Enter |
| Mac, CrossOver             | `~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/AppData/Local/FieldsOfMistria/saves` | In Finder, press Shift-Command-G, paste, press Return |

The step shows the Windows path by default, with “On Linux, Steam Deck, or a Mac?” revealing the
others. Fields of Mistria’s Steam app ID is 2142790. The Proton & CrossOver paths, Steam Deck’s
browser, an SD card’s library, & Flatpak Steam are unverified; #130 checks them. The Linux row adds
“Not there? Look in your Steam library’s steamapps/compatdata/2142790 folder.”

## On another device

1. **Scan the code** with the tracker’s scanner, or “Or paste a link”. Opening the link directly (a
   Camera scan, a message to yourself) works the same way.
2. **It applies at once,** since the PC has already shared a save: “You’re following your save”,
   with the progress counts & when the save is from.

- **iPhone & iPad browsers** get one question before following, as a tag dialog: “Follow here, or in
  the home screen app?” / “Safari can clear a site’s data after a week away. The home screen app
  keeps it.” with “Follow in {browser}” & “I’ll use the app”, which explains Share › “Add to Home
  Screen”, then opening the app & scanning there.
- **A device already following** another link asks “Follow this save instead?”; the next save
  applies with the usual rules.
- **A computer following its own save** that opens a link says “Your save file is already on this
  computer.” & stays as it is.
- **A link that doesn’t parse** says “That link doesn’t look right” & keeps scanning & pasting.

## Living with it

Following devices have a quiet status button beside settings & feedback. Its panel says where the
save comes from & when the last one came, with “Show the code” on the PC. It speaks up with a dot &
a short slip only when something is late or wrong. Its accessible name is “Following: {status}”.

| Stage            | The PC                                        | Another device                                                   |
| ---------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Playing          | Updates each time you sleep; nothing to do    | Updates a moment later                                           |
| Away for a while | Nothing                                       | A slip after an unusually long gap (“No new saves in 5 days”)    |
| Browser restart  | Asks to re-allow reading the save (one click) | Nothing                                                          |
| Game update      | Can’t read the save: a field note on Home     | Keeps its last good progress; the date ages                      |
| App update       | Reloads itself at a safe moment               | Same; “Update the tracker on your PC” or “Update this tracker”   |
| New farm         | Drop the new save                             | Switches to the new farm & backs up the old one                  |
| New phone        | Show the code again                           | The new phone follows; the old one keeps following until stopped |
| Non-Chrome PC    | Drop the save in again after each session     | Updates whenever it’s dropped in                                 |
| New link         | “Make a new link” in Data                     | “Your PC stopped sharing this save”; follow the new code         |
| Paused           | “Following is taking a break”, hairline       | Same; checking off by hand still works                           |

Check-offs made by hand on a phone stay on that phone, so a new phone starts with only what’s in the
save. A player who wants them moves them with backup & restore, which stays in the lane.

## Leaving a lane

Data’s following card has “Stop following”, which opens a tag dialog: “Stop following & start over?”
/ “This erases this device’s progress, including anything you checked off by hand.” with “Export a
backup first”, “Erase & stop”, & “Cancel”. The device goes back to tracking by hand, empty.

- **On the PC,** stopping also retires the follow link, so other devices say “Your PC stopped
  sharing this save” & keep what they have until they stop too.
- **“Make a new link”** on the PC stays in the lane: it retires the old link & shows a new code, for
  when the old one leaked.
- **A device that can’t follow** (its stored progress is quarantined or from a newer build) can’t
  start a lane & points to Data first.

## Trouble

- **The save can’t be read** after a game update: a red field note on the PC (“Your save didn’t read
  right”), & other devices keep their last good progress.
- **The save moved or access lapsed:** an amber field note with the drop box & folder path again.
- **Following can’t be reached:** “We couldn’t reach the follow service” with “Try again”, on either
  side. Uploads retry by themselves.
- **Taking a break** (the kill switch): a hairline note on both sides; nothing to do.
- **Too many new links:** “That’s a lot of new links. Try again in a bit.” on the PC.
- **Another tab is already following** on the PC: “Already following in another window”.

## Accessibility

- **Focus follows the step.** When a step completes, focus moves to the next step’s title; a step
  that fails keeps focus on its own title with the error inside it. A tag dialog focuses its title &
  returns focus to the control that opened it.
- **One polite live region** announces step results (“Following your save”, “You’re following your
  save”), & an assertive one an error that blocks a step, once. Field notes already on a page at
  load are plain content.
- **Targets** are at least 44 px tall on phones & 24 px elsewhere. The drop box has the keyboard
  path described above.

## Visual direction

The screens reuse the app’s own pieces: the 512 px column, the Home header, DataCard, the tag
dialog, field notes, the toolbar & its panels, & ui/button. Steps are cards numbered in lowercase
roman numerals; photo-mount corners frame the code & the drop box. #251’s canvas has drawn versions
of most of these pieces to borrow from.

## Voice

A chill friend helping with a two-minute job: casual, short, a little playful, & never technical.
The app speaks as “we” (“we’ll keep up”). Most players upload one file & maybe scan a code, so no
screen should feel like a technical journey. Chosen in a copy workshop on #131 (option B of three);
the table below is still being rewritten to match.

## Copy

First draft, pending the tone workshop on #131: the voice should be chiller & friendlier than this.
Keys are new inlang messages; `{browser}`, `{time}`, & `{days}` are parameters.

| Key                        | Text                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `follow_title`             | Follow your save                                                                                                      |
| `follow_home_body`         | Your tracker updates itself from the game’s save.                                                                     |
| `follow_only_save`         | Following brings over what’s in your save. Anything you check off by hand stays on this device & isn’t sent anywhere. |
| `follow_where`             | Where’s your save file?                                                                                               |
| `follow_lane_other`        | My save file is on another device                                                                                     |
| `follow_lane_other_body`   | Scan the code or open the link from the computer that runs the game.                                                  |
| `follow_lane_here`         | My save file is on this computer                                                                                      |
| `follow_lane_here_body`    | Your tracker here updates from it, & you can share it with your phone.                                                |
| `follow_lane_here_mac`     | The game runs on this Mac                                                                                             |
| `follow_lane_hand`         | I’ll track by hand, no save file                                                                                      |
| `follow_lane_hand_body`    | Check things off yourself. You can still import a save now & then.                                                    |
| `follow_override_computer` | On a computer?                                                                                                        |
| `follow_override_phone`    | On a phone?                                                                                                           |
| `follow_erase_title`       | Start fresh to follow?                                                                                                |
| `follow_erase_body`        | Following starts from your save, so it erases this device’s progress, including anything you checked off by hand.     |
| `follow_erase_export`      | Export a backup first                                                                                                 |
| `follow_erase_confirm`     | Erase & follow                                                                                                        |
| `follow_pc_step_save`      | Connect your save                                                                                                     |
| `follow_pc_save_body`      | Copy this folder, open it in File Explorer, & drag your newest save here.                                             |
| `follow_pc_watched`        | Your tracker here updates every time you sleep, while this page is open.                                              |
| `follow_pc_redrop`         | Drop your save in again after you play to update.                                                                     |
| `follow_pc_cant_drag`      | Can’t drag? Choose the file instead                                                                                   |
| `follow_pc_done`           | Following your save                                                                                                   |
| `follow_pc_step_share`     | Follow on your phone too                                                                                              |
| `follow_pc_show_code`      | Show code                                                                                                             |
| `follow_pc_copy_link`      | Copy link                                                                                                             |
| `follow_pc_stream`         | Streaming? Keep this off screen.                                                                                      |
| `follow_pc_share_note`     | Your phone gets what’s in the save. Things you check off here stay on this PC.                                        |
| `follow_tip_chrome`        | Let Chrome do this for you                                                                                            |
| `follow_tip_chrome_body`   | In Chrome or Edge, your tracker updates every time you sleep, without dropping your save in again.                    |
| `follow_other_scan`        | Scan the code                                                                                                         |
| `follow_other_paste`       | Or paste a link                                                                                                       |
| `follow_other_done`        | You’re following your save                                                                                            |
| `follow_other_done_body`   | Updated from your save at {time}. Things you check off here stay on this device.                                      |
| `follow_ios_title`         | Follow here, or in the home screen app?                                                                               |
| `follow_ios_body`          | Safari can clear a site’s data after a week away. The home screen app keeps it.                                       |
| `follow_ios_here`          | Follow in {browser}                                                                                                   |
| `follow_ios_app`           | I’ll use the app                                                                                                      |
| `follow_ios_app_steps`     | Tap Share, then “Add to Home Screen”. Open the tracker from there & tap “Scan the code”.                              |
| `follow_switch_link`       | Follow this save instead?                                                                                             |
| `follow_pc_has_own`        | Your save file is already on this computer.                                                                           |
| `follow_bad_link`          | That link doesn’t look right                                                                                          |
| `follow_status_ok`         | Last save from your game {time}                                                                                       |
| `follow_status_gap`        | No new saves in {days} days                                                                                           |
| `follow_stop`              | Stop following                                                                                                        |
| `follow_stop_title`        | Stop following & start over?                                                                                          |
| `follow_stop_body`         | This erases this device’s progress, including anything you checked off by hand.                                       |
| `follow_stop_confirm`      | Erase & stop                                                                                                          |
| `follow_new_link`          | Make a new link                                                                                                       |
| `follow_new_link_body`     | Devices following the old link stop getting saves until they follow the new one.                                      |
| `follow_retired`           | Your PC stopped sharing this save                                                                                     |
| `follow_unreadable`        | Your save didn’t read right                                                                                           |
| `follow_reallow`           | Let the tracker read your save again                                                                                  |
| `follow_unreachable`       | We couldn’t reach the follow service                                                                                  |
| `follow_paused`            | Following is taking a break                                                                                           |
| `follow_too_many`          | That’s a lot of new links. Try again in a bit.                                                                        |
| `follow_other_window`      | Already following in another window                                                                                   |
| `follow_update_pc`         | Update the tracker on your PC                                                                                         |
| `follow_update_here`       | Update this tracker                                                                                                   |
| `follow_blocked`           | Sort out this device’s data first                                                                                     |

## Decisions so far

- Three lanes, one per device, with an erase to switch, so following never merges into existing
  progress (maintainer, 2026-10-28).
- The PC follows its own save without being asked or told it’s “following itself”; sharing is an
  optional second step.
- The lane choice asks where the save file is, with tracking by hand as the third option; “on this
  computer” appears only on a computer & is a quiet link on a Mac (maintainer, 2026-10-28).
- Detection only shows, hides, or words options, with overrides, & never picks a lane.
- The erase lands in the same write as the first save, so an abandoned setup loses nothing.
- Restore & a new farm stay inside a lane; only switching lanes erases.
- The voice is a chill friend that speaks as “we” (maintainer, 2026-10-28).
