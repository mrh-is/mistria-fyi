# AGENTS.md — Harvest Helper

## Commands

- **Dev**: `npm run dev` | **Build**: `npm run build` | **Type-check**: `npm run check`
- **Lint**: `npm run lint` (prettier + eslint) | **Fix**: `npm run lint:fix`
- **Pipeline**: `npm run pipeline` (regenerates `tracker-data.json` from
  `pipeline/input/fiddle.json`)
- No test suite configured yet. Vitest is installed but no tests exist.

## Architecture

SvelteKit 2 + Svelte 5 (runes) app deployed to Cloudflare Pages. Mobile-first PWA tracker for Fields
of Mistria 100% completion.

- **`src/lib/engine/`** — Pure functions: availability filtering, progress calculation, search, save
  import. No side effects.
- **`src/lib/stores/`** — Reactive state via `$state`/`$derived` runes; `userState` persisted to
  localStorage.
- **`src/lib/data/`** — Static import of generated `tracker-data.json` (game universe, ~430KB).
- **`src/lib/types/`** — Branded ID types (`ItemId`, `NpcId`, etc.) shared between pipeline and app.
- **`src/lib/components/ui/`** — shadcn-svelte vendored components (do not manually edit; relaxed
  lint rules).
- **`src/routes/`** — 9 category pages (almanac, animals, cosmetics, mines, museum, npcs, quests,
  renown, skills) + settings.
- **`pipeline/`** — Separate TypeScript project (tsx). Extracts game data from `fiddle.json` →
  `tracker-data.json`.

## Componentization

Extract a component when it has its own independent state/concern OR is reused — even if it's small.
Page files should be **layout compositors**, not containers for unrelated logic. For example, the
settings page composes `<ThemeCard />`, `<ImportCard />`, `<TransferCard />`, etc. without knowing
their internals. Don't extract _parts_ of a single concern (e.g., pulling out a result display while
leaving its state machine in the parent).

**Colocate components with the page** (same directory): Components that are used exclusively by one
page should be colocated in the route directory with `PascalCase` filenames (e.g.,
`src/routes/skills/SkillRow.svelte`). Move reusable components to `$lib/components/` when they're
used by multiple pages.

**Pages as layouts**: When possible and reasonable, reduce page files to pure layout compositors.
Migrate business logic, calculations, and state management into components. Pages should primarily
handle data fetching and composition, not logic.

## Code Style

- **Strict TypeScript**: `strictTypeChecked` ESLint + `strict: true` tsconfig. Use `type` imports
  (`consistent-type-imports`).
- **Formatting**: Prettier — double quotes, no tabs, trailing commas, 100 char width, semicolons.
- **Imports**: Auto-sorted by `perfectionist/sort-imports` — externals first, then `$lib`/`$app`
  internals, then relative.
- **Svelte**: Use `let` (not `const`) for `$props()` destructuring. Use runes (`$state`, `$derived`,
  `$effect`), not legacy stores.
- **Naming**: `camelCase` variables/functions, `PascalCase` types/components, `kebab-case` files.
  Branded IDs for type safety.
- **Rules**: `eqeqeq`, `prefer-const` (except `.svelte`), `no-var`, `object-shorthand`,
  `prefer-template`, `curly` (multi-line).
