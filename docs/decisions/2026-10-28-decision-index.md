---
id: 2026-10-28-decision-index
status: current
summary: >-
  Headers own applicability metadata; lint validates the readable index & JSON projection.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/268
  - https://github.com/mrh-is/mistria-fyi/issues/268#issuecomment-6472487942
  - scripts/decision-index.ts
relationships: []
---

# Decision applicability metadata

## Context

[Issue #268](https://github.com/mrh-is/mistria-fyi/issues/268) found stale applicability references
in historical decisions. Its
[owner comment](https://github.com/mrh-is/mistria-fyi/issues/268#issuecomment-6472487942) selects
metadata in each record’s header, with a generated readable index.

## Decision

Keep stable IDs, statuses, applicability summaries, evidence, & forward amendment/supersession
relationships in YAML frontmatter. Derive paths & titles from the records, and generate
`docs/decision-index.md` from those headers. Expose the same inventory as JSON through
`pnpm run decisions -- --json`.

Validate coverage, unique IDs, local evidence paths, relationship targets, status/scope consistency,
& acyclic links through the existing lint path. Remote GitHub evidence is syntax-checked without
requiring network access. Applicability & authorization remain evidence judgments; the check cannot
establish them.

Seed unverified records as “needs-review” with explicit questions. Reconcile demonstrated changes
with narrow annotations, preserving historical reasoning. Qualify private-archive references
discovered during seeding; do not introduce a general bare-number lint rule from this initial scan.

## Alternatives

A separately maintained inventory would duplicate the decision directory & drift when a record is
added. Treating every unannotated record as current would silently assert an audit that has not
happened. Rewriting old reasoning would obscure why a replacement was necessary.

## Revisit if

Another consumer needs a different export format, or repeated metadata failures demonstrate a gap in
the focused validator.
