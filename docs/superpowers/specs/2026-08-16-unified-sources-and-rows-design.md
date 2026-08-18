# Unified sources & row components

**Issues:** #91, #101

**Goal:** Remove the legacy source type system, migrate all consumers to `AcquisitionSource`, rename
`acquisitionSources` to `sources`, unify row components into one recipe-style pattern, and extend
source display to all entity types.

## Context

PR #100 (issue #78) introduced inline `acquisitionSources` arrays on every item, cosmetic, & recipe,
and switched the visibility engine to read from them. The legacy system still exists in parallel:

- `trackerData.sources` (top-level `Record<ItemId, Source[]>` map)
- `LegacyItemSource` and `LegacyRecipeSource` types in `tracker-data.ts`
- `Restriction` / `RestrictionType` types used by `availability.ts`
- Legacy source consumers in components, engine modules, utility modules, & the pipeline

Meanwhile, the row components have accumulated significant duplication. `CompletionRow`,
`RedactedRow`, `CosmeticRow`, `ItemRow`, and inline recipe row markup in `recipes-content.svelte`
all implement near-identical row shells with incompatible source rendering patterns.

This spec covers both cleanups as a single PR, since the type unification is a prerequisite for
component unification.

## 1. Type system cleanup

### Base entity type

Extract a `TrackerEntity` base interface that formalizes the shared contract between items,
cosmetics, & recipes:

```typescript
interface TrackerEntity {
  sources?: AcquisitionSource[];
  visibility?: VisibilityCondition;
}

interface Item extends TrackerEntity {
  category: string;
  name: string;
  questGate?: QuestId[];
  recipeId?: RecipeId;
}

interface Cosmetic extends TrackerEntity {
  defaultUnlocked: boolean;
  name: string;
  slot: CosmeticSlot;
  subCategory?: string;
}

interface Recipe extends TrackerEntity {
  memberItemIds: ItemId[];
  presentations: RecipePresentation[];
}
```

`name` is not on the base type: items & cosmetics have a direct `name` field, but recipes derive
their display name from `presentations[0].name`. `TrackerRow` accepts `name` as a separate prop.

The entity types are currently inline record values in `TrackerData`. This change extracts them as
standalone exported interfaces, which also makes them available for type-narrowing and reuse in
engine code.

### Remove legacy types

Delete from `tracker-data.ts`:

- `LegacyItemSource` (and its alias `Source`)
- `LegacyRecipeSource` (and its alias `RecipeSource`)
- `SourceType` enum
- `Restriction` interface
- `RestrictionType` enum

The canonical source type is `AcquisitionSource`, imported from `acquisition.ts` and re-exported
from `tracker-data.ts`.

### Rename field on entities

All entity interfaces change `acquisitionSources` to `sources` (defined on `TrackerEntity`,
inherited by `Item`, `Cosmetic`, & `Recipe` — see base type section above).

The field stays optional for now. Issue #102 tracks strengthening it to a required non-empty tuple
(`[AcquisitionSource, ...AcquisitionSource[]]`) once pipeline coverage is guaranteed. Components
handle the empty/missing case as they do today.

### Remove top-level sources map

Delete `sources: Partial<Record<ItemId, Source[]>>` from `TrackerData`. All consumers read from
`entity.sources` directly.

### Pipeline changes

- Remove `extractSources()` extractor (or the parts that produce the legacy format)
- Remove `convertLegacyRecipeSource()` bridge in `main.ts`
- Emit `sources: AcquisitionSource[]` directly on recipes (the acquisition source collectors already
  produce this format for items & cosmetics)
- Stop emitting the top-level `sources` map
- Remove legacy `recipe.sources: LegacyRecipeSource[]` from recipe output

## 2. Availability engine migration

### Current state

Two parallel availability systems exist:

- **Legacy:** `availability.ts` reads `source.restrictions: Restriction[]` (flat interface with
  `type`, `season?`, `seasons?`, `weathers?`, etc.). Functions take
  `sourcesMap: Partial<Record<ItemId, Source[]>>`.
- **New:** `availability-condition.ts` evaluates `source.availability: AvailabilityCondition`
  (composable tree with `all`/`any`/`not` logic, plus `season`, `weather`, `time`, `heartLevel`,
  `skillLevel`, `perkUnlocked`, `quest`, `minesLevel`, `gamePredicate`).

`AvailabilityCondition` is a strict superset of what `Restriction` can express.

### Migration

Rewrite `availability.ts` to consume `AcquisitionSource.availability` via
`evaluateAvailabilityCondition()`:

- All functions that take `sourcesMap: Partial<Record<ItemId, Source[]>>` change to take
  `sources: AcquisitionSource[]` directly (callers pass `item.sources`)
- `isSourceAvailable(source, worldState, mode)` evaluates `source.availability` using
  `evaluateAvailabilityCondition(source.availability, context)` where `context` is derived from
  `worldState`
- `hasSelectiveSeasonRestriction(source)` is replaced by
  `hasSelectiveSeasonCondition(source.availability)` (already exists in `availability-condition.ts`)
