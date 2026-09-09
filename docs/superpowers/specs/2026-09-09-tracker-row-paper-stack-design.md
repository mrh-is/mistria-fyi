# Tracker row paper stack

- **Issue:** #130
- **Pull request:** #221
- **Status:** Approved

## Goal

Render tracker rows as a legible stack of physical paper layers: one white item sheet above one
brown source sheet. The same brown sheet must peek through the item paper’s corner cutout while
closed and expand downward while open. Borders, shadows, corner radii, controls, and adjacent rows
must all follow that material model rather than being independent visual effects.

## Current limitation

The current implementation divides the visual assembly across unrelated primitives. The committed
version clips the white row while rendering a separate brown triangle and source card. The unstaged
version overlays a brown triangle on an uncut white rectangle, renders the expanded brown body
elsewhere, removes the white bottom border while open, and adds the white shadow only during hover.

That structure cannot produce two coherent sheets. The overlay can cover the white border, the hover
shadow follows the wrong silhouette, and the corner control has no single brown surface to anchor
to. The correction is a localized component rearchitecture rather than another styling pass.

## Material model

Every contiguous run of closed tracker rows forms one white sheet. Individual rows remain distinct
records, but adjacent white row panels share a single 1px separator and have no internal corner
radii.

A row with sources also owns one brown source sheet beneath its white panel. The brown sheet is
always present:

- While closed, it overlaps the lower portion of the white panel and contributes no additional flow
  height. Only the area exposed by the white paper’s bottom-right cutout is visible.
- While open, the same brown element grows downward to reveal its source content.
- Its disclosure control is anchored to its bottom-right corner, so the control moves down when the
  sheet opens and returns when it closes.

Opening a source sheet terminates the current white sheet. The following row begins a new white
sheet after a small page-background gap.

## Component model

The paper behavior is divided into focused components with an explicit, documented coupling
contract.

### `TrackerRowStack`

`TrackerRowStack` owns the relationship between neighboring rows. It renders a semantic wrapper
around a direct sequence of `TrackerRow` roots and defines the shared paper geometry tokens.

The stack determines which rows start and end a white sheet:

- The first direct tracker-row child starts a sheet.
- A row immediately following an open source row starts a sheet.
- The last direct tracker-row child ends a sheet.
- A row with an open source sheet ends a sheet.
- Adjacent closed rows remain within one sheet.

The component uses direct-child state attributes or classes, not knowledge of `TrackerRow`
internals. Controls such as “Show more” and empty-state messages sit outside the row stack.
Composition sites that render a tracker row beside unrelated content, such as a search-result
category label, use a one-row `TrackerRowStack` rather than relying on incidental `:first-child` or
`:last-child` behavior.

No Svelte context or row-registration lifecycle is required for this version. Direct-child state is
sufficient, remains inspectable in the browser, and avoids synchronization problems during
filtered-list transitions. Context may be introduced later only if the stack needs behavior that
selectors cannot express.

### `TrackerRow`

`TrackerRow` owns record behavior and source expansion state. It renders the row root, applies
explicit source-state attributes, supplies item content to `TrackerPaper`, and controls
`SourcePaper` through an `expanded` value and toggle callback.

Lifting expansion state into `TrackerRow` removes state-dependent cross-component `:has()` queries.
Pure hover and focus styling may still use `:has()` when it makes the relationship clearer, but
sheet boundaries, borders, radii, and layout cannot depend on discovering child state through DOM
traversal.

### `TrackerPaper`

`TrackerPaper` owns the white foreground surface. It contains:

- an unclipped shadow wrapper;
- a clipped white fill and orthogonal 1px border;
- an unclipped diagonal border overlay when the row has sources; and
- a content region for the checkbox, sprite, label, subtitle, and active badge.

This component receives its start-of-sheet, end-of-sheet, and cutout state through attributes or CSS
custom properties set by `TrackerRow` and `TrackerRowStack`. It does not know about source
descriptions or disclosure behavior.

### `SourcePaper`

The current `CornerPeek` responsibility becomes `SourcePaper`. `SourcePaper` renders one persistent
brown element, the disclosure button and caret, and the expandable content region. It is controlled
by `TrackerRow` and contains no independent expansion state.

The brown element owns its background, native 1px border, outer radii, overlap, expansion
transition, and control positioning. There is no separate notch triangle. The visible closed corner
is simply the portion of the brown sheet revealed by `TrackerPaper`.

### `SourceCard`

`SourceCard` remains content-only. It lays out source icons, descriptions, and restriction badges
but owns no paper background, border, radius, shadow, overlap, or disclosure positioning.

Existing `TrackerCheckbox`, `SpriteSlot`, and `RestrictionBadges` components retain their focused
responsibilities.

