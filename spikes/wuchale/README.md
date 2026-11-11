# Wuchale localization spike

The isolated fixture shipped about 21% less compressed JavaScript. Moving About's body, footer, and
metadata reduced the real Spanish route's initial JavaScript by 2,934 gzip bytes. Those are
historical measurements from before the app-wide migration. The app now extracts its UI copy from
Svelte and TypeScript. This fixture is still runnable; its historical baselines are in Git.

## Run from the workspace root

Use the regular worktree setup first. The fixture has a separate SvelteKit app, Vite config and
Cloudflare Pages output. It uses the app's game vocabulary for comparison.

```sh
pnpm exec wuchale check --full --config spikes/wuchale/wuchale.config.js
pnpm exec node scripts/check-wuchale-catalogs.js spikes/wuchale/wuchale.config.js
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
screenshots.

```sh
pnpm exec node spikes/wuchale/browser-probe.js http://127.0.0.1:4381 --wuchale
```

To rerun the intermediate keyed baseline, use the fixture at commit `c341692f` in a separate
checkout and build with `build keyed`. For the original Paraglide baseline, use commit `100b0d23`
and its `build paraglide` mode.

The launcher sets the fixture working directory before invoking Vite's multi-environment builder.
The explicit CLI config path keeps pnpm at the workspace root after Vite creates a local cache. For
development, `pnpm exec node spikes/wuchale/run-vite.js dev` serves the fixture on port 4380.

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

## Historical comparison of checks

| Existing protection                                                   | Spike equivalent and limits                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check:i18n` compares message-key sets                                | The fixture checks a nonblank value or plural form array in each of the eight configured locales. Wuchale's structural check validates placeholders and plural forms, but skips empty values.                                                                                           |
| `check:locale-sync` flags changed English with unchanged translations | Full extraction detects source changes before regeneration. After extraction a reworded source gets a new identity with empty translations. The round-trip test verifies both failures and the runtime English fallback. Copying an old translation onto a new identity can still pass. |
| The hardcoded-text ESLint rule flags unwrapped Svelte literals        | Extraction covers recognized template text and attributes. An extraction check can pass while unrecognized display text remains. Review the extracted references and check the rendered surface.                                                                                        |

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
Traditional Chinese navigation and back, and empty/error branches. The separate `/[locale]/pilot`
route renders the same search panel and prerenders HTML for all eight locales.

The production app resolves locale in its root load and passes it to game-data loaders and
components. The fixture derives both UI and game locale from the same route parameter, using the
existing `loadNames` and `getName` unchanged. Paraglide can render with an explicit locale. The
Wuchale fixture uses SSR startup catalog loading, a request-local `AsyncLocalStorage` context, and a
browser catalog commit in addition to that route-derived locale. SvelteKit tracks the route
parameter read in `load`; a first attempt using only server locals failed to refresh the locale on
client navigation.

The default Wuchale loader changed the heading to Traditional Chinese during hover preloading while
the URL and game name stayed Spanish. The custom client loader now prepares an isolated snapshot for
the destination route and locale. The root layout activates that snapshot before hydration or the
committed navigation's DOM update. Chromium verified that the destination catalog finished loading
on hover while the current page stayed Spanish, then verified that clicking changed the UI, game
name and document language together.

Cold Chromium load of `/es/search?q=té`, through hydration and the count interaction. The probe
counts distinct JavaScript asset paths, sums file bytes and sums separately gzipped files. The
totals include SvelteKit, Svelte, and the fetched game vocabulary chunk. For `/es/pilot`, the probe
measures the JavaScript the fixture service worker stored after the first online visit, then reloads
offline and verifies that the count button still updates the translated result.

| Fixture   | Search JS requests | Search gzip bytes | Prerendered pilot JS cached | Pilot gzip bytes |
| --------- | -----------------: | ----------------: | --------------------------: | ---------------: |
| Paraglide |                 17 |            50,382 |                          17 |           50,362 |
| Wuchale   |                 19 |            39,966 |                          19 |           39,943 |

The baseline imports the app's compiled Paraglide modules and passes locale explicitly. Its dynamic
locale dispatch retained multiple languages for the search route. The Wuchale client requested only
the destination feature group and locale. The original default loader fetched the Spanish settings
copy during search. Neither final search build fetched that copy. The Wuchale server still preloads
every group and locale, and the custom loader requires an explicit route-to-group mapping. Storage
shards and runtime groups are independent.