- `hasTimelyRestriction(source)` walks the `AvailabilityCondition` tree checking for
  `season`/`weather`/`time` nodes
- `getItemRestrictions(sources)` is replaced by a new function that extracts displayable
  availability summaries (season & weather badges) from `AvailabilityCondition` trees for
  `RestrictionBadges`

### Deleted

- `Restriction` type and `RestrictionType` enum
- `isTimelyRestriction` helper
- `seasonMatches` / `weatherMatches` private helpers (absorbed by `evaluateAvailabilityCondition`)

### Preserved

- `WorldState` interface (maps to `AvailabilityContext`)
- Public function names (`isItemAvailable`, `shouldShowItem`, `shouldCountItem`, `isItemDimmed`,
  `filterAvailableItems`, `isRowVisible`) with updated signatures
- `RestrictionBadges` component (updated to read from `AvailabilityCondition`)
- All existing tests, rewritten for the new signatures

## 3. Component unification

### Unified row component

One component (working name: `TrackerRow`) replaces five existing patterns:

| Retired                                       | Replacement                                                           |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `CompletionRow`                               | `TrackerRow`                                                          |
| `RedactedRow`                                 | `TrackerRow` with `display={{ mode: "redacted" }}`                    |
| `CosmeticRow`                                 | Direct `TrackerRow` usage in cosmetics page                           |
| `ItemRow`                                     | Direct `TrackerRow` usage in item pages (callers pass `item.sources`) |
| Inline recipe row in `recipes-content.svelte` | `TrackerRow`                                                          |

### Props

```typescript
type TrackerRowDisplay =
  | { mode: "completed"; leaving?: boolean }
  | { mode: "redacted" }
  | { mode: "visible"; dimmed?: boolean };

interface TrackerRowProps {
  display: TrackerRowDisplay;
  entity: TrackerEntity;
  name: string;
  onToggle: () => void;
}
```

Three display modes make illegal states unrepresentable:

- **`completed`:** Checked-off item. Uniform appearance regardless of whether the item has been
  revealed — no redaction on completed rows. `leaving` enables the fade-out animation after the user
  just checked it off.
- **`redacted`:** Unrevealed item. Lock icon, "Redacted" text, source icons visible. No modifiers.
- **`visible`:** Revealed, incomplete item. Checkbox, name, source icons. `dimmed` greys the row
  when the item is unavailable in the current season/weather.

There is no separate `completed` boolean — the mode _is_ the completion state. The parent derives
the mode from completion state + spoiler engine output. The row component has no store dependencies,
keeping it pure and testable.

`entity` provides `sources` & `visibility`. `name` is a separate prop because recipes derive their
display name from presentations, not a `name` field.

### Visual pattern

All rows adopt the recipe-style UI:

- **Left side:** Checkbox (visible) or lock icon (redacted) + item name (or "Redacted" italic text)
- **Right side:** Source type icons (one per source), acting as a disclosure control
- **Expanded area:** Unified source detail list (see section 4)
- **Badges:** Season/weather restriction badges extracted from `AvailabilityCondition` trees,
  displayed at the row level

The CompletionRow-style left-disclosure chevron and `ItemDetail` (text labels with availability
dots) are retired.

### Redacted rows show sources everywhere

All category pages pass `sources` to `TrackerRow` for redacted items. Almanac, museum, cosmetics,
mines, & quests pages gain source icons on their redacted rows, matching the recipe page's existing
behavior.

### Retired components

- `completion-row.svelte`
- `redacted-row.svelte`
- `cosmetic-row.svelte`
- `item-row.svelte`
- `item-detail.svelte`

### Updated components

- `recipe-source-list.svelte` generalizes to handle all `AcquisitionSource` types (renamed to
  `source-list.svelte` or similar)

## 4. Source display

### Icon mapping

Expand the `SOURCE_ICON` map (in `icon-maps.ts` or equivalent) to cover every `AcquisitionSource`
type discriminant. Current coverage includes ~20 recipe source types. New mappings are needed for
~15 item/cosmetic source types: `bug_catch`, `fish`, `forage`, `mine`, `crop`, `tree`,
`animal_product`, `artifact_dig`, `monster`, `monster_feed`, `dive`, `fish_trap`, `equipment`,
`recipe`, `perk_drop`, `festival_activity`, `date`, `proposal`, `wedding`, `station`,
`artifact_replicator`, `ritual_chamber`, `renown`, etc.

Icon selection uses Lucide icons from the project's existing shadcn-svelte dependency.

### Source segment text

Extend `buildSourceSegments` in `source-segments.ts` to handle all `AcquisitionSource` types. The
function signature changes from `(source: RecipeSource, lookups)` to
`(source: AcquisitionSource, lookups)`.

New source types produce descriptive text following the existing pattern: action verb + context,
with spoiler-gated segments for names behind visibility conditions. The `SegmentLookups` interface
may grow to include lookup tables for locations, animals, monsters, & stations.