## Shared geometry

`TrackerRowStack` establishes named custom properties for the geometry shared across components:

- `--tracker-paper-border-width: 1px`;
- `--tracker-paper-line`: the theme-aware border color;
- `--tracker-paper-radius: 2px`;
- `--tracker-peek-size`: the square dimension of the corner cutout;
- `--tracker-source-inset`: the brown paper’s inline-start offset, aligned with the sprite column;
- `--tracker-sheet-gap`: the gap following an open source sheet; and
- pointer-aware row and target sizes.

The source inset is derived from or defined beside the checkbox target width and row gap. The
implementation cannot duplicate an unexplained `51px` literal in a child component.

Shadow geometry is a design-system concern rather than a tracker-only value. `app.css` defines a
theme-aware `--shadow-small` token whose value is valid both as a `box-shadow` and inside
`drop-shadow()`. The Tailwind `shadow-sm` theme value maps to the same token, so class-based and
component-CSS consumers share one elevation. `TrackerPaper` uses
`filter: drop-shadow(var(--shadow-small))` because its shadow must follow a clipped silhouette.
Ordinary rectangular surfaces may use `box-shadow: var(--shadow-small)` or the mapped `shadow-sm`
utility. Decorative effects such as the sprite sticker shadow and focus rings are not elevation
shadows and do not use this token.

Physical properties are avoided where logical equivalents exist. The requested corner remains the
inline-end, block-end corner in the current left-to-right interface.

## Border geometry

Every visible paper edge is exactly 1 CSS pixel thick. Border width does not change with state,
hover, focus, theme, viewport width, or device-pixel ratio.

### Orthogonal edges

White and brown horizontal and vertical edges use native CSS borders with
`--tracker-paper-border-width`. Native borders also draw the rounded portions of exposed orthogonal
corners. A border cannot be simulated by placing a larger colored rounded rectangle behind a clipped
fill because that technique can lose or thicken the border around a radius.

The white fill and its ordinary border may be clipped to create the corner opening. The clip removes
the obsolete portions of the bottom and inline-end edges. The diagonal border is rendered separately
outside that clip, so neither the clip path nor a border radius can truncate it.

The brown source paper is rectangular and is not clipped. Its native border therefore follows every
exposed outer radius without a second border layer.

### Diagonal edge

The cutout diagonal uses an SVG centerline path in an absolutely positioned, unclipped overlay. The
path has a computed `stroke-width` of `1px`, `vector-effect: non-scaling-stroke`, and
geometric-precision rendering. Stroke width is defined perpendicular to the path, which makes a 1px
SVG stroke the correct 1px diagonal border.

The diagonal cannot be constructed as the space between two polygons whose coordinates differ by
`1px` on both axes. At 45 degrees, that construction produces a perpendicular width of √2 pixels. If
a filled strip is ever substituted for the centerline stroke, each axis offset must be `1 / √2`
pixels so its perpendicular width remains 1px.

For the initial 27 × 27 cutout, the overlay path runs from `(26.5, 0.5)` to `(0.5, 26.5)`. Those
endpoints meet the centerlines of the native 1px inline-end and bottom borders, which sit 0.5px
inside the border box. The path uses butt caps so it neither projects beyond those intersections nor
creates a pointed end. Any visual-checkpoint adjustment moves an endpoint only along the diagonal
and cannot change the 1px perpendicular stroke width.

Raster antialiasing may distribute a diagonal’s coverage across adjacent device pixels. That is
expected and is not the same as a border whose geometric width exceeds 1 CSS pixel.

### Shared separators

Adjacent closed white rows share one separator. The first row contributes its 1px bottom border; the
following row suppresses its top border. The rule is defined by `TrackerRowStack`, not by every row
guessing whether it happens to be a DOM `:first-child` or `:last-child`.

When a source sheet opens, the current row retains its complete white bottom border up to the
cutout. The following row restores its top border because it begins a new sheet. The brown source
paper retains its own complete exposed border.

No open or closed state removes the white bottom border wholesale.

## Corner rules

Only corners exposed to the page background are rounded. All internal corners remain square.

- A row that starts a white sheet rounds both white top corners.
- A row that ends a white sheet rounds the white bottom-left corner.
- A source-free row that ends a white sheet also rounds the white bottom-right corner.
- A sourced row uses the diagonal cutout instead of a white bottom-right radius.
- A closed sourced row has no internal brown radius. If it is also the final row in the stack, the
  visible brown bottom-right outer corner is rounded.
- An open brown source sheet rounds both of its exposed bottom corners.
- The white row following an open source sheet rounds both top corners because it begins a new
  sheet.

