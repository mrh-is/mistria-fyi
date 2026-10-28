---
id: 2026-10-07-codex-model-preferences
status: needs-review
summary: >-
  Leave the model & reasoning effort unpinned in `.codex/config.toml`, so Codex uses the user's
  configured preferences or an explicit session override. Keep the existing approval, sandbox, &
  network settings. The delegation guide describes task routing without establishing a project
  default model.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-07-codex-model-preferences.md#decision
relationships: []
---

# Inherit Codex model preferences

## Context

The project pinned Codex to GPT-5.6 Terra with medium reasoning effort, overriding the user's
configured preferences. The maintainer removed those settings from the local project config and
requested that change be merged.

## Decision

Leave the model & reasoning effort unpinned in `.codex/config.toml`, so Codex uses the user's
configured preferences or an explicit session override. Keep the existing approval, sandbox, &
network settings. The delegation guide describes task routing without establishing a project default
model.

## Alternatives

Pin a newer model or another reasoning effort in the project config: rejected because that would
continue overriding personal preferences and require updates as model availability changes.

## Revisit if

A repository workflow requires a specific model or reasoning effort for reproducible behavior.
