# Visibility panel redesign

Prerequisite for issue #18 (in-app feedback). The current toolbar splits world state
(season/weather) and filters (availability mode, show completed, recipe sources) into two separate
buttons and panels. This spec merges them into a single "visibility" panel, freeing the toolbar
layout for the feedback button.

## Motivation

1. **Conceptual unity.** Season, weather, availability mode, source filters, and show-completed are
   all facets of the same question: "what items am I looking at?" Splitting them across two buttons
   is an implementation artifact, not a user-facing distinction.
2. **Toolbar simplification.** The merged panel reduces the toolbar from three concerns (search,
   world state, filters) to a cleaner layout: feedback (left), search (center), visibility (right).
3. **Source filter expansion.** Source type filters currently only appear on the recipes page. Every
   category now has sources, so the filter should be available everywhere. Merging panels gives it a
   natural home without adding a third button.

---

## 1. Toolbar layout

| Left                              | Center                                   | Right                     |
| --------------------------------- | ---------------------------------------- | ------------------------- |
| Feedback (`MessageCircleWarning`) | Search (`Search`, on pages that have it) | Visibility (merged panel) |

The visibility button replaces the current season/weather pill and filter button. Its icon remains
`ListFilter`. When any filter is non-default (including non-default season or weather), the button
shows the existing active-filter indicator (amber highlight).

**Search-mode behavior:** when search is active (expanded to full bar width), the feedback and
visibility buttons are hidden, same as current behavior where the search bar replaces the toolbar
controls. If the visibility panel is open when search activates, it closes.

---

## 2. Visibility panel

A single floating panel (same position and style as the current filter/world-state panels). Sections
are collapsible; collapsed state shows a compact summary of the current selection.

The panel has a max height of `70vh` with `overflow-y: auto` to handle cases where the full content
exceeds the viewport (small screens, landscape, large text scaling). The panel's bottom is anchored
above the toolbar, same as current panel positioning.

### Section 1: seasonality

This section is only shown on routes that use world state (`/`, `/all`, `/almanac`, `/animals`,
`/museum`). On other routes, the panel starts with source types.

**Collapsible.** Collapsed state shows the current status: e.g., "Summer / Calm" when seasonal or
accessible is selected, or "All items" when all-items mode is active.

Contains:

- **Availability mode toggle** (seasonal / accessible / all items): always visible within the
  section header area, even when the section is collapsed. This is the primary control and doesn't
  benefit from being hidden.
- **Season picker** (4 compact tiles): shown only when mode is "seasonal" or "accessible". Reduced
  padding and icon/label size compared to the current full-width tiles to fit within the unified
  panel.
- **Weather picker** (2–4 compact tiles, varies by season): shown only when mode is "seasonal" or
  "accessible". Also reduced size.

When the mode is "all items", the season and weather pickers are hidden since seasonality is
irrelevant.

**Interaction note:** tapping the collapsed section header expands the section to reveal the
season/weather pickers. The availability mode toggle is always interactive regardless of
collapsed/expanded state. The toggle does not itself expand/collapse the section.

### Section 2: source types

**Collapsible.** Collapsed state shows a summary: e.g., "2 hidden" when some types are filtered out,
"All shown" when none are hidden, or the count of active filters.

Contains:

- **Filter chips** for each source type group, with show-all / hide-all controls.
- Uses the existing grouped `SOURCE_FILTERS` taxonomy (e.g., "Gathering" groups `forage`,
  `bug_catch`, `artifact_dig`, `animal_product`), not raw individual source types. This keeps the
  chip count manageable and matches the existing UX language.
- The set of chips shown is **page-contextual**: only source type groups that have at least one
  matching item on the current page are displayed. This avoids showing irrelevant filters (e.g.,
  "Fishing" on the cosmetics page).

**Source filter semantics:**

- An item with multiple sources is **visible** if **any** of its sources match an active filter
  (union/OR logic). This is the intuitive behavior: "show me items I can get from stores" includes
  items that also come from other sources.
- When **all** filters are shown (default), all items are visible. When **all** filters are hidden,
  only items with no sources (if any exist) remain.
- Source filters compose with seasonality and show-completed: an item must pass all active filter
  dimensions to be shown (AND across dimensions, OR within source types).

### Show completed

A `BlockySwitch` toggle, always visible (not inside a collapsible section). This is a simple binary
that doesn't benefit from collapsing.

### Reset

A "Reset filters" button, shown when any setting is non-default. Resets:

