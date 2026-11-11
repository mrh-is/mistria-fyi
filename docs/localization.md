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
label and the rest use MFG's own slot labels. When a label matches something the game already names,
pull it from there rather than writing another translation: the in-game term is the one players
recognize.

### Game vocabulary in UI chrome

MFG's own chrome names plenty of concepts the game names too: category names ("Almanac",
"Villagers", "Renown"), seasons, quest types, relationship statuses, "Cancel". These come from the
game vocabulary. `APP_UI_STRINGS` in `pipeline/src/localize/ui-strings.ts` lists the `misc_local`
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

Components never call the ambient `getLocale()`: it reports the previous page's locale while a
navigation is committing, & it is a third source of truth. `tests/component-locale.test.ts` enforces
both rules.

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

- **Terms inside sentences** ("Decrease renown", "Mines floor {floor}") are complete Wuchale
  messages, since interpolating a game label into a sentence breaks grammar across languages. Their
  wording follows the game's own sentence-level term, checked against the 1.0.5 translation tables
  (`misc_local/confirm_leave_dungeon`, `town_rank`, `rank`, `select_a_villager`, &
  `invite_npc_to_festival`).
- **Mines, Quests, Recipes, & Cosmetics** (`category_*_name`, `source_location_mines`) are
  standalone labels, but the game's `fiddle/misc_local.toml` has no key for any of them. The game
  names the mines only inside sentences ("Are you sure you want to exit the Mines?"), so the Mines
  message uses that sentence's noun.
- **Perks** follow the game's skill-perk tutorial (`ui/tutorials/skill_perks/title`) and its
  dialogue. Standalone labels use the full term; English keeps "perk", which the game uses on its
  own ("Select a perk to see its description"). Note: the game calls skills умения in Russian and
  perks навыки. Note: French names the perk menu « Bonus de compétences » (plural compétences,
  `ui/tutorials/skill_perks/steps/1/text`), so labels for a set of perks use that plural, while a
  single perk is a « bonus de compétence ».

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
  `src/lib/data/page-load.ts`, which awaits the listed chunks in the locale the root layout
  resolved. The layout already awaits `ui` on every route, so pages don't list it. A page that
  renders source segments also spreads `SEGMENT_LOOKUP_NAME_CHUNKS` from
  `src/lib/sources/segment-lookups.ts`. If you add a `getName()` call for a new category to a page's
  component tree, add the category to that route's list; the thrown error names the missing chunk.
- **`/everything`** awaits every category (`NAME_CHUNKS`).
- **Sitewide search** (`search-results.svelte`) awaits every category for the active locale, plus
  English (search also matches English terms), on first open, not at page load, and gates its
  results on that load. Chunks are cached per `<locale>/<category>` for the session, so reopening
  search never refetches.
- **Tests** run with every chunk preloaded by `src/vitest-setup-names.ts`. Tests of the loading
  boundary itself run in the `cold` Vitest project, which skips that setup.

**MFG's own UI copy** (buttons, labels, dialogs, descriptions) is English in the Svelte or
TypeScript that displays it. Wuchale extracts that copy into
[`src/lib/i18n/catalogs/`](../src/lib/i18n/catalogs/). A catalog entry keeps the source, references,
and all translations together. Wuchale identifies a message by its source text and optional context.

The root layout loads shared copy and the destination route’s catalog for the URL locale. Loading a
destination in advance doesn’t change the active locale. About loads its own catalog, metadata
formatters receive the destination locale, and the small error catalog is bundled so it’s available
without a successful catalog load. The game vocabulary still uses its separate name chunks.

Acquisition sources ("Purchase from the General Store (after repairing)") are sentences assembled
from game names, and parts of them can be spoilered or gated behind progress. `source-segments.ts`
writes each complete sentence in source, and `fillMessage` fills its placeholders with segments
rather than plain text: it passes private-use markers into the message, then splits the result at
the markers, so each locale's word order decides where a gated name lands. A message that drops a
placeholder throws; the source-rendering invariants test renders every generated source in every
locale to catch that.

English grammar stays in English: the definite article on stores and biomes ("the General Store";
`en-grammar.ts` lists the stores that take one, so the tracker contract carries no English),
"a"/"an", and stripping a quest name's own "The" apply only when the locale is `en`. Other locales'
messages handle articles themselves. Lists of alternatives ("Pond, River, or Ocean") use
`Intl.ListFormat`'s disjunction for the active locale.

