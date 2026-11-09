# Wuchale localization spike

**Recommendation: continue with a single-route pilot.** Source text and split catalogs make search
copy easier to review, and the Spanish search fixture shipped about 20% less compressed JavaScript.
Fix the hover-preload bug by activating translations when navigation commits. Then measure one route
with production prerendering and offline caching before deciding whether to migrate the whole app.

## Run from the workspace root

Use the regular worktree setup first. The fixture has a separate SvelteKit app, Vite config and
Cloudflare Pages output. Its build reads the real Paraglide messages and game data for comparison.

```sh
pnpm exec wuchale check --full --config spikes/wuchale/wuchale.config.js
pnpm exec node spikes/wuchale/check-catalogs.js
pnpm exec node --test spikes/wuchale/catalogs.test.js
```

To update catalogs, run `pnpm exec wuchale --config spikes/wuchale/wuchale.config.js --clean` and
review the resulting diff. The command intentionally removes obsolete messages. Omit `--clean` when
you want to inspect obsolete translations before deleting them. Use the default parallel extraction
path. In 0.26.7, the sequential `--sync` loop short-circuited after the first changed file, which
left the settings fixture out on the first extraction.

Build and serve the Wuchale fixture in one terminal.

```sh
pnpm exec node spikes/wuchale/run-vite.js build
pnpm exec wrangler --cwd spikes/wuchale pages dev --port 4381 --ip 127.0.0.1
```

Run the probe in a second terminal. An optional directory argument saves desktop and mobile
screenshots. Stop the local server, repeat the build with `build paraglide`, and run the same probe
against the rebuilt fixture. Both builds use the same output directory.

```sh
pnpm exec node spikes/wuchale/browser-probe.js http://127.0.0.1:4381
```

The launcher sets the fixture working directory before invoking Vite's multi-environment builder.
The explicit CLI config path keeps pnpm at the workspace root after Vite creates a local cache. For
development, `pnpm exec node spikes/wuchale/run-vite.js dev` serves the fixture on port 4380. On the
Wuchale build, append `--observe-preload` to reproduce the hover-preload failure below.

## Catalog storage and extraction

- One adapter loads all three shards into one catalog. It uses Wuchale's source text plus context as
  identity, rejects duplicate identities, and moves each complete translation record to
  `search.json`, `settings.json`, or `shared.json` based on its current references. A message with
  no references goes to `shared.json` until cleaned. The fixed file list makes all shards available
  to the watcher up front. The storage key is the absolute catalog directory.
- The real extraction test changes an English string, removes its old identity, preserves unrelated
  translated records, and moves a file from search to settings. The shared retry label becomes
  settings-owned when both references move into settings. Adding a locale leaves existing
  translations intact and produces eight missing-translation errors until that locale is filled.
  Shards are written separately. Run one writer at a time and review moves as a single Git diff.
- The search slice extracts its heading, `aria-label`, placeholder, empty/error branches, retry
  text, interpolated search link and count. Wuchale deduplicates the identical heading and label.
  The link needs one full template literal so translators can reorder the query. The built-in
  `plural(count, [...])` pattern uses the generated CLDR helper. An English singular/otherwise
  ternary extracted two unrelated strings and could not apply Russian plural categories. The fixture
  uses explicit branches for its empty/error selection and does not exercise ICU select.
- An imported label built from string concatenation in a plain JavaScript module escaped both
  extraction and the full check in the test. Keep display strings as complete messages in scanned
  files. Broader migration would need a JavaScript adapter, explicit extraction annotations for
  heuristic misses, and narrow exclusions for literals such as product names or game-owned data. The
  game-owned fishing label is passed as a value from `getName` and never enters the catalogs.

## Checks and review

