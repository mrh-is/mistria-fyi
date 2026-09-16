# Localization support design

## Problem

Issue #153 (private beta). Fields of Mistria ships localized
game text in 8 languages, sourced from `pipeline/input/assets/localization/`. MFG currently only
ever reads English text, embedded inline in the source asset TOML (`name = "Balor"`), and has no
locale concept anywhere in `src/lib`. The issue asks for three things:

1. A language picker (display names in-script, not flags — country ≠ language).
2. Every game-entity name (items, NPCs, locations, festivals, ...) translated using the game's own
   localization data.
3. MFG's own UI chrome text translated too, machine-translation acceptable to start, refined via
   user reports.

This is a cross-cutting change: it touches routing, the pipeline's extraction contract, the
`tracker-data.ts` type contract, how every component that currently reads `entity.name` renders
text, and adds a new UI-string translation surface. It needs a spec and an approved acceptance
checklist before implementation, per `AGENTS.md` §3.

This spec has been through two independent Opus review passes. **(review)** marks findings from
either pass; where a first-pass fix was itself found broken on the second pass, that's called out
explicitly rather than silently re-fixed, since it's the kind of mistake worth being visible about.

## Locale identifiers: BCP 47 is canonical, game codes are a pipeline-only concern

**(review, round 2)** The game's own codes are a mix of ISO 639-3 (`eng`, `jpn`, `kor`, `rus`,
`spa`, `fra`) and BCP 47 (`zh-Hans`, `zh-Hant`) — confirmed in `l10n.meta.toml`. Feeding these raw
into `<html lang>`, `hreflang`, `Intl.Collator`, or a routing/i18n library is wrong:
`hreflang="jpn"` is not a valid tag and search engines ignore it (defeating the entire point of
locale-prefixed routing, below), and `new Intl.Collator("jpn")` doesn't throw — it silently falls
back to the default locale's collation, so sorting would look "fixed" in code review while doing
nothing for Japanese or Korean.

**Resolution:** BCP 47 (`en`, `ja`, `ko`, `ru`, `es`, `fr`, `zh-Hans`, `zh-Hant`) is the one locale
identifier used everywhere in the app: URL segments, `locales.json`, `<html lang>`, `hreflang`,
`Intl.Collator`, and Paraglide's own locale config. The game's codes exist only inside the pipeline,
at the one boundary where it reads `l10n.meta.toml` and the `translations/*.meta.toml` files — a
small static map (`eng`→`en`, `jpn`→`ja`, `kor`→`ko`, `rus`→`ru`, `spa`→`es`, `fra`→`fr`,
`zh-Hans`→`zh-Hans`, `zh-Hant`→`zh-Hant`) is applied once, when the pipeline names its output files
and writes the manifest. Nothing downstream of the pipeline ever sees a game code. This also
resolves a smaller inconsistency the second review caught: the current `localize.ts` stub already
throws for `_lang !== "en"` — under this decision that's the _correct_ convention going forward, not
a bug to fix.

## Key finding: l10n key scheme varies per category, and isn't fully mapped yet

`pipeline/input/assets/localization/translations/<lang>.meta.toml` is a flat table. The common shape
is `<category>/<subcategory-path>/<entity_id>/name`, e.g.:

```toml
"npcs/balor/name" = "Balor"
"items/fish/bait_fish/copper_rockfish/name" = "Rascasse cuivrée"
```

...which mirrors the `topCategory`/`subCategory` arguments extractors like `forEachItem`
(`almanac.ts`) already receive, plus the entity's existing stable ID. There is no `eng.meta.toml` —
English is the canonical source, embedded inline in the asset TOML, not present in the translation
tables.

**(review, round 1) This pattern does not hold everywhere.** A closer pass over `jpn.meta.toml`
found:

- **Cosmetics** (`player_assets/<id>/name`) use a different top-level prefix than any MFG category,
  and there are only 319 keys for 358 cosmetic entries — `cosmetics.ts:65` already silently falls
  back to the ID when no name is found (`(asset.name) ?? id`), which the new strict pipeline rule
  (below) needs to replace, not inherit.
