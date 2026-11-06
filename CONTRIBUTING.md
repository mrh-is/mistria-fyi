# Contributing — Mistria Field Guide

## Task Workflow

All work is tracked via [GitHub Issues](https://github.com/mrh-is/mistria-fyi/issues). New tasks go
in GitHub Issues.

### Issue lifecycle

1. **Create an issue.** Include enough context that someone unfamiliar with the codebase can act on
   it: what, where, why, & acceptance criteria.
2. **Label it.** Apply a `status:` label & a `type:` label, plus an `area:` label if the change is
   scoped to one subsystem. The [label page](https://github.com/mrh-is/mistria-fyi/labels) describes
   each one.
3. **Work it.** Create a branch (see [branch naming](#branch-naming)), make changes, and open a PR
   that references the issue: `Closes #N`, or `Refs #N` when work remains after the merge.
4. **Merge.** PRs squash-merge to `main`, which is the only merge method the repository allows. The
   PR title becomes the commit title.

### Branch naming

`<issue-number>-<short-description>`, e.g. `23-npc-hearts-center`; `pnpm run worktree:new` creates
this form. Agent harness branches such as `claude/issue-23-a1b2c3` or `codex/…` are also accepted.
Worktrees are optional; see [Worktrees](AGENTS.md#worktrees).

## Using AI agents

Agents are welcome. Claude Code and Codex both read [AGENTS.md](AGENTS.md) (Claude through
`CLAUDE.md`), which links the on-demand guides in `docs/agent-*.md`. The repo also ships shared
agent config: `.claude/settings.json` and `.codex/rules/` allow the project’s `pnpm` scripts and
deny other package managers. A `permissions.deny` rule in `.claude/settings.json` keeps Claude
Code’s file tools from editing the generated tracker data.

Agent-authored commits use a stable product identity in a `Co-Authored-By` trailer, such as
`Co-Authored-By: Codex <codex@openai.com>`. The “Guarded paths” check requires a label for changes
to generated files. Keep personal agent settings (models, delegation, review habits, & session
limits) in your own user config. Keep personal per-repo settings in `.claude/settings.local.json` or
`CLAUDE.local.md`, both gitignored.

## Project Overview

Mobile-first PWA tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/) 100% completion.
SvelteKit 3 + Svelte 5 (runes), Tailwind 4, shadcn-svelte, deployed to Cloudflare Pages.

### Key directories

| Path                    | What                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `src/routes/(category)` | 10 category pages (almanac, animals, cosmetics, mines, museum, …)       |
| `src/lib/engine/`       | Pure functions: availability, progress, search, save import             |
| `src/lib/stores/`       | Reactive state via `$state`/`$derived` runes; persisted to localStorage |
| `src/lib/components/`   | Shared components; `ui/` began as shadcn-svelte & is now ours           |
| `src/lib/types/`        | Branded ID types shared between pipeline and app                        |
| `src/lib/data/`         | Static import of generated `tracker-data.json`                          |
| `pipeline/`             | Separate TS project: game data → `tracker-data.json`                    |

## Developer Workflow

For the full task lifecycle, verification matrix, and worktree mechanics, see
[docs/development-workflow.md](docs/development-workflow.md). For architecture boundaries, data
contracts, and state management rules, see [docs/app-architecture.md](docs/app-architecture.md).

## Commands

See the command table in the [command reference](docs/agent-reference.md#package-commands).

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Code Conventions

[AGENTS.md](AGENTS.md#architecture-boundaries) defines architecture boundaries & component
extraction rules; [agent-reference.md](docs/agent-reference.md#code-conventions) defines code style.
Styling rules live in [docs/styling.md](docs/styling.md).

## Pipeline

The app is powered by `tracker-data.json`, generated from locally supplied game TOML assets. See the
[pipeline guide](pipeline/README.md) for the current pipeline contracts. Extractor work requires
locally supplied assets for integration regeneration. During development, run the affected colocated
test with `pnpm exec vitest run pipeline/src/path/to/module.test.ts`. At commit-ready, follow
[agent-verification.md](docs/agent-verification.md#full-verification) for the full-matrix exception,
real-asset tests, & pipeline regeneration. Commit reviewed generated changes, preserving
[the game version protocol](docs/game-version-update-protocol.md).
