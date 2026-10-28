---
id: 2026-10-06-category-completion
status: needs-review
summary: >-
  `isCategoryComplete(key, ctx)` in `engine/progress.ts` is the only category completion predicate,
  defined as `getCategoryProgress(key, ctx).completed >= total`. Components call it instead of
  re-deriving completion. Where the old progress count could reach 100% while the category was still
  incomplete, the progress count changes rather than the predicate: each dateable villager now adds
  one step for a settled relationship (platonic, or married with a declared child choice). The
  craving quest's rule lives once, in `engine/craving-quest.ts`, and progress, search, & the quests
  page read it.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-category-completion.md#decision
relationships: []
---

# Category completion comes from progress

## Context

Eleven components computed their own “category complete” predicate to drive `<AllCompleted>` and
`celebrateCategory()`, while `getCategoryProgress` fed the header. The two disagreed in places: the
almanac & museum predicates ignored applicability, the villagers header counted only heart levels
while a villager row also needs a settled relationship, and the craving-quest rule lived in three
copies that disagreed when the spouse mapped to no pregnancy quest
([mrh-is/mistria-fyi-private#440](https://github.com/mrh-is/mistria-fyi-private/issues/440)).

## Decision

`isCategoryComplete(key, ctx)` in `engine/progress.ts` is the only category completion predicate,
defined as `getCategoryProgress(key, ctx).completed >= total`. Components call it instead of
re-deriving completion. Where the old progress count could reach 100% while the category was still
incomplete, the progress count changes rather than the predicate: each dateable villager now adds
one step for a settled relationship (platonic, or married with a declared child choice). The craving
quest's rule lives once, in `engine/craving-quest.ts`, and progress, search, & the quests page read
it.

## Alternatives

- **Per-category engine predicates beside progress.** Rejected: two definitions can drift again, and
  a header at 100% without a celebration (or the reverse) is the bug this fixes.
- **Keep villagers progress as levels only and drop the relationship requirement from completion.**
  Rejected: villager rows would read complete in the header while their own rows stay incomplete.

## Revisit if

- A category needs a completion state that progress can't express as a count, such as an optional
  goal that shouldn't block 100%.
