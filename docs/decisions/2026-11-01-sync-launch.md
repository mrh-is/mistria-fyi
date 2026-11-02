---
id: 2026-11-01-sync-launch
status: current
summary: >-
  Launch removes both sync switch modules & every call site, so sync shows on every build; the
  sync-first welcome card replaces the import-or-transfer card.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/291
  - https://github.com/mrh-is/mistria-fyi/issues/360
  - src/lib/components/welcome-card.svelte
relationships: []
---

# Sync launch

## Context

Sync shipped in pieces (#132 to #137) behind a build-time switch that hid it on `mistria.fyi` &
showed it everywhere else. The [envelope format record](2026-10-30-follow-envelope-format.md)
defined the switch and listed launch as its revisit condition. Launch (#291) is that condition. The
maintainer authorized it in #291, once the relay was live & the pre-launch review’s blockers (#359,
#360, #361) had closed.

## Decision

- **No switch.** `src/lib/sync/enabled.ts` (`__SYNC_ENABLED__`) & `src/lib/sync/sync-switch.ts`
  (`syncSwitchOn`) are deleted with every call site & every test of the hidden state. Sync, the
  privacy page’s “With sync” section, & the feedback sync log appear on every build.
- **The deployment flag stays.** `__PRODUCTION_DEPLOYMENT__` still drives the feedback dry run
  through `src/lib/server/deployment.ts`.
- **One welcome card.** The card that offered save import on a computer & QR transfer on a phone
  only showed with sync off, so it goes with the switch, along with its now-unused copy. The
  sync-first card asks “with sync or by hand”. Import & transfer stay on the Data page until QR
  deprecation (#138).
- **The device check runs on production.** A preview can’t make codes on the live relay, so the
  real-device run happens on `mistria.fyi` right after the launch deploys, with the relay’s kill
  switch ready (#360).

## Alternatives

- **Keep the switch, set to on:** leaves a dead branch & tests of a state no build reaches.
- **A runtime flag:** could hide sync again without a deploy, but the relay’s kill switch already
  pauses sync, and a second off switch would need its own copy & tests.
- **Keep the import-or-transfer card for players who skip sync:** the sync-first card already offers
  “by hand”, and Data holds both tools.

## Revisit if

- Sync needs to be withdrawn for longer than the relay’s kill switch should stay on.
- QR deprecation (#138) changes what the Data page offers a player who doesn’t sync.
