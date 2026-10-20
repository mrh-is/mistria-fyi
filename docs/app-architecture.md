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
- Persists progress & world state to `localStorage` with a 300 ms debounce, and this device's
  preferences under a separate key (see [localStorage](#localstorage)).
- Exposes methods for toggling individual entries, importing/exporting JSON, merging save data, and
  resetting.
- Enforces domain constraints at the mutation boundary (e.g., heart level caps, mine floor bounds,
  renown clamping).

## 3. Persistence & Serialization

### localStorage

The store writes two blobs, under the keys in `src/lib/stores/storage-keys.ts`:

- **`mistria-fyi:progress`** holds `SerializedState`, which is also the JSON backup format:
  - `version: 1`, an integer. Any other value is rejected as `unsupported-version`.
  - `progress`: every `ProgressState` field, with sets serialized as sorted arrays and records
    filtered to non-default entries.
  - `worldState`: the in-game season & weather the availability filters read.
- **`mistria-fyi:preferences`** holds `SerializedPreferences` (`availabilityWindows`, a subset of
  `now`, `anytime`, & `later`, and `showSpoilers`). These are per-device conveniences: they're never
  exported, so restoring a backup or resetting progress keeps them, and a missing or invalid field
  falls back to its default rather than blocking anything.

A progress blob that fails validation is copied to `mistria-fyi:progress-quarantine` and blocks
persistence until an explicit replace (reset, restore, or save import); the player can download it
from the Backup & Restore card. The ephemeral UI-only `showCompleted` field is not persisted.

The serializer writes exactly the fields `SerializedState` declares; unrecognized fields in a loaded
blob are dropped. Data written by a newer version than the build is never quarantined; #106
implements the “newer data” state (writes blocked, nothing quarantined). There are no legacy
readers: the launch format starts at version `1`, and a later shape change needs a versioned
migration. Fields added after launch must be optional so older blobs keep loading.
`user-state-golden.test.ts` pins the launch shape & the storage keys.

### Save File Import

The app processes save files entirely client-side. No save data is uploaded.

1. The user selects a `.sav` file or the extracted JSON files (`player.json`, `gamedata.json`,
   `quests.json`).
2. `parseSavArchive` or `parseExtractedSaveFiles` bundles the sections into a `SaveBundle`. A
   section must be a JSON object, and `player` must contain at least one recognizable progress
   field. When some JSON files are unusable but at least one parses, the others are reported as
   warnings.
3. `extractSaveProgress` maps the bundle to a `Partial<ProgressState>` using `trackerData` for
   validation and warning generation. Every field is read through a type guard: a field of the wrong
   shape (a string where a list belongs, `null` where an object belongs) is dropped with a warning,
   and non-text list entries are dropped individually. A quest listed as both completed and active
   imports as `completed`. It returns that state & its warnings; it doesn’t count anything.
4. `mergeFromSave` unions the imported state into the current `userState.state.progress`, taking max
   values for numeric fields (heart levels, skill levels, renown, mine floor) and the more advanced
   quest state (`none` → `obtained` → `completed`). Relationships & child choice merge as one
   household through the pure `mergeHousehold` in `src/lib/engine/relationships.ts`, which reports
   conflicts rather than guessing. The merge’s counts are the ones the import summary shows.

Numeric levels are normalized by `normalizeLevel` in `src/lib/engine/progress.ts` at extraction
time, and `mergeFromSave` clamps them again before installing. Import stays additive, so an invalid
fact produces a warning rather than aborting the import:

| Input                          | Result                        |
| ------------------------------ | ----------------------------- |
| Missing or `0`                 | Treated as unset, no warning  |
| Fractional                     | Floored, no warning           |
| Above the domain maximum       | Clamped to the maximum, warns |
| Negative                       | Ignored, warns                |
| Wrong type, `NaN`, or infinite | Ignored, warns                |

The save’s mine-floor field is a zero-based index, so a valid zero imports as floor one and index 99
imports as floor 100; missing or invalid values remain unset. It is normalized against the maximum
index before adding one (see [the save format](save-file-format.md)).

Renown is the exception: it clamps silently at every boundary, since nothing in ordinary play
produces an out-of-domain value. Backup restore (`restoreBackup`) uses the same domain maximums but
rejects the whole document when a mine floor, heart level, or skill level is out of domain; renown
is clamped there too rather than rejected. See
[Backup Restore vs Transfer](#backup-restore-vs-transfer).

### Backup Restore vs Transfer

These flows are not interchangeable:

- **Backup restore** (`restoreBackup`) replaces progress & world state with the imported JSON. It is
  a full overwrite of everything the backup holds; this device's preferences aren't part of it.
- **Save import / device transfer** (`mergeFromSave`) unions imported progress into the current
  state. It is additive and never removes existing entries. The versioned binary contract and
  failure behavior are documented in [the progress transfer format](transfer-format.md).

## 4. Route Composition

Pages are layout compositors. They handle data fetching and composition, not business logic.

- **Shared layout** — `src/routes/(category)/+layout.svelte` applies the category color and renders
  `children()`.
- **Category pages** — the shared category layout derives each page’s progress through
  `getCategoryProgress`; each `+page.svelte` delegates rendering to a focused component, such as
  `#lib/components/skills-content.svelte`.
- **Colocated components** — components used by a single page live in the same directory (e.g.,
  `src/routes/data/import-card.svelte`).
- **Shared components** — reusable components live in `src/lib/components/` or vendored
  `src/lib/components/ui/`.
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
  `mistria-fyi:preferences`, & `mistria-fyi:theme`, plus the progress blob's shape & version (see
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
