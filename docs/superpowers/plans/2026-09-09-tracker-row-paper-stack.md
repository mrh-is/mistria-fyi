# Tracker row paper stack implementation plan

- **Issue:** #130
- **Pull request:** #221
- **Design:** `docs/superpowers/specs/2026-09-09-tracker-row-paper-stack-design.md`
- **Status:** Approved

## Outcome

Replace the current separate notch, source card, and hover-shadow effects with a componentized
two-sheet assembly. A `TrackerRowStack` coordinates neighboring white row panels, `TrackerPaper`
owns the clipped white foreground and its exact 1px outline, and `SourcePaper` owns one persistent
brown background sheet whose disclosure control follows its bottom-right corner.

The implementation preserves the current unstaged restriction-badge refinements and all tracker
behavior unrelated to paper geometry.

## File map

### New components

- `src/lib/components/tracker-row-stack.svelte`: row grouping, adjacency contract, shared geometry,
  and pointer-density tokens.
- `src/lib/components/tracker-paper.svelte`: white surface, cutout, exact diagonal outline, native
  orthogonal borders, outer radii, and silhouette-following shadow.
- `src/lib/components/source-paper.svelte`: persistent brown source sheet, controlled expansion,
  source content, caret, and disclosure hit target.

### Reworked components

- `src/lib/components/tracker-row.svelte`: owns expanded state, composes the paper components, and
  exposes row state to the stack.
- `src/lib/components/tracker-checkbox.svelte`: consumes the shared interaction-target size.
- `src/lib/components/sprite-slot.svelte`: consumes the shared pointer-aware visual size.
- `src/lib/components/source-card.svelte`: remains content-only and receives only spacing changes
  needed to reserve the disclosure target.
- `src/lib/components/corner-peek.svelte`: removed after its behavior is replaced by `SourcePaper`.
- `src/app.css`: defines the reusable small-elevation token and maps `shadow-sm` to it.

### Composition sites

- `src/lib/components/almanac-content.svelte`
- `src/lib/components/animal-subcategory.svelte`
- `src/lib/components/cosmetics-content.svelte`
- `src/lib/components/dates-section.svelte`
- `src/lib/components/mines-content.svelte`
- `src/lib/components/museum-content.svelte`
- `src/lib/components/pet-collectibles-section.svelte`
- `src/lib/components/quests-content.svelte`
- `src/lib/components/recipes-content.svelte`
- `src/lib/components/search-results.svelte`

### Tests

- `src/lib/components/tracker-row.client.test.ts`
- `src/lib/components/tracker-row.test.ts`
- `src/lib/components/tracker-row-stack.test.ts`
- `src/lib/components/source-card.test.ts`
- `tests/accessibility/geometry.spec.ts`

## Phase 1: Commit approved documents

After the user approves the design and this plan, stage only the two documentation files. Run the
documentation-relevant formatting and spelling checks, then commit the approved artifacts with the
required Codex co-author trailer before changing implementation files.

The four pre-existing unstaged component files remain unstaged during this documentation commit.
Confirm with `git diff --cached --name-only` that no implementation file enters the commit.

## Phase 2: Establish failing contracts

### Component behavior

Update `tracker-row.client.test.ts` before changing the components:

1. Render a sourced row and assert that the brown source-paper element and disclosure button exist
   while collapsed, while source content does not.
2. Record the disclosure button node, open the row, and assert that the same node remains,
   `aria-expanded` changes, source content appears, and the tracker-row root exposes its open state.
3. Close the row and assert that the same button returns to collapsed state.
4. Render two sourced rows, open both, and prove that expansion remains independent rather than
   accordion-controlled.
5. Retain the existing completion-focus and spoiler behavior coverage.

Update `tracker-row.test.ts` to assert structural responsibilities rather than serialized
implementation details:

- sourced rows render a `TrackerPaper` cutout, an unclipped diagonal overlay, and a persistent
  `SourcePaper`;
- source-free rows render no `SourcePaper` or diagonal;
- the source state is owned by the tracker-row root; and
- reportable metadata, checkbox labeling, and sprite states remain unchanged.

Add `tracker-row-stack.test.ts` with a small Svelte harness that renders representative direct-child
rows. Assert that the stack wrapper and row state attributes required by the adjacency contract are
present. Do not attempt to prove pixel geometry in jsdom.