- **Animals** are keyed `ranching/animals/<id>/core/name` — an unguessable `core` segment in the
  middle of the path.
- **Mines biomes and renown ranks are keyed by ordinal**, not ID: `dungeons/dungeons/biomes/0/name`,
  `renown/ranks/0/name`. An upstream reorder would silently reassign translations to the wrong
  rank/biome with no error — this needs an English-name equality assertion at extraction time, not
  just key derivation.
- **Skills have zero l10n keys** in the translation table at all, despite 9 named skills rendering
  in `/skills`.
- **Items: roughly 2,439 `items/**/name` keys found against roughly 2,653 items in
  `tracker-data.json`** — a gap of the same order of magnitude either way; needs precise
  quantification before the items extractor is touched, not discovered mid-migration. (This spec
  uses "roughly 2,700 entity names" elsewhere as a rough order-of-magnitude figure for the items
  category specifically — both numbers describe the same open gap, not two different facts.)

`tracker-data.ts` has **24 fields matching `name: string`**, not the ~9 categories originally listed
here. The full category list needing this treatment: items (almanac), npcs, festivals, pets, perks,
quests, stores, renown, museum wings, dungeons/mines biomes, cosmetics, animals, recipes, skills,
and any others found during the implementation plan's category audit (start of its fan-out phase).

**Implication, revised:** l10n keys are derivable _as a starting assumption per category_, not a
universal rule. Each category gets verified against its actual translation-table keys before its
extractor is migrated; categories that don't fit the derivable-key pattern (cosmetics, animals,
ordinal-keyed categories, skills) get a documented, explicit override rather than a guess. This
verification is scoped as a lightweight audit — a table of category → actual key pattern found — not
full extractor code written during planning.

## Concepts

**Locale:** one of the 8 BCP 47 tags above. English (`en`) becomes a locale like any other rather
than a special case — this eliminates most `if (locale === "en")` branching.

**Locale status:** `l10n.meta.toml` marks each game language `ship = true | false`. Only English is
`true`; the other 7 are `false` (the studio calls these "beta" translations, per the user). Pipeline
output carries this through as `status: "stable" | "beta"` per locale, so the UI can label
unfinished languages rather than presenting them as equally authoritative.

**Locale manifest:** a small generated file (e.g. `src/lib/data/locales.json`) listing each locale's
BCP 47 tag, native `display_name` (from `l10n.meta.toml`, e.g. `日本語`), and `status`. Drives the
language picker without needing to load any per-locale name data.

**Two translation domains, kept separate, with different tooling for each:**

