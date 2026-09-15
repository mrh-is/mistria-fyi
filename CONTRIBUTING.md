# Contributing — Mistria Field Guide

## Task Workflow

All work is tracked via [GitHub Issues](https://github.com/mrh-is/mistria-fyi/issues). New tasks go
in GitHub Issues.

### Issue lifecycle

1. **Create an issue** — include enough context that someone unfamiliar with the codebase can act on
   it (what, where, why, acceptance criteria).
2. **Label it** — apply a `status:` label and a `type:` label. Add an `area:` label if the change is
   scoped to one subsystem.
3. **Work it** — create a branch (`<issue-number>-<short-description>`), make changes, open a PR
   that references the issue (`Closes #N`).
4. **Merge** — squash merge to `main`.

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

`<issue-number>-<short-description>` — e.g., `23-npc-hearts-center`.

## Project Overview

Mobile-first PWA tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/) 100% completion.
SvelteKit 2 + Svelte 5 (runes), Tailwind 4, shadcn-svelte, deployed to Cloudflare Pages.

### Key directories

| Path                    | What                                                                    |
| ----------------------- | ----------------------------------------------------------------------- |
| `src/routes/(category)` | 9 category pages (almanac, animals, cosmetics, mines, museum...)        |
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

| Command                                | What                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `pnpm run dev`                         | Dev server                                            |
| `pnpm run build`                       | Production build (Cloudflare Pages)                   |
| `pnpm run check`                       | SvelteKit type checking                               |
| `pnpm run lint`                        | Prettier + ESLint                                     |
| `pnpm run lint:fix`                    | Auto-fix lint issues                                  |
| `pnpm run test`                        | Complete Vitest suite                                 |
| `pnpm run test:app`                    | App tests (`src/`)                                    |
| `pnpm run test:pipeline`               | Pipeline tests (`pipeline/`)                          |
| `pnpm run pipeline -- /path/to/assets` | Regenerate `tracker-data.json` from local TOML assets |

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## Code Conventions

- **TypeScript**: `strictTypeChecked` ESLint + `strict: true` tsconfig. Use `type` imports
  (`consistent-type-imports`).
- **Formatting**: Prettier — double quotes, no tabs, trailing commas, 100 char width, semicolons.
- **Imports**: Auto-sorted by `perfectionist/sort-imports` — externals first, then `$lib`/`$app`,
  then relative.
- **Svelte**: Use `let` (not `const`) for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming**: `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- **Components**: Extract when a component has its own state/concern OR is reused. Pages should be
  layout compositors. Colocate page-specific components in the route directory; move to
  `$lib/components/` when shared.
- **shadcn-svelte**: Vendored in `src/lib/components/ui/` — do not manually edit these.

## Pipeline

The app is powered by `tracker-data.json`, generated from locally supplied game TOML assets. See the
[pipeline guide](pipeline/README.md) for the current pipeline contracts. Extractor work requires
locally supplied assets for integration regeneration. When relevant assets are available, run
`pnpm exec vitest run pipeline/`, `pnpm run pipeline -- /path/to/assets`, `pnpm run check`, and
`pnpm run lint`, then commit the updated `src/lib/data/tracker-data.json`.
