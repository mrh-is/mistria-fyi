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

## Alternatives

- **Per-manager config** (`mise.toml`, fnm guidance): fixes one maintainer’s machines, still depends
  on shell activation, and does nothing for Codex cloud.
- **Tighter `engines` with `engine-strict`:** pnpm checks `engines` against the `devEngines`
  runtime, so it adds nothing once pnpm supplies Node, and alone it only turns the mismatch into a
  failure.
- **Reading the version from `package.json` only:** would drop `.node-version`, which `setup-node`,
  mise, fnm, and the cloud setup script already read.

## Revisit if

- `setup-node` or the version managers read `devEngines.runtime`, making `.node-version` redundant.
- pnpm drops or changes `devEngines.runtime` downloads, or Dependabot can’t update the lockfile
  entry.
- A bare-`node` entry point becomes common enough that agents bypass the pinned runtime in practice.
