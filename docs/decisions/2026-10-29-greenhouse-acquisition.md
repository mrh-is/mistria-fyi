---
id: 2026-10-29-greenhouse-acquisition
status: current
summary: >-
  Greenhouse growing is a crop route gated by the quest that awards its first blueprint.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/245
  - pipeline/src/acquisition/collectors/natural.assets.test.ts
relationships: []
---

# Greenhouse acquisition

## Context

Crop sources need distinct outdoor & greenhouse availability. The tracker records quest progress,
but it does not record greenhouse construction or seed inventory. Game v1.0.8 awards the first
greenhouse blueprint from “Upgrade the Carpenter’s Shop”; its GML restricts crop seasons only on the
farm.

## Decision

Represent greenhouse growing as a second `crop` source with `greenhouse: true`, the same seed ID, &
completion of `upgrade_the_carpenters_shop` as its availability gate. This preserves the shared
growing method while giving players a distinct localized label & a year-round route after unlock.
The gate expresses access to the route, consistent with other acquisition sources.

## Alternatives

A new source type duplicates the crop’s seed relationship & growing method. A new persisted
construction or inventory flag expands this extraction fix into progress tracking & save import. An
ungated greenhouse source would incorrectly make crops available before the blueprint unlock.

## Revisit if

The tracker begins recording constructed buildings or seed inventory, or the game changes how
players unlock greenhouses. Replace the access gate with the more precise recorded state then.