Run the focused component tests and confirm that the new paper-structure assertions fail for the
expected missing elements or state.

## Phase 3: Add design tokens

Update `src/app.css` with one semantic small-elevation value per theme:

```css
:root {
  --shadow-small: 0 1px 1px rgb(46 42 34 / 12%);
}

.dark {
  --shadow-small: 0 1px 1px rgb(0 0 0 / 30%);
}

@theme inline {
  --shadow-sm: var(--shadow-small);
}
```

The value deliberately omits spread distance so it is valid as both
`box-shadow: var(--shadow-small)` and `filter: drop-shadow(var(--shadow-small))`. Do not replace
decorative sprite shadows or focus rings with this token because they do not represent surface
elevation.

No tracker-specific raw elevation shadow remains after this phase.

## Phase 4: Build `TrackerRowStack`

Create `tracker-row-stack.svelte` as a small wrapper around a `children` snippet. Its root
establishes:

- `--tracker-paper-border-width: 1px`;
- `--tracker-paper-line` from the existing hairline token and approved opacity;
- `--tracker-paper-radius: 2px`;
- `--tracker-peek-size: 27px`;
- `--tracker-row-gap: 7px`;
- `--tracker-source-inset: calc(var(--tracker-target-size) + var(--tracker-row-gap))`;
- `--tracker-sheet-gap: 6px`;
- `--tracker-target-size`, `--tracker-row-min-size`, and `--tracker-sprite-size` density values; and
- the shared `--shadow-small` token inherited from `app.css`.

Use touch-safe values by default:

```css
--tracker-target-size: 44px;
--tracker-row-min-size: 48px;
--tracker-sprite-size: 40px;
```

Use this exact media-query cascade:

```css
@media (pointer: fine) and (hover: hover) {
  /* Set 32px targets, 40px rows, and 36px sprites. */
}

@media (any-pointer: coarse), (hover: none) {
  /* Restore 44px targets, 48px rows, and 40px sprites. */
}
```

The second rule comes after the fine-pointer rule. `any-pointer: coarse` is required for
Surface-class and other hybrid devices whose primary mouse reports `pointer: fine` while the
touchscreen remains available. A rule using only `pointer: coarse` does not satisfy the design
contract.

The stack sets sheet-position variables on its direct tracker-row children:

- all rows default to internal square corners and no top border;
- the first direct row starts a sheet;
- a row following an open row starts a sheet;
- an open row ends a sheet; and
- the final direct row ends a sheet, even if non-row controls follow outside the stack.

Use direct-child selectors against stable `data-tracker-row` and source-state attributes. Keep the
selectors in `TrackerRowStack`, and expose only custom properties to the child paper components. Do
not reach into `TrackerPaper` or `SourcePaper` descendant classes from the stack.

Define safe standalone defaults on `TrackerRow` so an accidentally unwrapped row appears as a
complete one-row sheet during migration, but update every known composition site before delivery.

## Phase 5: Build `TrackerPaper`

Create `tracker-paper.svelte` with `children` and `hasCutout` inputs. Its DOM has three focused
layers:

1. An unclipped wrapper carrying `filter: drop-shadow(var(--shadow-small))`.
2. A white surface carrying layout, background, native 1px orthogonal borders, stack-provided outer
   radii, and the cutout clip path.
3. An absolutely positioned SVG diagonal overlay outside the clipped surface.

The white surface retains its bottom border in all states. The cutout clips only the bottom-right
segment that no longer belongs to the white silhouette. It cannot remove the bottom border to the
left of the cutout.

The diagonal SVG uses a fixed `27 × 27` coordinate system matching `--tracker-peek-size`, an
explicit `stroke-width="1"`, `vector-effect="non-scaling-stroke"`,
`shape-rendering="geometricPrecision"`, and the shared paper-line color. Keep the SVG outside the
clipped surface with visible overflow. The initial path is `M 26.5 0.5 L 0.5 26.5`, which meets the
0.5px centerlines of the native inline-end and bottom borders. Use butt caps so the stroke stops at
those intersections. If browser review finds a raster seam, adjust an endpoint only along the
diagonal rather than changing stroke width or offsetting both axes by a full pixel.

