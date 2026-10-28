# Sync setup & pairing

tl;dr: The app detects what it can (device, platform, iPhone browser vs. installed app, whether the
browser can watch a file) and asks only what it can’t. Home invites with one card; all setup happens
on one page, `mistria.fyi/sync`, which Data also links to. On a PC that page asks one question: will
you check things off on this PC or on your phone? Each browser ends up in one role: a **tracker**, a
**self-updating tracker**, or a **relay**. This document is the journey, the screens, & the copy for
#131; the protocol is in [sync.md](sync.md).

Status: screens & copy in review on #131. Every state has a mockup on the
[design canvas](https://claude.ai/artifact/UhDfkQVf4Csu7eN9RcBStx) (version 43); [Screens](#screens)
embeds a sheet per section. The happy path is approved; error & notice screens are first drafts.

## Mental model

Three parts, named the same way everywhere:

1. **The game** writes a save file on the PC each time you sleep (and when you load in).
2. **The relay**, a browser tab on that PC, watches the file & sends each new save onward.
3. **The tracker**, on your phone, receives it & updates your progress.

Sync moves the game’s save in one direction. Things checked off by hand stay on the device where
they were checked off, except once: when a PC that already holds progress pairs, it can send that
progress along (see [Carrying the PC’s progress](#carrying-the-pcs-progress)).

Player-facing names: “the game”, “your PC”, “your phone”, & “the tracker”. The PC tab calls itself
“the relay” only where its role matters (“This PC is the relay”).

## Roles

| Role                  | Where                   | Checks things off          | Gets progress from                           |
| --------------------- | ----------------------- | -------------------------- | -------------------------------------------- |
| Tracker (default)     | Any device              | Yes                        | Sync, a one-time import, or by hand          |
| Self-updating tracker | The PC running the game | Yes                        | Its own watched save                         |
| Relay                 | The PC running the game | No; the guide is read-only | Its own watched save, mirrored for reference |

- A browser is a tracker until setup makes it something else.
- **A relay never touches stored progress.** Whatever the browser had tracked stays in storage,
  untouched & hidden, while it relays. The read-only mirror lives in its own storage, outside stored
  progress & backups, and is discarded when the relay is turned off. Turning it off shows the stored
  progress again exactly as it was left.
- **A self-updating tracker** watches the save the same way a relay does but applies it locally,
  with no phone & no network. Check-offs are safe there, because nothing leaves the browser.
- **Why a relay doesn’t track.** If the PC tab took check-offs while relaying, they’d silently fail
  to reach the phone, which contradicts the mental model. A read-only mirror of the latest save
  keeps the guide useful on the PC without that trap. The relay already parses each save, so the
  mirror costs little.
- **The relay is a dashboard first.** In relay mode the app opens on a status dashboard: which
  phone, which save, when it last sent. Browsing the guide is a side trip from there. Trouble takes
  over that view and stays until dismissed, so a broken relay is hard to miss.

## First look

New players see the Home welcome card, which only invites; they can poke around first. The card’s
setup action opens `mistria.fyi/sync`, which does the work. “I’ll check things off by hand”
dismisses the card, as today.

- **On a PC,** the card lists what setup gets you (import your progress, keep it up to date, sync it
  to your phone) under one “Get set up” button, “About two minutes”. The card reads the same on
  Windows, Mac, & Linux.
- **On a phone,** the card’s button is “Sync from my PC”, with the step count on it (“2 steps, about
  two minutes”, or “3 quick steps” in an iPhone browser), and “How it works” beside it.
- **The setup page asks one question on a PC:** “On this PC” (1 step) or “On my phone” (2 steps).
  The two paths are whole-card buttons with an “or” between them, so they read as exclusive. “How it
  works” sits with the phone path, the only one it explains, and opens a tag dialog.
- **The redesign drops WelcomeCard’s corner ring & accent wash.** The ring waits on #10’s marginalia
  decision; the Field Guide doesn’t otherwise use gradients.

### The decision tree

Diamonds are questions the player answers; hexagons are checks the app makes itself and never asks.

```mermaid
flowchart TD
    classDef detected fill:#eeedea,stroke:#948a7c,stroke-dasharray:4 3
    classDef asked fill:#e1f5ee,stroke:#0f6e56
    classDef outcome fill:#eeedfe,stroke:#534ab7

    DEVICE{{What device is this?}}:::detected
    DEVICE -->|PC or Mac| CARD1[Card: “Get set up”]
    DEVICE -->|Phone| CARD2[Card: “Sync from my PC”]
    CARD1 -->|By hand| MANUAL[Manual tracking]:::outcome
    CARD2 -->|By hand| MANUAL

    CARD1 --> PLATFORM{{Which platform?}}:::detected
    PLATFORM -->|Windows or Linux| WHERE{On this PC,<br/>or on my phone?}:::asked
    PLATFORM -->|Mac| MACPAIR[Sync from my PC:<br/>pair by link]:::outcome
    MACPAIR -.->|“The game’s on this Mac”| WHERE

    WHERE -->|On this PC| WATCH1{{Can this browser watch a file?}}:::detected
    WATCH1 -->|Yes| SELF[Self-updating tracker]:::outcome
    WATCH1 -->|No| ONCE[Import once + Chrome tip]:::outcome

    WHERE -->|On my phone| WATCH2{{Can this browser watch a file?}}:::detected
    WATCH2 -->|Yes| RELAY[Relay: pair a phone, then connect the save]:::outcome
    WATCH2 -->|No| REDROP[Relay that re-drops the save + Chrome tip]:::outcome
    RELAY -.->|PC holds progress| CARRY[“Send this PC’s progress too”, checked]:::outcome

    CARD2 --> IOS{{iPhone browser?}}:::detected
    IOS -->|Yes| INSTALL[Step i: add to home screen<br/>optional; folds when skipped]:::outcome
    IOS -->|No| PAIR[Pair with your PC]:::outcome
    INSTALL --> PAIR
```

- **Import defaults to self-updating.** “On this PC” in a browser that can watch files gets the
  self-updating tracker without being asked; elsewhere it imports once, with the Chrome tip.
- **The choice is remembered,** and Data links back to the setup page. Every path stays reachable.
- **A Mac pairs like a phone.** Fields of Mistria has no Mac build, so a Mac is almost always where
  the player checks things off. A link covers CrossOver & Whisky players. A Linux PC or Steam Deck
  usually runs the game through Proton, so it gets the PC question.

### What the app can detect

| Check                     | How                                                                                                                                                 | Confidence                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| PC or phone               | User-Agent Client Hints `mobile` (Chrome & Edge only), plus a coarse pointer & screen size everywhere; “I’m on a computer” & “I’m on a phone” links | Heuristic; keep the overrides             |
| Platform                  | User-Agent Client Hints `platform`, else the user agent (`Windows`, `Macintosh` without touch, `Linux` or `X11` without `Android`)                  | Reliable; only picks defaults             |
| Installed or in a browser | `matchMedia("(display-mode: standalone)")`; `navigator.standalone` on iOS                                                                           | Reliable on iOS & Android                 |
| iPhone or iPad browser    | iOS user agent, or `Macintosh` with `navigator.maxTouchPoints > 1` (iPad Safari reports a Mac), & not standalone                                    | Reliable for iPhone; heuristic for iPad   |
| Can watch a file          | Feature checks for `FileSystemObserver` & drag-and-drop file handles                                                                                | Shows support only; behavior pending #130 |

- **Every iOS & iPadOS browser behaves like Safari here.** All of them, Firefox included, run on
  WebKit, and a home screen web app keeps its own storage apart from the browser that added it.
  Confirm on Firefox for iPhone during #130.
- **File watching is a capability check, not a promise.** A browser can have `FileSystemObserver`
  and still lose the file when the game replaces it instead of rewriting it; #130 checks that.
- **Android needs no install step.** An app installed from Chrome shares its storage with Chrome, so
  the data is already there.

### Why install on iPhone

A page can’t install itself on iOS, & `navigator.share` opens a share sheet without “Add to Home
Screen”, so the step gives instructions. Links, including Camera scans, always open in Safari, never
in the home screen app. The step still earns its place: Safari deletes a site’s script-written
storage after seven days of Safari use without visiting it, which would take progress & pairing keys
with it, while a home screen app keeps its own clock that only its own use resets. It also opens
full screen with its own icon. The step stays optional but recommended; #130 confirms the storage
behavior on current iOS.

## Save folders

| Platform                   | Folder                                                                                                              | How the step opens it                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Windows                    | `%LOCALAPPDATA%\FieldsOfMistria\saves`                                                                              | Paste into File Explorer’s address bar, press Enter   |
| Linux & Steam Deck, Proton | `~/.local/share/Steam/steamapps/compatdata/2142790/pfx/drive_c/users/steamuser/AppData/Local/FieldsOfMistria/saves` | In the file manager, press Ctrl+L, paste, press Enter |
| Mac, CrossOver             | `~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/AppData/Local/FieldsOfMistria/saves` | In Finder, press Shift-Command-G, paste, press Return |

Fields of Mistria’s Steam app ID is 2142790 ([SteamDB](https://steamdb.info/app/2142790/)). The
Proton & CrossOver paths, & Steam Deck’s browser, are unverified; #130 checks them. Other Wine
setups get “Look in its drive_c folder”.

## Setup journey

Setup starts on whichever device the player is holding. Starting on the phone, it says to open
`mistria.fyi/sync` on the PC in Chrome or Edge; arriving there from a phone’s instructions, the PC
still asks its one question. Either way, pairing comes first, then the save. The phone scans with
the tracker’s own scanner, so the pairing lands in whichever copy the player is using.

| Step | On the PC                                                       | On the phone                                            |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | Picks “On my phone” on `mistria.fyi/sync`                       | iPhone browser only: add to home screen, or skip        |
| 2    | Shows a covered code; “Show code” reveals it & “Copy link”      | With progress, asks “Keep what I have” or “Start fresh” |
| 3    |                                                                 | Taps “Scan the code” & scans                            |
| 4    | Shows a six-digit code; the player confirms it matches          | Shows the same code, then “You’re paired!”              |
| 5    | Sends this PC’s progress, if checked                            | “Your PC’s progress is here too”                        |
| 6    | Connect the save: copy the folder path, drag the newest file in | Waits for the first save                                |
| 7    | Sends the save                                                  | “It worked!”: progress appears                          |
| 8    | Opens on the relay dashboard while the player plays             | Updates each time the player sleeps in the game         |

Why pair first: the player sees success on the phone right away, and finishing the save step makes
progress appear on the phone moments later, which demonstrates the whole system once.

- **Steps are cards.** The current step is open with an accent rule; done steps fold to one line
  with a green rule & check; later steps fold & fade. A skipped step folds to “Skipped. Add it any
  time.” with “Show me”, so it never vanishes. Steps that don’t apply (installing, off iPhone) are
  absent.
- **The Chrome tip.** In a browser that can’t watch a file, a “Field tip” shipping tag sits above
  the steps: “Let Chrome do this for you”, with “Copy this page’s link”. Headlines say Chrome; body
  text says “Chrome or Edge”. It can’t be dismissed.
- **The Camera path on iPhone.** The Camera app opens codes in Safari, so a code that arrives that
  way asks “Pair Safari, or the app?” as a tag dialog. The page can’t open the home screen app, so
  “Got it” closes the dialog, & its text says to open the app & tap “Scan the code”.

### Pairing a computer

A Mac or a second PC has no camera aimed at the screen. With the code showing, the PC also offers
“Copy link”: the same offer URL the QR holds. The player sends it to the other computer however’s
easiest (“like a message to yourself”) & opens it there, or pastes it into the setup page. It
arrives like a Camera-opened code, & the match code guards it the same way. “Scan with this Mac’s
camera instead” stays as a fallback. The offer still expires after a couple of minutes.

### Carrying the PC’s progress

When the PC holds progress, pairing shows “Send this PC’s progress too”, checked, under the code:
“It adds to what’s on your phone, including things you checked off by hand.” After the phone
confirms the pairing, the PC sends that progress once through the sync channel, & the phone merges
it in before the first save. This replaces exporting a backup on the PC & restoring it on the phone.
See [sync.md](sync.md#carrying-the-pcs-progress) &
[the decision record](decisions/2026-10-28-sync-carry-pc-progress.md).

- **The phone decides about its own progress.** The PC can’t see the phone’s data before pairing, so
  a phone with progress asks before scanning: “Keep what I have” (the PC’s progress adds on top) or
  “Start fresh” (erases what’s on this phone first).
- **The PC’s stored progress stays where it is,** untouched, while it relays.

## Any time, not just first run

Every path stays reachable from Data, which links to the same setup page. Changing roles later:

- **Tracker or self-updating tracker → relay.** Setup offers to carry the PC’s progress, as above.
- **Tracker → self-updating tracker.** The first watched save applies through the apply rules
  (#129), like any sync, so earlier check-offs aren’t overwritten blindly.
- **Phone with progress → paired.** The first save asks “Is this the farm you’ve been tracking?” and
  merges through the apply rules (#135).
- **Relay → tracker.** Unpairing discards the mirror and shows the stored progress exactly as it was
  left.
- **Paired phone → unpaired.** Unpairing keeps everything already on the phone.

## Data management

The page keeps its name: pairing moves data too, and “Settings” already names the toolbar gear’s
panel. Its intro becomes “Pair your devices, or import, back up, or reset your Field Guide
progress.” It regroups into two sections:

- **Pairing:** “Pair with Your Phone” on a PC (“Keep your phone up to date every time you play.”) or
  “Pair with Your PC” on a phone (“Get each new save from your PC as you play.”). Open, it shows the
  device & last send, “Pair a different phone”, & “Unpair”. Its setup button opens the setup page.
- **Data:** “Import from Save File” (which also hosts the self-updating state & the relay’s save,
  with “Use a different save”), “Backup & Restore” (“Keep a copy of your progress, or move it to a
  new device once.”), & “Danger Zone”.

“Transfer to Another Device” leaves with #138, once sync ships. That also removes the question of
pairing vs. transfer: pairing keeps a phone up to date, & Backup & Restore is the one-time move.
Card titles stay in title case to match their siblings. Confirmations (“Pair a different phone?”,
“Unpair your {device}?”) use the tag dialog.

## The relay dashboard

- The relay opens on its dashboard: one card, near the vertical middle of the page, so it reads as
  “this is all there is, & it’s working”. It names the phone, the save, & the last send, with
  “Pairing settings”.
- “Browse the guide” opens the full guide, read-only, mirroring the latest save, under the note
  “Read-only on the relay. From your {device}’s save at {time}.”
- Trying to check something off there shows a toast: “This PC is the relay. Check things off on your
  {device}.”
- Trouble takes over the card in amber (red for errors) until dismissed; a pause on our side is
  hairline, since there’s nothing to do.
- Start here and watch real use. If the read-only guide goes unused or only confuses, remove it and
  keep the dashboard alone.

## Status on the phone

Sync status lives in a quiet toolbar button beside settings & feedback. It speaks up only when
something is late or wrong: a colored dot, plus a short slip above it (“No saves in 5 days”, “Sync’s
taking a break”). Tapping it opens a compact panel in the toolbar-panel style: where progress comes
from, when, the last save’s date, & “Pairing & data settings”. The self-updating PC uses the same
button. Notices that need more than a slip are field notes on Home (below).

### Tone & notices

- **Amber** needs you, **red** is an error, **green** is good news, & **hairline** is just so you
  know.
- Notices are field notes: a taped-in slip with a tilted icon marker & the app’s highlighter band
  under the title. Questions & confirmations use the tag dialog.
- The relay’s own notices (“Your save file moved”, “Another tab’s already the relay”, “Waiting for
  the internet”, the daily cap, & “needs a tracker update”) stack as field notes under its card.

## Moving to the installed app on iPhone

iOS keeps a browser’s data apart from the home screen app, so the app can’t move it.

- **Before installing.** When an iPhone browser holds progress, the install step offers “Export a
  backup first” ahead of its instructions.
- **First launch of the installed app.** With no progress yet, the app asks whether the player was
  using the tracker in Safari or another browser (“Yes, bring it over”, “3 quick steps”), and walks
  them through exporting a backup there, restoring it here, & pairing again. “No, I’m new here”
  dismisses it.
- Restore (not import) is right here, since the app is empty: it carries manual check-offs &
  provenance intact.
- **Then pair again from the app.** Pairing keys stay on each device & never travel in backups, so
  the app pairs fresh. With one phone per PC, the PC’s match step notes “This replaces Safari on
  your iPhone”, & Safari shows “Sync moved to the home screen app” & keeps what it has.

## Living with it

| Stage           | Relay (PC)                                                          | Tracker (phone)                                                            |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Playing         | Dashboard open; nothing to do                                       | Quiet sync button; its panel says when the last save came                  |
| Away for days   | Pairing lapses after 14 days unseen; dashboard says to re-pair      | Slip after an unusually long gap; after the lapse, a field note to re-pair |
| Browser restart | Asks to re-allow reading the save (one click; “every visit” sticks) | Nothing                                                                    |
| Game update     | Can’t read the save: takes over the dashboard                       | Keeps its last good progress; the panel’s date ages                        |
| App update      | Reloads itself at a safe moment                                     | Same; a version mismatch names the device that’s behind                    |
| New phone       | Pair again; the old phone stops receiving                           | Old phone keeps its progress & says so; new one gets the next save         |
| New farm        | Drop the new save                                                   | Asks “Is this the farm you’ve been tracking?”; backs up the old one (#135) |
| Kill switch     | “Sync is taking a break”, hairline                                  | Hairline dot & slip; tracking by hand still works                          |
| Stop syncing    | “Unpair”: back to a tracker                                         | Unpaired; keeps everything                                                 |
| Non-Chrome PC   | Re-drop the save after each session to send it                      | Updates whenever a save is re-dropped                                      |

The self-updating tracker lives with the same stages on one device: a browser restart asks to
re-allow reading the save, a game update shows the error in place of progress updates, & a new farm
asks “Is this the farm you’ve been tracking?” through the apply rules.

## Visual direction

The screens use the app’s own pieces (the 512 px column, the Home header, DataCard, the tag dialog,
the toolbar & its panels, ui/button) so sync reads as part of the Field Guide, not a bolt-on.

- **Lowercase roman numerals** number steps, in the display face & home accent.
- **Photo-mount corners** frame what you hand over: the pairing code, the match code, & the drop
  box.
- **The tag dialog** carries every question & confirmation; **field notes** carry notices; the
  **Field tip** is an inline shipping tag.
- **Data & setup pages have no toolbar,** matching the app’s other utility pages.

## Voice

Write like a chill, non-judgmental friend helping with a tech setup.

- **Casual & warm.** Contractions, plain words, a little encouragement. Never blame the player.
- **Linear.** Every screen answers “what do I do now?” with numbered steps in order. Cut anything
  that isn’t a step or the reason for one.
- **One mental model.** Name the game, your PC, your phone, & the tracker consistently.
- **“Check off”, not “tick”,** matching the rest of the app.

## Screens

One sheet per canvas row, rendered from version 43. PC boards are cropped to the 512 px column.

### First look

![The Home card on a PC & a phone, the setup page’s two paths, & “How it works”](https://github.com/user-attachments/assets/7a8b6ec3-50c8-49fe-b280-3b72368a96ad)

### Setup on the PC

![Self-updating & import setup, the pairing code with “Send this PC’s progress too”, the match step, connecting the save, & sending](https://github.com/user-attachments/assets/4654bd3e-b7e6-425b-9caf-face6844aa51)

### Setup on the phone

![The install step & its skipped fold, pairing, keep or start fresh, the scanner, the Camera dialog, the match code, & success](https://github.com/user-attachments/assets/a37e3834-3119-4212-a7c1-bd79cd33677b)

### Mac & Linux

![A Mac’s setup page, pairing by link, the Proton save folder, & CrossOver](https://github.com/user-attachments/assets/2c3da5ef-cf62-4713-b1b9-019866fb864c)

### Setup hiccups

![An expired code, a rejected match, a code scanned first by someone else, a slow confirmation, & the wrong file](https://github.com/user-attachments/assets/46531314-9d0f-48b4-91ca-34782d9cabe7)

### Data management

![Data regrouped into Pairing & Data, the paired settings, the self-updating import card, & the unpair dialogs](https://github.com/user-attachments/assets/6dfdc2c9-3835-4cc9-b9ce-a28850b3f22c)

### The relay dashboard

![The centered relay card, the read-only guide & its toast, dark mode, & the re-drop dashboard](https://github.com/user-attachments/assets/5147c8eb-b1b9-4a97-bb86-205d218a52b7)

### When the relay needs you

![Takeovers for an unreadable save, a browser restart, a lapsed pairing, & a pause, plus the field notes](https://github.com/user-attachments/assets/b1a485c0-57e8-448c-9ba7-2c1d631c82db)

### Living with it on the phone

![The quiet sync button, its panel, the slips, the field notes, & the farm question](https://github.com/user-attachments/assets/15e9aa66-3f99-475e-903c-600280f6f4dc)

### Moving to the iPhone app

![The app’s first launch, bringing progress over, the PC’s replace note, & Safari after the move](https://github.com/user-attachments/assets/f55aac0a-c6b0-4760-9561-a6da60383e0e)

### The self-updating tracker

![The self-updating PC’s sync panel, its restart & error notes, & the farm question](https://github.com/user-attachments/assets/548c0272-dadb-4d7e-a952-dfd9b736bfe2)

## Copy

Keys follow [localization.md](localization.md#adding-a-new-ui-string-agents--humans): snake_case,
`sync_` for sync, in `messages/en.json` & every other locale. `{device}` is the paired device’s
derived name (“Pixel 8”), `{time}` a relative or clock time, `{date}` an in-game date, `{farm}` the
farm’s name, `{days}` a count, `{url}` the setup address, & `{suffix}` the save file’s ending
(`-autosave.sav`), the last three in `<code>`. The welcome card keeps `onboarding_overline` &
`onboarding_title`; the other `onboarding_*` descriptions & actions retire. The drop box reuses the
import card’s strings. Error & notice copy is a first draft.

### Home & the setup page

| Key                           | English                                                                           |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `sync_welcome_lead`           | Let your game save fill in your progress for you.                                 |
| `sync_welcome_feature_import` | Import your progress from your save                                               |
| `sync_welcome_feature_update` | Keep it up to date as you play                                                    |
| `sync_welcome_feature_phone`  | Sync it to your phone                                                             |
| `sync_welcome_setup_action`   | Get set up                                                                        |
| `sync_welcome_setup_time`     | About two minutes                                                                 |
| `sync_welcome_manual_action`  | I’ll check things off by hand                                                     |
| `sync_welcome_phone_lead`     | Fill in your progress from the game save on your PC, and it keeps up as you play. |
| `sync_welcome_phone_action`   | Sync from my PC                                                                   |
| `sync_steps_two`              | 2 steps, about two minutes                                                        |
| `sync_steps_three`            | 3 quick steps                                                                     |
| `sync_how_it_works`           | How it works                                                                      |
| `sync_switch_to_phone`        | I’m on a phone                                                                    |
| `sync_switch_to_computer`     | I’m on a computer                                                                 |
| `sync_setup_title`            | Get set up                                                                        |
| `sync_choose_lead`            | Pick where you’ll check things off. You can switch later.                         |
| `sync_choice_here_title`      | On this PC                                                                        |
| `sync_choice_here_steps`      | 1 step                                                                            |
| `sync_choice_here_body`       | This tab updates from your save every time you sleep in the game.                 |
| `sync_choice_or`              | or                                                                                |
| `sync_choice_phone_title`     | On my phone                                                                       |
| `sync_choice_phone_steps`     | 2 steps · about two minutes                                                       |
| `sync_choice_phone_body`      | This PC sends each new save to your phone as you play.                            |
| `sync_mac_lead`               | Fields of Mistria doesn’t run on Mac, so this Mac syncs from the PC you play on.  |
| `sync_mac_choice_body`        | Your PC sends each new save to this Mac as you play.                              |
| `sync_mac_game_here`          | The game’s on this Mac (CrossOver, Whisky)                                        |

### How it works

| Key                    | English                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `sync_how_game_title`  | The game saves                                                                                                               |
| `sync_how_game_body`   | Fields of Mistria writes a save on your PC every time you sleep.                                                             |
| `sync_how_relay_title` | The relay passes it on                                                                                                       |
| `sync_how_relay_body`  | A tab like this one, open on that PC, spots each new save and sends it to your phone, locked so only your phone can read it. |
| `sync_how_phone_title` | The tracker catches up                                                                                                       |
| `sync_how_phone_body`  | Your phone updates your progress. Anything you check off by hand stays on the device where you checked it off.               |
| `sync_how_done`        | Got it                                                                                                                       |

### Setup on the PC

| Key                       | English                                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `sync_here_title`         | Connect your save                                                                                                            |
| `sync_here_lead`          | One step. After this, the tracker updates every time you sleep in the game.                                                  |
| `sync_import_title`       | Import your save                                                                                                             |
| `sync_import_lead`        | One step. Drop your save in again whenever you want to catch up.                                                             |
| `sync_relay_title`        | Set up sync                                                                                                                  |
| `sync_relay_lead`         | Two steps, about two minutes.                                                                                                |
| `sync_step_pair_phone`    | Pair your phone                                                                                                              |
| `sync_scan_intro`         | On your phone, open {url} and tap “Scan the code”.                                                                           |
| `sync_show_code`          | Show code                                                                                                                    |
| `sync_hide_code`          | Hide code                                                                                                                    |
| `sync_code_stream_hint`   | Streaming? Keep this off screen.                                                                                             |
| `sync_code_expires`       | Good for {time}                                                                                                              |
| `sync_copy_link`          | Copy link                                                                                                                    |
| `sync_copy_link_hint`     | Pairing a computer? Copy the link and open it there.                                                                         |
| `sync_send_progress`      | Send this PC’s progress too                                                                                                  |
| `sync_send_progress_hint` | It adds to what’s on your phone, including things you checked off by hand.                                                   |
| `sync_match_question`     | Does your phone show this code?                                                                                              |
| `sync_match_yes`          | Yes, it matches                                                                                                              |
| `sync_match_no`           | No, it doesn’t                                                                                                               |
| `sync_match_replaces`     | This replaces {device}. It keeps what it has but stops getting saves.                                                        |
| `sync_paired_summary`     | Paired with your {device}. Nice!                                                                                             |
| `sync_step_save`          | Connect your save                                                                                                            |
| `sync_step_save_summary`  | Drag the game’s save into this tab.                                                                                          |
| `sync_save_path_windows`  | Copy this path, paste it into File Explorer’s address bar, and press Enter.                                                  |
| `sync_save_path_linux`    | Copy this path. In your file manager, press Ctrl+L, paste it, and press Enter.                                               |
| `sync_save_path_mac`      | Copy this path. In Finder, press Shift-Command-G, paste it, and press Return.                                                |
| `sync_save_path_mac_note` | That’s CrossOver’s usual spot. Using something else? Look in its drive_c folder.                                             |
| `sync_copy_path`          | Copy path                                                                                                                    |
| `sync_save_drag`          | Drag the newest file ending in {suffix} here.                                                                                |
| `sync_save_redrop_note`   | Here, drop your save in again after each time you play.                                                                      |
| `sync_sending`            | Sending your save to your {device}…                                                                                          |
| `sync_tip_overline`       | Field tip                                                                                                                    |
| `sync_tip_title`          | Let Chrome do this for you                                                                                                   |
| `sync_tip_body`           | This browser can’t keep watching a file. In Chrome or Edge, each save goes out the moment you sleep, with no dropping files. |
| `sync_tip_action`         | Copy this page’s link                                                                                                        |
| `sync_tip_after`          | Then paste it into Chrome or Edge.                                                                                           |

### Setup on the phone & other computers

| Key                         | English                                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sync_phone_lead`           | Two steps: one here, one on your PC.                                                                                    |
| `sync_phone_lead_ios`       | Three quick steps.                                                                                                      |
| `sync_step_install`         | Add it to your home screen                                                                                              |
| `sync_install_share`        | Tap Share in Safari.                                                                                                    |
| `sync_install_add`          | Tap “Add to Home Screen”.                                                                                               |
| `sync_install_open`         | Open the tracker from there to keep going.                                                                              |
| `sync_install_skip`         | Skip, keep using Safari                                                                                                 |
| `sync_install_skipped`      | Skipped. Add it any time.                                                                                               |
| `sync_install_show`         | Show me                                                                                                                 |
| `sync_step_pair_pc`         | Pair with your PC                                                                                                       |
| `sync_pc_open`              | On your PC, open {url} in Chrome or Edge and click “Show code”.                                                         |
| `sync_scan_action`          | Scan the code                                                                                                           |
| `sync_step_save_on_pc`      | Connect your save, on your PC                                                                                           |
| `sync_step_save_on_pc_hint` | Your PC walks you through it.                                                                                           |
| `sync_has_progress_title`   | This phone already has progress                                                                                         |
| `sync_has_progress_body`    | Keep it, and what comes from your PC adds on top. Or start fresh, which erases what’s on this phone.                    |
| `sync_has_progress_keep`    | Keep what I have                                                                                                        |
| `sync_has_progress_fresh`   | Start fresh                                                                                                             |
| `sync_check_pc`             | Check your PC. It should show this code:                                                                                |
| `sync_confirm_there`        | Confirm it there, and you’re paired.                                                                                    |
| `sync_waiting_pc`           | Waiting for your PC…                                                                                                    |
| `sync_paired_with_pc`       | Paired with your PC                                                                                                     |
| `sync_paired_title`         | You’re paired!                                                                                                          |
| `sync_paired_body`          | Now connect your save on your PC. Your progress shows up here as soon as it’s done.                                     |
| `sync_paired_progress_body` | Your PC’s progress is here too. Now connect your save on your PC, and new saves show up as soon as it’s done.           |
| `sync_waiting_save`         | Waiting for your first save…                                                                                            |
| `sync_worked_title`         | It worked!                                                                                                              |
| `sync_worked_body`          | Your progress is here, and it updates every time you sleep in the game.                                                 |
| `sync_worked_action`        | Take a look                                                                                                             |
| `sync_camera_title`         | Pair Safari, or the app?                                                                                                |
| `sync_camera_body`          | Your camera opened this code in Safari. Using the tracker from your home screen? Open it there and tap “Scan the code”. |
| `sync_camera_pair`          | Pair Safari                                                                                                             |
| `sync_camera_ok`            | Got it                                                                                                                  |
| `sync_link_copy`            | On your PC, open {url}, click “Show code”, then “Copy link”.                                                            |
| `sync_link_send`            | Send the link to this Mac, like in a message to yourself.                                                               |
| `sync_link_open`            | Open it here, or paste it below.                                                                                        |
| `sync_link_placeholder`     | Paste the link here                                                                                                     |
| `sync_link_pair`            | Pair                                                                                                                    |
| `sync_link_camera`          | Scan with this Mac’s camera instead                                                                                     |

### Setup hiccups

| Key                        | English                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sync_expired_title`       | That code timed out                                                                                             |
| `sync_expired_body`        | Codes last a couple of minutes. Grab a new one when your phone’s ready.                                         |
| `sync_expired_action`      | New code                                                                                                        |
| `sync_no_match_title`      | No worries, nobody’s paired                                                                                     |
| `sync_no_match_body`       | Show a new code and scan it again.                                                                              |
| `sync_scanned_first_title` | Someone else got to this code first                                                                             |
| `sync_scanned_first_body`  | On your PC, click “No, it doesn’t”, then show a new code and scan it again.                                     |
| `sync_scan_again`          | Scan again                                                                                                      |
| `sync_too_slow_title`      | That took a while                                                                                               |
| `sync_too_slow_body`       | The code expired before your PC confirmed it, so nobody’s paired. Show a new code on your PC and scan it again. |
| `sync_wrong_file_title`    | Hmm, that’s not a save file                                                                                     |
| `sync_wrong_file_body`     | Look for one ending in {suffix}.                                                                                |

### Data management

| Key                             | English                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `data_intro` (changed)          | Pair your devices, or import, back up, or reset your Field Guide progress.                                                     |
| `sync_data_pairing`             | Pairing                                                                                                                        |
| `sync_data_data`                | Data                                                                                                                           |
| `sync_pair_phone_title`         | Pair with Your Phone                                                                                                           |
| `sync_pair_phone_summary`       | Keep your phone up to date every time you play.                                                                                |
| `sync_pair_pc_title`            | Pair with Your PC                                                                                                              |
| `sync_pair_pc_summary`          | Get each new save from your PC as you play.                                                                                    |
| `sync_pair_sending`             | Sending to your {device} · {time}                                                                                              |
| `sync_pair_intro`               | Pair a phone, and this tab sends it each new save while you play. Two steps, about two minutes.                                |
| `sync_pair_setup`               | Set up pairing                                                                                                                 |
| `sync_label_phone`              | Phone                                                                                                                          |
| `sync_label_pc`                 | PC                                                                                                                             |
| `sync_label_save`               | Save                                                                                                                           |
| `sync_label_last_sent`          | Last sent                                                                                                                      |
| `sync_label_last_save`          | Last save                                                                                                                      |
| `sync_label_updated`            | Updated                                                                                                                        |
| `sync_checked_in`               | {device} · checked in {time}                                                                                                   |
| `sync_pair_different`           | Pair a different phone                                                                                                         |
| `sync_unpair`                   | Unpair                                                                                                                         |
| `sync_unpair_keeps`             | You’ll keep everything on this phone.                                                                                          |
| `sync_import_sending`           | Sending {farm} to your {device}                                                                                                |
| `sync_import_updating`          | Updating from your save · {time}                                                                                               |
| `sync_use_different_save`       | Use a different save                                                                                                           |
| `sync_stop_updating`            | Stop updating                                                                                                                  |
| `backup_card_summary` (changed) | Keep a copy of your progress, or move it to a new device once.                                                                 |
| `sync_new_phone_title`          | Pair a different phone?                                                                                                        |
| `sync_new_phone_body`           | Your {device} keeps its progress but stops getting saves.                                                                      |
| `sync_new_phone_cancel`         | Never mind                                                                                                                     |
| `sync_new_phone_confirm`        | Pair a new phone                                                                                                               |
| `sync_unpair_title`             | Unpair your {device}?                                                                                                          |
| `sync_unpair_body`              | This tab goes back to being a regular tracker, with your progress just how you left it. Your {device} keeps everything it has. |
| `sync_unpair_cancel`            | Keep syncing                                                                                                                   |

### The relay

| Key                     | English                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `sync_relay_overline`   | Relay                                                        |
| `sync_relay_heading`    | Sending your saves to your {device}                          |
| `sync_relay_body`       | Keep this tab open while you play. That’s it.                |
| `sync_pairing_settings` | Pairing settings                                             |
| `sync_browse_guide`     | Browse the guide                                             |
| `sync_read_only`        | read-only                                                    |
| `sync_guide_read_only`  | Read-only on the relay. From your {device}’s save at {time}. |
| `sync_relay_toast`      | This PC is the relay. Check things off on your {device}.     |
| `sync_redrop_title`     | Done playing? Send your save.                                |
| `sync_redrop_sleep`     | Sleep in the game so it saves.                               |
| `sync_redrop_drop`      | Drop the newest {suffix} here.                               |
| `sync_redrop_last`      | Last sent {time}, to your {device}.                          |
| `sync_hide_for_now`     | Hide this for now                                            |

### Trouble & notices

| Key                         | English                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `sync_stopped_overline`     | Sync stopped                                                                                                                      |
| `sync_paused_overline`      | Sync paused                                                                                                                       |
| `sync_unreadable_title`     | We couldn’t read your latest save                                                                                                 |
| `sync_unreadable_body`      | The game probably just updated, and the tracker needs to catch up. Your {device} has everything up to {date}.                     |
| `sync_unreadable_self_body` | The game probably just updated. Your progress here is from {date} until the tracker catches up.                                   |
| `sync_unreadable_update`    | Check for a tracker update.                                                                                                       |
| `sync_unreadable_log`       | Still stuck? Send us a sync log so we can fix it.                                                                                 |
| `sync_check_update`         | Check for an update                                                                                                               |
| `sync_send_log`             | Send a sync log                                                                                                                   |
| `sync_reallow_title`        | Let this tab read your save again                                                                                                 |
| `sync_reallow_body`         | Browsers forget file access when they restart, so this tab needs your OK again.                                                   |
| `sync_reallow_click`        | Click “Allow access”.                                                                                                             |
| `sync_reallow_every_visit`  | Pick “Allow on every visit”, and it won’t ask again.                                                                              |
| `sync_reallow_action`       | Allow access                                                                                                                      |
| `sync_lapsed_title`         | Your {device} hasn’t checked in since {date}                                                                                      |
| `sync_lapsed_body`          | Pairings expire after two weeks away. Pair again to pick up where you left off.                                                   |
| `sync_pair_again`           | Pair again                                                                                                                        |
| `sync_break_title`          | Sync is taking a break                                                                                                            |
| `sync_break_body`           | We’ve paused it for everyone while we fix something. Nothing’s lost, and you can still check things off by hand on your {device}. |
| `sync_break_ok`             | Got it                                                                                                                            |
| `sync_moved_title`          | Your save file moved                                                                                                              |
| `sync_moved_body`           | It was renamed, moved, or deleted, so we lost track of it. Drop the newest one in again.                                          |
| `sync_moved_action`         | Choose the file                                                                                                                   |
| `sync_other_tab_title`      | Another tab’s already the relay                                                                                                   |
| `sync_other_tab_body`       | Only one tab at a time can send saves. You can close this one.                                                                    |
| `sync_offline_title`        | Waiting for the internet                                                                                                          |
| `sync_offline_body`         | Your latest save goes out as soon as this PC is back online.                                                                      |
| `sync_daily_cap_title`      | That’s a lot of saves for one day!                                                                                                |
| `sync_daily_cap_body`       | Your {device} has everything up to {date}, and sync picks back up tomorrow.                                                       |
| `sync_device_behind_title`  | Your {device} needs a tracker update                                                                                              |
| `sync_device_behind_body`   | Open the tracker there and it’ll update itself.                                                                                   |

### Status on the phone

| Key                       | English                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sync_toolbar_label`      | Sync                                                                                                                           |
| `sync_panel_from_pc`      | From your PC                                                                                                                   |
| `sync_panel_from_save`    | From your save                                                                                                                 |
| `sync_panel_settings`     | Pairing & data settings                                                                                                        |
| `sync_slip_gap`           | No saves in {days} days                                                                                                        |
| `sync_slip_break`         | Sync’s taking a break                                                                                                          |
| `sync_phone_lapsed_title` | Your pairing expired                                                                                                           |
| `sync_phone_lapsed_body`  | Your PC hasn’t heard from this phone in over two weeks. Pair again to keep syncing.                                            |
| `sync_pc_behind_title`    | Update the tracker on your PC                                                                                                  |
| `sync_pc_behind_body`     | Reload the sync tab there, and you’re good.                                                                                    |
| `sync_replaced_title`     | Your PC paired with another device                                                                                             |
| `sync_replaced_body`      | This phone keeps its progress but won’t get new saves.                                                                         |
| `sync_replaced_action`    | Pair this phone again                                                                                                          |
| `sync_farm_title`         | Is this the farm you’ve been tracking?                                                                                         |
| `sync_farm_this_save`     | This save                                                                                                                      |
| `sync_farm_tracking`      | Tracking now                                                                                                                   |
| `sync_farm_note`          | A new farm backs up {farm} first, then starts fresh.                                                                           |
| `sync_farm_new`           | No, it’s a new farm                                                                                                            |
| `sync_farm_same`          | Yes, same farm                                                                                                                 |
| `sync_self_reallow_body`  | Browsers forget file access when they restart. Click “Allow access”, then pick “Allow on every visit”, and it won’t ask again. |

### Moving to the iPhone app

| Key                       | English                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `sync_app_welcome_body`   | Were you using the tracker in Safari or another browser? The app can’t see that data, so let’s bring it over. |
| `sync_app_bring`          | Yes, bring it over                                                                                            |
| `sync_app_new`            | No, I’m new here                                                                                              |
| `sync_move_title`         | Bring your progress over                                                                                      |
| `sync_move_export`        | Export a backup from your browser                                                                             |
| `sync_move_export_open`   | Open {url} in the browser you used.                                                                           |
| `sync_move_export_steps`  | Go to Data, open “Backup & Restore”, and tap “Export backup”.                                                 |
| `sync_move_come_back`     | Come back here.                                                                                               |
| `sync_move_restore`       | Restore it here                                                                                               |
| `sync_move_restore_hint`  | Pick the backup you just saved.                                                                               |
| `sync_move_pair`          | Pair with your PC again                                                                                       |
| `sync_move_pair_hint`     | Pairings don’t come along in backups.                                                                         |
| `sync_safari_moved_title` | Sync moved to the home screen app                                                                             |
| `sync_safari_moved_body`  | This copy keeps what it has but won’t get new saves.                                                          |

## Decisions so far

- The app detects what it can and asks only the rest; the flowchart marks which is which.
- Home invites with one card on every platform; all setup happens on `mistria.fyi/sync`, which Data
  also links to. A PC’s only question is “On this PC” or “On my phone”, drawn as two exclusive
  paths.
- “How it works” sits with the phone path, the only one it explains.
- Every path is available on first run & any time later from Data.
- A relay defaults to its dashboard, centered, with a read-only guide behind it and a toast on
  check-off attempts; the guide gets removed if real use shows it isn’t useful.
- One phone per relay. Several trackers wouldn’t sync with each other, and supporting that would be
  a major revision of the protocol.
- The self-updating tracker gets its own issue (#252), as new scope for #123.
- The platform picks defaults only: Linux & Steam Deck get the PC flow with the Proton path, & a Mac
  pairs like a phone, by link. The switch links override.
- A shown pairing code also offers “Copy link”, the same offer URL, for computers without a camera.
- A PC with progress carries it over the sync channel once after pairing, checked by default; the
  phone decides about its own progress before scanning. See
  [the decision record](decisions/2026-10-28-sync-carry-pc-progress.md).
- On iPhone, installing is optional step i of setup, recommended for Safari’s storage limits, &
  folds when skipped. Moving from a browser to the installed app goes through backup export &
  restore, offered before installing and on the app’s first launch.
- Pairing is confirmed by matching a six-digit code shown on both devices, derived from the
  handshake, so a leaked code can’t silently redirect sync. See
  [the decision record](decisions/2026-10-27-sync-pairing-confirm.md).
- The pairing code starts covered; showing it mints the offer, & hiding it doesn’t restart it.
- Device names derive locally from the browser and only label a pairing; they never decide anything.
  Renaming is out of scope for v1.
- An iOS or iPadOS browser can pair like any phone; moving to the installed app re-pairs from the
  app, as part of the migration. A code opened from the Camera asks which copy to pair, & can only
  say how to open the app, not open it.
- A relay leaves stored progress untouched; its mirror lives apart & is discarded on unpair.
- Data management keeps its name & regroups into Pairing & Data; the relay’s save lives in the
  Import card, not the pairing card.
- Status lives in a quiet toolbar button that speaks up only when late or wrong. Amber needs you,
  red is an error, green is good news, & hairline is just so you know.
- Notices are field notes; questions & confirmations are tag dialogs; the Chrome tip is a Field tip.
