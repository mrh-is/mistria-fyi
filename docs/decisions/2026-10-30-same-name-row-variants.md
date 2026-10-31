---
id: 2026-10-30-same-name-row-variants
status: current
summary: >-
  Almanac rows sharing a name within a category get a reviewed variant word from the game’s own
  descriptions. A set means visible rows (recipe entries), not the members of one entry.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/149#issuecomment-6452968696
  - pipeline/src/overrides/item-variants.ts
  - pipeline/src/overrides/item-variant-terms.ts
relationships: []
---

# Same-name row variants

## Context

Issue #149’s design names colorway variants from the game’s descriptions through a reviewed table.
Its research counted 271 “same-name sets” inside almanac entries: the members of one recipe
(`collapseColorways` groups by `recipe_key`). But an almanac row is one entry, pictured & named by
its canonical member, so those members never show as separate rows. The rows players can’t tell
apart, such as the six “Animated Clouds Window” rows, are separate entries with the same name: 71
sets & 239 rows in v1.0.8.

## Decision

- A same-name set is the rows (entries, by canonical item ID) of one almanac category that share an
  English name. The variant is a field of `AlmanacEntry`, not `Item`.
- `ITEM_VARIANT_SETS` reviews every set, named or unnamed with a reason, and records every row’s
  English description, named or not. The extractor throws on an uncovered set, a set whose rows
  changed, a changed description, a repeated variant, & a review that no longer matches. Its error
  carries a proposal from the review rules.
- Each locale’s term comes from that locale’s description of an evidence row where possible.
  `ITEM_VARIANT_TERMS` lists each locale under `game` or `machine`; the messages themselves stay in
  `messages/<locale>.json`.
- Search matches the variant per word with the name (“oak window”), ranked after every name match.

## Alternatives

1. **Name the members inside each entry, as the research counted.** They aren’t displayed
   separately, so naming them would leave the reported rows unchanged.
2. **Derive names in the extractor at build time.** The decision on #149 requires a human-reviewed
   table, & descriptions need judgment (multi-phrase diffs, game typos such as the Japanese “walnut
   & gold” cabinet that says green).
3. **Store provenance inside the message files.** Inlang’s message format has no metadata field, so
   a pipeline table holds it and the real-asset test checks it.

## Revisit if

- The game starts naming colorways itself, in its own localization.
- The almanac starts showing an entry’s members as separate rows, which would make within-entry sets
  visible.
- The table grows enough that per-update review is a burden, which would favor generating proposals
  into a reviewable file.
