---
id: 2026-10-31-bounded-feedback-progress
status: current
summary: >-
  Keep small feedback progress attachments detailed. Summarize oversized provenance by field &
  source, then the largest collections by entry count, within a shared 32 KiB budget.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/339
  - src/lib/feedback/progress-attachment.ts
relationships: []
---

# Bound feedback progress attachments

## Context

A local late-game save produces a progress attachment larger than the API’s 50 KiB input limit.
Removing per-fact provenance alone still leaves too much data. Feedback issues must also fit
GitHub’s 65,536-byte body budget alongside the message & optional sync log.

## Decision

Project only the fields classified for public feedback, then fit the compact JSON to 32 KiB. Keep
small attachments unchanged by size handling. For larger attachments, replace provenance with counts
by progress field & source first, because it holds most of the repeated detail. Then replace the
largest remaining collections with their entry counts until the attachment fits. Each replacement
carries `summarized: true` & `count`, so the reader can see what was summarized.

The preview, submitted payload, & API use the same function. Re-projecting a summary preserves only
its selected count fields. The API’s 50 KiB input & 100 KiB payload limits stay unchanged; older
clients sending attachments above the input limit still need to reload the app.

The budget leaves room for an ASCII message at the API’s maximum length & a full 24 KiB sync log.
Messages with more UTF-8 bytes can still require the existing, owner-approved omission of older sync
events. Every published event remains part of the preview, & the issue reports omissions.

## Alternatives

- Raising input limits does not solve GitHub’s body limit.
- Removing provenance alone still leaves the measured late-game progress over the input limit.
- Always summarizing would discard useful small-farm detail unnecessarily.
- Summarizing only on the server would make the published progress differ from the preview.

## Revisit if

New progress types no longer fit after collection summaries, the sync-log or message budget grows,
or diagnosing feedback requires individual facts that the bounded summary removes.
