# Application Architecture

> Canonical reference for Mistria Field Guide's data flow, state model, and UI composition.

## 1. Generated Data Contracts

### `src/lib/data/tracker-data.json`

This file is produced by the pipeline (`pipeline/`) and must never be hand-edited. It contains the
complete static dataset: items, recipes, animals, cosmetics, villagers, quests, mines, museum wings,
skills, stores, and sources.

### `src/lib/types/tracker-data.ts`

The shared data contract between the pipeline and the app. It defines branded ID types (`ItemId`,
`RecipeId`, `VillagerId`, etc.) and the `TrackerData` interface. The pipeline emits JSON that must
conform to these types.

### `src/lib/types/user-progress.ts`

The player's recorded progress (`ProgressState`, `QuestState`, `ChildChoice`) and the shape of a
save merge (`MergeCounts`, `MergeConflict`, `MergeResult`). The engine, store, and UI all share
these types; the store owns the mutable instance.

## 2. Engine vs Stores

### `src/lib/engine/`

Pure functions with no side effects. They accept explicit inputs and return computed values.
oxlint's `no-restricted-imports` enforces the layering: engine modules and their tests can't import
from `src/lib/stores/`, `src/lib/components/`, or `src/lib/paraglide/`, even for types. Engine tests
build their inputs directly rather than driving the store. Service-worker cache code & update
plumbing live in `src/lib/pwa/`; message labels & colors for the UI live in `src/lib/presentation/`.

### Other `src/lib/` layers

- **`sources/`** builds the localized source text for item rows (segments, name lookups, & the
  hand-kept game tables behind them).
- **`controllers/`** holds rune-backed controllers that components instantiate, such as the spoiler
  guard & the leaving-row set.
- **`effects/`** fires UI side effects: confetti & the undo toast.
- **`utils/`** is for low-level helpers (formatting, records, localized links, storage access) that
  any layer may import. oxlint's `no-restricted-imports` keeps it from importing components, stores,
  or any of the layers above.
- **`test-utils/`** holds helpers & harnesses that only tests import.

- **Availability filtering** — determines which items/recipes/Villagers are visible based on season,
  weather, quest gates, and world state.
- **Progress calculation** — computes completion counts and percentages from `ProgressState`.
- **Search** — filters and ranks tracker entries.
- **Save import** — parses extracted save JSON files and builds a `Partial<ProgressState>` for
  merging.

### `src/lib/stores/user-state.svelte.ts`

Owns all mutable application state via Svelte 5 runes (`$state`, `$derived`, `$effect`). It:

- Holds the canonical `UserState` shape (`availabilityWindows`, `progress`, `showCompleted`,
  `showSpoilers`, `worldState`).
