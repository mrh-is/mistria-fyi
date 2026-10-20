# Localization

MFG has two independent translation systems, covering different content and with different tooling.
Confusing them, or assuming one guarantees the other, is the most common mistake here.

## Two systems

**Game data names** (items, villagers, locations, festivals, recipes, ...) come from Fields of
Mistria's own translation tables in `assets.zip` under `assets/localization/`. The pipeline
(`pipeline/src/localize/localize.ts`) reads them and writes localized names into
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
Paraglide messages. `APP_UI_STRINGS` in `pipeline/src/localize/ui-strings.ts` lists the `misc_local`
keys the app displays, the pipeline writes them into the `ui` chunk, and the root layout
(`src/routes/+layout.ts`) awaits that chunk on every route, so `getName("ui", id, locale)` works
anywhere.

### Getting the locale in components

There are two ways, & the choice follows what the component renders:

- **Content components** (records, sections, anything a route composes from game data) take a
  required `locale: LocaleCode` prop, which the route passes from `data.locale`. They never default
  it; a missing prop is a type error rather than a silent English render.
- **Sitewide chrome** (page header, progress counters, the language picker) reads `page.data.locale`
  from `$app/state`.

Components never call Paraglide's ambient `getLocale()`: it reports the previous page's locale while
a navigation is committing, & it is a third source of truth. `tests/component-locale.test.ts`
enforces both rules.

Two adjustments happen in the extractor rather than the app. A request with `stripArticle` drops the
leading definite article the game puts on a menu title ("The Almanac" → "Almanac", "Le musée" →
"Musée") for the languages that write one; the others pass through. Player-gendered strings
(`<he>Casado</he><she>Casada</she><they>Casade</they>`, as Spanish `married` is) collapse to their
`<they>` form; any other inline markup throws, since the app renders these as plain text.

When you add a UI string that names something the game names, add its `misc_local` key to
`APP_UI_STRINGS` and call `getName("ui", …)` instead of adding a message. A key the game hasn't
translated yet (`mission_quests`, as of 1.0.2) falls back to English in every locale, the same as
any other game-data gap, and gets picked up at the next game-data update.

### Hand-aligned game terms

Some game nouns can't come from the `ui` chunk, so their messages carry the game's term by hand.
Each locale uses exactly one term per concept across all of its messages; when you add or edit a
message that mentions one of these concepts, use the term below.

- **Terms inside sentences** ("Decrease renown", "Mines floor {floor}") stay Paraglide messages,
  since interpolating a game label into a sentence breaks grammar across languages. Their wording
  follows the game's own sentence-level term, checked against the 1.0.5 translation tables
  (`misc_local/confirm_leave_dungeon`, `town_rank`, `rank`, `select_a_villager`, &
  `invite_npc_to_festival`).
- **Mines, Quests, Recipes, & Cosmetics** (`category_*_name`, `source_location_mines`) are
  standalone labels, but the game's `fiddle/misc_local.toml` has no key for any of them. The game
  names the mines only inside sentences ("Are you sure you want to exit the Mines?"), so the Mines
  message uses that sentence's noun.
- **Perks** follow the game's skill-perk tutorial (`ui/tutorials/skill_perks/title`) and its
  dialogue. Standalone labels use the full term; English keeps "perk", which the game uses on its
  own ("Select a perk to see its description"). Note: the game calls skills умения in Russian and
  perks навыки.

| Concept   | en        | es                      | fr                       | ja             | ko        | ru          | zh-Hans  | zh-Hant  |
| --------- | --------- | ----------------------- | ------------------------ | -------------- | --------- | ----------- | -------- | -------- |
| Mines     | Mines     | minas                   | mines                    | 鉱坑           | 광산      | шахты       | 矿洞     | 礦洞     |
| Renown    | renown    | reputación              | renommée                 | 名声           | 명성      | репутация   | 声望     | 聲望     |
| Town rank | town rank | categoría (de la aldea) | classement (de la ville) | タウンランク   | 마을 등급 | ранг города | 城镇等级 | 城鎮段位 |
| Villagers | villager  | aldeano                 | habitant                 | 町の住民       | 마을 주민 | житель      | 村民     | 村民     |
| Perks     | perk      | don de habilidad        | bonus de compétence      | スキルボーナス | 스킬 특성 | навык       | 技能特长 | 技能特長 |

