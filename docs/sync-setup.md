# Sync setup & pairing

tl;dr: The app detects what it can (device kind, iPhone browser vs. installed app, whether the
browser can watch a file) and asks only what it can’t: on a PC, whether you’ll use the tracker here
or on another device; on a phone, whether to sync or check things off by hand. Each browser ends up
in one role: a **tracker**, a **self-updating tracker**, or a **relay**. This document is the
journey & decision flow for #131; the protocol is in [sync.md](sync.md). UI & copy wait until the
flow is settled.

Status: flow in review on #131. The
[design canvas](https://claude.ai/artifact/UhDfkQVf4Csu7eN9RcBStx) is paused at an earlier flow; its
visual direction (lowercase roman numerals for steps, photo-mount corners on the drop box & code)
carries forward.

## Mental model

Three parts, named the same way everywhere:

1. **The game** writes a save file on the PC each time you sleep (and when you load in).
2. **The relay**, a browser tab on that PC, watches the file & sends each new save onward.
3. **The tracker**, on your phone, receives it & updates your progress.

Sync moves the game’s save, and only the save, in one direction. Anything checked off by hand stays
on the device where it was checked off.

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

## First look: the decision tree

The tree runs on first run (onboarding) & from Data. Diamonds are questions the player answers;
hexagons are checks the app makes itself and never asks.

```mermaid
flowchart TD
    classDef detected fill:#eeedea,stroke:#948a7c,stroke-dasharray:4 3
    classDef asked fill:#e1f5ee,stroke:#0f6e56
    classDef outcome fill:#eeedfe,stroke:#534ab7

    START([Player starts setup]) --> DEVICE{{What device is this?}}:::detected
    DEVICE -->|PC| WHERE{Use the tracker here,<br/>or on another device?}:::asked
    DEVICE -->|iPhone or iPad, in a browser| NUDGE[Suggest installing to the home screen<br/>dismissible]:::outcome
    DEVICE -->|Phone app, or Android| PHONE{Sync from your PC,<br/>or check off by hand?}:::asked
    NUDGE --> IOSQ{Sync from your PC,<br/>or check off by hand?}:::asked
    IOSQ -->|Sync| INSTALL[Install first: move progress,<br/>then pair from the app]:::outcome
    IOSQ -->|By hand| MANUAL3[Manual tracking in the browser]:::outcome

    WHERE -->|Here| HOW{Import, or check off by hand?}:::asked
    HOW -->|By hand| MANUAL[Manual tracking<br/>no more setup]:::outcome
    HOW -->|Import| WATCH1{{Can this browser watch a file?}}:::detected
    WATCH1 -->|Yes| SELF[Self-updating tracker]:::outcome
    WATCH1 -->|No| ONCE[Import once<br/>+ “Chrome or Edge can do this automatically”]:::outcome

    WHERE -->|Another device| WATCH2{{Can this browser watch a file?}}:::detected
    WATCH2 -->|Yes| RELAY[Relay: pair a phone, then connect the save]:::outcome
    WATCH2 -->|No| REDROP[Relay that re-drops the save each time<br/>+ “Chrome or Edge can do this automatically”]:::outcome

    PHONE -->|Sync| PAIR[Pair with your PC<br/>then the PC continues as a relay]:::outcome
    WHERE -.->|PC has progress| MOVE[Offer to move it first]:::outcome
    PHONE -->|By hand| MANUAL2[Manual tracking<br/>no more setup]:::outcome
```

- **Import defaults to self-updating.** A player who picks “import” on a PC that can watch files
  gets the self-updating tracker without being asked; the one-time import is the fallback.
- **The installed-app nudge is dismissible, but sync isn’t available without the app.** A player can
  keep checking things off in an iOS browser. Choosing sync there leads only to installing (see
  [Moving to the installed app](#moving-to-the-installed-app-on-iphone)); the browser never pairs,
  because pairing keys don’t travel in backups and would stay stuck in the browser.
- **“How it works”** (the mental model) sits beside the first question, collapsed but clearly
  labeled. Curious players open it; ready players skip it.
- **The choice is remembered,** and Data leads with it. The other paths stay one tap away.
- **One-time import moves under “Just this once”,** so players can tell it won’t update on its own.

### What the app can detect

| Check                     | How                                                                                                                                              | Confidence                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| PC or phone               | User-Agent Client Hints `mobile` (Chrome & Edge only), plus a coarse pointer & screen size everywhere; onboarding’s “I’m on a computer” override | Heuristic; keep the override              |
| Installed or in a browser | `matchMedia("(display-mode: standalone)")`; `navigator.standalone` on iOS                                                                        | Reliable on iOS & Android                 |
| iPhone or iPad browser    | iOS user agent, or `Macintosh` with `navigator.maxTouchPoints > 1` (iPad Safari reports a Mac), & not standalone                                 | Reliable for iPhone; heuristic for iPad   |
| Can watch a file          | Feature checks for `FileSystemObserver` & drag-and-drop file handles                                                                             | Shows support only; behavior pending #130 |

- **Every iOS & iPadOS browser behaves like Safari here.** All of them, Firefox included, run on
  WebKit, and a home screen web app keeps its own storage apart from the browser that added it.
  Confirm on Firefox for iPhone during #130.
- **File watching is a capability check, not a promise.** A browser can have `FileSystemObserver`
  and still lose the file when the game replaces it instead of rewriting it; #130 checks that.
- **Android needs no nudge.** An app installed from Chrome shares its storage with Chrome, so the
  data is already there. Installing stays optional.

## Any time, not just first run

New players meet the tree in onboarding, and every path stays reachable from Data later, so a player
who starts by hand and comes back for sync goes through the same tree. Changing roles later:

- **Tracker or self-updating tracker → relay.** Whenever the PC already holds progress, however
  setup was reached (the tree, Data, or `mistria.fyi/sync`), setup first offers to move it, since
  things checked off by hand don’t come along in the save. The offer depends on the phone:
  - **Empty phone:** export a backup on the PC & restore it on the phone, then pair.
  - **Phone with progress:** restore would replace the phone’s progress, so the player chooses which
    side to keep. Keeping the PC’s makes the phone export its own backup first, then restores. There
    is no additive transfer of a backup; the first save’s questions (#135) handle the rest.
  - Either way the PC’s stored progress stays where it is, untouched, while it relays.
- **Tracker → self-updating tracker.** The first watched save applies through the apply rules
  (#129), like any sync, so earlier check-offs aren’t overwritten blindly.
- **Phone with progress → paired.** The first save asks “Is this the farm you’ve been tracking?” and
  merges through the apply rules (#135).
- **Relay → tracker.** Turning the relay off discards the mirror and shows the stored progress
  exactly as it was left.
- **Paired phone → unpaired.** Turning sync off keeps everything already on the phone.

## Sync setup journey

Setup starts on whichever device the player is holding. Starting on the phone, it says to open
`mistria.fyi/sync` on the PC; arriving there implies “another device”, so the PC skips that
question, but still makes the move offer when it holds progress. Either way, pairing comes first,
then the save. The phone scans with the app’s own scanner; on iPhone, the Camera app would open the
code in Safari, which shows the “scan from the tracker app” page instead.

| Step | On the PC                                                 | On the phone                                    |
| ---- | --------------------------------------------------------- | ----------------------------------------------- |
| 1    | Picks “another device” (or arrives at `mistria.fyi/sync`) |                                                 |
| 2    | Shows a covered pairing code, then “Show code”            | Opens `mistria.fyi/sync`, taps “Scan the code”  |
| 3    |                                                           | Scans the code, then says to check the PC       |
| 4    | Shows a six-digit code; the player confirms it matches    | Shows the same code, then “You’re paired!”      |
| 5    | Connect the save: copy the folder path, drag the file in  |                                                 |
| 6    | Sends the save                                            | “It worked!”: progress appears                  |
| 7    | Stays on the relay dashboard while the player plays       | Updates each time the player sleeps in the game |

Why pair first: the player sees success on the phone right away, and finishing step 5 makes progress
appear on the phone moments later, which demonstrates the whole system once.

## The relay dashboard

- The relay opens on its dashboard: which phone, which save, when it last sent. Trouble takes over
  the dashboard until dismissed.
- “Browse the guide” opens the full guide, read-only, mirroring the latest save.
- Trying to check something off there shows a toast instead: “This PC is the relay. Check things off
  on your {device}.”
- Start here and watch real use. If the read-only guide goes unused or only confuses, remove it and
  keep the dashboard alone.

## Moving to the installed app on iPhone

iOS keeps a browser’s data apart from the home screen app, so the app can’t move it.

- **Before installing.** The install nudge in an iPhone browser, when that browser holds progress,
  offers “Export a backup first” ahead of the install steps.
- **First launch of the installed app.** With no progress yet, the app asks whether the player was
  using the tracker in Safari or another browser, and if so walks them through exporting a backup
  there & restoring it here. Dismissible.
- Restore (not import) is right here, since the app is empty: it carries manual check-offs &
  provenance intact.
- **Then pair from the app.** Only the installed app pairs; a browser that already has progress
  keeps it for manual tracking, & never pairs.

## Living with it

| Stage           | Relay (PC)                                                          | Tracker (phone)                                                            |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Playing         | Dashboard open; nothing to do                                       | “Updated from your PC {time ago}” stamp                                    |
| Away for days   | Pairing lapses after 14 days unseen; dashboard says to re-pair      | Toast after an unusually long gap; after the lapse, says to pair again     |
| Browser restart | Asks to re-allow reading the save (one click; “every visit” sticks) | Nothing                                                                    |
| Game update     | Can’t read the save: takes over the dashboard                       | Keeps its last good progress; stamp ages                                   |
| App update      | Reloads itself at a safe moment                                     | Same; a version mismatch names the device that’s behind                    |
| New phone       | Pair again; the old phone stops receiving                           | Old phone keeps its progress; new one gets the next save                   |
| New farm        | Drop the new save                                                   | Asks “Is this the farm you’ve been tracking?”; backs up the old one (#135) |
| Kill switch     | “Sync is taking a break”                                            | Same; tracking by hand still works                                         |
| Stop syncing    | “Turn off sync”: back to a tracker                                  | Unpaired; keeps everything                                                 |
| Non-Chrome PC   | Re-drop the save after each session to send it                      | Updates whenever a save is re-dropped                                      |

The self-updating tracker lives with the same stages on one device: a browser restart asks to
re-allow reading the save, a game update shows the error in place of progress updates, & a new farm
asks “Is this the farm you’ve been tracking?” through the apply rules.

## Voice

When UI & copy resume, write like a chill, non-judgmental friend helping with a tech setup.

- **Casual & warm.** Contractions, plain words, a little encouragement. Never blame the player.
- **Linear.** Every screen answers “what do I do now?” with numbered steps in order. Cut anything
  that isn’t a step or the reason for one.
- **One mental model.** Name the game, the relay, & the tracker consistently (player-facing names to
  be chosen with the UI).
- **“Check off”, not “tick”,** matching the rest of the app.

## Decisions so far

- The app detects what it can and asks only the rest; the flowchart marks which is which.
- Every path is available on first run & any time later from Data.
- A relay defaults to its dashboard, with a read-only guide behind it and a toast on check-off
  attempts; the guide gets removed if real use shows it isn’t useful.
- One phone per relay. Several trackers wouldn’t sync with each other, and supporting that would be
  a major revision of the protocol.
- The self-updating tracker gets its own issue (#252), as new scope for #123.
- Steam Deck is unresearched; the PC/phone override covers it until #130 looks at its browsers.
- On iPhone, moving from a browser to the installed app goes through backup export & restore,
  offered before installing and on the app’s first launch.
- Pairing is confirmed by matching a six-digit code shown on both devices, derived from the
  handshake, so a leaked code can’t silently redirect sync. See
  [the decision record](decisions/2026-10-27-sync-pairing-confirm.md).
- The pairing code starts covered; showing it mints the offer, & hiding it doesn’t restart it.
- Device names derive locally from the browser and only label a pairing; they never decide anything.
  Renaming is out of scope for v1.
- An iOS or iPadOS browser never pairs; sync there means installing the app first.
- Moving PC progress to a phone that already has some asks which side to keep, & backs up the phone
  first.
- A relay leaves stored progress untouched; its mirror lives apart & is discarded on turn-off.
