# Visibility panel redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate world-state and recipe-filter panels with one compact visibility
panel whose contextual source filters work across every source-bearing category.

**Architecture:** `ToolbarState` owns the active source-group selection and combines registrations
from every mounted content component, which makes `/all` a natural union without route-specific
branching. A small registration helper maps raw source types through the existing `SOURCE_FILTERS`
taxonomy. Source-bearing components use one store predicate for OR-within-source filtering, while
the toolbar delegates the merged seasonality, source-type, show-completed, and reset controls to a
focused `VisibilityPanel` component.

**Tech stack:** Svelte 5 runes, TypeScript 6, Vitest 4 server rendering, Tailwind CSS 4,
shadcn-svelte toggle groups, and Lucide Svelte icons.

**Spec:** `docs/superpowers/specs/2026-08-30-visibility-panel-redesign.md`

## Global constraints

- Use `pnpm` exclusively with Node `>=26.0.0 <27.0.0`.
- Keep `SOURCE_FILTERS` as the single grouping taxonomy; uncovered source types always remain shown.
- Source groups compose with availability and show-completed using AND across dimensions and OR
  across an entity's sources.
- Reset availability mode to `"available"`, clear source filtering, and turn off show-completed;
  never alter season or weather.
- Season and weather never activate the amber filter indicator. This follows the spec's explicit
  definition in §2 and migration notes, which supersede the contradictory sentence in §1.
- Source selections reset on navigation and do not persist.
- Do not edit `src/lib/data/tracker-data.json` or vendored files under `src/lib/components/ui/`.
- Preserve search expansion, backdrop dismissal, weather correction after a season change, persisted
  availability/show-completed state, keyboard semantics, and reduced-motion behavior.

---

### Task 1: Generalize contextual source-filter state

**Files:**

- Create: `src/lib/stores/toolbar-state.test.ts`
- Create: `src/lib/utils/source-filter-registration.svelte.ts`
- Modify: `src/lib/stores/toolbar-state.svelte.ts`

**Interfaces:**

- Consumes: `SourceFilter`, `Source[]`, and the existing `SOURCE_FILTERS` taxonomy.
- Produces: `toolbarState.sourceFilters`, `registerSourceFilters(owner, getSources)`,
  `toolbarState.matchesSourceFilters(sources)`, `toolbarState.resetSourceFilters()`, and the
  existing toggle/show-all/hide-all operations generalized beyond recipes.

- [ ] **Step 1: Write failing store tests for contextual union, reset, and OR semantics**

Add tests that instantiate a fresh exported `ToolbarState`, register two owners, and prove the
following literal behaviors:

```ts
it("unions contextual filters from every mounted owner", () => {
  const state = new ToolbarState();
  state.setSourceFilters("museum", [gatheringFilter]);
  state.setSourceFilters("recipes", [storeFilter]);

  expect(state.sourceFilters.map(({ label }) => label)).toEqual(["Gathering", "Store"]);
});

it("matches any active covered source and always admits uncovered sources", () => {
  const state = new ToolbarState();
  state.setSourceFilters("page", [gatheringFilter, storeFilter]);
  state.hideAllSourceFilters();
  state.toggleSourceFilter(storeFilter);

  expect(state.matchesSourceFilters([{ type: "forage" }, { type: "store", storeId }])).toBe(true);
  expect(state.matchesSourceFilters([{ type: "forage" }])).toBe(false);
  expect(state.matchesSourceFilters([{ type: "lost_and_found" }])).toBe(true);
  expect(state.matchesSourceFilters([])).toBe(true);
});

it("resets active labels without removing the page context", () => {
  const state = new ToolbarState();
  state.setSourceFilters("page", [gatheringFilter, storeFilter]);
  state.hideAllSourceFilters();
  state.resetSourceFilters();

  expect([...state.activeSourceLabels]).toEqual(["Gathering", "Store"]);
});
```

Use complete `Source` fixtures. Define `storeId` as a branded literal in the test rather than
loosening production types.

- [ ] **Step 2: Run the store test and verify RED**

Run: `pnpm run test -- src/lib/stores/toolbar-state.test.ts`

