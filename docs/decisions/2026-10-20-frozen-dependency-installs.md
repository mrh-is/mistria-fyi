# Frozen dependency installs

## Context

Harness-created worktrees can lack dependencies even when the machine has the required runtime &
package manager. The tooling-failure rule stopped work until the owner approved the repository’s
documented frozen install. Issue #154 records the recurring setup friction; the owner authorized a
standing permission during the PR #179 repair.

## Decision

Agents may run `pnpm install --frozen-lockfile` for absent or stale project dependencies without
additional approval. They must use the configured external store & preserve the lockfile. A failed
frozen install still invokes the tooling-failure procedure.

## Alternatives

Requiring approval for each frozen install repeats an already authorized setup decision. Allowing
arbitrary dependency repair would also authorize dependency changes, configuration changes, or
authentication steps, which remain outside this permission.

## Revisit if

The installation procedure changes, or a frozen install requires an additional consequential action
beyond restoring the project’s locked dependencies.
