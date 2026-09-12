# Home and category frame implementation plan

- **Issue:** #130
- **Phase:** 4
- **Design:** `docs/superpowers/specs/2026-09-10-home-category-frame-design.md`
- **Status:** Approved

## Outcome

Replace the home card grid with the approved Field Guide index, extend the shared page header with
category ribbon composition, and convert the persistent utility footer into accessible floating
tools. Preserve existing routing, progress calculations, search/filter behavior, and specialized
category content.

## File map

### Home composition

- `src/routes/+page.svelte`: sticky home header, index heading, search-state composition, and quiet
  “Everything” summary.
- `src/lib/components/category-grid.svelte`: active and completed semantic lists.
- `src/lib/components/category-card.svelte`: replace the card primitive with a compact category
  stripe and responsive ribbon.
- `src/lib/components/overall-progress.svelte`: expose a linear home-header presentation while
  retaining a concise accessible summary.

### Shared frame

- `src/routes/(category)/+layout.svelte`: supply category identity and consistent frame spacing.
- `src/lib/components/page-header.svelte`: add optional category ribbon and progress-rule
  presentation without changing generic uses.
- `src/routes/+layout.svelte`: reserve safe space for floating tools and preserve the overlay inert
  boundary.
- `src/app.css`: add shared stripe-paper, page-inset, floating-surface, and focus/elevation tokens
  only where a reusable semantic token is required.

### Utilities

- `src/lib/components/toolbar-footer.svelte`: compose settings, feedback, search, and filters as
  floating tools, then reposition the existing panels above them.

### Tests

- Add focused server/component tests for category stripe semantics and header variants.
- Update `tests/accessibility/keyboard.spec.ts` for the new tool order.
- Extend `tests/accessibility/geometry.spec.ts` for home ribbon overflow and 44-pixel phone targets.
- Update `tests/accessibility/semantics.spec.ts` for overall progress and category-link names.
- Run existing theme, contrast, search, feedback, filter, and route accessibility suites unchanged
  where possible.

## Phase 1: Commit approved artifacts

Commit the approved design and this plan before editing implementation files. Confirm that the
documentation commit contains no source or test changes and includes the required Codex co-author
trailer.

## Phase 2: Establish failing contracts

Add focused tests that define the new public structure and behavior:

1. Category stripes expose category name and completed/total values, render the ribbon as
   decorative, and expose progress through nonvisual text rather than relying on the colored rule.
2. The shared header renders category-ribbon state only when category identity is supplied; ordinary
   settings, privacy, and “Everything” headers retain the generic mode.
3. The toolbar exposes settings, feedback, search, and filters in predictable keyboard order on the
   home route.
4. Home controls meet target geometry and the projected ribbon does not create 320-pixel horizontal
   overflow.
5. Overall progress retains a named semantic summary after its visual treatment changes.

Run only the focused component and browser tests and confirm that the new assertions fail for the
expected missing structure or ordering.

## Phase 3: Build category stripes

Rework `CategoryCard` into a native anchor-based stripe; do not edit vendored card primitives. Use
component-scoped CSS for the ribbon clip paths, responsive projection, print mark, count columns,
and reduced-motion rules. Keep category color selection driven by `categoryForKey`.

Update `CategoryGrid` to render single-column active and completed lists. Preserve keyed category
ordering and existing completion partitioning. The completed group receives an understated amber
heading and treatment without changing category progress data.

Update the home route to combine its title and overall progress in a sticky header, remove the
welcome card from the primary path, add the “Index” heading, and keep search results as the sole
content when search is active. Render “Everything” as a restrained summary row without a redundant
disclosure icon.

Run focused home component tests and bring the stripe contracts to green.

## Phase 4: Extend the shared category header

Add optional category identity to `PageHeader`. In category mode, place the icon solely in a
responsive edge ribbon, display `X / Y`, and add a category-colored progress rule. In generic mode,
preserve the current back control, optional icon snippet, title, and optional progress behavior.

Update the category layout to pass the category key and theme color while continuing to derive
progress through `getCategoryProgress`. The layout remains the only shared category route
compositor.

Run focused header tests plus representative category and generic-route browser checks.

## Phase 5: Float the utilities

Add a settings link to `ToolbarFooter`, remove the settings link from the home header, and recompose
the bottom bar as two floating groups inside a pointer-transparent fixed layer. Keep every button
and link pointer-active and at least 44 × 44 CSS pixels.

Retain all existing state logic, route capability sets, overlay handling, focus restoration, Escape
handling, status announcements, and feedback integration. Reposition search, visibility, and
feedback surfaces relative to the floating layer without redesigning their interiors. Update the
root layout’s bottom safe-area reservation to prevent content from being obscured.

Run the existing toolbar client and accessibility tests, then bring the new focus-order and geometry
expectations to green.

## Phase 6: Visual review and refinement

Start the application and inspect the home page, one representative category page, “Everything”,
settings, search, filters, and feedback at 320-pixel phone, wider phone, and desktop widths in light
and dark themes.

Verify:

- category counts align on the slash;
- ribbons meet the paper edge with no gap during hover or focus;
- desktop ribbons sit behind the page and phone ribbons fold over it;
- completed categories remain legible and distinct;
- sticky headers do not cover focused content;
- floating tools do not cover the last content row;
- panels clear the tools and safe-area inset;
- keyboard focus mirrors hover treatment;
- reduced-motion mode removes decorative translation and tilt; and
- no route develops horizontal overflow.

Adjust only shared frame geometry and tokens in this phase. Defer overlay material redesign, icon
art, and category-content migration to their owning phases.

## Phase 7: Verification and delivery

Run the full verification matrix once:

```sh
pnpm run lint:fix
pnpm run lint
pnpm run check
pnpm run test
pnpm run build
pnpm playwright test tests/accessibility
```

Require zero lint errors and zero warnings. Review the complete diff against `130-tracker-row`,
commit with the repository owner’s configured identity and
`Co-Authored-By: Codex <codex@openai.com>`, push `130-home-category-frame`, and open a stacked PR
with base `130-tracker-row`. The PR body references issue #130 as Phase 4 without closing it, ends
with `Agent: codex`, and carries exactly the `agent: codex` label plus the appropriate area label.