Do not draw the diagonal using nested polygon fills offset by 1px on each axis. Do not reduce the
SVG stroke to `0.707px`; SVG stroke width is already measured perpendicular to the path.

Apply `border-start-start-radius`, `border-start-end-radius`, `border-end-start-radius`, and
source-free `border-end-end-radius` from stack-provided variables. Native CSS borders must follow
every rounded corner continuously.

Keep content layout in `TrackerRow`, passed through the snippet, so `TrackerPaper` remains unaware
of completion, spoilers, sprites, or source data.

Run the focused structural tests and bring the `TrackerPaper` expectations to green before
continuing.

## Phase 6: Build `SourcePaper`

Replace the current `CornerPeek` implementation with `source-paper.svelte`. It receives `expanded`,
`contentId`, `label`, `sources`, `sourceSegments`, `sourceBadges`, and an `onToggle` callback. It
has no local expansion state.

Render the brown paper root in both states. Align its inline-start edge with
`--tracker-source-inset`, give it the same native 1px border, and place it below the white paper in
the row stacking context.

Use `margin-block-start: calc(-1 * var(--tracker-peek-size))` and a collapsed minimum block size
equal to `--tracker-peek-size`. The overlap contributes no extra closed-row height. Expanded source
content includes enough block-start space to begin below the white row rather than underneath it.

Anchor the disclosure button with logical bottom-right insets inside the brown root. Its box uses
`--tracker-target-size`, extends upward over the closed overlap when necessary, and never extends
beyond the paper’s inline-end or block-end outer edges. Keep the brown root overflow visible so the
upper portion of a 44px closed target remains usable.

Place the caret inside that button rather than in a separate independently positioned element.
Rotate it from closed to open state, preserve the accessible name, `aria-expanded`, and
`aria-controls`, and remove the negative external button offsets used by the current component.

The brown paper applies no clip path. Use native outer radii supplied through row state:

- closed internal source paper: square corners;
- closed source paper on the final stack row: rounded bottom-right corner; and
- open source paper: rounded bottom-left and bottom-right corners.

Reserve sufficient content padding at inline-end and block-end to prevent long source descriptions
or restriction badges from colliding with the disclosure target. Preserve the current source-card
responsive reflow at narrow widths.

Keep the existing semantic assertions in `source-card.test.ts`, including the current unstaged
restriction-badge expectations. Spacing and target-clearance changes belong to `SourcePaper`
wherever possible and should not require content assertions to change. Update this test only if the
`SourceCard` public markup changes for a concrete accessibility reason.

Use the existing Svelte slide transition unless live review shows border tearing. If it tears, keep
the brown root persistent and transition only an inner content wrapper or an animatable grid track.
Reduced motion sets the transition duration to zero.

Run the focused client and source-card tests and bring the controlled expansion behavior to green.

## Phase 7: Recompose `TrackerRow`

Move `expanded` into `tracker-row.svelte`. Add an explicit root attribute with `none`, `closed`, or
`open` source state, and compose:

```text
TrackerRow
├── TrackerPaper
│   ├── TrackerCheckbox
│   ├── SpriteSlot
│   ├── label and subtitle
│   └── active badge
└── SourcePaper
    └── SourceCard
```

Remove the duplicated notch element, its SVG, all state-dependent global `:has()` geometry, the
open-state bottom-border suppression, the hover-only row shadow, and the row-level magic source-card
inset.

Preserve the existing `completeOut` out-transition, `data-leaving` attribute, and `focusAdjacentRow`
completion-focus relay without moving their behavior into a paper component. Their current client
tests remain regression coverage during recomposition.

Hover and focus may change brown-paper brightness and caret color. Focus retains a visible indicator
without using the elevation shadow token. Neither interaction alters geometry or shadow strength.

Update `TrackerCheckbox` to size its hit area from `--tracker-target-size`. Update `SpriteSlot` to
size its frame from `--tracker-sprite-size` and keep its internal sprite proportional. Set
`TrackerPaper` minimum block size from `--tracker-row-min-size`.

Do not force the current spoiler control below its existing minimum. If spoiler content makes a row
taller than the density token, the row grows naturally.

Run the focused component tests again.

## Phase 8: Integrate row stacks

Wrap every contiguous row sequence listed in the file map with `TrackerRowStack`. Keep each
sequence’s empty state, “Show more” control, and section heading outside the stack root.

