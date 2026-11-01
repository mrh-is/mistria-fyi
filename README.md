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

New machine? Install the prerequisites in [docs/machine-setup.md](docs/machine-setup.md) first
(Node, pnpm, ShellCheck, & the GitHub CLI), and run `node scripts/machine-doctor.ts` to check them.

```bash
pnpm install --frozen-lockfile
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
- [docs/testing-inventory.md](docs/testing-inventory.md) — which test layer to use for a component
- [docs/font-assets.md](docs/font-assets.md) — proprietary font boundary and Cloudflare setup
- [pipeline/README.md](pipeline/README.md) — pipeline contracts & extractor details

## Data pipeline

The app is powered by `tracker-data.json`, generated from locally supplied Fields of Mistria TOML
assets. The pipeline lives in `pipeline/` and runs via `tsx`. Original game data files and local
pipeline inputs are not checked in. The repository includes the generated tracker dataset; extracted
icons are hosted separately at `assets.mistria.fyi`. These game-derived materials are excluded from
the project license. Building and testing the app does not require local game assets. See the
[pipeline guide](pipeline/README.md) for setup, contracts, & extractor details.

```bash
pnpm run pipeline -- /path/to/assets
```

## Scripts

See the command table in the [agent command reference](docs/agent-reference.md#package-commands).

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
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) — bundled font & vendored UI component licenses
- [SECURITY.md](SECURITY.md) — vulnerability reporting