- **Game content names** — item/NPC/location/etc. display names, sourced from the game's own
  translation tables. Pipeline-generated flat data, no formatting or pluralization involved (they're
  proper nouns — see the composite-string caveat under Scope boundaries). Consumed through a plain
  lookup helper, not a general i18n library — see
  [Why not a general i18n library for entity names](#why-not-a-general-i18n-library-for-entity-names).
- **UI chrome text** — MFG's own strings (buttons, labels, descriptions), machine-translated by us,
  not sourced from the game, and needing real message-formatting features (pluralization,
  interpolation). Built on [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
  — see [UI chrome text translation](#ui-chrome-text-translation).

These must not be merged into one "translations" blob — different provenance, different trust level,
different update cadence, different tooling.

## Why not a general i18n library for entity names — and why Paraglide still owns routing

Worth addressing directly: why hand-roll lookup instead of using an established i18n library for
everything?

[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) is the
SvelteKit-recommended choice and is a strong fit for UI chrome text (below) — but it's
compiler-based: message IDs are expected to be known, hand-authored identifiers at build time,
compiled into tree-shaken functions. That model fits a few hundred UI strings well. It's a poor fit
for roughly 2,700 pipeline-generated entity names per locale: there's no meaningful "tree-shaking"
benefit when nearly every generated ID is reachable somewhere in the data, and forcing thousands of
data rows through a compile-time message-ID system fights the tool rather than using it as intended.
The older runtime alternative, `svelte-i18n`, is stale and not Svelte-5-native as of this writing.

More fundamentally: no general i18n library ships an adapter for Fields of Mistria's own TOML
translation-key scheme. That extraction and lookup logic is inherently ours to write regardless of
library choice — it's translated _reference data_, not application messages. A flat
`Record<EntityId, string>` per category per locale, generated by the pipeline and read through a
small typed helper, is the right amount of custom code here.

**(review, round 2) One correction to how this was sequenced in an earlier draft:** Paraglide's
SvelteKit integration owns its own URL-based locale-routing strategy (a `reroute` hook plus a
configured locale list). An earlier draft of the implementation plan hand-rolled a separate
`[locale]` route segment in an early phase and only introduced Paraglide much later for UI text —
that would mean building routing twice, with the second attempt likely fighting or replacing the
first. **Paraglide is adopted starting in the routing phase**, configured with the same BCP 47
locale list from the start, even though UI message extraction (Phase 7 in the implementation plan)
happens later. Its routing strategy _is_ the `[locale]` mechanism, not a parallel one. This also
means the app never needs a second, bespoke locale-routing implementation — one less thing to keep
in sync with two domains' worth of translated content.

## Data model changes

### `tracker-data.json` stops carrying names

Per the user's direction: break English out of the core data file entirely and treat it as just
another locale. `tracker-data.ts` entity types lose their `name: string` field entirely — not
replaced by an opaque key field, just gone. This is a schema-breaking change to the pipeline/app
contract (`AGENTS.md` §5) and needs a deliberate version bump, not a silent shape change.

**(review, round 1) This is also the type-safety mechanism**, simpler than an earlier draft of this
spec that proposed a branded `LocalizedText` type: since entity types carry no name-shaped field at
all, `{entity.name}` is a compile error by construction — there's nothing to accidentally render.
The only way to get a display string is `getName(category, id, locale)`, described below. No opaque
brand, no `resolveText()` indirection — the absence of the field _is_ the guardrail.

### New per-locale, per-category name chunks, keyed by branded ID

One JSON module per `(locale, category)` pair (e.g. `src/lib/data/locales/ja/items.json`), keyed by
the same branded ID types already used everywhere else in `tracker-data.ts` — e.g.
`Record<ItemId, string>`, `Record<NpcId, string>` — rather than a single flat table keyed by opaque
l10n path strings. This keeps a stray typo'd key from silently type-checking as valid, the same
protection branded IDs already give the rest of the data model, and it means a route only loads the
categories it actually renders (an items page doesn't pull npc names) — which pairs naturally with
locale-prefixed routing, where a route's loader already knows both its locale and its category.

**(review, round 2) The first-pass fallback description was self-contradictory** — it said the `en`
chunks are "always loaded" as a universal fallback _and_ that routes "only load the categories they
need," which can't both be true (a universal fallback requires every category's English chunk
everywhere). **Corrected design:** fallback is per-category, not blanket. When a route renders
category X in locale L (L ≠ `en`), it loads category X's L chunk _and_ category X's `en` chunk
together, and resolves missing keys from the latter. A route never loads an `en` chunk for a
category it doesn't render. This is consistent with the per-category loading goal; it does mean a
non-English page loads two chunks per category (its locale's + English's) instead of one, which is
the real cost model — not "roughly today's size." **The actual byte cost, on English vs. a
non-English route, must be measured during the Phase 3 pilot** (see the implementation plan), not
assumed either way.

`en/*.json` is generated by the pipeline from the same inline strings it extracts today, through the
same derived-key path, so English is structurally identical to every other locale — no special
casing in the app layer.

### `getName()` takes an explicit locale, and is resolved per request, not per module

**(review, round 2) An implicit "current locale" read from ambient/module-level state is unsafe
under SvelteKit SSR on Cloudflare's Workers runtime**, where a single module instance can serve
concurrent requests for different visitors — and with locale-in-the-URL, concurrent requests for
_different_ locales become the normal case, not an edge case. `getName(category, id, locale)` takes
locale as an explicit argument, sourced from the current route's `load()` data (or SvelteKit's
request-scoped `event.locals`), never from a singleton. Loaded chunk data itself (parsed JSON) can
be cached at module scope safely, since it's immutable once loaded — only the "which locale is
active" decision is request-scoped, not the data.

### Search needs the whole active locale, not just the current route's categories

**(review, round 2) Per-category, per-route loading (above) is unreconciled with sitewide search**,
which scans across items, npcs, animals, cosmetics, recipes, quests, museum entries, and more in a
single pass (`src/lib/engine/search.ts`) — locale-correct search therefore needs every category's
chunk for the active locale loaded, which the per-route strategy deliberately doesn't provide.
**Resolution: these are two different loading strategies for two different features, and that's fine
as long as it's explicit.** Category/route pages load only what they render. The search UI, when
first opened (not on every page load), lazy-loads every category's chunk for the active locale (plus
English, per the fallback rule above) as its own explicit cost, cached afterward for the session.
This is a deliberate tradeoff: search stays slow to first-open in a non-English locale but doesn't
force every page to carry the full locale's data.

### Strict pipeline classification, with a clear line between "wrong shape" and "no translation yet"

The pipeline is strict about text fields, echoing the existing "throw, don't fabricate fallback"
convention in `pipeline/src/localize.ts` and the extractors. Every text-bearing field the pipeline
encounters in source TOML must be explicitly classified as one of:

- **Localizable** — has a derivable l10n key; gets looked up per locale and written to that
  category's locale chunks.
- **Structural** — an ID, enum tag, sprite path, or other non-display data; stays plain `string`,
  untouched.
- **Manual override** — doesn't fit the derivable pattern cleanly (cosmetics, animals, ordinal-keyed
  categories, skills, per the Key finding above). Lives in a **JSON data file** (a list of
  `{ category, id, explicitKey }` or `{ category, id, reason }` entries), not inline code, so a
  future game content patch that adds one new cosmetic is a one-line data edit, not a code change.

