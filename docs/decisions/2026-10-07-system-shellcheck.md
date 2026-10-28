---
id: 2026-10-07-system-shellcheck
status: needs-review
summary: >-
  Use the system ShellCheck binary for shell linting, provisioned through the platform package
  manager. The historical shell-script entry point is not a current implementation assertion.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-07-system-shellcheck.md#decision
relationships: []
---

# System ShellCheck over the npm wrapper

## Context

[mrh-is/mistria-fyi-private#674](https://github.com/mrh-is/mistria-fyi-private/issues/674) added the
`shellcheck` npm package so local, cloud, & CI runs shared one ShellCheck version. That wrapper
pulls in `decompress@4`, old `file-type` releases, & `sprintf-js@1.1.3`, which carry seven
Dependabot alerts (two critical). `decompress` & `sprintf-js` have no patched release, and
`file-type` can't be overridden without breaking `decompress@4`. The package's npm page also links
to a GitHub repository that doesn't exist.

## Decision

`pnpm run lint:shell` runs `scripts/lint-shell.sh`, which uses the system `shellcheck` and fails
with an install hint when it's missing. Locally that's Homebrew, CI uses the copy preinstalled on
`ubuntu-latest`, and `scripts/setup-cloud-agent.sh` installs it with apt.

## Alternatives

- **Keep the wrapper & dismiss the alerts:** leaves unpatched criticals in the lockfile and depends
  on a package with no visible source.
- **Download a pinned, checksum-verified release:** keeps one version everywhere but adds a download
  script to maintain for a linter whose output barely varies between releases.
- **`shellcheck-wasm`:** a month old, no repository, & no CLI.

## Revisit if

Version drift between machines causes ShellCheck findings that differ between local runs & CI, or a
maintained npm distribution with a clean dependency tree appears.