Expected: FAIL because `ToolbarState` is not exported and the generalized registration and matching
methods do not exist.

- [ ] **Step 3: Implement the generalized store**

Replace `recipeSourceFilters` with a derived, de-duplicated `sourceFilters` list backed by an
owner-keyed registration map. Preserve each group's taxonomy definition, emit duplicate labels once,
and sort the resulting union by label for stable multi-owner output. Implement matching with this
contract:

```ts
matchesSourceFilters(sources: Source[]): boolean {
  if (!this.sourceFilterActive) return true;
  return sources.length === 0 || sources.some((source) => {
    const group = this.sourceFilters.find((filter) => filter.types.includes(source.type));
    return group === undefined || this.activeSourceLabels.has(group.label);
  });
}
```

`setSourceFilters(owner, filters)` updates one owner and resets all active labels only when the
contextual filter list changes. `removeSourceFilters(owner)` removes that contribution. Explicit
`resetSourceFilters()` selects every currently registered label. Export `ToolbarState` for isolated
tests while continuing to export the singleton.

- [ ] **Step 4: Implement the component registration helper**

Create a rune-aware helper which scans a reactive source getter, keeps only contextual taxonomy
groups, registers them during the component lifetime, and unregisters them during effect cleanup:

```ts
export function registerSourceFilters(owner: string, getSources: () => Source[]): void {
  $effect(() => {
    const sourceTypes = new Set(getSources().map(({ type }) => type));
    toolbarState.setSourceFilters(
      owner,
      SOURCE_FILTERS.filter(({ types }) => types.some((type) => sourceTypes.has(type))),
    );
    return () => toolbarState.removeSourceFilters(owner);
  });
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm run test -- src/lib/stores/toolbar-state.test.ts`

Expected: PASS with all contextual union, matching, and reset cases green.

- [ ] **Step 6: Commit the state foundation**

```bash
git add src/lib/stores/toolbar-state.svelte.ts src/lib/stores/toolbar-state.test.ts src/lib/utils/source-filter-registration.svelte.ts
git commit -m "refactor: generalize toolbar source filters"
```

---

### Task 2: Build the unified visibility panel

**Files:**

- Create: `src/lib/components/visibility-panel.svelte`
- Create: `src/lib/components/visibility-panel.test.ts`
- Modify: `src/lib/components/toolbar-footer.svelte`

**Interfaces:**

- Consumes: `showSeasonality: boolean`, `toolbarState.sourceFilters`, `userState`, season/weather
  formatting utilities, and `BlockySwitch`.
- Produces: one accessible panel card with seasonality and source-type collapsibles, an
  always-visible show-completed toggle, and a conditional reset button.

- [ ] **Step 1: Write failing server-rendered panel tests**

Render `VisibilityPanel` with a seeded source-filter context and assert independently derived,
consumer-visible output:

```ts
it("renders expanded seasonality and source sections with accessible controls", () => {
  toolbarState.setSourceFilters("test", [gatheringFilter, storeFilter]);
  const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

  expect(body).toContain("Seasonality");
  expect(body).toContain('aria-expanded="true"');
  expect(body).toContain("Source types");
  expect(body).toContain('aria-pressed="true"');
  expect(body).toContain("Show completed items");
});

it("omits seasonality and reset controls at defaults", () => {
  const { body } = render(VisibilityPanel, { props: { showSeasonality: false } });

  expect(body).not.toContain("Seasonality");
  expect(body).not.toContain("Reset filters");
});

it("shows reset for a hidden source group without changing world-state output", () => {
  toolbarState.setSourceFilters("test", [gatheringFilter]);
  toolbarState.hideAllSourceFilters();
  const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

  expect(body).toContain("Reset filters");
  expect(body).toContain("Spring");
  expect(body).toContain("Calm");
});
```

Reset `toolbarState`, `userState`, and test registrations after every test.

- [ ] **Step 2: Run the panel test and verify RED**

Run: `pnpm run test -- src/lib/components/visibility-panel.test.ts`

Expected: FAIL because `visibility-panel.svelte` does not exist.

- [ ] **Step 3: Implement the panel shell and collapsible sections**

