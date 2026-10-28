---
id: 2026-10-13-no-implicit-dependency-installs
status: needs-review
summary: >-
  `pnpm-workspace.yaml` sets `verifyDepsBeforeRun: error`: `pnpm run` & `pnpm exec` fail on absent
  or stale dependencies instead of installing them. Installation happens only through `pnpm install
  --frozen-lockfile` or `node scripts/setup-worktree.ts`. The commands that must run before
  dependencies exist, the machine doctor & worktree setup, lose their pnpm scripts and are invoked
  with `node` directly, which also makes the doctor check the shell's real runtime.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-13-no-implicit-dependency-installs.md#decision
relationships: []
---

# No implicit dependency installs

## Context

The read-only diagnostic, `pnpm run machine:doctor`, installed 482 packages & ran `prepare` before
the doctor started (#58). pnpm 11 defaults `verifyDepsBeforeRun` to `install`, so any `pnpm run` or
`pnpm exec` in a worktree without current dependencies installs them first. Running through pnpm
also substitutes the `devEngines` runtime (Node 24.21.0) for the shell's own Node, so the doctor
reported a Node 26 agent shell as healthy.

## Decision

`pnpm-workspace.yaml` sets `verifyDepsBeforeRun: error`: `pnpm run` & `pnpm exec` fail on absent or
stale dependencies instead of installing them. Installation happens only through
`pnpm install --frozen-lockfile` or `node scripts/setup-worktree.ts`. The commands that must run
before dependencies exist, the machine doctor & worktree setup, lose their pnpm scripts and are
invoked with `node` directly, which also makes the doctor check the shell's real runtime.

## Alternatives

1. **Keep `install` & document the side effect:** rejected; a diagnostic that installs & runs
   lifecycle scripts violates the stop-and-report policy for agents.
2. **`verifyDepsBeforeRun: warn` or `prompt`:** rejected; a warning scrolls past agents, & a prompt
   blocks non-interactive shells.
3. **Keep the pnpm scripts & bypass the check per command
   (`pnpm --config.verify-deps-before-run=false run …`):** rejected; the bypass is easy to forget &
   still runs the doctor on the wrong Node.

## Revisit if

pnpm changes how `verifyDepsBeforeRun` treats lifecycle scripts or `devEngines` runtimes, or the
error setting forces routine reinstalls that cost more than the silent installs it prevents.
