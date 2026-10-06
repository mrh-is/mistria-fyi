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

The player's recorded progress (`CompletedState`, `QuestState`, `ChildChoice`) and the shape of a
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
- **Progress calculation** — computes completion counts and percentages from `CompletedState`.
- **Search** — filters and ranks tracker entries.
- **Save import** — parses extracted save JSON files and builds a `Partial<CompletedState>` for
  merging.

### `src/lib/stores/user-state.svelte.ts`

Owns all mutable application state via Svelte 5 runes (`$state`, `$derived`, `$effect`). It:

- Holds the canonical `UserState` shape (`availabilityWindows`, `completed`, `showCompleted`,
  `showSpoilers`, `worldState`).
- Persists to `localStorage` under the key `mistria-fyi-v1` with a 300 ms debounce.
- Exposes methods for toggling individual entries, importing/exporting JSON, merging save data, and
  resetting.
- Enforces domain constraints at the mutation boundary (e.g., villager level caps, mine floor
  bounds, renown clamping).

## 3. Persistence & Serialization

### localStorage

The `SerializedState` interface defines the persisted shape:

- `version: "2"` — used for migration detection; version `"1"` is still accepted on load.
- `availabilityWindows` — a subset of `now`, `anytime`, & `later`. A legacy `availabilityMode`
  (`available`, `everything`, `timely`) is migrated on load.
- `completed` — all sets and records are serialized as sorted arrays or filtered records. Legacy
  formats (`villagers`, `skills`, `quests` as flat arrays) are migrated on load.
- `showSpoilers`
- `worldState`

The ephemeral UI-only `showCompleted` field is not persisted.

### Save File Import

The app processes save files entirely client-side. No save data is uploaded.

1. The user selects a `.sav` file or the extracted JSON files (`player.json`, `gamedata.json`,
   `quests.json`).
2. `parseSavFile` or `parseSaveFiles` bundles the sections into a `SaveBundle`. A section must be a
   JSON object, and `player` must contain at least one recognizable progress field. When some JSON
   files are unusable but at least one parses, the others are reported as warnings.
3. `buildImportState` maps the bundle to a `Partial<CompletedState>` using `trackerData` for
   validation and warning generation. Every field is read through a type guard: a field of the wrong
   shape (a string where a list belongs, `null` where an object belongs) is dropped with a warning,
   and non-text list entries are dropped individually. A quest listed as both completed and active
   imports as `completed`.
4. `mergeFromSave` unions the imported state into the current `userState.completed`, taking max
   values for numeric fields (Villager levels, skill levels, renown, mine floor) and the more
   advanced quest state (`none` → `obtained` → `completed`).

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

Renown is the exception: it clamps silently at every boundary, since nothing in ordinary play
produces an out-of-domain value. Backup restore (`importState`) uses the same domain maximums but
rejects the whole document when a mine floor, villager level, or skill level is out of domain;
renown is clamped there too rather than rejected. See
[Backup Restore vs Transfer](#backup-restore-vs-transfer).

### Backup Restore vs Transfer

These flows are not interchangeable:

- **Backup restore** (`importState`) replaces the entire serialized state with the imported JSON. It
  is a full-state overwrite.
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
- **"Everything" view** — `src/routes/all/+page.svelte` computes overall completion and renders one
  `category-section.svelte` per category. That component owns the category-to-content map (which
  content component, whether it's compact, whether its rows stack), the sticky
  `section-header.svelte`, and hiding a completed category unless completed content is shown. A new
  category adds one map entry, not a new section file.

## 5. Progress & Visibility

Progress calculation and UI row visibility are separate concerns.

- **Progress** is computed in `src/lib/engine/progress.ts` from the full `CompletedState`,
  regardless of filters.
- **Visibility** is controlled by `availabilityWindows` (`now`, `anytime`, `later`),
  `showCompleted`, and `showSpoilers` at the component level.
- Hidden completed rows still contribute to progress totals. This ensures the overall percentage
  remains accurate even when the user filters out completed content.
- **Category completion** is `isCategoryComplete(key, ctx)`, which is the category's progress at
  100%. The header, the all-completed banner, & `celebrateCategory()` all read it; components don't
  re-derive completion. See the [decision record](decisions/2026-10-06-category-completion.md).

## 6. Response Headers

`src/lib/security/` is the one source for the Content-Security-Policy and the other security headers
(`Permissions-Policy`, `Referrer-Policy`, `Strict-Transport-Security`, and
`X-Content-Type-Options`). Cloudflare Pages delivers them by two paths, and both derive from it:

- **Server responses passing through `handle`** — SvelteKit emits the CSP, with a per-response
  script nonce, from the `csp` option in `vite.config.ts`; the `securityHeaders` hook in
  `hooks.server.ts` adds the rest to pages, bare-path redirects, & API responses. Framework
  responses emitted before `handle`, such as trailing-slash normalization redirects (`HEAD /en/all/`
  returns `308`), do not receive these headers. Pages never applies `_headers` to Function
  responses.
- **Static files** — the build writes `_headers` (gitignored) from the same directives, and
  `@sveltejs/adapter-cloudflare` copies it into `build/` with its own cache rules. Never commit or
  hand-edit it.

`security-headers.test.ts` pins the full production policy, so any change to it shows up in review.
The asset origin lives in `src/lib/asset-origin.ts`; `asset-origin.test.ts` holds the copies that
can't import it (CSS & upload scripts) to the same value.