The offline test covers a previously visited Spanish route using the fixture's small service worker.
Production precache selection, first offline access to an unvisited route, version upgrades,
bare-path stubs, and page-load timings remain open.

## About in the production app

The About data section uses the same three messages and eight translations as before. Its page load
imports the Wuchale catalog for the locale resolved by the root layout. The page provides that
snapshot through Svelte context, so hover preloading can finish without changing the current view.
The root layout already remounts the page when the locale commits. The manifest plugin puts Wuchale
catalogs into the same per-locale cache delivery mechanism as the game chunks, while the two systems
retain separate source files and ownership.

The data-section-only pilot measured **365,072 gzip bytes across 58 JavaScript files** on Spanish
About, compared with **365,577 across 57** before the partial migration. The rest of the app still
loads Paraglide, so this difference does not project a full migration. The browser verified that the
Traditional Chinese catalog arrived on hover and the page stayed Spanish until click. In a fresh
context, visiting Spanish Home cached the Spanish and English About catalogs under the existing
bilingual-search policy. The other six stayed out of the cache. About then hydrated on its first
visit with the network disabled.

The expanded pilot moved About's linked sentences, footer controls, page heading, and metadata.
Svelte's inline tags let the catalog place links and icons in the translated sentence. A file-scoped
script adapter uses the runtime explicitly passed by the page load. Both adapters share the About
catalog, and the page header uses the same title as metadata. At this stage, shared components on
About and the rest of the app still used Paraglide.

The expanded pilot measured **362,643 gzip bytes across 57 JavaScript files** against the same
365,577-byte Paraglide baseline. Chromium verified Spanish prerendered metadata, Traditional Chinese
metadata after navigation, and the correct contact link on the first offline About visit.

```sh
pnpm run build
pnpm exec wrangler pages dev --port 4395 --ip 127.0.0.1
# In another terminal
pnpm exec node spikes/wuchale/app-probe.js http://127.0.0.1:4395 --wuchale
```

## App-wide source extraction

The candidate now extracts app-authored messages from Svelte and TypeScript. Shared Svelte copy
reacts to the committed locale, and preloading the next locale only fills its catalog cache. Data
and Sync share a Wuchale load group for the sync-code dialog. The standalone error catalog keeps
recovery available when another catalog fails. [Localization](../../docs/localization.md) describes
the authoring and catalog checks.

### Cold production payload

The baseline is Paraglide on main at `2669be88`. The candidate includes that same revision and the
sync-code catalog split. Both builds used Node 24.22.1, the same tracker data, and local production
previews. Each Spanish route loaded in a fresh Chromium context with the service worker blocked. The
probe counts distinct app JavaScript requests through hydration and gzips the emitted files
individually, independent of the preview server's compression.

| Spanish route | Paraglide JS requests | Paraglide gzip bytes | Wuchale JS requests | Wuchale gzip bytes | Difference |
| ------------- | --------------------: | -------------------: | ------------------: | -----------------: | ---------: |
| Home          |                    71 |              406,358 |                  70 |            326,049 |     −19.8% |
| Almanac       |                    95 |              475,187 |                  94 |            392,282 |     −17.4% |
| Data          |                    62 |              440,664 |                  65 |            351,989 |     −20.1% |
| About         |                    57 |              374,390 |                  58 |            306,639 |     −18.1% |

Build each revision with `pnpm run build` and serve them with `pnpm run preview` on distinct ports.
Run the probe from the candidate checkout and give it the client output for each preview.

```sh
pnpm exec node spikes/wuchale/compare-cold-app.js \
  http://127.0.0.1:5197 /path/to/paraglide/.svelte-kit/output/client \
  http://127.0.0.1:5196 .svelte-kit/output/client
```

These measurements cover the two app integrations at their current split points. The broader
evaluation still needs warm navigation and locale-switch timings, worker cache-fill bytes, and the
same live authoring and translation-review tasks on both branches.

Upstream references: [Svelte adapter](https://wuchale.dev/adapters/svelte/),
[catalog loading](https://wuchale.dev/guides/loading/),
[storage contract](https://wuchale.dev/guides/storage/), and [CLI](https://wuchale.dev/guides/cli/).
