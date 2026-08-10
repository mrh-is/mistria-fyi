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
assets. The pipeline lives in `pipeline/`, runs via `tsx`, and expects an assets root that contains a
`fiddle/` directory. Game assets are ignored by Git and are not present in a fresh clone. See the
[pipeline guide](pipeline/README.md) for the maintained contracts & extractor details.

### Running the pipeline

```bash
pnpm run pipeline -- /path/to/assets
MISTRIA_ASSETS=/path/to/assets pnpm run pipeline
```

`--parse-only` stops after parsing, but it is a version-specific v1.0.2 smoke test: it requires 295
non-metadata TOML files and three representative paths. It is not a general validator for newer
asset versions.

### Artifacts

- `pipeline/output/tracker-data.json`, pretty diagnostic output.
- `pipeline/output/tracker-data-readable.json`, duplicate pretty diagnostic output.
- `pipeline/output/fiddle-readable.json`, the parsed & evaluated namespace tree for inspection.
- `src/lib/data/tracker-data.json`, minified committed app data.

### When a new game version drops

1. Get the new assets directory containing a `fiddle/` folder of TOML files
2. Run `pnpm run pipeline -- /path/to/new/assets`
3. Compare the generated artifacts
4. Commit the updated `src/lib/data/tracker-data.json`

### Pipeline architecture

```
assets root/fiddle/*.toml (directory-walked)
    |
    v
parse-fiddle.ts     Walk directory tree, merge into nested object, record provenance
    |
    v
evaluate.ts         Resolve supported value expressions in place
    |
    v
extractors/*.ts     Parse requirements during source extraction; project domains
    |               & preserve direct-reward quest gates
    v
main.ts             Attach quest gates & assemble TrackerData
    |
    v
tracker-data.json   Typed via src/lib/types/tracker-data.ts
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
| `pnpm run pipeline -- /path/to/assets` | Generate tracker-data.json from local TOML assets |

## Tech stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)