A store's availability qualifier is a slot, not a suffix. `buildStoreQualifier` returns bare clauses
("after repairing") joined by `Intl.ListFormat`'s conjunction, and the store and scroll bundle
sentences place it: in parentheses after the store in English, ahead of the verb in Japanese,
Korean, & Chinese.

Most names come from game-translated chunks. Farm animals use `animals` `<id>/core`, museum wings
use `museum_wings`, and locations use `locations` (`locations/<id>/name`). Processing stations such
as apiaries use item names. Crafting station labels are extracted from `source-segments.ts`. The
game leaves some source names untranslated or unnamed, so `source-names.ts` fills the gaps:

- **Monsters:** the game has no full monster name. Since 1.0.7 a `pets.toml` variant carries only a
  bare qualifier (“Copper”, “Default”) shown under its pet kind, and three monsters have no variant.
  Every locale, English included, composes the `pets/skins` family name with a machine-translated
  qualifier.
- **Locations without a game name** (`farm`, `mines`, & `dungeon`) and **water types** use interim
  machine-translated labels. The Bell Tower's upper floor (`bell_tower_f2`) borrows the building's
  `bell_tower_f1` name.
- **Cutscenes:** the game names none, so each reviewed `CutsceneSourceId` has its own
  machine-translated sentence; villager names inside them come from the `villagers` chunk.

Almanac rows that share a name (six “Animated Clouds Window” rows) show a variant word, such as
“Oak”, as a subtitle. The game names no variants, so `item-variants.ts` supplies the labels. Most
values are the game’s own terms, taken from each locale’s descriptions; the rest are machine
translations. `pipeline/src/overrides/item-variant-terms.ts` records which is which, and the
[game version update protocol](game-version-update-protocol.md#name-same-name-almanac-rows) says how
to add one.

Scroll bundle sources carry the bundle's `bundleItemId` and render through the `items` chunk.
Upgrade sources carry a closed `UpgradeId`, and a store's `upgradeAction` is a `StoreUpgradeAction`
key; the source formatter supplies the display text for each.

## Falling back to English

When nothing better is available, the app serves English rather than an error or an empty slot. This
is the rule for every layer: a game-data name with no translation, a UI string a locale hasn't
translated, and a request with no usable locale all resolve to English.

Every page URL carries a locale prefix (`/ja/almanac`); there is no unprefixed default. Every bare
URL lands on the right locale's copy of its page, keeping its query & fragment: the stored
preference cookie's (`mistria-fyi-locale`) locale, then the browser's best language match, then
`/en`. Each bare path is a static stub page whose inline script picks the locale and replaces itself
(`src/lib/i18n/bare-path-stub.ts`), so the choice happens in the browser and no shared cache can
hand one visitor's locale to another. A prefix in the wrong case (`/zh-hans/almanac`, or all
uppercase) lands permanently on its BCP 47 casing.

## Locale list & routing

`LOCALE_CODES` in `src/lib/types/locale.ts` is the authoritative UI locale list. The pipeline's
`src/lib/data/locales.json` must match it in order. `src/lib/i18n/locale-path.ts` handles canonical
locale prefixes and leaves infrastructure URLs bare. The root layout resolves the target URL's
locale, while the server hook isolates the locale of each request.

## Adding a new UI string (agents & humans)

When reviewing UI translations, look up in-game terms in `pipeline/output/game-term-lexicon.json`.
Run `pnpm run pipeline:assets -- --game-term-lexicon-only` if the file is missing or its `version`
differs from `CURRENT_GAME_VERSION` in `pipeline/src/game-version.ts`. Look up the English term
under `locales.en`, then use the same native key under the target locale. For example,
`locations/water_seal/name` gives `水の封印` in `ja`, so the game uses `封印` for the seal. The
lexicon also covers Almanac category labels and skill names. The song crystal category is omitted
while its Japanese translation is missing. The lexicon lives outside the app's bundled data.

1. Write the English where it appears. Svelte components and routes are scanned by default. Name new
   TypeScript helpers that format copy in the current UI locale `*-messages.ts` under `src/lib` or
   `src/routes`. Keep the whole sentence in one string or template literal so translators can move
   its placeholders.
2. `pnpm run dev` adds newly encountered messages to the catalogs as you edit and visit pages. Run
   `pnpm run messages:extract` before review to scan every source file and remove obsolete entries.
   Review the catalog diff, fill missing translations, and keep the numbered placeholders intact.
   Identical English with different meanings can use `@wc-context: …`. Use `@wc-include` for missed
   copy and `@wc-ignore` for technical literals.
