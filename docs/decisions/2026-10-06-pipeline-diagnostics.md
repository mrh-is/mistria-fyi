# Pipeline diagnostic policy

## Context

Pipeline extraction warnings could silently omit recipe sources, almanac data, or acquisition
mappings after game updates. Reviewed overrides could also lose their target without failing the run
(#407).

## Decision

Pass one run-scoped diagnostic collector through affected extractors & collectors, then validate it
before serialization or publication. Standalone callers validate a private collector before
returning. Every exception matches the full diagnostic kind, field path, target ID, & message, with
an explicit reason & real-asset evidence. Missing reviewed targets & obsolete overrides cannot be
allowlisted; exceptions no longer observed fail as obsolete.

Void Herb’s native biome-less forageable tag is the initial exception because an existing reviewed
acquisition override supplies its Mines source. Beta localization fallback remains a separate
policy.

## Alternatives

Immediate warning-by-warning throws would hide later findings in the same run. A module-global
collector would leak diagnostics between independent calls. Broad kind-level suppressions would
permit unrelated new omissions, & retaining unused exceptions would conceal upstream fixes.

## Revisit if

A pipeline stage is independently runnable & must publish partial results, or source metadata makes
an exact exception unstable for reasons unrelated to its underlying finding. Any replacement must
preserve fatal missing-target checks & evidence for each accepted data-quality exception.