**(review, round 1) Two different failure modes need two different responses, and an earlier draft
conflated them:**

- A text-bearing field the pipeline **can't classify into one of the three buckets above** — throw
  during extraction. This is a shape/coverage bug in the pipeline itself and should fail loud.
- A classified, localizable field whose **specific translation key is simply absent** from a given
  language's table (untranslated content, or a beta language that's incomplete) — this is normal and
  expected, especially across 7 languages the studio itself calls beta. Log it (same tombstone
  pattern as `namelessItems` in `almanac.ts`) and fall back to English at render time. Never fail
  the build over a missing individual key.

## Pipeline changes

For each extractor that currently reads a `name` field inline from asset TOML, add a second pass
that, for every locale in `l10n.meta.toml`, looks up the derived (or manually overridden) key in
that locale's translation table and writes the resolved string into that category's locale chunk
(named by BCP 47 tag, per the identifier decision above), falling back to English per-key when a
translation is missing.

`pipeline/src/localize.ts` is currently a stub that always throws
(`"English strings are inline in TOML data"`) — this is the file where the real lookup logic
belongs; the stub gets replaced, not worked around.

Generate `locales.json` (the manifest) from `l10n.meta.toml`'s `display_name` and `ship` fields,
translating game codes to BCP 47 tags at generation time — no hand-maintained duplicate list, and no
game code ever reaching the app layer.

## Routing: locale as a URL path segment

**(review, resolved by discussion)** Locale is part of the URL path (e.g.
`mistria.fyi/ja/items/...`), not client-only state. Reasoning:

- **Discoverability.** With a single URL serving all 8 languages via client-side text swap, search
  engines only ever index one language per page — non-English content is effectively invisible to
  search, and a player searching in their own language can never find the site.
- **Caching correctness.** This app deploys to Cloudflare Pages, which caches rendered pages by URL
  at the edge. Client-only locale means every visitor, regardless of language, gets the same cached
  (English) HTML shell and sees a flash of English before JS swaps in their language.
  Locale-prefixed routes let each language be its own real, edge-cacheable, server-rendered page.
