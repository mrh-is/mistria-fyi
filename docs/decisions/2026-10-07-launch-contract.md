# Launch contract for stored data & public URLs

## Context

The pre-launch audit (#641) found two surfaces that become permanent once the launch posts (#219)
link into the site. The persisted progress format (#644) still carried readers for pre-launch
shapes, a `mistria-fyi-v1` key holding a version `"2"` blob, a `completed` wrapper holding facts
that aren't completions, & device preferences inside the backup. The public URLs & client-side
identifiers (#646) had no record of which were promises. The only players with stored data are the
maintainer & one tester, so a one-time break costs nothing now and a lot later.

## Decision

- **No legacy readers.** Version `"1"`, the flat `villagers`/`skills`/`quests` arrays,
  `romanticVillagers`/`marriedVillager`, & `availabilityMode` are no longer read. Older data is
  quarantined and downloadable, per
  [the no-migration decision](2026-10-07-no-pre-rename-migration.md).
- **Namespaced, unversioned keys:** `mistria-fyi:progress`, `mistria-fyi:progress-quarantine`,
  `mistria-fyi:preferences`, & `mistria-fyi:theme`. The key names the slot; the blob's `version`
  names the shape. The old keys aren't read.
- **`progress` wrapper & integer version.** `completed` became `progress` (in memory too), and
  `version` is the integer `1`, matching `TRANSFER_VERSION`'s type.
- **Unknown fields are dropped** on save. Downgrade tolerance doesn't help, since an older build
  rejects a newer version anyway, and passthrough would keep renamed keys forever.
- **Preferences are per-device.** `availabilityWindows` & `showSpoilers` live under their own key,
  outside the backup, so a restore or a progress reset keeps them. `worldState` (the in-game season
  & weather) stays with progress.
- **A golden fixture** (`user-state-golden.test.ts`) pins the launch shape & the storage keys.
- **URLs:** locale prefixes keep BCP 47 casing, and miscased prefixes redirect permanently. `/all`
  became `/everything`, with no redirect since nothing outside the two players links to it.
- **Locale cookie:** pinned explicitly to `mistria-fyi-locale` (cookie names can't contain `:`).
- The full list of promised & unpromised identifiers lives in
  [the architecture doc](../app-architecture.md#7-public-contract).

## Alternatives

- **Keep the legacy readers until a removal date:** rejected; the two affected players can re-import
  their saves, and every reader kept now becomes a post-launch obligation.
- **Lowercase locale segments** (`/zh-hans`): rejected; BCP 47 casing matches `hreflang` & the
  Paraglide locale codes, and a redirect covers retyped links.
- **Keep preferences in the backup:** rejected; restoring a backup on a second device shouldn't
  change that device's filters.
- **Keep the library-default cookie name:** rejected; an upgrade could change it silently.

## Revisit if

A field must be renamed or removed after launch (that needs a version `2` with a migration, not an
edit to the golden fixture), the app gains a way to sync preferences across devices, or a route slug
must change (add a redirect and list it in the contract).
