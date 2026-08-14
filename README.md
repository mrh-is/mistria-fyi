# Harvest Helper

A mobile-first companion tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/). Helps
completionists track progress toward 100%.

## Quick start

```bash
pnpm install
pnpm run dev
```

## Developer docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, architecture, & code style
- [docs/development-workflow.md](docs/development-workflow.md) — setup, worktrees, verification
- [docs/app-architecture.md](docs/app-architecture.md) — data contracts, state, persistence,
  composition
- [pipeline/README.md](pipeline/README.md) — pipeline contracts & extractor details

## Data pipeline

The app is powered by `tracker-data.json`, generated from locally supplied Fields of Mistria TOML
assets. The pipeline lives in `pipeline/` and runs via `tsx`. Game assets are not checked in. See
the [pipeline guide](pipeline/README.md) for setup, contracts, & extractor details.

```bash
pnpm run pipeline -- /path/to/assets
```

## Scripts

| Command                                | Description                                       |
| -------------------------------------- | ------------------------------------------------- |
| `pnpm run dev`                         | Start dev server                                  |
| `pnpm run build`                       | Production build (Cloudflare Pages)               |
| `pnpm run preview`                     | Preview production build locally                  |
| `pnpm run check`                       | SvelteKit type checking                           |
| `pnpm run lint`                        | Prettier + ESLint                                 |
| `pnpm run lint:fix`                    | Auto-fix formatting and lint issues               |
| `pnpm run test`                        | Complete Vitest suite                             |
| `pnpm run test:app`                    | App tests (`src/`)                                |
| `pnpm run test:pipeline`               | Pipeline tests (`pipeline/`)                      |
| `pnpm run pipeline -- /path/to/assets` | Generate tracker-data.json from local TOML assets |

## Tech stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)
