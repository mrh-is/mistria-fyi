# Field Guide overlays & polish implementation plan

- **Issue:** #229
- **Status:** Approved
- **Design artifact:** `field-guide-overlays.html`, rev 4b

## Goal

Finish the Field Guide’s v1.0 surface language by replacing the remaining generic utility surfaces
with opaque paper foldouts and specimen tags, applying the approved category palette, and completing
the motion, theme, completion, and responsive passes.

The shared-element category transition and optional margin artwork are deferred to #233 and #234 in
milestone v1.1.

## Phase 1: Availability model

Replace the single availability choice with three independently selectable windows:

- `now`: selectively timed entries available in the chosen season and weather;
- `anytime`: entries without selective season or weather restrictions; and
- `later`: selectively timed entries unavailable in the chosen season or weather.

The default selection is `now` plus `anytime`, which preserves today’s “available” behavior. Legacy
persisted values migrate as follows: `available` to `now` plus `anytime`, `timely` to `now`, and
`everything` to all three windows. Serialization remains versioned and deterministic.

Update the pure availability and progress functions first, then adapt route and component callers.
Add migration, partitioning, progress, animal-availability, and filtering tests before changing the
controls.

Primary files:

- `src/lib/stores/user-state.svelte.ts`
- `src/lib/engine/availability.ts`
- `src/lib/engine/animal-availability.ts`
- `src/lib/engine/progress.ts`
- their existing test files and persistence tests

## Phase 2: Shared foldouts

Create a focused foldout frame that supplies the opaque raised-paper surface, title row, close
control, bounded scrolling, safe-area placement, 150 ms entrance motion, and reduced-motion path.
`ToolbarFooter` remains the sole coordinator for the mutually exclusive `settings`, `feedback`,
`search`, and `filters` states, focus restoration, Escape behavior, route changes, and background
inertness.

Move the settings tool into the same button-and-panel model as the other tools. Keep the visual
order as settings and feedback on the left, then search and filters on the right. Remove translucent
materials and backdrop blur from utility surfaces.

Primary files:

- `src/lib/components/toolbar-footer.svelte`
- new focused foldout and quick-settings components in `src/lib/components/`
- toolbar interaction tests

## Phase 3: Search & filters

Render search inside its foldout while keeping the existing engine, completion mutations, undo
behavior, spoiler visibility, and route availability. Group results by category, add compact
category ribbons, retain per-result completion controls, and announce result counts.

Recompose filters as three visible sections. “When to find” uses separated multi-select chips for
the availability windows and joined single-select strips for season and weather. “Sources” uses the
real source-filter registrations as separated chips. “Show completed” remains a switch, and one
clear action restores the default availability windows, all sources, and hidden completed items.

Add a specimen-tag source explainer generated from the canonical source groups. It must trap and
restore focus, close on Escape or outside activation, and remain legible in both themes.

Primary files:

- `src/lib/components/search-results.svelte`
- `src/lib/components/visibility-panel.svelte`
- new source explainer and search-panel components
- `src/lib/stores/toolbar-state.svelte.ts`
- existing search, visibility, and toolbar tests

## Phase 4: Quick settings & data management

The quick-settings foldout contains the spoiler switch, a joined Light, Dark, and Auto theme
selector, and a link to `/settings`. Keep the established theme and user-state stores as the source
of truth.

Recast `/settings` as “Data management”. Preserve all import, transfer, backup, restore, reset,
feedback, privacy, and AI-disclosure behavior, but present the four data tools as compact Field Kit
rows. The destructive row remains visually and semantically distinct. Theme and spoiler controls
leave this destination page because they now live in quick settings.

Primary files:

- new quick-settings component
- `src/routes/settings/+page.svelte`
- `src/routes/settings/settings-card.svelte` and focused data-management cards as needed
- settings and theme tests

## Phase 5: Feedback specimen tag

Restyle the existing feedback component without changing its submission contract. Preserve message
validation, privacy copy, Turnstile, reply email, progress attachment and preview, selected-element
picker, draft lifetime, cancellation, error recovery, and focus management.

Use the clipped specimen-tag paper shape for both compact and expanded states. Keep every control at
least 44 CSS pixels or provide sufficient pointer spacing, and retain the current accessible dialog
semantics.

Primary files:

- `src/lib/components/feedback-panel.svelte`
- `src/lib/components/feedback-panel.client.test.ts`
- feedback picker tests where interaction contracts change

## Phase 6: Palette & completion

Apply the approved light and dark category values exactly. Give the home frame a neutral intentional
accent instead of inheriting Almanac green. Change the dark page ground to warm gray `#222226`, then
tune raised paper, borders, focus rings, sprite slots, and overlay materials for contrast.

Completed categories keep their category ribbon color. Add a narrow gold-leaf line only along the
ribbon’s chevron edge, with a restrained hover shimmer for pointer devices. Apply the same completed
signal to category page headers. Reduced motion removes shimmer and decorative transforms.

Primary files:

- `src/app.css`
- `src/routes/+page.svelte`
- `src/lib/components/category-card.svelte`
- `src/lib/components/page-header.svelte`
- category-card and page-header tests

## Phase 7: Motion & spoiler polish

Normalize motion to the approved cadence: 150 ms foldouts, 200 ms fades, 100 ms completion pulse,
and 300 ms progress fills. Refine spoiler reveal so concealed text and NPC treatments resolve with a
short opacity transition without flashing, shifting layout, or exposing hidden text early.

Every decorative animation receives an immediate `prefers-reduced-motion` path. Functional state
changes, focus, and announcements remain intact when animation is disabled.

Primary files:

- `src/app.css`
- `src/lib/components/spoiler.svelte`
- `src/lib/components/tracker-row.svelte`
- `src/lib/components/npc-record.svelte`
- focused spoiler and interaction tests

## Phase 8: Responsive verification

Verify 320 and 375 CSS-pixel phones, landscape phone, intermediate tablet width, the 701-pixel
ribbon breakpoint, large desktop, 200% zoom, both themes, keyboard navigation, and reduced motion.
Panels must occupy the space above the toolbar without horizontal overflow, and their internal
content must scroll independently when the viewport is short.

Run the complete verification matrix once the focused tests pass:

1. `pnpm run lint:fix`
2. `pnpm run lint`
3. `pnpm run check`
4. `pnpm run test`
5. `pnpm run build`

Review the final browser console, accessibility results, visual states, and Git diff before commit,
push, and PR creation.
