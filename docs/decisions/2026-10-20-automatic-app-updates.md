# Automatic app updates at each page's safe moment

Supersedes [App update detection](2026-10-16-app-update-detection.md) and the consent-based update
flow it preserved (#360). Detection itself is unchanged.

## Context

A new version waited for a player to accept the “Refresh” toast, and a player who ignored it stayed
on the old version until every tab closed. The 10-16 record listed automatic activation when idle or
navigating as a reversal outside its scope, to be reconsidered “if reloading every other tab becomes
acceptable”. That condition now holds: the owner approved applying updates without a prompt, never
mid-task, in #111. The same review rejected a global “every page idle” lock, since tabs from older
builds don't know the lock and a dialog left open overnight would block updates forever.

## Decision

- **A new worker activates as soon as it installs.** Its install ends with `skipWaiting()`, and its
  activation claims every tab.
- **Older caches stay while a page runs that version.** Each page reports its version to the active
  worker (`mfg:client-version`) on load. The worker keeps the reports in the version-independent
  `client-versions-v1` cache, keyed by client ID and pruned to open clients. Activation, and later
  page reports, delete an older version's cache only when every open page has reported a version and
  none runs that one. An unreported page keeps every older cache.
- **Old pages keep loading their chunks.** The worker answers any same-origin `/_app/immutable/`
  request from its caches (this version's first, then any other), so a page on an older version
  imports chunks the server no longer has.
- **Each page reloads at its own safe moment.** Once a newer version controls it (or a deploy is
  detected with no worker), a page reloads as soon as it isn't busy: no task holds updates off
  (`holdUpdatesWhile`: a save import or backup restore applying, a transfer code or result on
  screen, later a sync apply), no dialog or panel is open, and no text field has focus. A busy page
  re-checks on hold release, focus leaving a field, visibility changes, & every second. Its next
  client-side navigation loads the destination in full instead, unless a task holds updates off.
- **The prompt is gone.** Its three messages are deleted. The worker still honors
  `mfg:skip-waiting`, which tabs from earlier releases send, and those tabs reload once under their
  old behavior when the first version with this change takes over.

## Alternatives

- **A global idle lock across tabs:** rejected in #111 (see Context).
- **Reloading only when the page is hidden:** gentler for a reader mid-scroll, but a tab kept
  visible for days behind a game (the 10-16 record's case) would never update. Reloading an idle
  page loses no work: progress persists on `pagehide`, and SvelteKit restores scroll.
- **Asking each page for its version at deletion time (a `MessageChannel` round trip):** a frozen or
  busy tab can't answer in time, which would read as unknown and block deletion anyway, at the cost
  of a timeout on every activation.
- **Treating an unreported page as running the current version:** frees caches sooner, but a page
  from an older build whose report was lost would lose its chunks mid-use.

## Revisit if

- Old caches pile up in practice (a tab that never reports, such as a raw `/api` or `/sitemap.xml`
  tab or the bundled offline page, keeps them until it closes).
- Sync's courier tab needs to reload sooner than its safe moment allows, or sync makes progress data
  version-bound.
- A rollback to a release from before this change ships: its worker waits for consent again, and its
  activation deletes every cache but its own.
- Browsers start discarding bfcache or frozen pages differently enough that a restored old page
  can't find its cache.