- **Low retrofit cost right now, high cost later.** The user confirmed MFG's routing surface is
  small — top-level category pages plus a handful of admin pages, no per-entity URLs — so adding a
  locale segment now touches a manageable number of routes. Retrofitting this after locale switching
  and the picker UI ship client-only would be far more expensive.

Mechanics: Paraglide's SvelteKit routing strategy (see above) provides the `[locale]`-equivalent
segment; the root layout sets `<html lang="{locale}">` from the resolved route locale; each page
emits `hreflang` alternate links for the other 7 locales, using BCP 47 tags.

**(review, resolved by discussion) Two more routing decisions, settled with the user:**

- **URL path segments (slugs) stay in English for every locale** — `/ja/almanac`, not a
  Japanese-translated route name. Translated slugs are the right call for sites where the URL itself
  is primary content (Wikipedia, Airbnb), but for MFG's small, fixed set of category routes the
  added machinery (a slug-translation table, reverse-mapping a localized slug back to its canonical
  route, deciding which slug is canonical for `hreflang`) buys little the translated page content
  and `<title>` don't already provide. This is the standard, lower-cost default and nothing in issue
  #153 asks for translated routing.
- **All 8 locales are prefixed symmetrically — no unprefixed "default" locale.** An earlier draft of
  this spec had bare paths silently defaulting to English if no locale could be negotiated. The
  user's call: there are no existing users yet to avoid breaking, and English has no principled
  claim to being the unprefixed default among 8 supported languages — treating all locales the same
  is both simpler to reason about and avoids baking in an English-first assumption this app doesn't
  actually hold. **Revised behavior:** a bare, locale-less path (e.g. `/almanac`) attempts
  content-negotiation via `Accept-Language`; if a supported locale can be determined, redirect
  there; if not, 404 rather than silently assuming English. `/en/...` is a real, always-prefixed
  path like every other locale, never bare `/...`.

**(review, round 2) Non-page routes need explicit handling, not silence.** `sitemap.xml` currently
derives its URLs from route module paths and would otherwise emit a literal, broken `/[locale]/...`
segment. The sitemap generator needs updating to emit one entry per real locale-prefixed URL (or per
canonical URL plus `hreflang` alternates, whichever pattern the sitemap format prefers), and routes
that aren't visitor-facing pages (`/api/*`, `/data`, and similar) are explicitly excluded from
locale prefixing rather than left to accidentally 404 or duplicate. This is scoped as part of the
routing phase in the implementation plan, since it's the phase whose entire justification is
discoverability.

## UI chrome text translation

Built on [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs) — adopted starting
in the routing phase for its routing strategy (see above), with message extraction as a later,
separate phase. Compiler-based, tree-shaken per-locale output, full type safety (referencing an
undefined message ID is a compile error — the same guardrail property the entity name changes get
from dropping the `name` field), and built-in ICU pluralization support.

MFG's own strings are extracted into Paraglide's message format, English as the source of truth,
machine-translated to the other 7 locales (one-time pass, LLM-assisted is fine), checked into the
repo — no runtime translation API, no additional service dependency. Refined over time through
normal PRs when users report bad translations, per the issue text.

**(review, round 1) Pluralization is real and shouldn't be lost.** Any UI string that counts
something ("3 items collected") needs a real plural rule, not string concatenation — Russian alone
has three plural forms. Paraglide's ICU support (`{count, plural, one {# item} other {# items}}`)
handles this natively; this needs to be used from day one for any counting string, not bolted on
later. Entity _names_ don't need this (proper nouns don't pluralize) — this is purely a
UI-chrome-text concern.

v1 scope: cover the strings currently in the UI. New UI copy added later either gets translated in
the same PR or (acceptably) falls back to English until a follow-up pass — this mirrors how the game
itself treats incomplete localizations.

## Language selection & persistence

