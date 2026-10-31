---
id: 2026-10-06-reviewed-game-facts
status: amended
summary: >-
  The crown placeholder of 20 was replaced by 40 using native GML & letter evidence. The
  reviewed-override architecture remains applicable.
evidence:
  - https://github.com/mrh-is/mistria-fyi-private/pull/657
  - pipeline/src/overrides/game-facts.ts
relationships:
  - type: superseded-by
    target: 2026-10-28-crown-quest-gate
    scope: partial
    portion: >-
      Only the crown level 20 placeholder & pending mrh-is/mistria-fyi-private#638. Native evidence
      was accepted instead of a playthrough; this does not claim that the playthrough condition was
      met.
    evidence:
      - https://github.com/mrh-is/mistria-fyi-private/pull/657
      - pipeline/src/overrides/game-facts.ts
---

# Reviewed game facts

## Context

[mrh-is/mistria-fyi-private#414](https://github.com/mrh-is/mistria-fyi-private/issues/414)
identified runtime game facts scattered across acquisition collectors & visibility extractors,
including inventories & prices duplicated from native data.

## Decision

Keep reviewed facts in `pipeline/src/overrides/`, carrying IDs, values, evidence, & reasons.
Validate complete native targets before production extraction, & compare acquisition overrides
against collected native sources. Derive outfit inventories & wishing-well prices from native
tables. Preserve crown level 20 until
[mrh-is/mistria-fyi-private#638](https://github.com/mrh-is/mistria-fyi-private/issues/638) supplies
playthrough evidence.

Keep projection metadata & localization assertions distinct from acquisition overrides. Native
English equality confirms an ordinal assertion; it does not obsolete that assertion.

## Alternatives

Extractor-local exception tables hide review provenance. A validator relying exclusively on raw
fields cannot detect native acquisition equivalence that only appears after reward & stock
collection. Applying all checks inside individual extractors would duplicate native table traversal
& obstruct intentionally partial test fixtures.

## Revisit if

Native game tables encode a reviewed acquisition edge, a native target disappears, the game changes
its naming conventions, or
[mrh-is/mistria-fyi-private#638](https://github.com/mrh-is/mistria-fyi-private/issues/638)
establishes the crown gate.
