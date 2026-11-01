---
id: 2026-10-06-unified-acquisition
status: needs-review
summary: >-
  One collector walk per native acquisition table emits item and recipe sources. `extractRecipes`
  owns recipe identity, names, and native defaults; the acquisition layer owns acquired sources. A
  scroll target resolves through the product-item map or an existing recipe ID, and an unresolved
  target is a diagnostic. Assembly shares one requirement context and one stock requirement
  projection across target kinds. Standalone recipe extraction invokes the same collectors.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-unified-acquisition.md#decision
relationships: []
---

# Unified acquisition sources

## Context

Recipe extraction and item acquisition each walked the same reward, store, and exploration tables,
with different trigger, requirement, and deduplication rules
([mrh-is/mistria-fyi-private#413](https://github.com/mrh-is/mistria-fyi-private/issues/413)). Recipe
scrolls could leak into item sources as raw IDs, while item letters could acquire a fabricated
Spring 1 date. The v1.0.5 birthday letters also contain real item rewards whose birthday, heart, and
world-fact requirements need a truthful source.

## Decision

One collector walk per native acquisition table emits item and recipe sources. `extractRecipes` owns
recipe identity, names, and native defaults; the acquisition layer owns acquired sources. A scroll
target resolves through the product-item map or an existing recipe ID, and an unresolved target is a
diagnostic. Assembly shares one requirement context and one stock requirement projection across
target kinds. Standalone recipe extraction invokes the same collectors.

All accumulators use canonical source JSON, including `availability` and `visibility`, for
deduplication. Identical sources collapse. Sources with different gates remain separate
alternatives, even when their path fields match; this reconciles conflicting gates without combining
an availability from one path with a spoiler gate from another. The rule is independent of collector
order, and an unconditional source remains an explicit alternative.

Letters with shipping, donation, spouse, or reached-date triggers retain those forms and any
remaining requirements. Birthday letters use an explicit birthday `letter` source; other recognized
conditional letters use a conditional `letter` source. Their requirement expressions become
availability conditions, preserving heart and game predicates even when the UI cannot evaluate a
predicate. A recognized conditional trigger classifies the letter while additional unknown
predicates remain in the projected expression; wholly unsupported triggers produce a diagnostic,
with no invented date. The renderer names birthday mail explicitly in every locale. Letter IDs are
validated against the parsed native letters table, which is independent of emitted source payloads;
a stale source ID cannot register itself.

The unified wishing-well walker also emits native cosmetic rewards. This made the Soup Pot Hat and
Teapot Hat reviewed overrides obsolete, so those two overrides were removed. Other reviewed override
changes remain outside this decision.

## Alternatives

Combining gate fields with `all` would incorrectly require two alternative paths at once. Combining
them independently with `any` could pair the availability of one path with the spoiler condition of
another. Dropping a gate would make extraction order determine the output. Keeping separate recipe
walkers would preserve the original disagreement. Using a default or guessed date for conditional
letters would misstate the native requirement.

## Revisit if

The source model gains a first-class, paired alternative gate representation, the app can evaluate
birthday and other currently unknown game predicates, or new native letter triggers require another
explicit source form.
