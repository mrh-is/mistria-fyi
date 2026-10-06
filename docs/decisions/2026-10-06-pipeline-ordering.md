# Stable pipeline ordering

## Context

Issue #411 identified host-dependent string collation, input registration order, and timestamps as
sources of output churn. Transfer encoding depends on the emitted almanac order.

## Decision

Use one UTF-16 code-unit comparator for pipeline strings, sort disk and zip TOML files by relative
path before registration, and omit the unused generation timestamp. Compare converted sprite bytes
to refresh changed outputs without rewriting identical files. The game version remains the output
provenance.

## Alternatives

Explicit English collation still depends on host ICU data. Retaining a wall-clock timestamp makes
identical input produce different output. A force-only sprite refresh requires callers to remember
when game assets changed.

## Revisit if

The tracker requires linguistically sorted pipeline output rather than stable data ordering, or
regeneration needs provenance beyond the game version. Any transfer-ordering change requires
deliberate codec versioning and compatibility tests.
