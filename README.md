# Harvest Helper

A mobile-first companion tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/). Helps
completionists track progress toward 100%.

## Quick start

```bash
pnpm install
pnpm run dev
```

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
| `pnpm run pipeline -- /path/to/assets` | Generate tracker-data.json from local TOML assets |

## Tech stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)
