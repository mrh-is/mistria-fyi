---
id: 2026-10-21-category-registry
status: needs-review
summary: >-
  `engine/categories.ts` holds one entry per category. Every entry has a projection, which returns
  the category's rows and the progress `totals` they add up to; a route and search are optional
  capabilities. Progress, the completion predicate, & the overall total read projections' totals.
  Search providers take search's own context (default availability windows, the player's
  progression) and read their category's projection, so availability, applicability, & spoiler flags
  come from the same rows progress counts. `CategoryKey` and `SearchCategoryKey` derive from the
  registry.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-21-category-registry.md#decision
relationships: []
---

# Categories are one registry of capabilities

## Context

A category's facts were spread across parallel `Record<CategoryKey, …>` maps & switches: routes in
`data/categories.ts`, a progress function per category behind a switch in `engine/progress.ts`, a
hand-kept list of search categories beside a separate list of search providers, and the
`/everything` content map. Progress & search each walked the tracker data with their own rules, so
they could disagree about which rows exist or count, as the almanac's header & page rows did before
its projection (#117). Showing unobtainable almanac rows also left one total unsettled: section
headers counted revealed rows in their totals while the header did not.

## Decision

`engine/categories.ts` holds one entry per category. Every entry has a projection, which returns the
category's rows and the progress `totals` they add up to; a route and search are optional
capabilities. Progress, the completion predicate, & the overall total read projections' totals.
Search providers take search's own context (default availability windows, the player's progression)
and read their category's projection, so availability, applicability, & spoiler flags come from the
same rows progress counts. `CategoryKey` and `SearchCategoryKey` derive from the registry.

Localized names & descriptions stay in `data/categories.ts`, keyed by the registry's keys: the
engine can't import messages. The `/everything` content map stays in its component, since engine
modules can't import components.

**Unobtainable rows never count toward a total.** Revealing them with the almanac's filter changes
what renders, not any count: the header, each section's completed count & total, & the overall total
count only obtainable rows. A completed entry is always obtainable, so it always counts.

## Alternatives

- **One registry in `data/categories.ts` with names, routes, & engine capabilities.** Rejected: the
  engine's progress & search would then import the message module, which the engine layering
  forbids.
- **Search providers receiving a projection from the registry.** Rejected: pairing each provider
  with its own projection type needs method-signature bivariance, which the lint rules forbid, or
  casts; a provider reading its own projection keeps the types sound.
- **Count revealed unobtainable rows in section totals.** Rejected: an unobtainable row can't be
  completed, so its section would read incomplete forever while the header & celebration say done.

## Revisit if

- A category needs a projection without progress, such as a reference page with no completion goal;
  `totals` would then become an optional capability.
- Pages other than the almanac compose their own rows and diverge from their projection.