The tiny brown apex beneath the top of the diagonal is part of the intentional cutout, not an outer
sheet corner. No radius or border may leave a pointed white or brown corner projecting into page
background.

## Layering and shadow

The z-order is stable in every interaction state:

1. Page background.
2. Brown source paper.
3. White-paper shadow.
4. White paper and its border.
5. Interactive row content and source control.

The white paper casts a faint permanent shadow that follows its clipped silhouette, including the
diagonal. The filter belongs to an unclipped wrapper around the clipped white surface so the clip
cannot remove the shadow. The same shadow is present while closed, open, hovered, focused, and idle.

The initial `--shadow-small` values are `0 1px 1px rgb(46 42 34 / 12%)` in light mode and
`0 1px 1px rgb(0 0 0 / 30%)` in dark mode. The visual checkpoint may reduce these values if
necessary, but hover cannot introduce a new shadow or create a discontinuity between the diagonal
and horizontal portions.

Later white rows paint above the preceding row’s faint lower shadow, preventing a shadow seam
between neighboring white panels. Where no brown surface exists beneath an exposed white edge, any
remaining shadow must be imperceptible against the page background. A mask may be added inside
`TrackerPaper` if browser review shows a visible shadow outside the brown footprint.

Hover may subtly tint the brown paper or caret. Keyboard focus adds a visible focus treatment to the
disclosure control. Neither state changes border width, paper geometry, sheet height, corner radii,
or the permanent white-paper shadow.

## Source expansion

The brown paper begins beneath the white row by one `--tracker-peek-size`. Its closed block size
equals that overlap, so its negative block-start margin produces zero additional flow height.
Expanding the content increases the brown paper’s block size while retaining the same top position
behind the white row.

The disclosure control is a descendant of the brown surface and is positioned against the brown
paper’s inline-end and block-end edges. The visible caret and the 44 × 44 CSS-pixel hit target move
together. The hit target must remain inside an ancestor that does not clip it, and its overflow
dependency is documented in `SourcePaper`.

The button retains `aria-expanded`, `aria-controls`, and a row-specific accessible name. The
controlled content retains a stable ID across states.

Opening one source sheet does not close another. Multiple expanded rows remain supported.

The expansion transition may use the existing Svelte slide behavior or a grid-track transition,
provided the brown border and background remain continuous throughout. Reduced-motion mode removes
nonessential movement while preserving the immediate state change.

## Density and targets

Tracker lists contain hundreds of rows, so the default desktop presentation is deliberately compact
while every control continues to satisfy WCAG 2.2 Level AA target-size requirements.

`TrackerRowStack` defines density tokens consumed by `TrackerPaper`, `TrackerCheckbox`,
`SpriteSlot`, and `SourcePaper`:

- A fine primary pointer with hover uses a 32 × 32 CSS-pixel checkbox and disclosure target, a 36px
  sprite slot, and a 40px minimum row height.
- A coarse pointer, a no-hover environment, or a hybrid device exposing any coarse pointer uses 44 ×
  44 CSS-pixel targets, the current 40px sprite slot, and a 48px minimum row height.
- Hybrid devices retain the coarse-pointer values even if a mouse is also present, so touch remains
  comfortable.

The media-query cascade is exact: touch-safe values are the default;
`(pointer: fine) and (hover: hover)` enables compact values; a later
`(any-pointer: coarse), (hover: none)` rule restores touch-safe values. Testing only
`pointer: coarse` is insufficient because a hybrid device may report its mouse as the primary fine
pointer while also exposing a coarse touchscreen.

The visible checkbox drawing and caret may remain smaller than their interaction boxes. Target
dimensions describe the hit area, not the visual mark.

The compact fine-pointer target remains above the 24 × 24 CSS-pixel WCAG 2.2 Level AA minimum. The
stack must also preserve sufficient spacing when an interactive target is smaller than 44px. The
44px coarse-pointer target is the project’s touch affordance, not a claim that WCAG requires 44px
everywhere.

Content may increase a row beyond its minimum. In particular, the current spoiler control may
continue to make a row taller. This work does not compress, clip, or visually redesign spoilers. A
later spoiler-density pass may reduce their visible treatment while retaining an appropriately sized
interaction area.

## Composition changes

All contiguous tracker-row lists in almanac, recipes, animals, cosmetics, dates, mines, museum,
pets, quests, and other category content are wrapped in `TrackerRowStack`. Empty states, pagination
or “Show more” controls, nested section headers, and unrelated labels remain outside the direct row
sequence.

Search results preserve their category-label layout by giving each standalone tracker row a one-row
stack. This makes its four outer-corner decisions explicit rather than accidental.

