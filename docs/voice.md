# Copy voice

tl;dr: Mistria Field Guide talks like a chill friend who’s happy to help: casual, warm, a little
goofy, & never technical. It speaks as “we”, tells the truth about effort, explains the why, &
reassures before it instructs. Short labels stay plain; the friend comes through in explanations,
setup steps, confirmations, & errors. Read this before writing or editing any English UI text; for
other locales, [localization.md](localization.md) carries the voice into each language.

The maintainer set this voice in a copy workshop for sync setup (#131, PR #275), by rewriting sample
screens. Those rewrites are the examples below.

## The voice

- **A friend, not a manual.** Picture helping a friend set something up on the couch. Nothing should
  feel like a technical journey; most tasks are one file & maybe one QR code.
- **Speak as “we”,** & talk to the player as “you”. “We’ll keep up from here.”
- **Casual is fine.** Contractions, “gonna”, “wanna”, “FYI”, & “automagically” all belong.
- **Honest about effort, then reassuring.** Name the awkward part, then promise it gets easier:
  “Gonna be honest, this is the weirdest part of the setup. But once you’re done here, it’s smooth
  sailing!”
- **Explain the why** in a sentence when it helps the player decide or relax. Longer & kind beats
  terse & cryptic.
- **Playful asides** live in parentheses & button subtitles: “I’ll track it all by hand (The way my
  ancestors did it)”.
- **Use the player’s world.** Their farmer & farm by name, _Fields of Mistria_, sleeping, the
  autosave.
- **Playful, not vague.** A joke never stands in for what happened: “Sync is paused for now”, not
  “Sync’s taking a nap”, & say when it ends (“It’ll turn back on by itself, usually by tomorrow”).
- **One obvious next step.** Show one active step at a time, with the rest visible but dimmed, so
  the player never has to read the whole screen to know what to do; every success ends with a button
  that says where to go.
- **Never blame the player.** Things “can happen”; they’re never something the player did wrong.

## The dial

The voice is always the same friend; how much of it shows depends on the moment.

| Moment                                   | How much                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| Labels, buttons, headings, table columns | Plain & short. A subtitle can carry the joke.                                      |
| Invitations & choices                    | Warm question titles (“Ready to get started?”), whole-card buttons with subtitles. |
| Instructions                             | Step by step, one action per sentence, saying what the player will see.            |
| Confirmations                            | Name something they’ll recognize (“{farmer} on {farm}”), easy yes & no.            |
| Destructive dialogs                      | Calm, clear about what’s lost, with a backup offered & a warm confirm.             |
| Errors                                   | The most reassurance: nothing lost, not your fault, what happens next.             |
| Status & slips                           | One friendly, factual line.                                                        |
| Safety notes                             | Plain & firm without being scary.                                                  |

## Patterns

### Instructions

Say each action, then what success looks like, in order. Let the player check they’re on track.

> Now open File Explorer and paste that into the address bar at the top. It should take you to a
> folder with files like `game-[numbers]-autosave.sav`. Drag that autosave file into this box:

### Confirmations

Confirm with something the player recognizes, & make backing out painless.

> Perfect! Looks like that save file is for {farmer} on {farm}, is that right? “Yep!” / “Hmm, no,
> try that again”

### Destructive dialogs

Lead with a low-key title, say exactly what goes away, offer a backup, & make the confirm button
sound like a choice the player is happy to make.

> **FYI, this is a fresh start.** You’ll be starting fresh by syncing your save file, which means
> anything you’ve tracked on this device will be cleared. Your save file will check off nearly
> everything on its own, but you can make a quick backup first if you’d like. “Make a backup” / “I’m
> ready to start anew” / “Cancel”

### Errors

Reassure in this order: nothing is lost, it isn’t your fault, here’s what happens next (including
anything the player should keep doing). A soft promise like “shortly” is fine; a precise time isn’t.

> **Hmm, we can’t read your save file.** Number one: nothing is lost. Your progress is totally safe.
> Number two: this isn’t anything you did. It can happen when _Fields of Mistria_ releases an
> update. Rest assured that we’re on the case, and this field guide should be updated shortly… For
> now, just leave this tab open, and enjoy… whatever is in the new update!

A device that’s only affected secondhand gets the short version, pointing to where the full story
is:

> **Your computer is having trouble reading your save file.** Your progress is safe! For more info,
> check Mistria Field Guide on your computer.

### Nudges

Guide toward the simplest way to use a feature, even when nothing enforces it:

> Heads up: only the game’s save file gets synced; anything you check off by hand on this computer
> stays here. Easiest is to track on one device, like your phone, and let your gaming computer just
> read the save file.

### Safety notes

When an instruction could be misused elsewhere, say why it’s safe here & what never to do:

> Press the Windows key + R, paste the same folder location, and press Enter. (That only opens a
> folder. Never paste anything else into that box, from us or anyone.)

Offer the risky route only after the safe ones.

## Words

- **“Sync” travels with “save file”** wherever copy explains what happens: “sync your save file”,
  “only the game’s save file gets synced”. It reinforces what syncs & what doesn’t. Short labels on
  a screen that already said it (“Stop syncing”, “Sync is paused for now”) & the Home card’s
  invitation can say “sync” alone.
- **“Check off”, not “tick”;** “by hand” for manual tracking.
- **Devices:** “your gaming computer”, “your phone”, “this device”, “this computer”. Not “PC” in
  player copy unless the context is only Windows.
- **Avoid the machinery:** no “pair”, “relay”, “follow”, “upload”, “parse”, “handle”, “token”, or
  “sync service” jargon beyond what the player must act on. “Link” is fine where the player copies,
  pastes, or opens one (“Copy link”, “Or paste a link”).
- **Name the game** as _Fields of Mistria_ in italics, & the app as Mistria Field Guide.

## Mechanics

- **Curly quotes & apostrophes** (“ ” ’) & the ellipsis character (…).
- **`&` for close pairs** in labels & short phrases (“Backup & Restore”, “questions & requests”);
  “and” joins clauses in running sentences.
- **Sentence case** for headings, buttons, & button subtitles. Data page card titles stay in title
  case to match their siblings.
- **Exclamation points** are welcome at success & in reassurance; one per message is plenty.
- **No emoji** in UI text; the app’s icons & sprites carry that job.
- **Parameters** read naturally in both directions: write variants for missing values (an unnamed
  farm) instead of filler text.

## Before & after

From the workshop, a first draft & the maintainer’s rewrite:

| Moment           | First draft                                                                                        | Maintainer’s rewrite                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Home card        | “Follow your save” / “Your tracker updates itself from the game’s save.”                           | “Ready to get started?” / “Let’s get you set up to keep track of all that hard work. How do you wanna work?”                          |
| Finding the save | “Copy this folder, open it in File Explorer, & drag your newest save here.”                        | “Gonna be honest, this is the weirdest part of the setup. But once you’re done here, it’s smooth sailing!” then one step per sentence |
| Clearing data    | “Start fresh to follow?” / “Following starts from your save, so it erases this device’s progress.” | “FYI, this is a fresh start” / “…you can make a quick backup first if you’d like.” / “I’m ready to start anew”                        |
| Unreadable save  | “Your save didn’t read right”                                                                      | “Hmm, we can’t read your save file” / “Number one: nothing is lost…”                                                                  |

The drafts were accurate but read like a spec. The rewrites are longer, kinder, & funnier, & they
answer the question the player is actually asking (“is this going to be a pain?”, “did I break
something?”).

## Reviewing copy

- Would a friend say this out loud?
- Does every instruction say what the player will see next?
- Does every error say nothing’s lost & it isn’t their fault?
- Does any sync copy say “sync” without “save file”?
- Is there machinery the player doesn’t need to know about?
