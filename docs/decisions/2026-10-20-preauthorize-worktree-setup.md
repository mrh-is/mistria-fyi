---
id: 2026-10-20-preauthorize-worktree-setup
status: current
summary: >-
  Standard isolated worktree setup is preauthorized; setup failures still require stop & report.
evidence:
  - AGENTS.md
relationships: []
---

# Preauthorize standard worktree setup

## Context

Fresh harness-created worktrees can lack dependencies & `.worktreeinclude` links. The
tooling-failure rule previously stopped agents at this expected state, requiring repeated approval
for the documented setup command (#154). The maintainer requested standing authorization for that
command.

## Decision

Agents may run `node scripts/setup-worktree.ts` inside an isolated harness-created worktree when
dependencies or included links are absent, including after a missing-dependency preflight failure.
The command uses the frozen lockfile, configured global pnpm store, & isolated dependency
directories. Required sandbox access still follows harness approval rules. Setup failures & other
tooling failures retain the stop-and-report requirement.

## Alternatives

- Ask before every standard initialization: rejected because expected worktree setup needs no new
  direction.
- Authorize arbitrary environment repairs or shared dependencies: rejected because this permission
  covers only the documented isolated setup command.

## Revisit if

The harness initializes these resources automatically, or the setup command’s responsibilities
change.
