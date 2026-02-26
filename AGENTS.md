# AGENTS.md — Harvest Helper

> Agent-specific instructions. For project conventions, architecture, and workflow, see
> [CONTRIBUTING.md](CONTRIBUTING.md).

## Task Workflow

Work is tracked via [GitHub Issues](https://github.com/mrh-is/harvest-helper/issues). To pick up a
task:

1. Read the issue **and its comments** (`gh issue view <number> --comments` or via GitHub API/MCP).
   Comments often contain screenshots, clarifications, and additional requirements.
2. Create a branch: `<issue-number>-<short-description>`.
3. Do the work. Run `bun run check` and `bun run lint` before committing.
4. Open a PR that references the issue (`Closes #N` in the PR body).

Issues labeled `ready` are available. Issues labeled `blocked` or `discussion` are not actionable
yet.

## Commands

- **Dev**: `bun run dev` | **Build**: `bun run build` | **Type-check**: `bun run check`
- **Lint**: `bun run lint` (prettier + eslint) | **Fix**: `bun run lint:fix`
- **Pipeline**: `bun run pipeline` (regenerates `tracker-data.json` from
  `pipeline/input/fiddle.json`)
- No test suite configured yet. Vitest is installed but no tests exist.

## Downloading Images from GitHub Issue Comments

GitHub user-content URLs require auth — unauthenticated requests return a 400 error. Use:

```sh
curl -H "Authorization: token $(gh auth token)" -L <image-url> -o <output-path>
```

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
- **`pipeline/`** — Separate TypeScript project (bun). Extracts game data from `fiddle.json` →
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