- Persists progress & world state to `localStorage` through one locked write function (see
  [One write path](#one-write-path)), and this device's preferences under a separate key (see
  [localStorage](#localstorage)).
- Exposes methods for toggling individual entries, importing/exporting JSON, merging save data, and
  resetting.
- Enforces domain constraints at the mutation boundary (e.g., heart level caps, mine floor bounds,
  renown clamping).

## 3. Persistence & Serialization

### localStorage

The store writes two blobs, under the keys in `src/lib/stores/storage-keys.ts`:

- **`mistria-fyi:progress`** holds `SerializedState`, which is also the JSON backup format:
  - `version`, a positive integer: `CURRENT_SERIALIZATION_VERSION`, currently `2`.
  - `progress`: every `ProgressState` field, with sets serialized as sorted arrays and records
    filtered to non-default entries, plus each fact's history (see [Provenance](#provenance)):
    `provenance`, `resolutions`, & `lastSavePlaytime`.
  - `worldState`: the in-game season & weather the availability filters read.
  - `local` (storage only, left out while empty): this device's own section, with slots reserved for
    sync's receipt & farm-switch backup. Exports never include it; a restore keeps this device's and
    never brings one in; a progress reset keeps it and a full reset clears it. Provenance & resolved
    diffs live in `progress`, so they travel with backups.
- **`mistria-fyi:preferences`** holds `SerializedPreferences` (`availabilityWindows`, a subset of
  `now`, `anytime`, & `later`, and `showSpoilers`). These are per-device conveniences: they're never
  exported, so restoring a backup or resetting progress keeps them, and a missing or invalid field
  falls back to its default rather than blocking anything.

`src/lib/stores/progress-storage.ts` owns the blob. Storage hydration & backup restore both read it
the same way: parse it, dispatch on `version`, run the numbered `MIGRATIONS` that bring it up to
this build's version, validate it with Valibot, then normalize it against tracker data. Each path
keeps its own policy above that validation:

| Ingress           | Policy         | A malformed value                                        |
| ----------------- | -------------- | -------------------------------------------------------- |
| Storage hydration | Repairs        | Falls back to its default, or its entry is dropped       |
| Backup restore    | Strict         | Rejects the whole document, which changes nothing        |
| Save import       | Warns          | Is skipped with a warning (see below)                    |
| Device transfer   | All-or-nothing | Rejects the whole payload ([format](transfer-format.md)) |

Outcomes by stored version:

- **This build's version or older:** migrated & loaded. Backups from every earlier build restore.
- **Newer than this build's:** the “newer data” state. The store blocks every write, quarantines
  nothing, and asks the player to update (“Your progress was saved by a newer version. Update to
  continue.”). An explicit replace doesn't lift it; another tab clearing or rewriting the stored
  value does. Exporting a backup meanwhile hands over the stored blob verbatim, never the defaults
  in memory. A newer backup is refused the same way, leaving progress untouched.
- **Unreadable** (not JSON, no valid `version`, or a malformed structure): copied to
  `mistria-fyi:progress-quarantine`, and persistence is blocked until an explicit replace (reset,
  restore, or save import). The player can download the copy from the Backup & Restore card.

An ID this build's tracker data doesn't know is never dropped: the store keeps it out of
`ProgressState`, so counts ignore it, and writes it back with the rest of the blob. A game update
that renames an ID therefore loses nothing; a migration can map the old ID once it's known.

The serializer writes exactly the fields `SerializedState` declares, plus those retained entries;
unrecognized fields in a loaded blob are dropped. The ephemeral UI-only `showCompleted` field is not
persisted. A shape change adds a migration: bump `CURRENT_SERIALIZATION_VERSION`, add the
`MIGRATIONS` step that produces the new version from the previous one, and add that version's
fixture under `src/lib/stores/progress-storage-fixtures/`. `progress-storage.test.ts` fails until
all three exist. `user-state-golden.test.ts` pins the launch shape, what it migrates to, & the
storage keys. See the [decision record](decisions/2026-10-20-storage-migrations-valibot.md).

### One write path

Every progress write goes through the store's `writeProgress`, run under the
`mistria-fyi:progress-write` Web Lock so tabs write one at a time. Inside the lock it re-reads the
stored value & validates it before writing:

| Stored value since this tab last read it | Auto-save (edits, migration) | Explicit replace (restore, reset) | Additive import (save, transfer) |
| ---------------------------------------- | ---------------------------- | --------------------------------- | -------------------------------- |
| Unchanged, or cleared                    | Writes                       | Writes captured replacement       | Writes merged progress           |
| Another tab's readable write             | Adopts it, writes nothing    | Writes captured replacement       | Unions with stored progress      |
| Unreadable                               | Quarantines it               | Quarantines, then writes          | Quarantines, then writes         |
| A newer build's                          | Blocks writes                | Blocks writes                     | Blocks writes                    |

Auto-saves wait for a 300 ms quiet period; explicit writes skip it but still take the lock. Explicit
writes capture their payload at confirmation & invalidate auto-saves already waiting for the lock.
Imports carry the additive preview, including unsaved local progress, and merge it with the stored
progress inside the lock. Their synchronous counts & conflicts describe that immediate preview; the
locked merge applies the same household conflict policy to the latest stored household. An import
preserves captured world state & unknown IDs. Its history merges three ways: each provenance entry,
resolution, or last save playtime the importing tab recorded since its base (the stored value it
last read, or its own explicit write still waiting for the lock) overwrites the stored one, and the
rest keep the history another tab stored meanwhile. A save or transfer agreeing with a fact already
stored leaves that fact's stored provenance in place. Edits made after confirmation are rebased onto
the locked merge result for the next auto-save, including removals & decreases, and so is their
history; a later household edit replaces that household as a unit to preserve the marriage cascade.
The pagehide flush can't wait for a lock, so it runs the same function synchronously, keeping the
compare-before-write. A browser without Web Locks runs every write synchronously; see the
[decision record](decisions/2026-10-20-serialized-progress-writes.md).

### Provenance

Every progress fact records where it came from, so applying a save (see
[sync.md](sync.md#applying-a-bundle)) can tell a fact the player set by hand from one a save or an
inference set. `src/lib/engine/provenance.ts` defines the keys & sources; the store records them.

- **A fact** is one tickable or settable entry, keyed by its field & the IDs that locate it:
  `almanac/turnip`, `animals/chicken/red`, `mineFloor`. Ticks & unticks both record, so an untick
  the player made is remembered.
- **Sources.** Setters & toggles record `manual`. A marriage cascade, a quest's recipe rewards (&
  the undo that takes them back), default unlocks, & “Record prerequisites” record `inferred`. A
  save import records `save`; a device transfer records `unknown`, since its payload carries no
  provenance. Only facts a call changes record: a save agreeing with a fact leaves its provenance as
  it was.
- **Hydration.** Facts stored before version 2 migrate as `unknown`, read the way hydration reads
  them, so a value it repairs to the default gets no record. A relationship the marriage cascade
  sets on load, such as a villager a later build makes dateable, records `inferred`. History for a
  historical almanac ID is rekeyed under its canonical entry on every load, as the fact itself is;
  when several collide, an entry already under the canonical key wins. A malformed `provenance` or
  `resolutions` container is dropped on hydration rather than quarantining progress, and rejected by
  backup restore.
- **Playtime.** Each record carries the `playtime` of the last applied save, so ordering needs no
  clock. A `save` record carries the save's own, or none when its `header.playtime` couldn't be
  read; only a readable one becomes the last applied save's.
- **Resolutions.** A “keep mine” remembers the save's value the player declined, holding until a
  save reports a different value (`resolutionHolds`). A manual edit of that fact clears it.
- **Lifetime.** Backups carry the history, a restore replaces it, & both resets clear it. See the
  [decision record](decisions/2026-10-21-progress-provenance.md).

### Save File Import

The app processes save files entirely client-side. No save data is uploaded.

1. The user selects a `.sav` file or the extracted JSON files (`player.json`, `gamedata.json`,
   `quests.json`, and optionally `header.json` & `info.json`).
2. `parseSavArchive` or `parseExtractedSaveFiles` bundles the sections into a `SaveBundle`. A
   section must be a JSON object, and `player` must contain at least one recognizable progress
   field. When some JSON files are unusable but at least one progress file parses, the others are
   reported as warnings. `header` & `info` only identify the save, so an unreadable one in a `.sav`
   is left out rather than rejecting the file.
3. `extractSave` reads each progress field into its value, a completeness flag, & diagnostics, using
   `trackerData` for validation. A field is `complete` only when the save records all of it; an
   absent or malformed field is `unknown` with no value, never an empty list or a zero. Every ID is
   tracked, known-but-untracked (a game ID the tracker deliberately leaves out, listed in
   `untracked-save-ids.ts`), or unrecognized; an unrecognized ID or an unreadable entry makes its
   field `unknown`. Relationships are never `complete`, since the save’s dating flags are all that
   is read, and neither are mount appearances, since the Mistmare is inferred from one scene ID in
   an uncatalogued scene history. It also retains the save’s identity: `info.creation_version` &
   `header.playtime`. A quest listed as both completed and active imports as `completed`.
4. `extractSaveProgress` turns that into the `Partial<ProgressState>` of every value it could read,
   plus the diagnostics the player sees as warnings (`absent` & `invalid-value` are diagnostics
   only). It doesn’t count anything. See the
   [decision record](decisions/2026-10-20-save-extraction-completeness.md).
5. `mergeFromSave` unions the imported state into the current `userState.state.progress`, taking max
   values for numeric fields (heart levels, skill levels, renown, mine floor) and the more advanced
   quest state (`none` → `obtained` → `completed`). Relationships & child choice merge as one
   household through the pure `mergeHousehold` in `src/lib/engine/relationships.ts`, which reports
   conflicts rather than guessing. The merge’s counts are the ones the import summary shows.

Numeric levels are normalized by `normalizeLevel` in `src/lib/engine/progress.ts` at extraction
time, and `mergeFromSave` clamps them again before installing. Import stays additive, so an invalid
fact produces a warning rather than aborting the import:

| Input                          | Result                        |
| ------------------------------ | ----------------------------- |
| Missing                        | Unknown, no warning           |
| `0`                            | Treated as unset, no warning  |
| Fractional                     | Floored, no warning           |
| Above the domain maximum       | Clamped to the maximum, warns |
| Negative                       | Ignored, warns                |
| Wrong type, `NaN`, or infinite | Ignored, warns                |

The save’s mine-floor field is a zero-based index, so a valid zero imports as floor one and index 99
imports as floor 100; missing or invalid values remain unknown. It is normalized against the maximum
index before adding one (see [the save format](save-file-format.md)).

Renown is the exception: it never warns, since nothing in ordinary play produces an out-of-domain
value. Above its maximum it clamps; a negative or non-numeric renown is left unknown with only a
diagnostic. Backup restore (`restoreBackup`) uses the same domain maximums but rejects the whole
document when a mine floor, heart level, or skill level is out of domain; renown is clamped there
too rather than rejected. See [Backup Restore vs Transfer](#backup-restore-vs-transfer).

### Backup Restore vs Transfer

These flows are not interchangeable:

- **Backup restore** (`restoreBackup`) replaces progress & world state with the imported JSON. It is
  a full overwrite of everything the backup holds; this device's preferences aren't part of it.
- **Save import / device transfer** (`mergeFromSave`) unions imported progress into the current
  state. It is additive and never removes existing entries. The versioned binary contract and
  failure behavior are documented in [the progress transfer format](transfer-format.md).
- **Save-driven sync** (planned, #123) will apply a save from the game as a policy-driven diff
  through one serialized write path, rather than through either flow above. See [sync.md](sync.md).

## 4. Route Composition

Pages are layout compositors. They handle data fetching and composition, not business logic.

- **Shared layout** — `src/routes/(category)/+layout.svelte` applies the category color and renders
  `children()`.
- **Category pages** — the shared category layout derives each page’s progress through
  `getCategoryProgress`; each `+page.svelte` delegates rendering to a focused component, such as
  `#lib/components/skills-content.svelte`.
- **Colocated components** — components used by a single page live in the same directory (e.g.,
  `src/routes/data/import-card.svelte`).
- **Shared components** — reusable components live in `src/lib/components/` or the project-owned
  `src/lib/components/ui/` (forked from shadcn-svelte).
- **"Everything" view** — `src/routes/everything/+page.svelte` computes overall completion and
  renders one `category-section.svelte` per category. That component owns the category-to-content
  map (which content component, whether it's compact, whether its rows stack), the sticky
  `section-header.svelte`, and hiding a completed category unless completed content is shown. A new
  category adds one map entry, not a new section file.

### Component conventions

- **Category content** — each category page renders one
  `src/lib/components/<category>-content.svelte` (`villagers-content.svelte`,
  `renown-content.svelte`), which takes `locale` and an optional `compact` flag for `/everything`.
  Its records (`skill-record.svelte`, `rank-record.svelte`) live beside it in `src/lib/components/`,
  named for the root element's class.
- **Callback props** — name them camelCase `onX` (`onClose`, `onToggle`, `onIncrement`). A lowercase
  name (`onclick`) is reserved for a DOM event handler the component forwards unchanged to its root
  element, as `tracker-checkbox.svelte` does.
- **Prop types** — annotate `$props()` inline. Declare a named `Props` interface only to extend
  another props type for rest-prop forwarding (the icon components extend `IconProps`).
- **Imports** — a shared component imports another through its `#lib/components/` path, never a
  relative one, so a file doesn't mix both styles.
- **No test-only props** — a production component doesn't take props that only tests or the share
  image set. Tests stub the dependency instead (`vi.mock("svelte/motion")` for reduced motion), and
  a variant with its own inputs gets its own component: `og-share-card.svelte` renders the
  presentational `category-stripe.svelte` directly rather than overriding `category-card.svelte`.
- **Domain constants** — derive values from the engine's constants (`DEFAULT_AVAILABILITY_WINDOWS`,
  `MAX_SKILL_LEVEL`) instead of restating them.

## 5. Progress & Visibility

Progress calculation and UI row visibility are separate concerns.

- **Progress** is computed in `src/lib/engine/progress.ts` from the full `ProgressState`, regardless
  of filters.
- **Visibility** is controlled by `availabilityWindows` (`now`, `anytime`, `later`),
  `showCompleted`, and `showSpoilers` at the component level.
- Hidden completed rows still contribute to progress totals. This ensures the overall percentage
  remains accurate even when the user filters out completed content.
- **Category completion** is `isCategoryComplete(key, ctx)`, which is the category's progress at
  100%. The header, the all-completed banner, & `celebrateCategory()` all read it; components don't
  re-derive completion. See the [decision record](decisions/2026-10-06-category-completion.md).

## Domain glossary

Three concepts had several names across modules. Each now has one term, used for identifiers,
persisted keys, generated condition types, CSS hooks, & prose. See the
[decision record](decisions/2026-10-06-canonical-domain-terms.md).

- **Spoilered:** a name or section the player hasn't unlocked, hidden behind a cover until revealed
  or unlocked by progress. Use `spoilered` (`isSpoilered`, `spoilered` props, `spoileredStoreIds`);
  its opposite is `unspoilered`. "Reveal" stays as the user action (`onReveal`), & "hidden" stays
  for unrelated senses such as the DOM `hidden` attribute & completed rows filtered out. The
  `villagerKnown` condition names the discovery fact that drives a villager's spoilering, so it
  keeps its name.
- **Mine floor:** the deepest mine floor the player has reached. Use `mineFloor` / `MineFloor`: the
  persisted key `progress.mineFloor`, the `mineFloor` condition type in `tracker-data.json`, & the
  `setMineFloor` setter. The game's own `maximum_mines_level` & `reached_mines_level` keys keep the
  game's name.
- **Heart level:** a villager's relationship level (zero through `MAX_HEART_LEVEL`). Villagers don't
  level up; the relationship does. Use `heartLevel` / `heartLevels`: the persisted key
  `progress.heartLevels`, `MAX_HEART_LEVEL`, & `setHeartLevel`.

Player spells are their own persisted field, `progress.spells`: they're attached to the player &
usable anywhere, though unlocked through mine progression.

## 6. Response Headers

`src/lib/security/` is the one source for the Content-Security-Policy and the other security headers
(`Permissions-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, and
`X-Content-Type-Options`). Cloudflare Pages delivers them by two paths, and both derive from it:

- **Server responses passing through `handle`** — SvelteKit emits the CSP, with a per-response
  script nonce, from the `csp` option in `vite.config.ts`; the `securityHeaders` hook in
  `hooks.server.ts` adds the rest to pages, bare-path redirects, & API responses. Framework
  responses emitted before `handle`, such as trailing-slash normalization redirects
  (`HEAD /en/everything/` returns `308`), do not receive these headers. Pages never applies
  `_headers` to Function responses.
- **Static files** — the build writes `_headers` (gitignored) from the same directives, and
  `@sveltejs/adapter-cloudflare` copies it into `build/` with its own cache rules. Never commit or
  hand-edit it.

`security-headers.test.ts` pins the full production policy, so any change to it shows up in review.
The asset origin lives in `src/lib/asset-origin.ts`; `asset-origin.test.ts` holds the copies that
can't import it (CSS & upload scripts) to the same value.

## 7. Public contract

Shared links, bookmarks, search indexes, installed apps, & players' stored data all depend on the
identifiers below. Changing a promised one needs a redirect, a migration, or an accepted loss, so
treat each as an API. See [the decision record](decisions/2026-10-07-launch-contract.md).

### Promised

- **Locale prefixes:** `/en`, `/ja`, `/zh-Hans`, `/zh-Hant`, `/es`, `/fr`, `/ko`, & `/ru`, in BCP 47
  casing, with no unprefixed default. A bare path redirects (307) to a negotiated locale; a miscased
  prefix (`/zh-hans/…`) redirects permanently (308) to the canonical casing. Both live in
  `bareLocaleRedirect` in `src/hooks.server.ts`.
- **Route slugs:** `almanac`, `animals`, `cosmetics`, `mines`, `museum`, `quests`, `recipes`,
  `renown`, `skills`, `villagers`, `everything`, `about`, `data`, `privacy`, & `settings`. A rename
  needs a redirect from the old slug.
- **Query & fragment links:** `/data?section=import|transfer` (the welcome card) and
  `/villagers#villager-<id>` (search results, keyed by game villager IDs).
- **Unlocalized paths:** `/api/feedback`, `/sitemap.xml`, & `/licenses.txt` (the build-generated
  open-source notices, linked from the About page; see `src/lib/build/licenses.ts`).
- **Storage keys:** `mistria-fyi:progress`, `mistria-fyi:progress-quarantine`,
  `mistria-fyi:preferences`, & `mistria-fyi:theme`.
- **Stored progress & backups:** whatever any earlier build stored or exported keeps loading in
  every later build, and a build never overwrites or quarantines data a newer build wrote (see
  [localStorage](#localstorage)).
- **Locale cookie:** `mistria-fyi-locale`, set explicitly in `src/lib/i18n/paraglide-options.ts` so
  a library change can't silently reset every player's language.
- **PWA identity:** the manifest's `id: "/"` & `start_url: "/"`. Changing the `id` orphans every
  installed copy.
- **Service-worker messages:** `mfg:cache-locales`, `mfg:client-version`, & `mfg:skip-waiting`. An
  open page posts these to whichever worker is active, installing, or waiting, which may be a newer
  version than the page, so renaming one strands tabs on the old version. A page reports its version
  with `mfg:client-version` so its version's cache outlives an update (#111). Tabs from releases
  before #111 post `mfg:skip-waiting` from their update prompt; the worker still honors it.

### Not promised

- **Cache names** (`cache-<version>`, `sprites-v1`, `offline-locales-v1`, `client-versions-v1`): the
  worker's `activate` deletes every cache it doesn't recognize (once no open page needs it), so a
  rename only costs a re-download, forgets which locales a player kept offline, or keeps older
  caches until the open pages report their versions again.
- Internal identifiers such as category keys, message keys, & component names.
