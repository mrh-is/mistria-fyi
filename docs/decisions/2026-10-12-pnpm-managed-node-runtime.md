---
id: 2026-10-12-pnpm-managed-node-runtime
status: needs-review
summary: >-
  Historical scope: pnpm-managed Node runtime. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-12-pnpm-managed-node-runtime.md#decision
relationships: []
---

# pnpm-managed Node runtime

## Context

`.node-version` pinned 24.21.0, but agent shells on macOS (mise) and Windows (fnm) resolved Node
26.5.0 (#16). Both managers activate through interactive-shell hooks that agent shells never run,
and mise ignores `.node-version` unless idiomatic version files are enabled. Codex cloud couldn’t
replace its image’s Node at all, so it trailed the pin by a few patch releases.

## Decision

`package.json` declares `devEngines.runtime` (`name: node`, `onFail: download`) with
`.node-version`’s release. `pnpm install` downloads that release, checksummed per platform in
`pnpm-lock.yaml`, into the pnpm store and links it into `node_modules/.bin`, so every `pnpm run`,
`pnpm exec`, and package binary uses it on Windows, macOS, Linux, and both cloud images.
`.node-version` stays the source of truth for CI’s `setup-node`, the Claude cloud setup script, and
local version managers; `tests/ci-workflow.isolated.test.ts` fails when `devEngines` disagrees with
it. CI and the Claude cloud setup keep installing the pinned Node on `PATH`, because bare `node`
calls (workflow steps, Claude hooks) don’t go through pnpm.

A bare `node` outside pnpm would still run the shell’s release silently, so every repository entry
point imports `scripts/lib/require-pinned-node.ts` first; it exits with a pointer to `pnpm run` or
`pnpm exec node` on any other release. `scripts/lib/pinned-node.test.ts` derives the entry points
from `package.json`, the workflows, the Git hooks, the shell scripts, and the agent hook configs,
and fails when one lacks the guard. The commit-msg hook runs through `pnpm exec node`. The Claude
PreToolUse edit guard is exempt: it runs on every edit, possibly before dependencies exist, and a
failure there would disable the guard rather than surface a version problem.

## Alternatives

- **Per-manager config** (`mise.toml`, fnm guidance): fixes one maintainer’s machines, still depends
  on shell activation, and does nothing for Codex cloud.
- **Agent command rules** (a Claude Bash hook or Codex `prefix_rule` rejecting bare `node`): cover
  only agents, miss humans and scripts, and can’t see through compound commands reliably.
- **Tighter `engines` with `engine-strict`:** pnpm checks `engines` against the `devEngines`
  runtime, so it adds nothing once pnpm supplies Node, and alone it only turns the mismatch into a
  failure.
- **Reading the version from `package.json` only:** would drop `.node-version`, which `setup-node`,
  mise, fnm, and the cloud setup script already read.

## Revisit if

- `setup-node` or the version managers read `devEngines.runtime`, making `.node-version` redundant.
- pnpm drops or changes `devEngines.runtime` downloads, or Dependabot can’t update the lockfile
  entry.
- Node reads a project-level config file at startup without a flag, which could enforce the pin
  without per-entry imports.
