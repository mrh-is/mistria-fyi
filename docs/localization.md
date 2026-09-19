# Localization

MFG has two independent translation systems, covering different content and with different tooling.
Confusing them, or assuming one guarantees the other, is the most common mistake here.

## Two systems

**Game data names** (items, villagers, locations, festivals, recipes, ...) come from Fields of
Mistria's own translation tables in `pipeline/input/assets/localization/`. The pipeline
(`pipeline/src/localize.ts`) reads them and writes localized names into
`src/lib/data/locales/<locale>/<category>.json` chunks. Structural records in
`src/lib/data/tracker-data.json` deliberately omit migrated display names. MFG never edits this
content and never invents a translation for it — a category with missing or unclear game-side
translation data is a pipeline extraction problem, not something to work around in the app.

The game's own UI vocabulary lives here too. Labels the game shows in its menus (almanac category
headings, animal variant tiers) have English text as bare entries in `fiddle/misc_local.toml` and
translations keyed `misc_local/<key>`; the pipeline emits the keys the app uses into the `ui` chunk
(`getName("ui", key, locale)`). An almanac category's `local_key` redirects its label to another
`misc_local` entry (fish → "Fishing and Diving"). Cosmetic sub-category labels come from the ordinal
`ui/character_customization/<slot>/<n>/name` keys into `cosmetics/subcategories`; the slots
themselves are icon tabs in the game with no text, so a slot with one sub-category borrows that
label and the rest use MFG's own `cosmetic_slot_*` messages. When a label matches something the game
already names, pull it from there rather than adding a Paraglide message: the in-game term is the
one players recognize.

### Game vocabulary in UI chrome

MFG's own chrome names plenty of concepts the game names too: category names ("Almanac",
"Villagers", "Renown"), seasons, quest types, relationship statuses, "Cancel". Those are not
Paraglide messages. `APP_UI_STRINGS` in `pipeline/src/extractors/ui-strings.ts` lists the
`misc_local` keys the app displays, the pipeline writes them into the `ui` chunk, and the root
layout (`src/routes/+layout.ts`) awaits that chunk on every route, so `getName("ui", id, locale)`
works anywhere. Sitewide chrome without a `locale` prop reads `page.data.locale`.

Two adjustments happen in the extractor rather than the app. A request with `stripArticle` drops the
leading definite article the game puts on a menu title ("The Almanac" → "Almanac", "Le musée" →
"Musée") for the languages that write one; the others pass through. Player-gendered strings
(`<he>Casado</he><she>Casada</she><they>Casade</they>`, as Spanish `married` is) collapse to their
`<they>` form; any other inline markup throws, since the app renders these as plain text.

When you add a UI string that names something the game names, add its `misc_local` key to
`APP_UI_STRINGS` and call `getName("ui", …)` instead of adding a message. A key the game hasn't
translated yet (`mission_quests`, as of 1.0.2) falls back to English in every locale, the same as
any other game-data gap, and gets picked up at the next game-data update.

### How name chunks load

Chunks are code-split: `src/lib/data/names.ts` declares them through a lazy `import.meta.glob`, so a
page fetches only the categories it renders, in the active locale only. There is no runtime English
fallback: the pipeline English-fills every key the game doesn't translate, so every locale's chunk
set is key-identical to `en`'s (`names.completeness.test.ts` guards this), and a missing entry
throws as a data bug. `getName()` & `getNameTable()` stay synchronous (components resolve names
inside `$derived`) and read from a session cache that `loadNames()` fills; reading a chunk that
exists but was never awaited throws rather than silently degrading.

- **Category routes** await their chunks in `+page.ts` via `loadPageNames(event, [...])`. A page
  that renders source segments also spreads `SEGMENT_LOOKUP_CATEGORIES` from
  `src/lib/utils/segment-lookups.ts`. If you add a `getName()` call for a new category to a page's
  component tree, add the category to that route's list; the thrown error names the missing chunk.
- **`/all`** awaits every category (`LOCALIZED_CATEGORIES`).
- **Sitewide search** (`search-results.svelte`) awaits every category for the active locale, plus
  English (search also matches English terms), on first open, not at page load, and gates its
  results on that load. Chunks are cached per `<locale>/<category>` for the session, so reopening
  search never refetches.
- **Tests** run with every chunk preloaded by `src/vitest-setup-names.ts`. Tests of the loading
  boundary itself live under `vitest.mocked.config.ts`, which skips that setup.

**MFG's own UI chrome text** (buttons, labels, dialogs, descriptions) is machine-translated by us
and built on [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs). Source
strings live in `messages/en.json`; translations live in the other 7 `messages/<locale>.json` files.
This is the system you touch when adding a new feature.

