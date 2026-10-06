# Dependency maintenance

## Context

Bulk dependency maintenance supersedes Dependabot PR #561. Agents also need a current starting
branch before they begin work.

## Decision

Disable routine Dependabot version-update PRs for npm & GitHub Actions; retain security alerts &
security-update PRs. Batch routine upgrades with compatibility checks. Refresh the intended starting
branch before creating agent worktrees, defaulting to `main`; fetch its remote tip without modifying
the shared checkout.

Retain TypeScript 6 until SvelteKit, `svelte-check`, & the TypeScript ESLint packages support
TypeScript 7. Keep Node types on the Node 24 major used by `.node-version` & CI.

Use the latest stable pnpm 11 release. Defer pnpm 12 because its default multi-document lockfile can
hide project dependencies from GitHub security alerts
([Dependabot #15904](https://github.com/dependabot/dependabot-core/issues/15904)).

## Alternatives

Routine bot PRs add review overhead alongside bulk maintenance. Disabling security updates would
remove timely vulnerability fixes. Pulling the shared checkout from a worktree script could disrupt
local work, so the script fetches the remote branch instead.

TypeScript 7 currently fails SvelteKit setup because its compiler API is incompatible. Node 26 types
could allow APIs unavailable to the Node 24 runtime.

Suppressing pnpm 12’s environment lockfile also disables automatic package-manager version
enforcement; retain pnpm 11 instead of weakening version enforcement for local work.

## Revisit if

Routine upgrades become infrequent enough that dependencies lag, or automated compatibility checks
make routine bot PRs inexpensive to review.

Revisit the pinned compiler & package-manager majors when their upstream compatibility gaps close.