- Availability mode to "accessible" (the app's default).
- Season to the current default (does not change season/weather; these are world state, not filters
  — resetting them would be surprising).
- Source filters to all-shown.
- Show-completed to off.

The button is not shown when all settings are already at their defaults.

**"Non-default" definition for the amber toolbar indicator:** availability mode ≠ "accessible", or
show-completed is on, or any source filters are hidden. Season/weather are excluded from the
indicator because they're world state the user actively sets, not filters they might forget are
narrowing their view.

---

## 3. Source filter generalization

The current `toolbarState.recipeSourceFilters` is scoped to recipes. This needs to generalize:

- `toolbarState` accepts page-contextual source filters. Each page (or its content component)
  provides the set of source type groups relevant to its items, derived by scanning the tracker data
  for that category's source types and matching them against `SOURCE_FILTERS`.
- The filter chips in the visibility panel reflect the current page's source types.
- Active source filter state **resets on navigation** (all filters shown on each new page). This is
  the simpler starting behavior; per-page persistence can be added later if users want it.
- The `SOURCE_FILTERS` constant remains the single source of truth for grouping raw source types
  into labeled chips. Pages that have source types not covered by any group see those types excluded
  from filtering (they're always shown). If new source types appear in the data, they should be
  added to `SOURCE_FILTERS`.

### Route-specific behavior

| Route                                  | Seasonality section          | Source types available                                                                                   |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `/` (home)                             | Shown                        | Yes (spans multiple categories; show the union of all source type groups present across displayed items) |
| `/all`                                 | Shown                        | Yes (same as home: union across all categories)                                                          |
| `/almanac`                             | Shown                        | Yes (per almanac category items)                                                                         |
| `/animals`                             | Shown                        | Yes (breed, default, etc.)                                                                               |
| `/museum`                              | Shown                        | Yes (per museum items)                                                                                   |
| Category pages (quests, recipes, etc.) | Hidden                       | Yes (per category's source types)                                                                        |
| `/settings`, `/privacy`                | Panel not shown (no toolbar) | N/A                                                                                                      |

For `/` and `/all`, the source filter chips represent the union of all source type groups that
appear across displayed items. No per-category sub-grouping in the filter panel; the filter applies
globally to all visible items on the page.

### Empty states

- If a route has **no source types** (unlikely given current data, but possible): the source types
  section is hidden entirely.
- If active source filters hide all items in a section/category: the section shows an empty state
  message (e.g., "No items match the current filters") rather than disappearing.
- If show-completed hides all items: same empty-state treatment.

---

## 4. Collapsible section behavior

Each collapsible section has:

- A header row with the section label, the collapsed summary, and a chevron indicator.
- Tapping the header toggles the section open/closed.
- Default state on panel open: all sections expanded (the panel is for making adjustments, so show
  everything). Collapsed state is not persisted across panel opens.
- Smooth expand/collapse animation (Svelte `slide` transition, consistent with existing UI).
  Respects `prefers-reduced-motion`.

### Accessibility

- Section headers use `button` elements with `aria-expanded`.
- Filter chips use `aria-pressed` to indicate active state (already used in the current
  implementation).
- The availability mode toggle group already uses `ToggleGroup` from shadcn-svelte, which handles
  ARIA roles.
- Keyboard: `Tab` navigates between controls, `Enter`/`Space` activates buttons and toggles.
- The panel dismissal backdrop button retains its existing `aria-label="Close panel"`.

---

## 5. Compact season & weather pickers

The current pickers use large tiles (full-width grid). In the merged panel, they need to be more
compact since they share vertical space with other controls:

- Season: 4 tiles in a row, smaller padding (e.g., `p-1.5` instead of `p-2.5`), icon + short label.
- Weather: tiles in a row, same compact treatment.
- The visual style matches the current tiles but at a reduced scale.

The exact sizing is a visual-design detail for implementation; the constraint is that the panel with
all sections expanded should fit on a mobile viewport (min 568px height, accounting for toolbar,
status bar, and safe areas) without requiring the panel to scroll in the common case. When it does
overflow (small screens, large text), the panel's `max-height: 70vh; overflow-y: auto` handles it
gracefully.

---

## 6. Migration notes

- The `activePanel` state in `toolbar-footer.svelte` currently distinguishes `"filters"` and
  `"world"`. After this change, there's a single `"visibility"` panel state.
- The season/weather pill in the toolbar center slot is removed, replaced by the search button.
- `toolbarState` needs to generalize source filters:
  - Rename/refactor `recipeSourceFilters` to a general `sourceFilters`.
  - Add a method for pages to register their relevant source type groups.
  - `activeSourceLabels` and filter logic remain structurally similar.
- The `filtersActive` derived state expands to include source filters on all pages (currently only
  active on recipes). Season/weather are excluded from the active indicator per §2.
- The `WORLD_STATE_ROUTES` set is reused to control whether the seasonality section appears.

### Behavior preservation

The following existing behaviors must be maintained:

- Search-open state hides all toolbar buttons and shows the search input full-width.
- Panel dismissal via backdrop tap closes the panel.
- Season change triggers weather reset if the current weather isn't available in the new season.
- Filter state (`availabilityMode`, `showCompleted`) persists in `userState` across sessions
  (existing localStorage persistence, unchanged).
- Source filter state resets on navigation (new behavior, but consistent with current recipe-page
  behavior where filters only exist on that page).
