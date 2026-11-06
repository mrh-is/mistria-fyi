# Application Architecture

> Canonical reference for Mistria Field Guide's data flow, state model, and UI composition.

## 1. Generated Data Contracts

### `src/lib/data/tracker-data.json`

This file is produced by the pipeline (`pipeline/`) and must never be hand-edited. It contains the
complete static dataset: items, recipes, animals, cosmetics, villagers, quests, mines, museum wings,
skills, stores, and sources.

### `src/lib/types/tracker-data.ts`

The shared data contract between the pipeline and the app. Its entity types, including
`TrackerData`, derive from the Valibot schemas in `tracker-data-schema.ts`; branded IDs (`ItemId`,
`RecipeId`, `VillagerId`, etc.) retain their public identities. Only recursive condition edges need
explicit TypeScript annotations; their leaf payloads derive from the schemas. The pipeline validates
the complete assembled output after enrichment and before publication, alongside
acquisition-reference, provenance, and cycle checks. Unknown fields and malformed payloads fail with
a field path. The app imports the schemas only as types and trusts this validated, committed JSON,
so schema validation adds no client runtime dependency.

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

- **Availability** — decides what's doable today from the season, the weather, & the player's
  progress, which sorts everything onto shelves.
- **Progress calculation** — computes completion counts and percentages from `ProgressState`.
- **Search** — filters and ranks tracker entries.
- **Save import** — parses extracted save JSON files and builds a `Partial<ProgressState>` for
  merging.

`engine/categories.ts` is the category registry: one entry per category, keyed and ordered by
`CategoryKey`. Every entry has a projection (`engine/projections/<category>.ts`) that returns the
category's rows and its progress `totals`, and a route; a search provider is optional. The
registry's comment lists the other files a new category needs. `getCategoryProgress`,
`getAllProgress`, & `isCategoryComplete` read each projection's totals, and search runs only the
categories that declare `search`, whose providers (`engine/search-providers.ts`) read their own
projection. `data/categories.ts` adds each category's localized name & description, which the engine
can't import. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-21-category-registry.md).

`engine/projections/almanac.ts` supplies the almanac page, progress counters, and search with one
row policy. It returns section membership, canonical rows, applicability, spoiler and filter flags,
and progress totals. Date Inspiration is counted only through its canonical Almanac entries.
Unobtainable entries are hidden by default; the almanac's temporary filter can reveal them without
changing any total: header progress and each section's count & total count only obtainable rows.
Page callers pass name & source filters. Search includes rows that aren't doable today, hides
spoilers, and deduplicates rows that belong to several sections. Section progress still counts each
in-game section membership.

### `src/lib/stores/user-state.svelte.ts`

Owns all mutable application state via Svelte 5 runes (`$state`, `$derived`, `$effect`). It:

- Holds the canonical `UserState` shape (`everythingGrouping`, `lastImport`, `progress`,
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
  - `version`, a positive integer: `CURRENT_SERIALIZATION_VERSION`, currently `6`.
  - `lastImport`: the last manual save import's timestamp, identity (filename number plus creation
    version), & player/farm display names, or `null`. Version 1 migrates to `null` without inventing
    history. Missing or malformed game metadata remains unknown and never blocks importing progress.
    Names are display information, never identity, and feedback attaches only `progress`, excluding
    this section. Backup restore carries it; a progress or full reset clears it.
  - `progress`: every `ProgressState` field, with sets serialized as sorted arrays and records
    filtered to non-default entries, plus each fact's history (see [Provenance](#provenance)):
    `provenance`, `resolutions`, `lastSavePlaytime`, & `lastSaveUnordered` (version 7).
  - `worldState`: the in-game season & weather the availability filters read.
  - `local` (storage only, left out while empty): this device's own section, which holds sync's
    lane, receipt, freshness, pending retires, & farm-switch backup (see [sync.md](sync.md)).
    Exports never include it; a restore keeps this device's and never brings one in; a progress
    reset keeps it (all but the receipt) and a full reset clears it. Provenance & resolved diffs
    live in `progress`, so they travel with backups.