Exact copy for each source type will be refined during implementation with representative items for
user review.

### Dropped: availability dots

`ItemDetail` currently renders green/red availability dots next to each source. These are not
carried forward to the unified source display.

## 5. Affected files

### Pipeline

| File                                           | Change                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------- |
| `pipeline/src/main.ts`                         | Remove `convertLegacyRecipeSource` bridge; remove legacy `sources` emission |
| `pipeline/src/extractors/sources.ts`           | Remove or repurpose (legacy format extractor)                               |
| `pipeline/src/acquisition/validate-sources.ts` | Update fallback logic referencing `acquisitionSources` / `sources`          |

### Types

| File                            | Change                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/types/tracker-data.ts` | Extract `TrackerEntity` base interface; extract `Item`, `Cosmetic`, `Recipe` as standalone interfaces; remove legacy types; rename `acquisitionSources` to `sources` |
| `src/lib/types/acquisition.ts`  | No changes expected (already canonical)                                                                                                                              |

### Engine

| File                                       | Change                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/lib/engine/availability.ts`           | Rewrite to use `AcquisitionSource.availability`                                     |
| `src/lib/engine/availability-condition.ts` | May gain helpers (timely-condition check, badge extraction)                         |
| `src/lib/engine/search.ts`                 | Update to pass `item.sources` instead of `trackerData.sources`                      |
| `src/lib/engine/progress.ts`               | Update `itemProgress` calls to pass `item.sources` instead of `trackerData.sources` |

### Utils

| File                               | Change                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/utils/source-segments.ts` | Extend to all `AcquisitionSource` types                                                                                            |
| `src/lib/utils/format.ts`          | Remove `sourceTypeLabel()`, `SOURCE_TYPE_LABEL`, update `recipeSourceLabel()` and `RecipeSourceLookups` to use `AcquisitionSource` |

### Stores

| File                                     | Change                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/lib/stores/user-state.svelte.ts`    | Update `recipe.sources` reference (now `AcquisitionSource[]`)                                                        |
| `src/lib/stores/toolbar-state.svelte.ts` | Update `SourceFilter.types` from `RecipeSource["type"]` to `AcquisitionSource["type"]`; update `recipeSourceFilters` |

### Components (retired)

- `src/lib/components/completion-row.svelte`
- `src/lib/components/redacted-row.svelte`
- `src/lib/components/cosmetic-row.svelte`
- `src/lib/components/item-row.svelte`
- `src/lib/components/item-detail.svelte`

### Components (new/updated)

| File                                                       | Change                                                                                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/components/tracker-row.svelte`                    | New unified row component                                                                                                     |
| `src/lib/components/recipe-source-list.svelte`             | Generalized to `source-list.svelte`                                                                                           |
| `src/lib/components/icon-source.svelte` / `icon-maps.ts`   | Expanded icon mapping                                                                                                         |
| `src/lib/components/restriction-badges.svelte`             | Updated to read `AvailabilityCondition`                                                                                       |
| `src/lib/components/search-results.svelte`                 | Update from `trackerData.sources[id]` to `item.sources`                                                                       |
| `src/lib/components/*-content.svelte` (all category pages) | Switch to `TrackerRow`; pass sources to redacted rows; update availability calls from `trackerData.sources` to `item.sources` |

### Tests

All existing tests in `availability.test.ts` and `availability-condition.test.ts` are updated for
new signatures. New tests cover:

- `buildSourceSegments` for new `AcquisitionSource` types
- `TrackerRow` rendering in visible & redacted states
- Badge extraction from `AvailabilityCondition` trees
- Source icon mapping completeness (every `AcquisitionSource` type has an icon)

## 6. Commit sequencing

This is a large change. To avoid broken intermediate states, the implementation should proceed in
this order, with each phase producing a green build:

1. **Pipeline & types:** Rename `acquisitionSources` → `sources`, remove legacy recipe `sources`
   field, remove top-level `sources` map, remove legacy types. Mechanical find-replace across all
   consumers to keep the build green.
2. **Availability migration:** Rewrite `availability.ts` to use `AcquisitionSource.availability`.
   Update all callers (content pages, progress, search) from `trackerData.sources` map to
   `entity.sources` arrays.
3. **Source display expansion:** Extend `source-segments.ts` and `Icon.Source` to cover all
   `AcquisitionSource` types. Update `format.ts` and `toolbar-state.svelte.ts`.
4. **Component unification:** Build `TrackerRow`, migrate all category pages, retire old components.

Each phase can be one or more commits, but the build must pass after each commit.

## 7. Follow-up

After this PR lands, update issue #102 with the finalized `TrackerEntity` interface so the non-empty
sources enforcement builds on the actual type rather than a spec draft.

## 8. Out of scope

- Transfer encoding changes (transfer encoding does not reference source data)
- Changes to `AvailabilityCondition` or `VisibilityCondition` type definitions
- Non-empty source enforcement (tracked in #102)
- New pipeline extractors or source collectors
- Game asset parsing changes
