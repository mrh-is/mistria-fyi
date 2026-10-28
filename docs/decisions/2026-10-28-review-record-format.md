---
id: 2026-10-28-review-record-format
status: current
summary: >-
  Shared review IDs & dispositions are repository guidance; aggregation tooling remains deferred.
evidence:
  - docs/agent-verification.md
  - https://github.com/mrh-is/mistria-fyi/pull/273
relationships: []
---

# Review record format

## Context

Issue [#267](https://github.com/mrh-is/mistria-fyi/issues/267) identifies a survey problem: raw
severity counts mix fixed defects, refuted claims, accepted risks, deferred work, & unresolved
findings. The
[owner’s scope correction](https://github.com/mrh-is/mistria-fyi/issues/267#issuecomment-6472487516)
calls for stable finding IDs & explicit resolution dispositions, deferring aggregation tooling.

## Decision

Define one shared format in [Review records](../agent-verification.md#review-records), using the
existing review threads rather than a separate ledger. IDs persist across reposts & re-reviews;
resolution replies distinguish fixed, refuted, accepted risk, & deferred, with supporting evidence.
Without a supported resolution, a finding remains unresolved. Repository-wide record semantics
belong in the repository reference; maintainer-specific posting & review-routing policy stays in the
personal overlay.

Defer the collector, validator, synthetic fixture suite, separate reviewer-provenance schema, &
historical aggregation demonstration. Preserve original historical text; append evidence-backed
mappings only when needed, without treating unstructured records as settled dispositions.

## Alternatives

The original collector & normalization infrastructure is disproportionate to a single survey.
Keeping the shared format only in a personal overlay would leave other contributors unable to
discover it. A second ledger would duplicate existing review records & risk divergent resolutions.

## Revisit if

A second survey demonstrates that the shared format is insufficient for aggregation without
executable extraction or validation. Define the demonstrated gap before adding tooling.