Move the availability, season, weather, source-chip, show-completed, and reset controls out of
`toolbar-footer.svelte`. Use local `$state(true)` values for both collapsibles, reset those values
to `true` whenever the component mounts on panel open, and use buttons with `aria-expanded`. Keep
the availability toggle outside the seasonality collapsible body so it remains operable while
collapsed. Use `slide` with a duration of `0` under `prefers-reduced-motion`, otherwise `150` ms.

The source summary is `"All shown"` at defaults and `"N hidden"` otherwise. The seasonality summary
is `"All items"` in `"everything"` mode and otherwise `${seasonLabel} / ${weatherLabel}`.

- [ ] **Step 4: Implement compact pickers, scrolling, and reset**

Use four season columns and equal-width weather tiles with `p-1.5`, `size-4` icons, and short
labels. Apply `max-h-[70vh] overflow-y-auto` to the inner panel card. Reset with:

```ts
function resetFilters(): void {
  userState.setAvailabilityMode("available");
  if (userState.state.showCompleted) userState.toggleShowCompleted();
  toolbarState.resetSourceFilters();
}
```

The active predicate is exactly availability mode not `"available"`, show-completed enabled, or a
hidden contextual source group.

- [ ] **Step 5: Merge toolbar panel and button state**

Reduce `ActivePanel` to `"visibility" | null`. Remove the old world-state pill and filters panel,
render `VisibilityPanel` in the floating card, move the existing search button to the center slot,
leave the left slot empty for the later feedback feature, and put the `ListFilter` visibility button
in the right slot. Opening search calls `closePanel()` before expanding. Backdrop dismissal and
search-mode replacement remain unchanged.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:
`pnpm run test -- src/lib/components/visibility-panel.test.ts src/lib/stores/toolbar-state.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the unified panel**

```bash
git add src/lib/components/toolbar-footer.svelte src/lib/components/visibility-panel.svelte src/lib/components/visibility-panel.test.ts
git commit -m "feat: merge toolbar visibility controls"
```

---

### Task 3: Apply source filtering to almanac, museum, and recipes

**Files:**

- Modify: `src/lib/components/almanac-content.svelte`
- Modify: `src/lib/components/museum-content.svelte`
- Modify: `src/lib/components/recipes-content.svelte`
- Modify: `src/lib/components/content-counters.test.ts`

**Interfaces:**

- Consumes: `registerSourceFilters(owner, getSources)` and
  `toolbarState.matchesSourceFilters(sources)` from Task 1.
- Produces: contextual chips and filtered row scopes for the three largest item-based views.

- [ ] **Step 1: Write failing behavior tests for grouped OR filtering and empty state**

Extend `content-counters.test.ts` with complete fixtures selected from generated tracker data at
test runtime, but use literal assertions for the chosen source-group outcome. Seed `toolbarState`
with the relevant `SOURCE_FILTERS`, hide all groups, activate one group, and render the real content
component. Prove that an entity with one matching source remains, a nonmatching entity is absent,
and a category whose rows are all hidden renders `"No items match the current filters"`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm run test -- src/lib/components/content-counters.test.ts`

Expected: FAIL because only recipes currently consult source state, and the other views disappear
instead of rendering filtered empty states.

- [ ] **Step 3: Register and filter almanac sources**

Register all aggregated almanac entry sources under owner `"almanac"`. Add
`toolbarState.matchesSourceFilters(sources)` to `scopedItems` after name and availability checks.
Render each original almanac category shell; when its visible list is empty because source or
show-completed filters are active, render the common empty-state sentence inside that category.

- [ ] **Step 4: Register and filter museum sources**

Register every museum item source under owner `"museum"`. Include the shared source predicate in
`isItemScoped`, preserve availability and completion counters, and retain wing/set shells with the
empty-state sentence when filters remove their last visible row.

- [ ] **Step 5: Migrate recipe registration and filtering**