- **`mistria-fyi:sync-uploads`** holds the sync courier's upload counter & the mailbox & hash of its
  last upload, apart from progress so nothing that blocks or erases progress touches them
  ([sync.md](sync.md#the-courier)).
- **`mistria-fyi:preferences`** holds `SerializedPreferences` (`showSpoilers`, and
  `everythingGrouping`, either `category` or `source`). These are per-device conveniences: they're
  never exported, so restoring a backup or resetting progress keeps them, and a missing or invalid
  field falls back to its default rather than blocking anything.

`src/lib/stores/progress-storage.ts` owns the blob. Storage hydration & backup restore both read it
the same way: parse it, dispatch on `version`, run the numbered `MIGRATIONS` that bring it up to
this build's version, validate it with Valibot, then normalize it against tracker data. Each path
keeps its own policy above that validation:

| Ingress           | Policy  | A malformed value                                  |
| ----------------- | ------- | -------------------------------------------------- |
| Storage hydration | Repairs | Falls back to its default, or its entry is dropped |
| Backup restore    | Strict  | Rejects the whole document, which changes nothing  |
| Save import       | Warns   | Is skipped with a warning (see below)              |

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

An ID this build's tracker data doesn't know is retained: the store keeps it out of `ProgressState`,
so counts ignore it, and writes it back with the rest of the blob. A game update that renames an ID
therefore loses nothing; a migration can map the old ID once it's known.

Version 4 deliberately drops the obsolete `progress.dates` checklist and its provenance &
resolutions, without mapping it into Almanac progress. It duplicated Date Inspiration, whose
canonical entries are already tracked by save import. Existing Almanac progress is preserved;
unknown IDs in supported fields still follow the retention policy above. Hydration & backup restore
both apply this removal, including when obsolete Dates values are malformed. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-date-inspiration-migration.md).

Version 5 adds `breakUpsDisabled`, defaulting to `false` for older blobs. Hydration and backup
restore preserve other dating relationships when it is true. With break-ups enabled, an engagement
or marriage makes only existing romantic/proposed relationships platonic; absent and undecided paths
remain undecided.

The serializer writes exactly the fields `SerializedState` declares, plus those retained entries;
unrecognized fields in a loaded blob are dropped. The ephemeral UI-only `showCompleted` field is not
persisted. A shape change adds a migration: bump `CURRENT_SERIALIZATION_VERSION`, add the
`MIGRATIONS` step that produces the new version from the previous one, and add that version's
fixture under `src/lib/stores/progress-storage-fixtures/`. `progress-storage.test.ts` fails until
all three exist. `user-state-golden.test.ts` pins the launch shape, what it migrates to, & the
storage keys. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-storage-migrations-valibot.md).

### One write path

Every progress write goes through the store's `writeProgress`, run under the
`mistria-fyi:progress-write` Web Lock so tabs write one at a time. Inside the lock it re-reads the
stored value. The pure writer in `src/lib/stores/progress-writer.ts` classifies that value and plans
the replacement or sync write. The import planner merges captured progress & rebases later edits
separately. The store handles storage access, quarantine, & publishing the planned state.

| Stored value since this tab last read it | Auto-save (edits, migration) | Explicit replace (restore, reset) | Additive import (save)      |
| ---------------------------------------- | ---------------------------- | --------------------------------- | --------------------------- |
| Unchanged, or cleared                    | Writes                       | Writes captured replacement       | Writes merged progress      |
| Another tab's readable write             | Adopts it, writes nothing    | Writes captured replacement       | Unions with stored progress |
| Unreadable                               | Quarantines it               | Quarantines, then writes          | Quarantines, then writes    |
| A newer build's                          | Blocks writes                | Blocks writes                     | Blocks writes               |

