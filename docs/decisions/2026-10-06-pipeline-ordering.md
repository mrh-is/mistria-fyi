---
id: 2026-10-06-pipeline-ordering
status: needs-review
summary: >-
  Use one UTF-16 code-unit comparator for pipeline strings, sort disk and zip TOML files by relative
  path before registration, and omit the unused generation timestamp. Compare converted sprite bytes
  to refresh changed outputs without rewriting identical files. The game version remains the output
  provenance.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-pipeline-ordering.md#decision
relationships: []
---

# Stable pipeline ordering

## Context

Issue [mrh-is/mistria-fyi-private#411](https://github.com/mrh-is/mistria-fyi-private/issues/411)
identified host-dependent string collation, input registration order, and timestamps as sources of
output churn. Transfer encoding depends on the emitted almanac order.

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
