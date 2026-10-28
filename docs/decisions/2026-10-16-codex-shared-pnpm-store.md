---
id: 2026-10-16-codex-shared-pnpm-store
status: needs-review
summary: >-
  Use the machine’s shared global pnpm store across agents, shells, & worktrees. Set
  `shell_environment_policy.set.pnpm_config_store_dir` & `sandbox_workspace_write.writable_roots` in
  the user-level Codex config, with pnpm’s home as the writable root to cover the store & version
  manager. Worktree setup requires the configured store; the doctor checks its location, effective
  configuration, & writability.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-16-codex-shared-pnpm-store.md#decision
relationships: []
---

# Codex shared pnpm store

## Context

Codex previously selected a separate store under `/private/tmp` to keep pnpm’s cache outside the
repository. The global store was outside the sandbox’s writable roots; pnpm’s version manager opens
its SQLite database even for version probes, so read access failed before work could begin.

## Decision

Use the machine’s shared global pnpm store across agents, shells, & worktrees. Set
`shell_environment_policy.set.pnpm_config_store_dir` & `sandbox_workspace_write.writable_roots` in
the user-level Codex config, with pnpm’s home as the writable root to cover the store & version
manager. Worktree setup requires the configured store; the doctor checks its location, effective
configuration, & writability.

## Alternatives

A separate store under `/private/tmp` duplicates every package, can be wiped on reboot, &
contradicts the global agent guide’s shared-store rule. A repository-local store also violates the
cache boundary. Neither is a fallback for missing sandbox access.

## Revisit if

Revisit this decision if Codex’s sandbox stops honoring user-level `writable_roots`, or the
permission-profile system replaces that setting.