Replace the recipe-specific `$effect`, `recipeSourceFilters`, and hand-built active type set with
`registerSourceFilters("recipes", ...)` and `toolbarState.matchesSourceFilters(entry.sources)`.
Preserve case-insensitive name search, spoiler behavior, section limits, and force-open behavior.
Render the empty-state sentence when a recipe group has no visible rows under active filters.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:
`pnpm run test -- src/lib/components/content-counters.test.ts src/lib/stores/toolbar-state.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the core content integration**

```bash
git add src/lib/components/almanac-content.svelte src/lib/components/museum-content.svelte src/lib/components/recipes-content.svelte src/lib/components/content-counters.test.ts
git commit -m "feat: filter core item views by source"
```

---

### Task 4: Apply source filtering to cosmetics and animals

**Files:**

- Modify: `src/lib/components/animal-cosmetics-section.svelte`
- Modify: `src/lib/components/animal-subcategory.svelte`
- Modify: `src/lib/components/animal-variants-section.svelte`
- Modify: `src/lib/components/animals-content.svelte`
- Modify: `src/lib/components/cosmetics-content.svelte`
- Modify: `src/lib/components/pet-collectibles-section.svelte`
- Create: `src/lib/components/source-filtered-content.test.ts`

**Interfaces:**

- Consumes: the Task 1 registration helper and matching predicate.
- Produces: page-contextual animal, pet, and wardrobe groups that retain uncovered sources and
  surface empty states.

- [ ] **Step 1: Write failing real-component tests**

Render `CosmeticsContent` and `AnimalsContent` with controlled toolbar group selection. Prove that a
known matching source stays visible, a known covered nonmatch is removed, the covered `default`
animal source is available as a contextual chip, and filtering the final row leaves the empty-state
copy. The uncovered `breed` source remains visible under every selection, as required by the spec.
The production change caught by these tests is removal or inversion of the shared source predicate.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm run test -- src/lib/components/source-filtered-content.test.ts`

Expected: FAIL because these components do not register or apply source filters.

- [ ] **Step 3: Filter wardrobe cosmetics**

Register all global cosmetic sources under `"cosmetics"`. Filter both slot-level and subcategory
visible arrays with `toolbarState.matchesSourceFilters(c.sources)`, keep completion totals based on
the source-filtered scope, and render the empty-state sentence inside original slot shells.

- [ ] **Step 4: Filter animal variants and cosmetics**

Register variant, animal-cosmetic, pet-cosmetic, and pet-skin sources once from
`animals-content.svelte` under `"animals"`. Add the source predicate to variant in-scope checks,
animal cosmetic `sectionConfig`, and pet visible lists. Pass enough state through
`animal-subcategory.svelte` to render one empty message rather than dropping an animal section whose
rows were filtered out.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm run test -- src/lib/components/source-filtered-content.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the cosmetics and animals integration**

```bash
git add src/lib/components/animal-cosmetics-section.svelte src/lib/components/animal-subcategory.svelte src/lib/components/animal-variants-section.svelte src/lib/components/animals-content.svelte src/lib/components/cosmetics-content.svelte src/lib/components/pet-collectibles-section.svelte src/lib/components/source-filtered-content.test.ts
git commit -m "feat: filter cosmetics and animals by source"
```

---

### Task 5: Apply source filtering to quests, dates, mines, home, and `/all`

**Files:**

- Modify: `src/lib/components/dates-section.svelte`
- Modify: `src/lib/components/mines-content.svelte`
- Modify: `src/lib/components/quests-content.svelte`
- Create: `src/lib/utils/tracker-sources.ts`
- Create: `src/lib/utils/tracker-sources.test.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/all/+page.svelte`
- Modify: `src/lib/components/source-filtered-content.test.ts`

**Interfaces:**

- Consumes: all Task 1 source-filter APIs.
- Produces: the remaining contextual registrations, navigation reset, and complete home and `/all`
  taxonomy unions.

- [ ] **Step 1: Write failing tests for source-less retention, route unions, and navigation reset**

Add store/component cases proving that hiding every contextual group still shows quests with an
empty source list, hides covered quest/date/spell sources, and that `resetSourceFilters()` restores
all current groups without removing registrations. Add a pure helper test proving the home/all
source union includes literal representative types from items, recipes, cosmetics, dates, animals,
pets, quest reward rows, and mine spells. The source-less assertion guards the spec's all-hidden
semantics.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:
`pnpm run test -- src/lib/components/source-filtered-content.test.ts src/lib/stores/toolbar-state.test.ts src/lib/utils/tracker-sources.test.ts`