| Existing protection                                                   | Spike equivalent and limits                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:i18n` compares message-key sets                                | The fixture checks a nonblank value or plural form array in each of the eight configured locales. Wuchale's structural check validates placeholders and plural forms, but skips empty values.                                                                                           |
| `check:locale-sync` flags changed English with unchanged translations | Full extraction detects source changes before regeneration. After extraction a reworded source gets a new identity with empty translations. The round-trip test verifies both failures and the runtime English fallback. Copying an old translation onto a new identity can still pass. |
| The hardcoded-text ESLint rule flags unwrapped Svelte literals        | Extraction covers recognized template text and attributes. An extraction check can pass while unrecognized display text remains. Keep the production rule and retain a reviewed inventory of display surfaces on any converted route.                                                   |

The fixture reuses the existing translations, including Spain Spanish and Taiwan Traditional
Chinese. A complete catalog may legitimately contain a source-identical value. Reviewers still need
to check voice, regional usage, placeholders, plurals, and the game lexicon. For an agent workflow,
review catalog diffs and an extraction coverage checklist with the same PR. Use an explicit context
when identical English needs distinct translations. Preserve the old text and translation in the PR
diff when wording changes so reviewers can assess whether reuse is justified.

## Runtime and measurements

Both variants ran on SvelteKit 3.1.1, Svelte 5.57 and a local Cloudflare Pages Worker with
`nodejs_compat`. The probe checks concurrent multilingual SSR, invalid-locale fallback to English,
Spanish hydration using the same server-rendered input, reactive plural rendering, Spanish to
Traditional Chinese navigation and back, and empty/error branches. The fixture uses a route
parameter directly. Production prerendering, bare-path stubs, and offline precaching are separate
integration work.

The production app resolves locale in its root load and passes it to game-data loaders and
components. The fixture derives both UI and game locale from the same route parameter, using the
existing `loadNames` and `getName` unchanged. Paraglide can render with an explicit locale.
Wuchale's default integration requires SSR startup catalog loading, a request-local
`AsyncLocalStorage` context, and a browser catalog commit in addition to that route-derived locale.
SvelteKit tracks the route parameter read in `load`; a first attempt using only server locals failed
to refresh the locale on client navigation.

With production-style hover preloading enabled on the Traditional Chinese link, hovering it changed
the Wuchale heading to Traditional Chinese while the current URL and game name stayed Spanish. The
default loader commits catalog state in `load`, which Kit can run speculatively. The fixture leaves
hover preloading off for ordinary navigation and exposes the mismatch as an explicit browser probe.

Cold Chromium load of `/es/search?q=té`, through hydration and the count interaction. The probe
counts distinct JavaScript asset paths, sums file bytes and sums separately gzipped files. The
totals include SvelteKit, Svelte, and the fetched game vocabulary chunk.

| Fixture   | JS requests | JS bytes | Gzip bytes | English search copy fetched | Spanish settings copy fetched |
| --------- | ----------: | -------: | ---------: | --------------------------- | ----------------------------- |
| Paraglide |          15 |  142,708 |     50,004 | Yes                         | No                            |
| Wuchale   |          19 |  112,867 |     39,976 | No                          | Yes                           |

The baseline imports the app's compiled Paraglide modules and passes locale explicitly. Its dynamic
locale dispatch retained multiple languages for the search route, while the settings copy stayed out
of the initial search payload. This is a fixture comparison, not a measurement of the production
app's locale-split or prerendered assets. Wuchale emitted separate locale/group chunks, but its
default browser `loadLocale(locale)` fetched all three groups for Spanish, and the server loader
preloaded every group and locale. Storage shards and runtime groups are independent. The fixture
gives no production cold-start, cache, or offline budget estimate.

## Adoption and rollback

A subsequent experiment would need to commit browser messages only when the navigation commits, and
measure route-only loading against production-style prerendering and PWA caching. A gradual
migration would keep app UI and game ownership separate, pin the compiler and adapter versions,
preserve message context and plural rules in the conversion, and retain the existing checks for
unconverted routes. This spike rolls back by removing the fixture and its two development
dependencies. Production migration would require preserving the original keyed messages until both
paths have been verified so a route can switch back without losing translations.

Upstream references: [Svelte adapter](https://wuchale.dev/adapters/svelte/),
[catalog loading](https://wuchale.dev/guides/loading/),
[storage contract](https://wuchale.dev/guides/storage/), and [CLI](https://wuchale.dev/guides/cli/).