- Locale is primarily carried by the URL (see Routing, above). A small separate persisted preference
  (e.g. `src/lib/stores/locale-preference.svelte.ts`, its own `safeLocalStorage` key — **(review,
  round 1) deliberately not part of `user-state.svelte.ts`**, since that store's shape is serialized
  for save import/export and transfer encoding, and a display preference has no business leaking
  into a save-file payload) records the visitor's last-chosen locale, used to pick a redirect target
  when a bare, locale-less URL is visited and a stored preference exists. Falls back to
  `Accept-Language` negotiation when no preference is stored; if neither yields a supported locale,
  the bare path 404s rather than defaulting to English (see Routing, above — no locale is privileged
  as the default).
- Picker UI: a settings control listing each locale by its native `display_name` (no flags, per the
  issue), with a "beta" badge for `status: "beta"` locales. Selecting one navigates to the
  equivalent path under that locale's prefix. Exact placement (existing settings surface vs. a new
  one) is an implementation decision, not a spec-level one.
- Changing locale triggers lazy-load of that route's categories' chunks in the new locale (and the
  UI-string bundle) before re-rendering; show existing content in the outgoing locale (or a loading
  state) rather than a flash of missing strings.

## Rendering changes

Every current `entity.name` read (components, search, sorting) needs to go through
`getName(category, id, locale)` instead of direct field access — this is the largest mechanical
surface of the change, even though each individual change is simple, and the compiler enforces it
since `name` no longer exists on the type.

`src/lib/engine/search.ts` and `src/lib/data/categories.ts` currently sort by
`.localeCompare()`/`.toLocaleString()` on English names with no locale argument — these need to
operate on the currently-active locale's resolved names, **(review, round 1) using a locale-aware
`Intl.Collator` constructed with the active locale's BCP 47 tag** (per the identifier decision above
— a bare `.localeCompare()` or a collator built from a game code silently sorts CJK content using
the wrong or default collation).

Search should match against the displayed locale's name **and** fall back to matching the English
name. Recommendation: most players searching in a non-English locale are still typing terms they
know from the game itself in that language, so the primary match should be the active locale — but
English item/NPC names circulate widely in wikis, Discord, and video content regardless of a
player's display language, so a player using `ja` might still type "Copper Rockfish" from a guide
they read in English. Falling back to English costs nothing extra here (search already loads the
full English locale set per the Search section above) and only helps.

## Fonts

None of the app's current display fonts (`Instrument Serif`, `Petrona`, `Fragment Mono`, `Satoshi`,
`IBM Plex Mono` — `src/app.css:9-57`) cover CJK or Cyrillic glyphs. Without a fallback,
Japanese/Korean/Simplified/Traditional Chinese/Russian locales would render as tofu boxes.

Approach: keep the current fonts for Latin-script locales (English, Spanish, French), and define a
separate font stack for CJK/Cyrillic locales, swapped in via the existing CSS custom properties
(`--font-display`, `--font-body`, etc. — `src/app.css:287`) keyed off `<html lang>` (now
route-driven, per Routing above). That mechanism is settled; the actual typeface choice is not — the
user wants to look at alternatives before committing rather than defaulting to Noto Sans, to find
something that better matches the project's whimsical, hand-crafted feel where a legible option
exists in-script. Font selection is a pre-implementation task for that phase, not decided by this
spec.

**(review, round 1) If a self-hosted font is chosen, verify it against the existing
Content-Security-Policy `font-src` directive** (currently allows `assets.mistria.fyi`) before
implementation, not as a build-time surprise.

Scope for v1: pick and verify glyph coverage for the CJK/Cyrillic font stack, then wire up the
per-locale fallback for the 5 non-Latin locales, plus a visual check that Russian names (which run
noticeably longer than English) don't break layouts sized for shorter text.

## Scope boundaries

- **Save file / transfer encoding: unaffected.** Both key off existing stable entity IDs, never
  display names. Localization is a pure presentation-layer change; no compatibility test or
  versioning concern there beyond the `tracker-data.ts` contract bump itself. **(review, round 2)
  Verified against `transfer.ts` directly: its orderings sort by ID, with no name reference** — this
  claim holds, not just an assumption.
