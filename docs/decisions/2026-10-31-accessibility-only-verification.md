---
id: 2026-10-31-accessibility-only-verification
status: current
summary: >-
  Accessibility-only changes with unchanged visible UI need focused accessibility tests instead of
  visual checks or screenshots.
evidence:
  - AGENTS.md
  - docs/agent-verification.md
  - https://github.com/mrh-is/mistria-fyi/pull/318
relationships: []
---

# Accessibility-only verification

## Context

The variant-label fix (#308) changes checkbox accessible names without changing the visible UI. The
existing verification rule required visual checks for every Svelte edit, which led to screenshots
that couldn’t show whether the fix worked. Michael requested a reminder to verify screen-reader
changes through their accessibility behavior.

## Decision

Accessibility-only changes don’t need visual checks or screenshots when visible content, layout,
focus behavior, & interactions stay unchanged. Focused tests verify the affected accessible names,
roles, states, & behavior instead.

## Alternatives

Requiring screenshots for every Svelte edit adds work without proving an accessible-name change.
Exempting all accessibility work would be too broad, since keyboard focus or visible-content changes
still need visual verification.

## Revisit if

A change affects both accessibility behavior & visible UI, or a visual regression shows that the
exemption’s unchanged-UI condition is insufficient.