Auto-saves wait for a 300 ms quiet period. Explicit writes skip it but still take the lock.
Replacements capture their payload at confirmation & invalidate auto-saves already waiting for the
lock. Imports capture the save & unsaved local progress, then check both against storage under the
lock. They publish progress only after the write succeeds. Their counts & conflicts describe the
captured preview. The locked merge applies the same household conflict policy to the latest stored
household. An import preserves captured world state & unknown IDs. Its history merges three ways:
each provenance entry, resolution, or last save playtime the importing tab recorded since its base
(the stored value it last read, or its own explicit write still waiting for the lock) overwrites the
stored one, and the rest keep the history another tab stored meanwhile. A save agreeing with a fact
already stored leaves that fact's stored provenance in place, unless a save is replacing a guess in
it and the merge kept the value that save reported. Edits made after confirmation are rebased onto
the locked merge result for the next auto-save, including removals & decreases, and so is their
history. Later partner changes keep their household together. Other relationship edits apply on top
of the merged household. The pagehide flush can't wait for a lock, so it runs the same function
synchronously, keeping the compare-before-write. Browsers without Web Locks run every write
synchronously. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-serialized-progress-writes.md).

### Provenance

Every progress fact records where it came from, so applying a save (see
[sync.md](sync.md#applying-a-bundle)) can tell a fact the player set by hand from one a save or an
inference set. `src/lib/engine/provenance.ts` defines the keys & sources; the store records them.

- **A fact** is one tickable or settable entry, keyed by its field & the IDs that locate it:
  `almanac/turnip`, `animals/chicken/red`, `mineFloor`. Ticks & unticks both record, so an untick
  the player made is remembered.
- **Sources.** Setters & toggles record `manual`. An engagement cascade, a quest's recipe rewards (&
  the undo that takes them back), default unlocks, & “Record prerequisites” record `inferred`. A
  save import records `save`. Stored facts whose original source is unavailable keep `unknown`. Only
  facts a call changes record, with one exception: a save replaces the app's guesses but never the
  player's entries, so one agreeing with an `unknown` or `inferred` fact promotes it to `save`, and
  one agreeing with a `manual` fact leaves it `manual`.
- **A quest's two moments.** When a different source finishes an obtained quest, its record keeps
  the obtained moment's source in `obtainedSource` (version 6), and any later change replaces the
  record. A save reporting `completed` follows the same rule for that moment: it replaces a guess
  and keeps `manual`, so a pen slash under a stamped X is permanent on purpose. A quest finished
  before version 6 has none, so it draws in its own source.
- **Marks.** `provenanceMark` turns a fact's key & sources into its checkbox's mark. The tool is
  decorative, so it's never announced. See the
  [decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-30-provenance-marks.md).
- **Hydration.** Facts stored before version 3 migrate as `unknown`, read the way hydration reads
  them, so a value it repairs to the default gets no record. A relationship the engagement cascade
  applies on load records `inferred`. History for a historical almanac ID is rekeyed under its
  canonical entry on every load, as the fact itself is; when several collide, an entry already under
  the canonical key wins. A malformed `provenance` or `resolutions` container is dropped on
  hydration rather than quarantining progress, and rejected by backup restore.
- **Playtime.** Each record carries the `playtime` of the last applied save, so ordering needs no
  clock. A `save` record carries the save's own, or none when its `header.playtime` couldn't be
  read; only a readable one becomes the last applied save's.
- **Resolutions.** A “keep mine” remembers the save's value the player declined, holding until a
  save reports a different value (`resolutionHolds`). A manual edit of that fact clears it.
- **Lifetime.** Backups carry the history, a restore replaces it, & both resets clear it. See the
  [decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-21-progress-provenance.md).

### Save File Import

The app processes save files entirely client-side. No save data is uploaded.

1. The user selects a `.sav` file or the extracted JSON files (`player.json`, `gamedata.json`,
   `quests.json`, and optionally `header.json` & `info.json`).
2. `parseSavArchive` or `parseExtractedSaveFiles` bundles the sections into a `SaveBundle`. Native
   filenames supply `saveNumber` from both autosaves & manual slots; renamed files and extracted
   JSON leave it unknown. `readSaveIdentity` copies optional identity & display fields for the
   manual import record. A section must be a JSON object, and `player` must contain at least one
   recognizable progress field. When some JSON files are unusable but at least one progress file
   parses, the others are reported as warnings. `header` & `info` only identify the save, so an
   unreadable one in a `.sav` is left out rather than rejecting the file.
3. `extractSave` reads each progress field into its value, a completeness flag, & diagnostics, using
   `trackerData` for validation. A field is `complete` only when the save records all of it; an
   absent or malformed field is `unknown` with no value, never an empty list or a zero. Every ID is
   tracked, known-but-untracked (a game ID the tracker deliberately leaves out, listed in
   `untracked-save-ids.ts`), or unrecognized; an unrecognized ID or an unreadable entry makes its
   field `unknown`. Relationships are complete when every dateable villager’s explicit status is
   readable, including `null` for undecided. Mount appearances use the explicit Mistmare reveal fact
   & the animal variant lists. Child choice is complete only with positive evidence; a childless
   save cannot distinguish refusal from postponement. It also retains the save’s identity:
   `info.creation_version` & `header.playtime`. A quest listed as both completed and active imports
   as `completed`.
4. `extractSaveProgress` turns that into the `Partial<ProgressState>` of every value it could read,
   plus the diagnostics the player sees as warnings (`absent` & `invalid-value` are diagnostics
   only). It doesn’t count anything. See the
   [decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-save-extraction-completeness.md).
5. `mergeFromSave` refuses the import if this device is syncing. It compares the incoming farm with
   the tracked farm using the same save number & creation version rules as sync. If the import would
   combine known different farms, it asks the player to cancel or explicitly merge. The write
   rechecks the farms when the player confirms. A confirmed merge keeps the combined progress and
   tracks the identified farm from the most recent import. Renamed saves & extracted JSON may lack a
   save number. An unidentified save leaves an existing known identity in place. Each tab accepts
   one import at a time.
6. `mergeFromSave` unions the imported state into the current `userState.state.progress`, taking max
   values for numeric fields (heart levels, skill levels, renown, mine floor) and the more advanced
   quest state (`none` → `obtained` → `completed`). Relationships, the break-ups setting, & child
   choice merge as one household through the pure `mergeHousehold` in
   `src/lib/engine/relationships.ts`, which reports conflicts rather than guessing. A defined
   incoming break-ups setting replaces the local setting. When it changes to disabled for a
   household that already had a partner, incoming romantic values may correct platonic values left
   by the old cascade. Other branch changes still conflict. The merge’s counts are the ones the
   import summary shows.

Manual import & sync share farm comparison, fact ordering, fact writes, & save provenance in
`save-identity.ts` & `save-progress.ts`. Manual import keeps its additive merge & household cascade.
It can recover quarantined progress after the unreadable copy is safe. Sync uses its provenance &
completeness policy to decide when to remove facts or ask. It can switch farms with a backup, and
records a sync receipt when it applies a bundle. See [Applying a bundle](sync.md#applying-a-bundle).

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
too rather than rejected. See [Backup restore vs save import](#backup-restore-vs-save-import).

### Backup restore vs save import

These flows are not interchangeable:

- **Backup restore** (`restoreBackup`) replaces progress & world state with the imported JSON. It is
  a full overwrite of everything the backup holds; this device's preferences aren't part of it.
- **Save import** (`mergeFromSave`) unions imported progress into the current state. It is additive
  and never removes existing entries.
- **Save-driven sync** applies a save from the game as a policy-driven diff through one serialized
  write path. See [sync.md](sync.md).

[#433](https://github.com/mrh-is/mistria-fyi/pull/433) retired progress-transfer QR codes. The old
`/data?section=transfer` link opens guidance on sync & backups.

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
  renders `category-section.svelte` for outstanding sections & again below a single Completed
  divider when “Show completed” is on. That component owns the category-to-content map (which
  content component & whether it's compact), the sticky, collapsible `section-header.svelte`, and
  hiding categories with no matching sections. A new category adds one map entry, not a new section
  file.

The Everything page also offers a Source grouping. `controllers/source-checklist.ts` adapts the
category projections into rows with their original completion identity, presentation, & reversible
store action. `presentation/source-groups.ts` places each row under all of its source instances,
merges stock facets within an instance, & classifies availability using only that instance’s
sources. Source totals & To do, Not now, & Done rollups precede display filtering; unobtainable rows
never hold a source open. `source-content.svelte` composes the source types & sections, placing Done
sections inside the same page-wide Completed fold. In both lenses, outstanding groups start open &
completed groups start closed on each page load; these choices aren't persisted. A source anchor
opens its containing type group, including a completed one. `controllers/completion-scope.svelte.ts`
partitions category sections by the same completion their headers show; compact records & masked
top-level spoiler sections register individually, & a masked section always counts as outstanding. A
section changes lists once a completed row has had time to leave, the source lens holds its sections
the same way, & focus inside a section that leaves moves to the nearest visible section trigger. The
Completed fold starts closed and renders its copy only once opened, because that copy is every
category a second time. Collapsed groups keep their content mounted so progress edits & filters can
update which groups have content. Category pages have no completion scope & keep their existing
grouping. The `group=category|source` query overrides the device’s `everythingGrouping` preference
without rewriting it; choosing the control updates both the preference & URL. Progress serialization
is unchanged.

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

- **Progress** is each category projection's `totals`, computed from the full `ProgressState`
  regardless of display filters; `src/lib/engine/progress.ts` holds its types & level rules.
- **Two systems decide what a page shows, & each has one job.** Availability says what's doable
  today, and it decides the shelf. Source filters say which sources the player is looking at, and
  they decide what's on the page. Neither touches a fraction, which always uses the full total.
- **Availability** is `isDoableToday` in `engine/availability.ts`. A locked row isn't doable. A row
  without sources is. Any other row needs a doable source among those the filters show, so a hidden
  shop can't keep a spring insect doable in summer. A source isn't doable while it's locked, a
  progress gate the app records is unmet, or it's out of season or weather. Unevaluable gates count
  as met, & time of day never counts against a source.
- **Availability has no knowledge of spoilers.** `ProgressContext.progressionState` is always
  derived with “Show spoilers” off, so that switch only changes what the spoiler UI reveals. Code
  that masks something reads `userState.progressionState` instead.
- **Shelves** live in `engine/shelves.ts`. To do has an unfinished row doable today through a shown
  source. Not now has unfinished shown rows, none doable. Completed has every row finished & at
  least one row matching the filters. Anything else leaves the page. `progressShelf` sorts
  categories, sections, & Museum sets from their `CategoryProgress`, & `rowShelf` sorts rows.
- **Folds:** `section-groups.svelte` groups a page's sections, & `shelf-groups.svelte` groups what's
  inside a section. Not now & Completed start closed and reset on navigation, while home keeps every
  shelf open, because it's the index. A search opens every fold. Sections in a closed page fold stay
  mounted, so they can report a new shelf.
- **Filter note:** each page's parts report `filteredCounts` through `registerPageSearch`, and
  `page-search-status.svelte` names the most actionable shelf that lost rows. Search uses the same
  note.
- **The toolbar** gives each page its own `clock` & `filter` flags in `ToolbarConfig`. The clock
  sets `worldState`. A save import or sync overwrites it with the save’s day, and a clock change
  then holds until the next save arrives.
- Mines counts floors as doable down to the first unbroken seal at or below the player's floor, and
  the floors past it wait. Finishing the seal's quest breaks it, and a floor below a seal proves
  that seal is broken. Quests read only spoilers & the items they ask for until #502. Skills &
  Renown are always To do.
- **Category completion** is `isCategoryComplete(key, ctx)` in `engine/categories.ts`, which is the
  category's progress at 100%. The header, the all-completed banner, & `celebrateCategory()` all
  read it; components don't re-derive completion. See the
  [decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-06-category-completion.md).

## Domain glossary

Three concepts had several names across modules. Each now has one term, used for identifiers,
persisted keys, generated condition types, CSS hooks, & prose. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-06-canonical-domain-terms.md).

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

- **Server responses passing through `handle`** — in production only `/api`; in development &
  `vite preview`, every page too. SvelteKit emits a rendered page's CSP, with a per-response script
  nonce, from the `csp` option in `vite.config.ts`; the `securityHeaders` hook in `hooks.server.ts`
  adds the rest to every response passing through it. Framework responses emitted before `handle`,
  such as trailing-slash normalization redirects (`HEAD /en/everything/` returns `308`), do not
  receive these headers. Pages never applies `_headers` to Function responses.
- **Static files** — `withHeadersFile` (`src/lib/build/headers-file.ts`) wraps the adapter and
  writes `_headers` (gitignored) from the same directives just before `@sveltejs/adapter-cloudflare`
  copies it into `build/` with its own cache rules. Never commit or hand-edit it.

`app.html`'s two inline scripts are allowed by SHA-256 hash in every policy, not by nonce: SvelteKit
refuses to prerender a template containing `%sveltekit.nonce%`. Editing either script changes its
hash, which the build recomputes and `security-headers.test.ts` pins.

### Prerendered pages

Every page is prerendered in every locale (the root `+layout.ts` opts in; the routes are listed in
`src/lib/i18n/prerender-entries.ts`), so each is a static file, so its CSP comes from `_headers`,
not SvelteKit. SvelteKit also writes a `<meta http-equiv>` policy into the page, hashing its inline
start script; a browser enforces both policies, so the `/*` header (with no hash for that script)
would block hydration. Each prerendered route therefore gets its own `_headers` rule
(`/:locale/almanac`; a locale home keeps its literal path, `/en`) that detaches the inherited CSP
(`! Content-Security-Policy`) and sets the same directives plus that route's start-script hashes.
The header keeps `frame-ancestors`, which a `<meta>` policy can't carry. A prerendered page can't
read its query on the server, so `?section=` is handled in the browser. See
[the decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-prerender-csp.md).

### Bare paths & routing

`_routes.json` sends only `/api/*` to the Pages Function; everything else is a static file, a
`_redirects` rule, or the adapter's plain-text `404.html`. An include list stays one rule however
many pages there are, where excluding each prerendered page would overflow Pages' 100-rule cap.

`withBarePathStubs` (`src/lib/build/bare-path-stubs.ts`) wraps the adapter outside
`withHeadersFile`. It writes a stub page for each bare path (`/` as `index.html`, `/almanac` as
`almanac.html`) beside the prerendered pages, and lists the stubs among them, so each stub's path
gets a `_headers` rule allowing its one inline script by hash. It also writes `_redirects`
(gitignored) for miscased locale prefixes. The dev server & `vite preview` have neither file, so the
`barePathStub` hook in `hooks.server.ts` serves the same stub & the same redirect there. An offline
launch at a bare path is handled by the service worker before the stub (see
[PWA verification](pwa-verification.md)). See
[the decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-21-bare-path-stubs.md).

`security-headers.test.ts` pins the full production policy, so any change to it shows up in review.
The asset origin lives in `src/lib/asset-origin.ts`; `asset-origin.test.ts` holds the copies that
can't import it (CSS & upload scripts) to the same value.

## 7. Public contract

Shared links, bookmarks, search indexes, installed apps, & players' stored data all depend on the
identifiers below. Changing a promised one needs a redirect, a migration, or an accepted loss, so
treat each as an API. See
[the decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-07-launch-contract.md).

### Promised

- **Locale prefixes:** `/en`, `/ja`, `/zh-Hans`, `/zh-Hant`, `/es`, `/fr`, `/ko`, & `/ru`, in BCP 47
  casing, with no unprefixed default. Every bare URL lands on the right locale's copy of that page
  (the stored preference, then the browser's languages, then English), keeping its query & fragment,
  and a lowercase or uppercase prefix (`/zh-hans/…`) lands permanently on the canonical casing. See
  [Bare paths & routing](#bare-paths--routing).
- **Route slugs:** `almanac`, `animals`, `cosmetics`, `mines`, `museum`, `quests`, `recipes`,
  `renown`, `skills`, `villagers`, `everything`, `about`, `data`, & `privacy`. A rename needs a
  redirect from the old slug.
- **Query & fragment links:** `/data?section=import` and `/villagers#villager-<id>` (search results,
  keyed by game villager IDs).
- **Unlocalized paths:** `/api/feedback`, `/sitemap.xml`, & `/licenses.txt` (the build-generated
  open-source notices, linked from the About page; see `src/lib/build/licenses.ts`).
- **Storage keys:** `mistria-fyi:progress`, `mistria-fyi:progress-quarantine`,
  `mistria-fyi:preferences`, `mistria-fyi:sync-uploads`, & `mistria-fyi:theme`.
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

- The retired beta route `/settings` returns the not-found page; use `/data?section=import` for
  data-management links. Its removal without a redirect was explicitly approved in #156; see
  [the decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-20-retire-settings-route.md).
- **The not-found page's content:** an unknown path gets the adapter's plain-text `404.html`, not
  the app's styled error page, since only `/api` reaches the Function. A locale prefix in a mixed
  casing other than all lowercase or all uppercase (`/zh-HaNs/…`) gets it too.
- **Cache names** (`cache-<version>`, `sprites-v1`, `offline-locales-v1`, `client-versions-v1`): the
  worker's `activate` deletes every cache it doesn't recognize (once no open page needs it), so a
  rename only costs a re-download, forgets which locales a player kept offline, or keeps older
  caches until the open pages report their versions again.
- Internal identifiers such as category keys, message keys, & component names.

## 8. Feedback credentials

`/api/feedback` files issues on `mrh-is/mistria-fyi` as a GitHub App installation. The generic error
page opens this same feedback form with an editable draft containing only the friendly message
already displayed. It never copies raw errors, stack traces, or URLs. Opening or closing the form
sends no report; the user must explicitly submit it. Progress & contact details remain opt-in, and
error reports do not offer the separate sync-log attachment. The form warns that the message becomes
a public GitHub issue.

`src/lib/server/github-app-auth.ts` signs a nine-minute RS256 App JWT with Web Crypto, exchanges it
at `POST /app/installations/{id}/access_tokens`, & caches the installation token per isolate until
five minutes before its `expires_at`. Each exchange asks for only `issues: write` on `mistria-fyi`,
so a permission or repository later added to the App never reaches these tokens. Requests share only
a settled token, never a pending exchange: a Worker's pending I/O belongs to the request that
started it, so concurrent requests with no fresh cached token each run their own exchange. A `401`
on the issue request drops the cached token only if it is the one GitHub rejected. The endpoint
requires all three App settings:

- `GITHUB_APP_ID`: the App ID (or client ID), the JWT issuer. Not secret.
- `GITHUB_APP_INSTALLATION_ID`: the App's installation on this repository. Not secret.
- `GITHUB_APP_PRIVATE_KEY`: the App's private key as a PKCS#8 PEM (`BEGIN PRIVATE KEY`). Secret,
  production only.

In production, missing or blank App settings return `503` & log only the missing variable names. A
failed exchange returns the same `503` as a failed issue request & logs only GitHub’s status &
request ID, never the key, the JWT, or a token. Personal access tokens are no longer supported.

`wrangler.toml` is the source of truth for the Pages project's configuration, so plain-text
variables can't be set in the dashboard. Store all three settings as production **secrets**: the IDs
aren't sensitive, but a secret keeps them production-only without restating the KV binding in a
per-environment `wrangler.toml` block.

Only production files issues. `vite.config.ts` sets `isProductionDeployment`
(`src/lib/server/deployment.ts`) at build time, true only when Cloudflare Pages builds `main`
(`CF_PAGES_BRANCH`). Every other build (branch previews, local builds, dev, & tests) runs feedback
as a dry run. It applies the same origin, payload, & Turnstile token checks, verifies Turnstile only
when `TURNSTILE_SECRET_KEY` is set, then returns `{ dryRun: true }` without reading the App
settings, calling GitHub, or storing the email. The panel says nothing was filed. No request header,
host, or body field can switch production into a dry run. If the Pages production branch is ever
renamed, update `vite.config.ts` in the same change, or production feedback silently becomes a dry
run. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-27-feedback-preview-dry-run.md).

### Setting up the App (maintainer)

1. On GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub App** for the account
   that owns `mrh-is/mistria-fyi`. Set the homepage URL to `https://mistria.fyi`, clear **Webhook →
   Active**, & under **Repository permissions** set only **Issues: Read and write** (GitHub adds
   **Metadata: Read-only** itself). Leave every other permission at **No access**, choose **Only on
   this account**, & create the App. Note its **App ID**.
2. **Install App → Only select repositories →** `mistria-fyi`. The installation ID is the number at
   the end of the installation's settings URL (`…/settings/installations/<id>`).
3. **Generate a private key.** GitHub downloads it as PKCS#1 (`BEGIN RSA PRIVATE KEY`), which Web
   Crypto can't import, so convert it:
   `openssl pkcs8 -topk8 -nocrypt -in app.pem -out app-pkcs8.pem`.
4. Store the settings as production secrets. Each command prompts for the value, or reads it from
   standard input:

   ```sh
   pnpm exec wrangler pages secret put GITHUB_APP_ID --project-name mistria-fyi
   pnpm exec wrangler pages secret put GITHUB_APP_INSTALLATION_ID --project-name mistria-fyi
   pnpm exec wrangler pages secret put GITHUB_APP_PRIVATE_KEY --project-name mistria-fyi < app-pkcs8.pem
   ```

   The dashboard works too: **Workers & Pages → mistria-fyi → Settings → Variables and Secrets →
   Production → Add**, type **Secret**. Confirm that none of the three appear under **Preview**,
   then delete both local `.pem` files; GitHub can't re-download a key, but you can generate
   another.

5. Redeploy production (secrets apply to new deployments), submit feedback, & confirm the issue's
   author is the App's bot account.
6. Remove the legacy token, then revoke it under **Settings → Developer settings → Personal access
   tokens → Fine-grained tokens**:
   `pnpm exec wrangler pages secret delete GITHUB_FEEDBACK_TOKEN --project-name mistria-fyi`. That
   command takes no environment flag, so confirm in the dashboard (**Settings → Variables and
   Secrets**) that `GITHUB_FEEDBACK_TOKEN` is gone from both **Production** & **Preview**, and
   delete any copy that remains. The endpoint ignores this obsolete binding; preview builds run
   feedback as a dry run without App credentials.

The App key doesn't expire, so there is no rotation schedule. To replace it, generate a second key,
store it as above, redeploy, then delete the old key in the App's settings. If the key leaks, delete
it there first: GitHub rejects JWTs signed with a deleted key immediately, though an installation
token already issued stays valid for up to an hour unless you also suspend the installation. See the
[decision record](https://github.com/mrh-is/mistria-fyi/blob/2941c9bf35350d638b77d2d28160556dc76f85de/docs/decisions/2026-10-22-feedback-github-app.md).
