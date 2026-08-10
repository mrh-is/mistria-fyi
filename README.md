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

The app is powered by `tracker-data.json`, generated from the game's TOML data files. The pipeline
lives in `pipeline/` and runs via `tsx`. A checked-in fixture at `pipeline/input/assets/` contains
the v1.0.2 game data (295 TOML files).

### Running the pipeline

```bash
pnpm run pipeline -- input/assets
```

You can also pass a different assets directory for local comparison (e.g. a newer game version).

Output:
- `pipeline/output/tracker-data.json` — pretty-printed (for debugging)
- `src/lib/data/tracker-data.json` — minified (committed, used by the app)

### When a new game version drops

1. Get the new assets directory containing a `fiddle/` folder of TOML files
2. Run `pnpm run pipeline -- /path/to/new/assets`
3. Compare output, then replace the checked-in fixture if the data looks correct
4. Commit the updated `src/lib/data/tracker-data.json`

### Pipeline architecture

```
assets/fiddle/*.toml (295 TOML files, directory-walked)
    |
    v
parse-fiddle.ts     Walk directory tree, merge into nested object
    |
    v
evaluate.ts         Resolve value expressions (self.recipe * N, item.store * N)
    |
    v
extractors/*.ts     10 extractors (museum, almanac, animals, npcs, cosmetics,
    |               skills, renown, quests, mines, sources) + quest-gates
    v
tracker-data.json   ~560KB minified, typed via src/lib/types/tracker-data.ts
```

## Scripts

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `pnpm run dev`      | Start dev server                          |
| `pnpm run build`    | Production build (Cloudflare Pages)       |
| `pnpm run preview`  | Preview production build locally          |
| `pnpm run check`    | SvelteKit type checking                   |
| `pnpm run lint`     | Prettier + ESLint                         |
| `pnpm run lint:fix` | Auto-fix formatting and lint issues       |
| `pnpm run pipeline -- input/assets` | Generate tracker-data.json from TOML fixture |

## Tech stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)