Expected: FAIL because the remaining components ignore source state.

- [ ] **Step 3: Filter quests and dates**

Register the nonempty results of `questSources` under `"quests"` and all date sources under
`"dates"`. Apply the predicate alongside show-completed when computing visible rows. Quests with no
sources, including the synthetic craving row, remain visible. Preserve spoiler sections and render
the filtered empty state within each original quest/date section.

- [ ] **Step 4: Filter mine spells without filtering floor progress**

Register spell sources under `"mines"`, include `sources` in each sorted spell entry, and apply the
shared predicate only to spell rows. Floor progress is source-less and remains visible under every
source selection. Preserve compact mode and spell completion counters.

- [ ] **Step 5: Register the home and `/all` unions**

Create `allTrackerSources(data)` in `src/lib/utils/tracker-sources.ts`. It returns the sources shown
by item, recipe, cosmetic, date, animal cosmetic/variant, pet, quest reward, and mine spell rows.
Register that flat array under `"home"` in `src/routes/+page.svelte` and under `"all"` in
`src/routes/all/+page.svelte`. The explicit `/all` registration keeps its contextual union complete
even when a fully completed category's content component is not mounted.

- [ ] **Step 6: Reset source selections on navigation**

Extend the existing `afterNavigate` callback in `src/routes/+layout.svelte`:

```ts
afterNavigate(() => {
  toolbarState.closeSearch();
  toolbarState.resetSourceFilters();
});
```

Component cleanup removes the previous route's owners, and the navigation reset selects all groups
for the new route.

- [ ] **Step 7: Run focused and application tests**

Run:
`pnpm run test -- src/lib/components/source-filtered-content.test.ts src/lib/stores/toolbar-state.test.ts src/lib/utils/tracker-sources.test.ts`

Expected: PASS.

Run: `pnpm run test:app`

Expected: all application tests PASS with zero failures.

- [ ] **Step 8: Commit the remaining route integration**

```bash
git add src/lib/components/dates-section.svelte src/lib/components/mines-content.svelte src/lib/components/quests-content.svelte src/lib/components/source-filtered-content.test.ts src/lib/utils/tracker-sources.ts src/lib/utils/tracker-sources.test.ts src/routes/+layout.svelte src/routes/+page.svelte src/routes/all/+page.svelte
git commit -m "feat: complete contextual source filtering"
```

---

### Task 6: Verify the specification and production build

**Files:**

- Modify only files required to fix verification findings.

**Interfaces:**

- Consumes: the complete implementation from Tasks 1–5.
- Produces: evidence that the approved specification, accessibility contract, and repository matrix
  are satisfied.

- [ ] **Step 1: Perform a spec coverage review**

Check every requirement in §§1–6 against the diff. Confirm toolbar placement, one-panel state,
conditional seasonality, expanded defaults, summaries, compact tiles, `70vh` scrolling, contextual
taxonomy, source OR behavior, empty states, navigation reset, amber predicate, reset semantics,
search close behavior, backdrop labeling, keyboard-native controls, and weather correction.

- [ ] **Step 2: Run automatic formatting and lint repair**

Run: `pnpm run lint:fix 2>&1 | tail -30`

Expected: exit 0. Review every formatter change before proceeding.

- [ ] **Step 3: Run the full verification matrix**

Run each command separately and retain its exit status:

```bash
pnpm run lint 2>&1 | tail -30
pnpm run check 2>&1 | tail -30
pnpm run test 2>&1 | tail -30
pnpm run build 2>&1 | tail -30
```

Expected: all four commands exit 0; lint reports zero errors and zero warnings; all tests pass; the
Cloudflare production build completes.

- [ ] **Step 4: Review the final diff and repository state**

Run:

```bash
git diff --check
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- src/lib src/routes docs/superpowers
```

Expected: no whitespace errors, no generated-data changes, no unrelated files, and every spec item
is represented by implementation or tests.

- [ ] **Step 5: Commit verification fixes, if any**

```bash
git add -u src/lib src/routes
git commit -m "fix: address visibility panel verification"
```

Skip this commit when verification produces no changes.