3. Run `pnpm run check:i18n` and `pnpm run lint`. Check the new copy in context, including in a
   language whose layout, word order, or plural forms differ from English.

With `GEMINI_API_KEY` already in your environment, run `WUCHALE_TRANSLATE=1 pnpm run dev` for live
drafts or `WUCHALE_TRANSLATE=1 pnpm run messages:extract` for a repository-wide pass. Both let
[Wuchale draft translations](https://wuchale.dev/guides/ai/). The provider receives the source
messages it is asked to translate. Review its drafts for regional usage and game terms before
committing. Installation, CI, and normal builds use the checked-in translations and require no
credentials.

### Plurals and rich text

Write ``plural(count, [`${count} result`, `${count} results`])`` with the Wuchale-generated
`plural.js` helper for English singular and plural forms. Wuchale applies the target locale’s plural
rules and catalog forms. Write links and icons inline in a complete Svelte sentence; the catalog
represents the elements with numbered tags that a translation can move. When markup is chosen at
runtime, `messageParts` can splice structured pieces into a translated sentence.

The `ui/` dialog primitive defaults to an English “Close” label. Product dialogs pass
`showCloseButton={false}` and use the localized `dialog-close-button.svelte` instead.

### Page metadata & manifest

`SITE_NAME` is the product name and stays the same in every locale. Route titles and descriptions
are extracted from their page load functions, which receive the destination locale.
`static/manifest.json` is a single English file. A per-locale manifest would need a route and a
locale-aware `<link rel="manifest">`.

### Offline page

`scripts/lib/offline-copy.ts` supplies the English for the static offline template. The build fills
its text slots from `offline.json` and checks that the values are plain text. The worker selects the
URL locale, then the last-used locale, then English, and sets the document language and direction.

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
- **Carry the voice, not the orthography.** The English talks like a chill, helpful friend: it
  addresses the reader as "you", speaks as "we", reassures, and allows a little goofiness ("Oops,
  forgot to put in your email!"); [voice.md](voice.md) defines it. Keep that register in every
  locale within that language's own UI conventions (tú in `es`, vous in `fr`, 你 in Chinese). Don't
  carry over marks that are only English house style: English uses `&` for close pairs ("Questions &
  requests"), but other locales write their own conjunction (y, et, and so on). In Spanish, y
  becomes e before an i sound ("datos e imágenes").
- **Native punctuation.** `zh-Hans` and `zh-Hant` use full-width punctuation (`，：（）！`) and `…`,
  not ASCII `, : ( ) !` or `...`.

## Tooling

`pnpm run check:i18n` checks every source adapter and catalog without writing files. It fails if
extraction would change the catalog, if a message is obsolete, or if any of the eight locales lacks
a translation or has invalid placeholders or plural forms. Changing the English creates a new source
identity. After extraction it needs translations again; unchanged messages keep theirs. The same
check runs locally and in CI, with no merge base or allowlist.

`pnpm run messages:compile` only builds the ignored runtime files from the checked-in catalogs.
Worktree setup and installation use this path, so stale extraction can’t be silently fixed before CI
checks it.

Extraction can miss strings assembled dynamically, passed from unscanned scripts, or excluded by its
heuristics. Check the extracted references after changing display text. CI checks completeness and
structure; it can’t tell whether a translation is correct or whether an English game-data field
should have come from a name chunk.

## Fonts

The base typefaces cover Latin only. `ja`, `zh-Hans`, `zh-Hant`, `ko`, and `ru` swap every font role
via `html:lang()` rules in `src/app.css` and a per-locale generated stylesheet; see
[`docs/font-assets.md`](font-assets.md#locale-fonts) for the pipeline and `/dev/fonts` for a
specimen. When adding UI that sets `font-family` directly, use the `--font-*` roles (or the
`font-display` / `font-body` / … utilities) so the locale overrides apply; hard-coded family names
will render tofu or system fallbacks on non-Latin locales.

## Improving a translation (humans)

Nobody on the project reads these languages natively, so machine translation & review are the only
process there is. A player's report is how a wrong translation gets found.

- **Game data & names** (items, villagers, festival text, ...): this content comes from the game
  itself, not from us. Report it to Fields of Mistria's own
  [feedback & bug report page](https://www.fieldsofmistria.com/feedback-and-bug-reports) — we have
  no ability to change it here.
- **MFG's own UI wording**: open a GitHub issue on this repo, same as any other bug or suggestion.