- **Composite display strings are a known v1 gap, not a silent one.** `search.ts` currently builds
  strings like `` `${animal.name} ${cosmetic.name}` ``. Word order and spacing for composed phrases
  are locale-dependent — `l10n.meta.toml`'s `infusion_order`/`infusion_space` fields exist for
  exactly this — and that formatting work is out of v1 scope, tracked with the rest of
  locale-specific formatting in #261 (private beta). This is
  narrower than "entity names need no formatting" (which is still true for a single name); composed
  multi-name strings are the exception, and v1 will display them in English word order regardless of
  locale until #261 lands.
- **No locale-specific formatting in v1** (date order, number formatting, pronoun display order —
  all present in `l10n.meta.toml` but unrelated to issue #153's three asks). Tracked separately as
  #261 (private beta).
- **No translation-quality tooling in v1.** "People can report bad translations" per the issue means
  the existing GitHub issue flow, not a new in-app reporting mechanism.

## Open questions

Not blocking the spec, but needs to be resolved during implementation:

**l10n key scheme coverage per category.** Confirmed derivable for `npcs` and one items subcategory;
confirmed _not_ derivable as-is for cosmetics, animals, mines biomes, and renown ranks (see Key
finding). Skills have no l10n keys at all and need investigation into where (if anywhere) their
translations live. The remaining categories (`festivals`, `perks`, `quests`, `stores`,
`museum_wings`, `dungeons`, `object_prototypes`, `recipes`, `infusions`, `dates`) are unverified.
This is the audit step at the start of the implementation plan's fan-out phase, not something this
spec resolves up front.

## Acceptance checklist

- [ ] Language picker exists, lists all 8 locales by native display name (no flags), marks the 7
      beta locales as such, and persists the user's choice across reloads.
- [ ] Locale is a URL path segment using BCP 47 tags (English included, always prefixed, no
      unprefixed default locale), with untranslated (English) route slugs across all locales, via
      Paraglide's routing strategy; visiting a bare/locale-less path redirects to a stored
      preference or negotiated `Accept-Language` locale when one is determinable, else 404; each
      locale's pages set `<html lang>` correctly and emit valid `hreflang` alternates; `sitemap.xml`
      reflects real locale-prefixed URLs with no broken `[locale]` segments.
- [ ] `tracker-data.json` no longer embeds English names; a generated `en` locale chunk set exists
      and is structurally identical to the other 7.
- [ ] Every entity category with a user-facing name resolves its displayed name from the active
      locale's chunk via `getName(category, id, locale)`, with fallback to English when a
      translation is missing. Categories confirmed in scope: items, npcs, festivals, pets, perks,
      quests, stores, renown, museum wings, dungeons/mines biomes, cosmetics, animals, recipes,
      skills (final list per the implementation plan's category audit).
- [ ] The category audit's output (a category → key-pattern table) and the resulting manual-override
      data file both exist and are reviewable, separate from any single category's extractor PR.
- [ ] `getName()` takes locale as an explicit parameter; no ambient/module-level "current locale"
      state exists that could leak across concurrent SSR requests.
- [ ] Switching locale updates all currently-rendered entity names without a full page reload.
- [ ] Sitewide search resolves names in the active locale (with English fallback) across every
      searchable category, using an `Intl.Collator` constructed with the active locale's BCP 47 tag.
- [ ] MFG's own UI chrome text is translated via Paraglide (static, machine-translated, checked in)
      for all 8 locales, with English fallback for any untranslated string, and correct plural
      handling verified for at least one string in Russian.
- [ ] Pipeline changes are covered by tests validating locale-key derivation, manual overrides, and
      fallback behavior for at least one entity per category touched.
- [ ] Save import/export and transfer-encoding tests still pass unmodified (confirms the no-impact
      assumption in Scope boundaries).
- [ ] CJK/Cyrillic locales render with a legible, chosen (not default-Noto) font, no tofu boxes;
      Latin-script locales are visually unaffected; Russian text doesn't break layout.
- [ ] Per-category chunk payload size (a non-English route's locale + English chunks vs. today's
      inline baseline) has been measured, not assumed.
