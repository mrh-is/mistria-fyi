# Contributing — Mistria Field Guide

## Task Workflow

All work is tracked via [GitHub Issues](https://github.com/mrh-is/mistria-fyi/issues). New tasks go
in GitHub Issues.

### Issue lifecycle

1. **Create an issue** — include enough context that someone unfamiliar with the codebase can act on
   it (what, where, why, acceptance criteria).
2. **Label it** — apply a `status:` label and a `type:` label. Add an `area:` label if the change is
   scoped to one subsystem.
3. **Work it** — create a branch (see [branch naming](#branch-naming)), make changes, and open a PR
   that references the issue (`Closes #N`).
4. **Merge** — merge to `main` with a merge commit. The repository allows only merge commits, so a
   branch’s individual commits stay in history.

### Labels

Status labels track where an issue is in its lifecycle:

| Label                    | Meaning                                                      |
| ------------------------ | ------------------------------------------------------------ |
| `status: ready`          | Triaged and ready to be picked up                            |
| `status: in progress`    | Actively being worked on                                     |
| `status: blocked`        | Waiting on an external dependency                            |
| `status: needs decision` | Requires a product, UX, or architecture decision before work |

Type labels describe the kind of change:

| Label               | Meaning                                          |
| ------------------- | ------------------------------------------------ |
| `type: bug`         | Something isn't working correctly                |
| `type: enhancement` | New feature or improvement                       |
| `type: maintenance` | Repository, release, verification, or operations |

Area labels scope the change to a subsystem:

| Label            | Meaning                          |
| ---------------- | -------------------------------- |
| `area: pipeline` | Data extraction pipeline changes |
| `area: ui`       | Frontend / visual changes        |

### Branch naming

`<issue-number>-<short-description>`, e.g. `23-npc-hearts-center`; `pnpm run worktree:new` creates
this form. Agent harness branches such as `claude/issue-23-a1b2c3` or `codex/…` are also accepted.
Worktrees are optional; see [Worktrees](AGENTS.md#worktrees).

## Using AI agents

Agents are welcome. Claude Code and Codex both read [AGENTS.md](AGENTS.md) (Claude through
`CLAUDE.md`), which links the on-demand guides in `docs/agent-*.md`. The repo also ships shared
agent config: `.claude/settings.json` and `.codex/rules/` allow the project’s `pnpm` scripts and
deny other package managers, and a Claude Code hook guards generated & vendored files.

CI enforces a few things for agent-authored work. The “Attribution” check rejects non-canonical
agent `Co-Authored-By` trailers and requires a final `Agent:` line & exactly one matching `agent:*`
label on agent-authored PRs. The “Guarded paths” check requires a label for changes to generated or
vendored files. Everything else about how you run agents (models, delegation, review habits, session
limits) belongs in your own user config, not in this repo. Keep personal per-repo settings in
`.claude/settings.local.json` or `CLAUDE.local.md`, both gitignored.

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
| `src/lib/components/`   | Shared components; `ui/` is vendored shadcn-svelte (don't edit)         |
| `src/lib/types/`        | Branded ID types shared between pipeline and app                        |
| `src/lib/data/`         | Static import of generated `tracker-data.json`                          |
| `pipeline/`             | Separate TS project: game data → `tracker-data.json`                    |

## Developer Workflow

For the full task lifecycle, verification matrix, and worktree mechanics, see
[docs/development-workflow.md](docs/development-workflow.md). For architecture boundaries, data
contracts, and state management rules, see [docs/app-architecture.md](docs/app-architecture.md).

## Commands

See the command table in the [agent command reference](docs/agent-reference.md#package-commands).

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
