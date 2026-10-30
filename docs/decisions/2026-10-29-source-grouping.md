---
id: 2026-10-29-source-grouping
status: current
summary: >-
  Everything groups existing completion tasks by acquisition instance, with source-specific windows
  & rollups, and a device preference overridden by the URL.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/145#issuecomment-6451364048
  - src/lib/presentation/source-groups.ts
relationships: []
---

# Source grouping

## Context

Issue #145 adds a Source grouping to Everything so players can see what remains at a shop, festival,
location, body of water, or mines biome across the existing tracked categories.

## Decision

Project existing category rows into source instances, retaining each category’s completion fact &
store action. An almanac collection, museum donation, & learned recipe remain distinct tasks even
when they picture the same item; their category labels distinguish them. Repeated facets of one
source (seasonal shop stock, for example) share a section & one row placement. Locations & water
types split into separate placements, and mine activities share their biome’s section.

Source totals & Now/Later/Done rollups use every obtainable row before display filters, so hiding
Later rows cannot finish a source. Specialized controls without acquisition sources, including mine
floor progress, stay in Progress. Sources the data does not name use the existing localized
acquisition sentence, preserving the game’s vocabulary & spoiler gates.

Persist the grouping in the existing per-device preferences blob. `group=category|source` overrides
the device preference for the current URL; only choosing the control changes the saved preference.
Type groups remain open, matching current category groups, until #248 adds collapsing & the separate
completed list to both groupings.

## Alternatives

Dedicated source routes would duplicate the Everything page’s row machinery & multiply localized
routes. Filtering each category’s existing content component would retain category sectioning and
use an item’s best source window, obscuring what remains at the selected source. Combining an item’s
separate completion tasks would lose the category contracts.

## Revisit if

Source pages acquire their own facts or navigation, the pipeline distinguishes rotating stock, or
#248 changes the shared type/category grouping container. New source kinds must preserve stable
instance identities & localized labels.
