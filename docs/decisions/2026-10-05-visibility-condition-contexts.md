---
id: 2026-10-05-visibility-condition-contexts
status: needs-review
summary: >-
  Use one condition evaluator with explicit context adapters, preserving the existing semantics:
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-05-visibility-condition-contexts.md#decision
relationships: []
---

# Visibility condition contexts

## Context

Issue [mrh-is/mistria-fyi-private#432](https://github.com/mrh-is/mistria-fyi-private/issues/432)
consolidates the condition switches in `visibility.ts`. The switches previously read different
facts: ordered quest category gates checked recorded acquisition & raw heart levels, while public
visibility checked derived quest availability & effective heart levels. Combining those facts would
change existing gates during a refactor.

## Decision

Use one condition evaluator with explicit context adapters, preserving the existing semantics:

- Ordered category gates use recorded heart levels. A `questAvailable` gate requires the quest to be
  obtained or completed. A `villagerKnown` gate recursively evaluates that villager’s visibility
  against recorded progress.
- Ordinary quest prerequisites & villager discovery use the least fixpoint of derived quest
  statuses, recorded heart levels, and no known villagers. Discovery does not recursively disclose
  villagers through other villagers.
- Public visibility uses derived quest statuses, the discovered villager set, and effective heart
  levels: the maximum of recorded levels & completed story-quest cascades, masked to zero for
  unknown villagers. Showing spoilers bypasses public visibility conditions.

Regression tests pin the differences between these contexts. The spoiler mutation planner remains
separate and applies intended changes through the store’s setters.

## Alternatives

Using effective heart levels & derived availability everywhere would let unacquired quests and
cascaded heart levels satisfy ordered category gates. Using recorded progress everywhere would hide
ordinary quests unlocked by derived prerequisites and ignore effective heart levels in public
visibility. Both alternatives change behavior beyond the consolidation scope.

## Revisit if

Verified game rules or a separately approved behavior change establish that an ordered gate should
accept derived availability or cascaded levels, or that discovery should support `villagerKnown`
chains. Update the relevant context & regression tests deliberately rather than changing the shared
evaluator.
