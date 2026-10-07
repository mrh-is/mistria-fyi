# Reviewed game facts

## Context

#414 identified runtime game facts scattered across acquisition collectors & visibility extractors,
including inventories & prices duplicated from native data.

## Decision

Keep reviewed facts in `pipeline/src/overrides/`, carrying IDs, values, evidence, & reasons.
Validate complete native targets before production extraction, & compare acquisition overrides
against collected native sources. Derive outfit inventories & wishing-well prices from native
tables. Preserve crown level 20 until #638 supplies playthrough evidence.

Keep projection metadata & localization assertions distinct from acquisition overrides. Native
English equality confirms an ordinal assertion; it does not obsolete that assertion.

## Alternatives

Extractor-local exception tables hide review provenance. A validator relying exclusively on raw
fields cannot detect native acquisition equivalence that only appears after reward & stock
collection. Applying all checks inside individual extractors would duplicate native table traversal
& obstruct intentionally partial test fixtures.

## Revisit if

Native game tables encode a reviewed acquisition edge, a native target disappears, the game changes
its naming conventions, or #638 establishes the crown gate.
