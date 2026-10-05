# Mistria Field Guide

[![CI](https://github.com/mrh-is/mistria-fyi/workflows/CI/badge.svg)](https://github.com/mrh-is/mistria-fyi/actions/workflows/ci.yml)

A mobile-first companion tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/). Helps
completionists track progress toward 100%.

> **This is an independent, unofficial, noncommercial fan project.** It is not produced, endorsed,
> supported, sponsored, or affiliated with [NPC Studio](https://www.npcstudio.com/). “Fields of
> Mistria” and related marks belong to NPC Studio. See [DISCLAIMER.md](DISCLAIMER.md) for the full
> notice.

## Quick start

```bash
pnpm install
pnpm run dev
```

Satoshi is a proprietary Fontshare font and is not distributed through this source repository. The
app uses the project’s self-hosted production copy by default. For exact typography without a
network connection, download Satoshi directly from Fontshare and install it locally. See
[docs/font-assets.md](docs/font-assets.md) for contributor and deployment setup.

## Developer docs

- [CONTRIBUTING.md](CONTRIBUTING.md) — conventions, architecture, & code style
- [docs/development-workflow.md](docs/development-workflow.md) — setup, worktrees, verification
- [docs/app-architecture.md](docs/app-architecture.md) — data contracts, state, persistence,
  composition
- [docs/accessibility-testing.md](docs/accessibility-testing.md) — automated checks & release matrix
- [docs/testing-inventory.md](docs/testing-inventory.md) — which test layer covers each component
- [docs/font-assets.md](docs/font-assets.md) — proprietary font boundary and Cloudflare setup
- [pipeline/README.md](pipeline/README.md) — pipeline contracts & extractor details

## Data pipeline

The app is powered by `tracker-data.json`, generated from locally supplied Fields of Mistria TOML
assets. The pipeline lives in `pipeline/` and runs via `tsx`. Original game data files and local
pipeline inputs are not checked in. This private repository currently includes the generated tracker
dataset and selected extracted icons used by the deployed app; those materials are excluded from the
project license. See the [pipeline guide](pipeline/README.md) for setup, contracts, & extractor
details.

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
| `pnpm run lint`                        | oxfmt + oxlint + ESLint + Stylelint               |
| `pnpm run lint:fix`                    | Auto-fix formatting and lint issues               |
| `pnpm run test`                        | Complete Vitest suite                             |
| `pnpm run test:changed`                | Vitest tests affected by branch changes           |
| `pnpm run test:accessibility`          | Complete browser accessibility matrix             |
| `pnpm run test:accessibility:critical` | Focused browser accessibility contract            |
| `pnpm run test:app`                    | App tests (`src/`)                                |
| `pnpm run test:pipeline`               | Pipeline tests (`pipeline/`)                      |
| `pnpm run pipeline -- /path/to/assets` | Generate tracker-data.json from local TOML assets |

## Tech stack

- SvelteKit 3 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)

## License & legal

Project-authored source code is licensed under [GPL-3.0-only](LICENSE). The license does not cover
NPC Studio material or other third-party assets. See:

- [COPYRIGHT.md](COPYRIGHT.md) — what the project license covers (and what it does not)
- [DISCLAIMER.md](DISCLAIMER.md) — unofficial fan-project and trademark notice
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — bundled font licenses
- [SECURITY.md](SECURITY.md) — vulnerability reporting
