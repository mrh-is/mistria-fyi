---
id: 2026-10-20-recipe-scroll-unlocks
status: needs-review
summary: >-
  Store a fixed scroll’s derived recipe identities on `Item.recipeUnlocks`. The pipeline resolves
  its set tag through recipe product tags, deduplicates variants, and throws when no recipe matches.
  Save import credits those identities from acquired scroll IDs. Generic scrolls carry a runtime
  target; their acquired item ID alone does not identify a recipe, so they keep using
  `recipe_unlocks`.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-20-recipe-scroll-unlocks.md#decision
relationships: []
---

# Native scroll unlocks

## Context

Fixed recipe scrolls use native `set_unlock` tags to grant one or more recipes. Some grants,
including the Engagement Ring, are absent from the save’s `recipe_unlocks`, so acquisition evidence
needs the scroll’s native effect rather than an inference from a crafted output.

## Decision

Store a fixed scroll’s derived recipe identities on `Item.recipeUnlocks`. The pipeline resolves its
set tag through recipe product tags, deduplicates variants, and throws when no recipe matches. Save
import credits those identities from acquired scroll IDs. Generic scrolls carry a runtime target;
their acquired item ID alone does not identify a recipe, so they keep using `recipe_unlocks`.

## Alternatives

- A separate top-level scroll registry duplicates item identity & lookup ownership.
- Inferring learning from recipe outputs confuses crafting with other acquisition paths.
- Hardcoded scroll IDs drift when the game adds a new set or scroll.

## Revisit if

The game adds fixed scroll effects that use something other than `set_unlock`, or saves start
preserving target identity for acquired generic scrolls.