Note: in both Chinese scripts the game titles its villager list 居民列表 (the `ui` chunk's
`villagers`) but calls an individual villager 村民 (`select_a_villager`). The category heading reads
the `ui` chunk; every message uses 村民. Hearts follow the game's phrasing too: a heart count is
"好感度達到10心" in zh-Hant and "N颗心" in zh-Hans, and adjusting hearts is "好感度" in zh-Hans (the
game never writes 心心).

### How name chunks load

Chunks are code-split: `src/lib/data/names.ts` declares them through a lazy `import.meta.glob`, so a
page fetches only the categories it renders, in the active locale only. There is no runtime English
fallback: the pipeline English-fills every key the game doesn't translate, so every locale's chunk
set is key-identical to `en`'s (`names.completeness.test.ts` guards this), and a missing entry
throws as a data bug. `getName()` & `getNameTable()` stay synchronous (components resolve names
inside `$derived`) and read from a session cache that `loadNames()` fills; reading a chunk that
exists but was never awaited throws rather than silently degrading.

- **Routes** build their `+page.ts` load with `localizedPageLoad([...], (locale) => metadata)` from
  `src/lib/data/page-load.ts`, which awaits the listed chunks in the locale the root layout resolved
  (never the URL: paraglide's `getLocaleForUrl` reports the base locale during SSR). The layout
  already awaits `ui` on every route, so pages don't list it. A page that renders source segments
  also spreads `SEGMENT_LOOKUP_NAME_CHUNKS` from `src/lib/sources/segment-lookups.ts`. If you add a
  `getName()` call for a new category to a page's component tree, add the category to that route's
  list; the thrown error names the missing chunk.
- **`/everything`** awaits every category (`NAME_CHUNKS`).
- **Sitewide search** (`search-results.svelte`) awaits every category for the active locale, plus
  English (search also matches English terms), on first open, not at page load, and gates its
  results on that load. Chunks are cached per `<locale>/<category>` for the session, so reopening
  search never refetches.
- **Tests** run with every chunk preloaded by `src/vitest-setup-names.ts`. Tests of the loading
  boundary itself run in the `cold` Vitest project, which skips that setup.

**MFG's own UI chrome text** (buttons, labels, dialogs, descriptions) is machine-translated by us
and built on [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs). Source
strings live in `messages/en.json`; translations live in the other 7 `messages/<locale>.json` files.
This is the system you touch when adding a new feature.

These systems have no shared enforcement. A component can display a raw, English-only game-data
field (a plain property access like `entity.name`, syntactically indistinguishable from a properly
localized one) with no tooling able to catch it — that's a type/pipeline-contract concern, not a
lint concern. See [Limits of the tooling](#limits-of-the-tooling) below.

### Source text

Acquisition sources ("Purchase from the General Store (after repairing)") are sentences assembled
from game names, and parts of them can be spoilered or gated behind progress. `source-segments.ts`
renders each sentence from a `source_*` Paraglide message and `fillMessage` fills its placeholders
with segments rather than plain text: it passes private-use markers into the message, then splits
the result at the markers, so each locale's word order decides where a gated name lands. A message
that drops a placeholder throws; the source-rendering invariants test renders every generated source
in every locale to catch that.

English grammar stays in English: the definite article on stores and biomes ("the General Store";
`en-grammar.ts` lists the stores that take one, so the tracker contract carries no English),
"a"/"an", and stripping a quest name's own "The" apply only when the locale is `en`. Other locales'
messages handle articles themselves. Lists of alternatives ("Pond, River, or Ocean") use
`Intl.ListFormat`'s disjunction for the active locale.

A store's availability qualifier is a slot, not a suffix. `buildStoreQualifier` returns bare clauses
("after repairing") joined by `Intl.ListFormat`'s conjunction, and the `source_store_qualified` &
`source_scroll_bundle_qualified` messages place it: in parentheses after the store in English, ahead
of the verb in Japanese, Korean, & Chinese.

Most names come from game-translated chunks: farm animals use `animals` `<id>/core`, stations are
items, museum wings use `museum_wings`, and locations use `locations` (`locations/<id>/name`). The
game leaves some source names untranslated or unnamed, so `source-names.ts` fills the gaps:

- **Monsters:** the game has no full monster name. Since 1.0.7 a `pets.toml` variant carries only a
  bare qualifier (“Copper”, “Default”) shown under its pet kind, and three monsters have no variant.
  Every locale, English included, composes the `pets/skins` family name with a machine-translated
  `source_monster_variant_*` qualifier.
- **Locations without a game name** (`farm`, `mines`, & `dungeon`) and **water types** use interim
  machine-translated `source_location_*` & `source_water_*` messages. The Bell Tower's upper floor
  (`bell_tower_f2`) borrows the building's `bell_tower_f1` name.
- **Cutscenes:** the game names none, so each reviewed `CutsceneSourceId` has its own
  machine-translated `source_cutscene_*` message; villager names inside them come from the
  `villagers` chunk.

Scroll bundle sources carry the bundle's `bundleItemId` and render through the `items` chunk.
Upgrade sources carry a closed `UpgradeId`, and a store's `upgradeAction` is a `StoreUpgradeAction`
key; each maps to a Paraglide message.

## Falling back to English

When nothing better is available, the app serves English rather than an error or an empty slot. This
is the rule for every layer: a game-data name with no translation, a UI string a locale hasn't
translated, and a request with no usable locale all resolve to English.

Every page URL carries a locale prefix (`/ja/almanac`); there is no unprefixed default. A bare path
redirects (307) to the stored preference cookie's (`mistria-fyi-locale`) locale, then the best
`Accept-Language` match, then `/en` (`bareLocaleRedirect` in `src/hooks.server.ts`). The redirect
sends `Vary: Cookie, Accept-Language` so caches don't hand one visitor's locale to another. A prefix
in the wrong case (`/zh-hans/almanac`) redirects permanently (308) to its BCP 47 casing.

## Locale list & Paraglide config

`project.inlang/settings.json` is the authoritative locale list. `LOCALE_CODES` in
`src/lib/types/locale.ts` repeats it as a literal tuple so `LocaleCode` stays a union type, and the
pipeline generates `src/lib/data/locales.json` from the game's language list. `locale.test.ts` fails
if either copy, or the compiled Paraglide runtime, drifts from `settings.json` (order included).
Adding a locale means changing all three in one PR.

`PARAGLIDE_OPTIONS` in `src/lib/i18n/paraglide-options.ts` is the only Paraglide compiler config:
the URL strategy, the per-locale URL patterns, and the unlocalized paths (`/api`, `/sitemap.xml`),
which `src/hooks.server.ts` also reads. The Vite plugin and `pnpm run paraglide:compile` (run by
`prepare`, through `scripts/paraglide-compile.ts`) both compile with it, so `src/lib/paraglide`
behaves the same whichever wrote it last. Don't call the `paraglide-js compile` CLI directly; it
takes only a few options as flags and would emit a runtime with the default strategy.

## Adding a new UI string (agents & humans)

1. Add the English string to `messages/en.json` under a descriptive key (snake_case, prefixed by
   feature area — e.g. `feedback_submit_button`, `about_maintainer_intro`).
2. Add the same key to all 7 other `messages/<locale>.json` files (`es`, `fr`, `ja`, `ko`, `ru`,
   `zh-Hans`, `zh-Hant`), translated. Machine translation is acceptable to start — see
   [Improving a translation](#improving-a-translation-humans) below for how these get refined. Match
   the game's regional variant and terminology; see [Regional variants](#regional-variants).
3. Run `pnpm run paraglide:compile` to regenerate `src/lib/paraglide`.
4. Use the generated message in your component: `import * as m from "#lib/paraglide/messages.js"`,
   then `{m.feedback_submit_button()}` in the template. Never hardcode the English string directly
   in a `.svelte` file.
5. Run `pnpm run lint` to catch any hardcoded template text you forgot to wrap. The
   `no-hardcoded-ui-text` rule applies to app templates by default.

### Sentences around links & icons

A sentence that wraps a link or icon is one message with a placeholder per element, never fragments
glued around it, since fragments force English word order. Render it with `messageParts` from
`src/lib/utils/message-parts.ts` (`about/+page.svelte` is the model) and place each slot in a
snippet or `{#each}`; a message that drops a placeholder throws.

The vendored `Dialog.Content` hardcodes an English "Close" label, so dialogs pass
`showCloseButton={false}` & render `dialog-close-button.svelte`, which uses `common_close`.

### Page metadata & manifest

`SITE_NAME` is the product name, a proper noun that is the same in every locale (`app_name`). Every
page's title and description come from messages through `localizedPageLoad`. `static/manifest.json`
is a single static file, so it stays English and declares `"lang": "en"` & `"id": "/"`; a per-locale
manifest would need a route and a locale-aware `<link rel="manifest">`.

### Regional variants

A locale tag doesn't pin down a region, but the game's translation does. MFG's chrome text sits
beside game-data names on every page, so it follows whatever regional variant the game ships;
otherwise the two read as different dialects side by side.

Each locale's target, as established from the game's own strings:

- **`es` is Spain Spanish**, not Latin American. The game uses patata, zumo, melocotón, nata, and
  gafas (not papa, jugo, durazno, crema, or lentes). In chrome, prefer ordenador over computadora,
  móvil over celular, and pulsa over presiona; keys are named as on Spanish keyboards (Intro, not
  Entrar).
- **`fr` is France French**, not Quebec. The game uses myrtille, not bleuet; e-mail is fine.
- **`zh-Hant` is Taiwan Traditional Chinese** (`zh-TW` usage), not Hong Kong. The game's strings use
  Taiwan vocabulary throughout (馬鈴薯, 起司, 巧克力, 鮭魚, 高麗菜) and Taiwan standard glyphs
  (線, 為, 麵, not 綫, 爲, 麪), with no Cantonese or Hong Kong terms. When machine-translating,
  prompt for Taiwan usage explicitly, then check the output for Mainland terms that survive script
  conversion:

  | Avoid (Mainland or HK) | Use (Taiwan)           |
  | ---------------------- | ---------------------- |
  | 劇透                   | 爆雷                   |
  | 保存 (data)            | 儲存                   |
  | 本地                   | 本機                   |
  | 列表                   | 清單                   |
  | 可選                   | 選填 / 選用            |
  | 跳轉                   | 跳至                   |
  | 點擊                   | 點選                   |
  | 聯繫                   | 聯絡                   |
  | 暫不可用               | 暫時無法使用           |
  | 條 (warnings, notices) | 則                     |
  | 橙 (color)             | 橘                     |
  | 數據, 文件, 網絡, 默認 | 資料, 檔案, 網路, 預設 |

- **`ja`, `ko`, `ru`, and `zh-Hans`** have no regional split worth tracking; write standard
  Japanese, Korean, Russian, and Mainland Simplified Chinese.

These rules apply to every locale:

- **Game terminology wins.** Before writing or translating a noun the game also uses, in any locale
  including `en` (pet skins, mines, renown, perks), check the game's term in
  `src/lib/data/locales/<locale>/` and reuse it. The game calls pet skins 寵物外觀, so MFG does too.
- **Carry the voice, not the orthography.** The English is direct, dry, and conversational: it
  addresses the reader as "you", states things plainly, and allows a little wit ("Oops, forgot to
  put in your email!"). Keep that register in every locale within that language's own UI conventions
  (tú in `es`, vous in `fr`, 你 in Chinese). Don't carry over marks that are only English house
  style: `en.json` uses `&` for close pairs ("Questions & requests"), but other locales write their
  own conjunction (y, et, and so on). In Spanish, y becomes e before an i sound ("datos e
  imágenes").
- **Native punctuation.** `zh-Hans` and `zh-Hant` use full-width punctuation (`，：（）！`) and `…`,
  not ASCII `, : ( ) !` or `...`.

## Tooling

Three checks exist. None is a full localization safety net; see
[Limits of the tooling](#limits-of-the-tooling).

### Key-shape check (`pnpm run check:i18n`)

`scripts/check-translation-keys.ts` compares the flattened key set of every `messages/<locale>.json`
against `messages/en.json` and fails on any missing or extra key. It checks **shape only, not
content** — a translation can legitimately equal its English source (a short string, a proper noun)
or still be a stale machine translation; this check only prevents a PR from adding an English string
without adding the corresponding key everywhere else. CI runs it on every pull request, and it's
part of `pnpm run verify`.

### Stale-translation check (`pnpm run check:locale-sync`)

`scripts/check-locale-sync.ts` catches what the key-shape check cannot: an English value that
changed while a locale's value for the same key did not. It compares the merge base of `--base`
(default `origin/main`) with the working tree, flattening every `messages/<locale>.json`, & lists
each `(locale, key)` where English changed and that locale's value is identical to the one it had at
the base. A locale that changed the key (even to the same text as English) passes. Added & removed
keys are not its concern; the key-shape check owns them.

CI runs it as the “Locale sync” job on pull requests that touch `messages/` (or the check itself),
using `--base HEAD^1`, the base branch tip of the PR's merge checkout. When the English change needs
no new translation (a punctuation fix, a proper noun that is the same in every script), add an entry
to `scripts/locale-sync-allowlist.json`:

```json
[
  {
    "key": "about_title",
    "locale": "ja",
    "reason": "The title is a proper noun; no change in script."
  }
]
```

Each entry names one key & one locale, & needs a non-empty reason; the check fails on a malformed
file. Entries are reviewed like any other change, so delete one when its key is retranslated.

### ESLint rule (`local/no-hardcoded-ui-text`)

A custom rule in `eslint-rules/no-hardcoded-ui-text.ts` walks the Svelte template AST and flags:

- Literal text nodes containing letters (not just punctuation/whitespace/digits).
- Literal values on text-bearing attributes (`title`, `alt`, `placeholder`, `aria-label`, etc).

It exempts `<code>`, `<kbd>`, `<pre>`, and `<samp>` content (file paths, keys, code snippets aren't
translated) and anything inside `<script>`/`<style>`. It cannot distinguish a proper noun ("Fields
of Mistria", a person's name) from ordinary prose — those need a
`<!-- eslint-disable local/no-hardcoded-ui-text -- reason -->` /
`<!-- eslint-enable local/no-hardcoded-ui-text -->` pair around the element, with a reason.

The rule applies to every `src/**/*.svelte` file except vendored `src/lib/components/ui/**`,
development routes under `src/routes/dev/**`, and `*.test-harness.svelte` fixtures. Keep these
exceptions narrow so new app templates receive the rule automatically.

## Limits of the tooling

Be honest with yourself (and reviewers) about what this catches:

- The ESLint rule only sees Svelte template syntax. It cannot verify that a displayed field like
  `entity.name` is actually locale-aware — that depends on whether the pipeline extractor for that
  category reads the game's translation tables. As of this writing, every pipeline category emits
  its names through per-locale chunks (`src/lib/data/locales/<locale>/<category>.json`) and
  `tracker-data.json` carries no display names, so the remaining risk is app-authored text. A future
  field added to the contract as English-only would render fine and pass lint.
- The key-shape check cannot verify translation quality or that a value has actually been translated
  (as opposed to copy-pasted from English). The stale-translation check only sees that a locale's
  value changed in the same PR as English; it cannot tell whether the new text is a correct
  translation, & it ignores a changed key whose locale value was edited for another reason.
- The ESLint rule covers app templates by default, but it does not inspect user-facing strings
  assembled in scripts or data. Review those strings when adding new features.

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
