---
id: 2026-10-28-composed-monster-names
status: current
summary: >-
  Every locale composes monster family & variant; the English-only monster chunk is removed.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/41#issuecomment-6144929351
  - src/lib/sources/source-names.ts
relationships: []
---

# Compose every monster name

## Context

The [source-name decision](2026-10-06-source-name-gaps.md) used an English monster chunk from pet
variant names. Game version 1.0.7 reduced those variant names to qualifiers, so they no longer
supplied complete monster names.
[PR #41’s resolution](https://github.com/mrh-is/mistria-fyi/pull/41#issuecomment-6144929351) removed
the extractor, table, & chunk in `c8f818e2`.

## Decision

Compose monster names from the localized `pets/skins` family & variant qualifier in every locale,
including English. `buildMonsterNames` in `src/lib/sources/source-names.ts` implements this policy.
The earlier decision’s location & water-name policies remain outside this replacement.

This record documents the already merged resolution; it authorizes no new runtime change. The game
update prompted reconsideration without satisfying either of the earlier record’s narrower revisit
conditions. The merged PR records the accepted replacement.

## Alternatives

Keeping an English-only table was rejected in PR #41’s review because it would duplicate
game-derived names. Using the shortened variant text alone would lose the family name.

## Revisit if

The game supplies complete, localized monster names rather than pet-family names & variant
qualifiers.
