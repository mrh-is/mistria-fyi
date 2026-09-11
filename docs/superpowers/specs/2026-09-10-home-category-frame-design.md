# Home and category frame

- **Issue:** #130
- **Phase:** 4
- **Status:** Approved

## Goal

Carry the Field Guide material system from tracker rows into the application frame. The home page
becomes a compact index of paper category stripes and edge ribbons, category pages inherit a shared
ribbon header, and the existing utility controls become floating tools that preserve their current
behavior and accessibility contracts.

This phase establishes shared composition. It does not migrate each category’s specialized content,
replace proxy icons, or redesign the settings, search, feedback, and filter surfaces beyond fitting
them into the new frame.

## Home index

The home page uses one sticky header containing the product title, overall percentage, completed and
total counts, and a full-width progress rule along its lower edge. Category navigation follows as an
understated index rather than a card grid.

Each category entry is one full-width raised-paper stripe with:

- a category name over a short pressed-color print mark;
- a concise progress count aligned on the slash as `X / Y`;
- a two-pixel category-colored progress rule along its bottom edge; and
- a separate colored ribbon carrying the category icon.

The ribbon has a concave chevron cut. On narrow layouts it folds over the paper’s inline-end edge
with the concavity facing inward. On wider layouts it mounts behind the centered paper column and
projects into the outer margin with the concavity facing outward. Ribbon widths remain consistent,
and the paper/ribbon overlap is oversized so hover movement cannot reveal a gap.

Incomplete categories appear first under an understated “Index” heading. Completed categories move
into a distinct “Completed” section with an amber-inflected treatment while retaining their own
accessible category names and progress values. The “Everything” link remains a quiet summary after
the category lists.

Search results replace the index content exactly as they do today. The welcome card is removed from
the primary index so roughly ten compact category rows can remain visible in a phone-height
viewport.

## Category frame

Every category route continues to derive its title, theme color, and progress in the shared category
layout. The shared `PageHeader` gains an optional category ribbon mode that composes:

- a back control;
- the category title;
- completed and total progress text;
- a category-colored progress rule; and
- the matching category icon inside an edge ribbon.

The category icon is not duplicated in the title row. Generic uses of `PageHeader`, including
settings, privacy, and “Everything”, retain the ordinary header treatment without a ribbon.

The shared category layout owns the consistent page gutter and vertical spacing around category
content. Phase 5 remains responsible for migrating specialized category interiors to their approved
patterns.

## Floating tools

The persistent bottom navigation bar becomes a pointer-transparent floating tool layer. Settings
sits alone at the lower inline-start edge; feedback, search when supported, and visibility filters
form a cluster at the lower inline-end edge.

Each tool has a minimum 44 × 44 CSS-pixel target, a translucent raised-paper surface, visible hover
and focus treatment, and an explicit accessible name. Existing panel, focus-restoration,
inert-background, search, filter-status, and route-availability behavior remains intact. Search and
visibility panels open above the floating tools rather than above an opaque footer bar.

## Motion and responsive behavior

Ribbon hover and focus may use a small horizontal slide, shadow change, and icon tilt. The paper
stripe may lift by at most one pixel. Reduced-motion preference removes those transforms and
shortens state transitions to effectively instantaneous changes.

The layout must not create horizontal page overflow at 320 CSS pixels. Desktop ribbons may project
beyond the centered page only where the viewport supplies a margin. Safe-area insets remain
respected for the sticky header, page bottom padding, tools, and panels.

## Accessibility

- Category links expose the category name and completed/total values in their accessible name.
- Visible count text uses spaces around the slash and is hidden from assistive technology when the
  link label already supplies the same information.
- The sticky overall summary exposes completed, total, and percentage values without relying on
  color or the visual progress rule.
- Keyboard focus produces the same ribbon feedback as hover without moving focus or changing
  document order.
- Tool order remains predictable: settings, feedback, search where available, then filters.
- All interactive targets remain at least 44 × 44 CSS pixels in the phone layout and satisfy the
  project’s desktop target-size-or-spacing rule.
- Light and dark surfaces, print marks, progress rules, text, and focus indicators retain adequate
  contrast.

## Deferred work

- Final category and utility artwork belongs to Phase 6; this phase reuses the structural icon
  system.
- Specialized NPC and category interiors belong to Phase 5.
- Vellum tuning, overlay redesign, completed-category polish, and cross-app motion tuning belong to
  Phase 7.
- The stripe-to-category navigation transition remains optional and is not part of this phase.
- Margin artwork remains optional and is not part of this phase.

## Acceptance criteria

1. The home page renders a compact semantic index of active and completed category stripes with
   responsive edge ribbons and accurate progress.
2. Category pages share a ribbon header and category progress treatment without duplicating route
   logic.
3. Generic page headers remain correct on non-category routes.
4. Settings and the tracker utilities render as floating controls while preserving existing search,
   feedback, filter, and focus behavior.
5. The home and category frames reflow without horizontal overflow at 320 CSS pixels, support both
   themes, honor safe areas, and disable decorative motion under reduced motion.
6. Focus, semantic names and state, target geometry, and automated accessibility checks are covered
   by browser tests.
