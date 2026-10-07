# Pipeline stage boundaries

## Context

Issue #416 identified mixed stage responsibilities & two native requirement traversals. Store recipe
sources reused final visibility as temporary extraction metadata.

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