Where a component has multiple conditional sequences, add one stack per visually contiguous group.
Do not wrap nested `ExpandableSection` headers into a tracker stack.

In `search-results.svelte`, place the individual tracker row inside a one-row stack while leaving
its category label in the existing neighboring column. Verify that the stack wrapper can shrink
within the result layout and does not introduce width or overflow changes.

Use `rg` to confirm that every production `TrackerRow` occurrence has an intentional
`TrackerRowStack` ancestor. A unit test is not required to encode every call site; the source audit
and browser route checks cover composition completeness.

Run `pnpm run check` and the application test suite after the integration sweep.

## Phase 9: Add browser geometry tests

Extend `tests/accessibility/geometry.spec.ts` with a tracker paper describe block.

In the desktop fine-pointer case:

1. Open a deterministic Almanac section containing at least two sourced rows.
2. Assert that checkbox and source targets are at least 32 × 32 CSS pixels.
3. Record the source target’s bounding box, open it, record the new box, and assert that its
   inline-end coordinate is unchanged while its block-axis coordinate increases.
4. Close it and assert that the control returns to its original block-axis coordinate.
5. Read computed styles to confirm the orthogonal border widths and SVG stroke width resolve to
   `1px`.
6. Confirm the adjacent closed-row separator occupies one CSS pixel and the white bottom border left
   of an open cutout remains 1px.
7. Confirm the next row begins after the expanded brown paper and `--tracker-sheet-gap`.

Add a touch-capable 320px case by importing and spreading a Playwright mobile device descriptor such
as `devices["iPhone 13"]`, then overriding its viewport width to 320px if needed. Viewport width or
`hasTouch: true` alone is not accepted as proof of the coarse-pointer path. Assert the actual
`matchMedia("(pointer: coarse)")`, `matchMedia("(any-pointer: coarse)")`, and hover results before
checking that both targets are at least 44 × 44 CSS pixels and the expanded row produces no
horizontal overflow.

Avoid screenshot-pixel assertions for diagonal antialiasing. Computed stroke geometry plus the
visual DPR matrix is the stable contract.

Run the new geometry cases directly before running the broader accessibility suite.

## Phase 10: Visual checkpoint

Start the local application and capture representative closed, hovered, focused, and open rows in
light and dark themes at desktop and 320px widths. Inspect at normal scale and magnified scale,
using 1× and 2× DPR where the browser tooling permits.

The checkpoint specifically verifies:

- one continuous 1px outline around every exposed white and brown edge;
- no missing pixels where a radius meets a straight border;
- no √2-thick diagonal strip;
- no gap or protruding point at either diagonal endpoint;
- one separator between closed neighbors;
- a complete white bottom border while open;
- a continuous, faint, tokenized shadow along the white bottom and diagonal;
- no shadow seam during hover or focus;
- correct outer-only radii for first, middle, final, and split sheets;
- source content clearance from the moving control;
- compact fine-pointer rows and touch-safe coarse-pointer rows; and
- natural growth around the current spoiler UI.

Pause for user review with the screenshots before committing implementation. Apply requested visual
tuning without changing the approved material or border contracts.

## Phase 11: Verification and delivery

Run focused checks first, then the complete required matrix once:

```sh
pnpm run test:app
pnpm run test:accessibility -- --grep "tracker paper|interactive target geometry|320-pixel reflow"
pnpm run lint:fix
pnpm run lint
pnpm run check
pnpm run test
pnpm run build
```

Lint must report zero errors and zero warnings. Review `git diff`, `git diff --check`, and the
generated build output status without editing generated tracker data.

After the user approves the visual checkpoint, commit the implementation with the repository owner’s
configured author identity and `Co-Authored-By: Codex <codex@openai.com>`. Push `130-tracker-row`,
update PR 221 with a substantive comment ending in `Agent: codex`, and preserve the existing
`agent: codex` ownership label.

## Rollback boundary

If the persistent brown sheet or border geometry cannot pass the visual matrix without
browser-specific hacks, stop before the implementation commit. The documentation commit remains
independently revertible, and the pre-existing unstaged component state remains recoverable from the
worktree diff. Do not fall back to the overlaid triangle architecture without a new design decision.
