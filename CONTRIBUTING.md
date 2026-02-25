# Contributing — Harvest Helper

## Task Workflow

All work is tracked via [GitHub Issues](https://github.com/mrh-is/harvest-helper/issues). The
IMPLEMENTATION-GUIDE.md file is historical — new tasks go in GitHub Issues.

### Issue lifecycle

1. **Create an issue** — use the "Task" template. Include enough context that someone unfamiliar
   with the codebase can act on it (what, where, why, acceptance criteria).
2. **Label it** — `ready` means it can be picked up. `blocked` means it's waiting on something.
   `discussion` means it needs design input before work.
3. **Work it** — create a branch, make changes, open a PR that references the issue (`Closes #N`).
4. **Merge** — squash merge to `main`.

### Labels

| Label         | Meaning                                          |
| ------------- | ------------------------------------------------ |
| `ready`       | Triaged and ready to be picked up                |
| `blocked`     | Waiting on external input (art, UX decision)     |
| `discussion`  | Needs design/architecture discussion before work |
| `pipeline`    | Data extraction pipeline changes                 |
| `ui`          | Frontend / visual changes                        |
| `bug`         | Something isn't working correctly                |
| `enhancement` | New feature or improvement                       |

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

### Commands

| Command            | What                                              |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | Dev server                                        |
| `npm run build`    | Production build (Cloudflare Pages)               |
| `npm run check`    | SvelteKit type checking                           |
| `npm run lint`     | Prettier + ESLint                                 |
| `npm run lint:fix` | Auto-fix lint issues                              |
| `npm run pipeline` | Regenerate `tracker-data.json` from `fiddle.json` |

No test suite yet (Vitest installed but no tests).

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

The app is powered by `tracker-data.json` (~430KB), generated from the game's `fiddle.json`. See
[README.md](README.md) for pipeline details. When changing pipeline extractors, run
`npm run pipeline` and commit the updated `src/lib/data/tracker-data.json`.
