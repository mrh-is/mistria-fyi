---
id: 2026-10-06-pipeline-stage-boundaries
status: needs-review
summary: >-
  Separate parse, extract, acquisition, enrich, localize, & emit stages. Traverse native
  requirements once, retaining independent acquisition & spoiler leaf policies to preserve existing
  output. Use pipeline-only stockGate metadata, consume it during enrichment, & reject leaks before
  emit. Keep canonical source sorting compatible with the previous visibility-key ordering.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-pipeline-stage-boundaries.md#decision
relationships: []
---

# Pipeline stage boundaries

## Context

Issue [mrh-is/mistria-fyi-private#416](https://github.com/mrh-is/mistria-fyi-private/issues/416)
identified mixed stage responsibilities & two native requirement traversals. Store recipe sources
reused final visibility as temporary extraction metadata.

## Decision

Separate parse, extract, acquisition, enrich, localize, & emit stages. Traverse native requirements
once, retaining independent acquisition & spoiler leaf policies to preserve existing output. Use
pipeline-only stockGate metadata, consume it during enrichment, & reject leaks before emit. Keep
canonical source sorting compatible with the previous visibility-key ordering.

## Alternatives

Deriving spoiler visibility entirely from availability would change negative, dating, perk, animal,
calendar, & cutscene behavior. Adding stockGate to the public Source type would expose a transient
phase concern to the app.

## Revisit if

The product deliberately changes spoiler policy, or pipeline intermediate representations become a
separately versioned public API.
