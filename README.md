# Harvest Helper

A mobile-first companion tracker for
[Fields of Mistria](https://store.steampowered.com/app/2142790/Fields_of_Mistria/). Helps
completionists track progress toward 100%.

## Quick start

```bash
bun install
bun run dev
```

## Data pipeline

The app is powered by `tracker-data.json`, generated from the game's raw data files. The pipeline
lives in `pipeline/` and runs via [bun](https://bun.sh).

### Running the pipeline

1. Place game data files in `pipeline/input/`:
   - `fiddle.json` (required) — raw game data (~7MB)
   - `localization.json` (optional) — English strings for item/NPC names

   Source files are on Google Drive at:
   `~/Library/CloudStorage/GoogleDrive-me@mrh.is/My Drive/Development/Mistria/versions/<version>/`

2. Run:

   ```bash
   bun run pipeline
   ```

4. Output:
   - `pipeline/output/tracker-data.json` — pretty-printed (for debugging)
   - `src/lib/data/tracker-data.json` — minified (committed, used by the app)

### When a new game version drops

1. Get the new `fiddle.json` (and `localization.json` if available)
2. Drop them into `pipeline/input/`, replacing the old ones
3. `bun run pipeline`
4. Commit the updated `src/lib/data/tracker-data.json`

### Pipeline architecture

```
fiddle.json (flat slash-key format, 46K entries)
    |
    v
parse-fiddle.ts     Strip visual/audio data, convert to nested object
    |
    v
localize.ts         Resolve i18n keys to English (fallback: snake_case -> Title Case)
    |
    v
extractors/*.ts     10 extractors (museum, almanac, animals, npcs, cosmetics,
    |               skills, renown, quests, mines, sources)
    v
tracker-data.json   ~430KB minified, typed via src/lib/types/tracker-data.ts
```

## Scripts

| Command            | Description                               |
| ------------------ | ----------------------------------------- |
| `bun run dev`      | Start dev server                          |
| `bun run build`    | Production build (Cloudflare Pages)       |
| `bun run preview`  | Preview production build locally          |
| `bun run check`    | SvelteKit type checking                   |
| `bun run lint`     | Prettier + ESLint                         |
| `bun run lint:fix` | Auto-fix formatting and lint issues       |
| `bun run pipeline` | Generate tracker-data.json from game data |

## Tech stack

- SvelteKit 2 + Svelte 5 (runes)
- Tailwind 4 + shadcn-svelte
- Cloudflare Pages
- PWA (offline-capable)