These systems have no shared enforcement. A component can display a raw, English-only game-data
field (a plain property access like `entity.name`, syntactically indistinguishable from a properly
localized one) with no tooling able to catch it — that's a type/pipeline-contract concern, not a
lint concern. See [Limits of the tooling](#limits-of-the-tooling) below.

## Adding a new UI string (agents & humans)

1. Add the English string to `messages/en.json` under a descriptive key (snake_case, prefixed by
   feature area — e.g. `feedback_submit_button`, `about_maintainer_intro`).
2. Add the same key to all 7 other `messages/<locale>.json` files (`es`, `fr`, `ja`, `ko`, `ru`,
   `zh-Hans`, `zh-Hant`), translated. Machine translation is acceptable to start — see
   [Improving a translation](#improving-a-translation-humans) below for how these get refined.
3. Run `pnpm run paraglide:compile` to regenerate `src/lib/paraglide`.
4. Use the generated message in your component: `import * as m from "$lib/paraglide/messages"`, then
   `{m.feedback_submit_button()}` in the template. Never hardcode the English string directly in a
   `.svelte` file.
5. If the component's file is in the `no-hardcoded-ui-text` allowlist in `eslint.config.js` already,
   `pnpm run lint` will catch any string you forgot to wrap. If the file isn't in that list yet (see
   below), add it in the same PR.

## Tooling

Two checks exist. Neither is a full localization safety net — see
[Limits of the tooling](#limits-of-the-tooling).

### Key-shape check (`pnpm run check:i18n`)

`scripts/check-translation-keys.ts` compares the flattened key set of every `messages/<locale>.json`
against `messages/en.json` and fails on any missing or extra key. It checks **shape only, not
content** — a translation can legitimately equal its English source (a short string, a proper noun)
or still be a stale machine translation; this check only prevents a PR from adding an English string
without adding the corresponding key everywhere else. CI runs it on every pull request, and it's
part of `pnpm run verify`.

### ESLint rule (`local/no-hardcoded-ui-text`)

A custom rule in `eslint-rules/no-hardcoded-ui-text.js` walks the Svelte template AST and flags:

- Literal text nodes containing letters (not just punctuation/whitespace/digits).
- Literal values on text-bearing attributes (`title`, `alt`, `placeholder`, `aria-label`, etc).

It exempts `<code>`, `<kbd>`, `<pre>`, and `<samp>` content (file paths, keys, code snippets aren't
translated) and anything inside `<script>`/`<style>`. It cannot distinguish a proper noun ("Fields
of Mistria", a person's name) from ordinary prose — those need a
`<!-- eslint-disable local/no-hardcoded-ui-text -- reason -->` /
`<!-- eslint-enable local/no-hardcoded-ui-text -->` pair around the element, with a reason.

**This rule only applies to files listed in `localizedFiles` in `eslint.config.js`.** Turning it on
for the whole codebase today would flag every not-yet-localized component (localization is still
rolling out feature area by feature area). When you localize a component, add its path to that list
in the same PR — the rule then guards against future regressions in that file, and coverage grows as
more of the app gets localized.

## Limits of the tooling

Be honest with yourself (and reviewers) about what this catches:

- The ESLint rule only sees Svelte template syntax. It cannot verify that a displayed field like
  `entity.name` is actually locale-aware — that depends on whether the pipeline extractor for that
  category was migrated to read the game's translation tables (see
  [`docs/superpowers/specs/2026-09-16-localization-support-design.md`](superpowers/specs/2026-09-16-localization-support-design.md)
  for the state of that migration, category by category). A field that's still English-only in
  `tracker-data.json` will render fine and pass lint.
- The key-shape check cannot verify translation quality or that a value has actually been translated
  (as opposed to copy-pasted from English).
- Both checks are opt-in / allowlisted, not repo-wide. A PR that never touches an allowlisted file
  can still ship hardcoded English text elsewhere without either check firing.

Do your best with these; don't treat a green CI run as proof that a feature is fully localized.

## Fonts

The base typefaces cover Latin only. `ja`, `zh-Hans`, `zh-Hant`, `ko`, and `ru` swap every font role
via `html:lang()` rules in `src/app.css` and a per-locale generated stylesheet; see
[`docs/font-assets.md`](font-assets.md#locale-fonts) for the pipeline and `/dev/fonts` for a
specimen. When adding UI that sets `font-family` directly, use the `--font-*` roles (or the
`font-display` / `font-body` / … utilities) so the locale overrides apply; hard-coded family names
will render tofu or system fallbacks on non-Latin locales.

## Improving a translation (humans)

- **Game data & names** (items, villagers, festival text, ...): this content comes from the game
  itself, not from us. Report it to Fields of Mistria's own
  [feedback & bug report page](https://www.fieldsofmistria.com/feedback-and-bug-reports) — we have
  no ability to change it here.
- **MFG's own UI wording**: open a GitHub issue on this repo, same as any other bug or suggestion.