`ExpandableSection` remains responsible for disclosure and indentation. It does not own tracker
paper styling, although its child snippet may contain a `TrackerRowStack`.

## Test contract

### Component tests

Component tests establish that:

- `TrackerRow` owns and exposes closed and open source state;
- `SourcePaper` is present while closed and open;
- the same disclosure button controls both states;
- source content appears only while expanded;
- multiple rows can remain open independently;
- the disclosure button is a descendant of the persistent brown paper;
- source-free rows render no brown paper or disclosure control; and
- reduced-motion behavior remains available.

Structural rendering tests verify the separate clipped white surface, unclipped diagonal overlay,
persistent brown surface, and shared border-width token. They do not assert incidental class
ordering or the complete serialized HTML.

### Browser geometry

Rendered-browser tests establish that:

- the disclosure and checkbox targets are at least 32 × 32 CSS pixels with a fine hover pointer;
- the disclosure and checkbox targets are at least 44 × 44 CSS pixels with a coarse pointer, no
  hover, or any available coarse pointer, using a Playwright mobile-device descriptor that resolves
  the relevant pointer media queries rather than viewport width alone;
- its block-axis coordinate increases when sources open and returns when they close;
- its inline-end alignment remains constant;
- opening a source preserves the complete white bottom border left of the cutout;
- adjacent closed rows have exactly one 1px separator;
- the next row begins below the open brown paper and the configured sheet gap;
- tracker rows and expanded sources do not overflow at a 320px viewport; and
- computed orthogonal border widths and the diagonal SVG stroke width equal `1px`.

Pixel-perfect automated assertions for diagonal rasterization are excluded because antialiasing
varies by device-pixel ratio and browser compositor. The structural width assertion is paired with
visual inspection at 1× and 2× DPR.

### Visual matrix

The visual checkpoint covers light and dark themes at 320px and desktop widths, with 1× and 2× DPR
where available. Representative cases include:

- a one-row stack with and without sources;
- first, middle, and final rows in a multi-row stack;
- closed, hovered, keyboard-focused, and open source states;
- one-line and multi-line source content;
- consecutive rows with sources;
- multiple simultaneously open source sheets;
- the row immediately following an open source sheet; and
- completion, obtained, dimmed, and spoilered row presentations.

Review occurs at normal size and magnified size to catch missing border segments, √2 diagonal
strips, antialiasing discontinuities, doubled separators, shadow seams, and corner-radius clipping.

## Acceptance criteria

- The UI reads as one white item sheet above one persistent brown source sheet.
- The brown corner visible while closed and the expanded source body are the same DOM surface.
- The source control remains in the brown paper’s bottom-right corner and moves down and back with
  expansion.
- Every exposed white and brown paper edge has a geometric width of exactly 1 CSS pixel.
- The diagonal is an unclipped 1px non-scaling centerline stroke and is never produced by 1px
  offsets on both axes.
- Every radius retains its own continuous 1px border.
- Adjacent closed white rows share one 1px separator.
- The white bottom border remains present while a source is open.
- Internal sheet corners are square, while every exposed outer corner follows the 2px radius.
- The permanent white-on-brown shadow is continuous across the horizontal and diagonal edges in
  idle, hover, focus, open, and closed states.
- Small surface elevation uses the shared theme-aware `--shadow-small` token, including the
  `shadow-sm` utility mapping and the paper’s silhouette-following filter.
- Hover and focus do not alter border geometry or introduce a shadow seam.
- Multiple source sheets may remain open independently.
- Fine-pointer rows remain compact with targets of at least 32 × 32 CSS pixels; coarse, no-hover,
  and hybrid environments retain targets of at least 44 × 44 CSS pixels.
- Content that exceeds the row minimum, including the current spoiler UI, increases row height
  without clipping or overlap.
- The interaction remains usable with keyboard input, reduced motion, light and dark themes, and a
  320px viewport.
- Focused component tests, rendered-browser geometry tests, the full repository verification matrix,
  and the visual checkpoint pass before implementation delivery.

## Preservation

The current unstaged restriction-badge and source-content refinements are independent of the paper
architecture and remain in place unless implementation exposes a concrete incompatibility.
`tracker-data.json`, generated data contracts, persistence behavior, completion semantics, source
aggregation, and restriction semantics are unchanged.

## Non-goals

- Changing source descriptions, restriction semantics, sprite rendering, or checkbox behavior.
- Introducing an accordion that permits only one open source sheet.
- Adding a general-purpose paper component system outside tracker rows.
- Redesigning spoiler visuals or their interaction model.
- Replacing the existing category and expandable-section hierarchy.
- Committing implementation code before this specification and its implementation plan are approved
  and committed.
