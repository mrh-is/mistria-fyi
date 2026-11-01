---
id: 2026-11-01-courier-probe-findings
status: current
summary: >-
  The courier treats an appeared record as a change, observes again after errored, & keeps a
  one-minute backstop poll; “Can’t drag?” pastes or picks the live save; launch doesn’t wait for the
  Android & Steam Deck checks.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/130
  - https://github.com/mrh-is/mistria-fyi/pull/340
  - https://github.com/mrh-is/mistria-fyi/issues/134
  - docs/sync.md#what-the-probe-found
relationships: []
---

# Courier changes from the probe run

## Context

The 2026-10-31 hardware run (#130, recorded in PR #340) contradicted three assumptions behind the
courier (#134) & setup’s “Can’t drag?” route:

- The game replaces its save, so changes arrive as `appeared` records, not `modified`.
- A save that disappears ends its observer with `errored`, & the observer reports nothing after,
  even once the file returns.
- Chrome gives a watched handle for a save pasted from File Explorer, & Firefox’s file picker opens
  the save folder. The Desktop copy that “Can’t drag?” offered was therefore never needed.

Android (#341) & the Steam Deck (#238) went untested, for lack of devices.

## Decision

- **Watching.** `appeared` on the watched file counts as a change. After `errored`, the courier
  observes again once the file reads.
- **The backstop poll.** While watching, the courier checks size & modification time once a minute.
  A read’s hash decides whether the save changed.
- **“Can’t drag?”** In Chrome & Edge it explains pasting the autosave from File Explorer. In
  browsers without file handles it opens the file picker on the save folder. The Desktop copy is
  gone.
- **Launch.** #291 no longer waits for #238 or #341 (maintainer, 2026-11-01). Each one is checked
  when its hardware is available.

## Alternatives

- **Observer only, no poll:** less work while idle, but an `errored` observer goes silent with no
  signal, & the probe saw exactly that.
- **Poll only:** simpler, but it delays each save by up to the interval, & the observer works for
  the normal save.
- **Keep the Desktop copy as a fallback:** a copy can’t be watched, & both browsers reach the live
  file without one. A paste that gives only a file already falls back to dropping it in again.
- **Wait for Android & the Steam Deck before launch:** blocks the maintainer’s own use on borrowed
  hardware. The worst failure for either check changes which device or browser a player is told to
  use. It doesn’t change the courier, relay, envelope, or apply rules. On Android, a scan that opens
  a browser tab instead of the installed app still follows, as on iOS. On the Steam Deck, a save the
  browser can’t reach narrows the supported platforms, as #238 already anticipates.

## Revisit if

- A later browser release makes `FileSystemObserver` reliable across replacement & disappearance, so
  the poll catches nothing.
- Pasting in Edge, on Linux, or on a Mac gives no handle, which would make the paste route
  Chrome-only.
- #341 or #238 finds a failure that changes the protocol rather than the guidance, such as a scanned
  link losing its fragment on Android.
