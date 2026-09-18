# Localization support implementation plan

Implements [the localization design spec](../specs/2026-09-16-localization-support-design.md) for
#153 (private beta). Revised after two independent Opus review
passes — see the spec's inline **(review)** notes for what changed and why, including one place (the
`en`-chunk fallback claim) where a first-pass "fix" was itself found broken on the second pass and
corrected here.

## Outcome

Players can pick any of the 8 languages the game ships (English plus 7 "beta" translations), reach
each one at its own URL (`/<locale>/...`, BCP 47 tags), and see every game-entity name and MFG's own
UI text in that language, with CJK/Cyrillic scripts rendering legibly. `tracker-data.json` no longer
embeds English text directly; English becomes one locale among eight, resolved through
`getName(category, id, locale)` — a field that doesn't exist on the type is the guardrail against
rendering untranslated data, not a branded wrapper type.

## Phase dependencies

```text
Phase 1  Foundations (types, pipeline plumbing)
   |
   v
Phase 2  Locale routing (/<locale>/..., Paraglide routing strategy, <html lang>)
   |
   +---> Phase 3  NPC pilot (end-to-end proof)
   |          |
   |          v
   |     Phase 4  Fan out (audit, then remaining categories, sitewide search)
   |
   +---> Phase 5  Picker UI + preference persistence
   |          ^ easier to test meaningfully once Phase 3 has real content
   |
   +---> Phase 6  Fonts (CJK/Cyrillic stack)
   |
   +---> Phase 7  UI chrome text (Paraglide message extraction)
   |
   v  (Phase 4, 5, 6, and 7 all feed in)
Phase 8  Verification & delivery
```

Solid connectors are hard dependencies. Phase 3 (and, transitively, Phase 4) can only start once
Phase 2 lands; Phases 5, 6, and 7 can also start once Phase 2 lands and proceed independently of
Phases 3/4, though Phase 5's picker is only meaningfully _testable_ once Phase 3 has produced real
translated content (the `^` note above, not a separate dependency). Phase 4 itself depends on Phase
3 proving the pattern first, not just on Phase 2. Phase 8 depends on everything.

## Sequencing: this is several PRs, not one

Per `AGENTS.md` §10 ("one concern per session, one issue, one PR-sized deliverable"), this plan is
too large for a single PR. Phase 4 (fan-out to remaining categories) and Phase 7 (UI chrome text)
are each large enough to become their own sub-issues under #153 once Phase 3's pilot proves the
pattern — filing them now, before the pilot validates the approach, risks locking in a plan that
Phase 3 discovers is wrong.

## File map

**New:**

- `src/routes/[locale]/` — locale-prefixed route wrapper around existing top-level category and
  admin pages, driven by Paraglide's SvelteKit routing strategy (adopted in Phase 2), not a
  hand-rolled parallel mechanism.
- `src/lib/data/locales.json` — generated manifest (BCP 47 tag, `display_name`, `status`) per
  locale.
- `src/lib/data/locales/<bcp47-tag>/<category>.json` — generated per-locale, per-category name
  chunks (e.g. `locales/ja/npcs.json: Record<NpcId, string>`).
- `pipeline/src/locale-codes.ts` — the one place the 8 game codes (`eng`, `jpn`, `zh-Hans`,
  `zh-Hant`, `spa`, `fra`, `kor`, `rus`) map to BCP 47 tags (`en`, `ja`, `zh-Hans`, `zh-Hant`, `es`,
  `fr`, `ko`, `ru`). Nothing outside the pipeline reads a game code.
- `pipeline/src/localize-overrides.json` — the manual-override data file for entities whose l10n key
  can't be derived from category + ID (cosmetics, animals, ordinal-keyed categories, skills, per the
  spec's Key finding).
- `src/lib/utils/get-name.ts` (or similar) — `getName(category, id, locale)`, the single typed
  lookup helper. Locale is always an explicit argument, sourced from route `load()` data — never
  ambient/module-level state, since SSR on Cloudflare Workers can serve concurrent requests for
  different locales.
- `src/lib/stores/locale-preference.svelte.ts` — persisted last-chosen locale, used only to pick a
  redirect target for locale-less URLs. Deliberately separate from `user-state.svelte.ts`.
- Paraglide setup (`project.inlang/`, generated message modules), configured with the 8 BCP 47
  locale tags from Phase 2 onward. Message extraction for UI chrome text happens later (Phase 7),
  but the routing strategy is adopted immediately so there's only one locale-routing mechanism.

**Rewritten:**

- `pipeline/src/localize.ts` — real key-derivation + lookup + strict classification (localizable /
  structural / manual override), replacing the always-throws stub. Its existing `_lang !== "en"`
  check turns out to already match the BCP 47 convention this plan adopts — worth confirming during
  the rewrite, not assuming.
- `pipeline/src/extractors/*.ts` (all categories with names — see Phase 4's audit for the final
  list) — stop reading `name` inline; call into `localize.ts` to populate per-locale chunks instead.
  Includes removing `cosmetics.ts:65`'s silent `(asset.name) ?? id` fallback, replaced by the
  manual-override mechanism.
- `src/lib/types/tracker-data.ts` — every entity's `name: string` field is removed, not replaced.
- `src/lib/engine/search.ts`, `src/lib/data/categories.ts` — sort/match via `getName()` and an
  `Intl.Collator` built with the active locale's BCP 47 tag, with English-term fallback for search
  matching. Search's own data-loading needs (below, Phase 4) are distinct from per-route category
  loading.
- `src/app.css`, `src/app.html` — per-locale font custom-property overrides; `<html lang>` driven by
  the resolved route locale.
- `src/routes/sitemap.xml/+server.ts` — emit real per-locale URLs (or canonical URLs with `hreflang`
  alternates); exclude non-page routes (`/api/*`, `/data`) from locale prefixing.

**Touched, mechanically, across many files:** every component currently reading `entity.name`
directly needs to call `getName()` instead. This is Phase 4's bulk, not complex individually.

## Phase 1: Foundations (types + pipeline plumbing, no visible behavior change)

Goal: land the data-model changes, the real `localize.ts`, and the manifest generator, proven by
tests, without touching any extractor's output shape yet.

1. Commit this spec and plan to the branch first, per the user's established preference for
   committing design artifacts before implementation.
2. Claim #153 (`status: in progress`, `agent: claude`), create worktree
   `.worktrees/153-localization-support`, baseline install per `AGENTS.md` §1/§3.
3. Add `LocaleCode` (union of the 8 BCP 47 tags) and `LocaleStatus` (`"stable" | "beta"`) to
   `src/lib/types/locale.ts`. Add the game-code → BCP-47 map in `pipeline/src/locale-codes.ts`
   (pipeline-only; never imported by app code).
4. Implement `pipeline/src/localize.ts`: given a category path + entity ID, derive the l10n key (or
   consult the manual-override data file), look it up per game-language, translate the result's
   locale tag to BCP 47 before writing output, and:
   - throw during extraction if a text field can't be classified as localizable / structural /
     override;
   - log and fall back to English if a classified field's key is simply absent from a locale's table
     (this is the expected, normal case for beta languages, not an error).
5. Generate `locales.json` from `l10n.meta.toml`'s `display_name` + `ship` fields, keyed by the
   translated BCP 47 tag.
6. Tests: key derivation and lookup against real fixture data for `npcs/balor` and
   `items/fish/bait_fish/copper_rockfish`, across at least one stable (`en`) and one beta (`ja`)
   locale; a test asserting the strict-throw behavior on an unclassified field; a test asserting
   log-and-fallback (not throw) on a classified field with a missing key; a test asserting the
   game-code → BCP-47 mapping is exhaustive over `l10n.meta.toml`'s actual language list (fails
   loudly if the game ever adds a 9th language this map doesn't know about).

**Verify:**
`pnpm exec vitest run pipeline/src/localize.test.ts pipeline/src/extractors/npcs.test.ts` (or
wherever the new tests land), then `pnpm run check`.

## Phase 2: Locale routing

Goal: land the URL structure everything else builds on, before any real translated content exists.
This is foundational — Phases 3, 5, 6, and 7 all depend on it.

1. Set up Paraglide JS (`project.inlang/`) configured with the 8 BCP 47 locale tags, and adopt its
   SvelteKit routing strategy as the app's `[locale]`-equivalent mechanism — not a hand-rolled route
   segment built separately from Paraglide, since Paraglide owns URL-based locale routing itself and
   a second implementation would only get replaced later when Phase 7 adopts Paraglide for messages.
   All 8 locales are prefixed symmetrically, English included — no unprefixed "default" locale (per
   the user: no existing users to avoid breaking, and no principled reason to privilege English
   among 8 supported languages). Route slugs themselves stay in English for every locale
   (`/ja/almanac`, not a translated route name) — the standard, lower-cost default; nothing in #153
   asks for translated routing.
2. Bare, locale-less paths (e.g. `/almanac`) attempt to resolve a locale — first from a stored
   preference (`locale-preference.svelte.ts`), then from `Accept-Language` negotiation — and
   redirect there if one is found; if neither yields a supported locale, 404 rather than silently
   defaulting to English.
3. Root layout sets `<html lang="{locale}">` from the resolved route locale.
4. Emit `hreflang` alternate links (BCP 47 tags) for the other 7 locales on each page.
5. Update `src/routes/sitemap.xml/+server.ts` to emit real locale-prefixed URLs instead of a literal
   broken `[locale]` segment, and confirm non-page routes (`/api/*`, `/data`) are excluded from
   locale prefixing.
6. Tests: routing tests confirming redirect-or-404 behavior for bare paths, `<html lang>`
   correctness, valid `hreflang` output, sitemap correctness, and that existing English content
   renders correctly under `/en/...` (this is a behavior change from today's unprefixed routes, not
   a zero-diff check — confirm the redirect/404 story explicitly rather than assuming continuity).

**Verify:** targeted route tests, `pnpm run check`, manual browser check that `/en/...` renders the
same page content as today's unprefixed routes (content identical, URL changed), that a bare path
like `/almanac` redirects or 404s as designed, and that `/sitemap.xml` contains no literal
`[locale]` text.

## Phase 3: Pilot category — NPCs end to end

Goal: prove the full pattern (pipeline → data → `getName()` → component → search) on the smallest
category (34 NPCs) before committing to it at item scale (~2,700 items), and get a real answer on
the chunk payload-size question the spec deliberately left unmeasured.

1. Update `npcs.ts` extractor to stop reading `name` inline; generate
   `locales/<bcp47-tag>/npcs.json: Record<NpcId, string>` for all 8 locales via `localize.ts`.
2. Remove `name: string` from the `Npc` type in `tracker-data.ts`.
3. Implement `getName("npcs", id, locale)`, taking locale as an explicit argument sourced from the
   route's `load()` data, reading from the loaded locale chunk(s), always falling back to `en`'s
   chunk for the same category.
4. Update every NPC-name-rendering component to call `getName()` instead of `.name`.
5. Update NPC sorting/search in `search.ts`/`categories.ts` to resolve through `getName()`, using an
   `Intl.Collator` constructed with the active locale's BCP 47 tag, falling back to English-term
   matching.
6. **Measure:** compare the payload for an `/ja/...` NPC page (locale chunk + English fallback chunk
   for the `npcs` category) against the pre-change baseline. Record the actual number in this plan
   or the PR description — this is the number the spec's per-category fallback design was deferring,
   not a hypothetical.
7. Tests: extractor test asserting generated NPC locale chunks match expected translations for a
   sample of NPCs across locales (including a beta locale with a missing key, confirming English
   fallback); component/rendering test confirming the same; a test confirming `getName()` gives
   correct results when called with two different locales in the same process (simulating concurrent
   SSR requests), guarding against any accidental reintroduction of ambient locale state.

**Verify:** targeted vitest run, `pnpm run check`, then a manual browser check of the NPC pages at
`/en/...` (should be visually identical to before this PR) and at least one non-Latin locale to
confirm the pipeline end-to-end.

**Decision point:** if the derivable-key assumption, the chunk shape, or `getName()`'s signature
needs to change based on what this phase finds, fix it here — before Phase 4 multiplies the pattern
across every other category.

## Phase 4: Fan out to remaining categories, plus sitewide search

**Start with an audit, not code.** Before touching any extractor, produce a short table — category →
actual translation-key pattern found in a representative locale (e.g. `jpn.meta.toml`) → derivable /
needs override — covering every category with a `name`-shaped field in `tracker-data.ts`
(items/almanac, festivals, pets, perks, quests, stores, renown, museum wings, dungeons/mines biomes,
cosmetics, animals, recipes, skills, and any others found). This is discovery work belonging in this
phase, not something to pre-solve during planning — the spec already flags four categories
(cosmetics, animals, mines/renown ordinals, skills) as known exceptions; the audit's job is to find
the rest and size the remaining work honestly before committing to a category-by-category schedule.
File sub-issues under #153 from the audit's output.

For each category, then, same shape as Phase 3: migrate the extractor, generate locale chunks,
update `getName()` call sites, update tests. Group small related categories into one PR; give the
largest (items/almanac, ~2,700 entries) its own PR, likely split further by subcategory given
volume. Skills need investigating separately first, since no l10n keys were found for them at all —
confirm whether skill names are actually translatable in the source data before assuming they are.
Cosmetics migration includes removing `cosmetics.ts:65`'s existing silent `?? id` fallback in favor
of the manual-override mechanism from Phase 1.

**Sitewide search, once enough categories exist:** `search.ts` scans across many categories in one
pass, which doesn't fit the per-route, per-category loading model the rest of this plan uses.
Implement search's data loading as its own explicit path: when the search UI is first opened (not on
every page load), lazy-load every category's chunk for the active locale plus English fallback,
cache for the session. Document this as a deliberate exception to per-route loading, not an
oversight.

**Verify per PR:** targeted vitest for that extractor, `pnpm run check`, manual spot-check of the
affected pages in at least one non-Latin locale. Verify search once its data-loading path lands:
open search in a non-English locale, confirm results resolve locale-correct names across categories
not on the current route.

## Phase 5: Picker UI

1. Settings control listing all 8 locales by native `display_name`, no flags, with a "beta" badge
   for `status: "beta"` locales (per `locales.json`). Selecting one navigates to the equivalent path
   under that locale's URL prefix.
2. Wire `locale-preference.svelte.ts` to persist the choice for future bare-URL redirects.

**Verify:** visual verification per `AGENTS.md` §8 — desktop + mobile, light + dark, picker open and
a locale selected, at least one non-Latin locale. Meaningful testing wants Phase 3 (or further)
landed so there's real translated content to switch between.

## Phase 6: Fonts

Blocked on a font choice — the user wants to look at alternatives to Noto Sans before deciding, so
this phase starts with that decision, not with code.

1. Survey CJK/Cyrillic-covering fonts as candidates (license, glyph coverage, how well they read
   against the project's existing whimsical-but-legible aesthetic).
2. Once chosen: define per-locale font-stack overrides for the existing `--font-*` CSS custom
   properties (`src/app.css:287`), keyed off `<html lang>` (route-driven, from Phase 2). If
   self-hosted, confirm the font's origin is covered by the CSP `font-src` directive before
   implementation.

**Verify:** visual check of at least one page in each non-Latin locale, confirming no tofu boxes,
that the chosen font reads cleanly at the sizes the display/body/controls roles are actually used
at, and that Russian text (which runs noticeably longer than English) doesn't break layouts sized
for shorter strings.

## Phase 7: UI chrome text translation

Can proceed in parallel with Phases 3-6 once Phase 2 lands (Paraglide is already set up there for
routing) — but is itself large enough to warrant its own sub-issue given how many components have
inline UI copy.

1. Extract existing UI strings into Paraglide's message format, English as the source of truth.
2. Machine-translate to the other 7 locales (one-time pass), commit the results. Use ICU plural
   syntax for any string that counts something (e.g. "3 items collected"); verify correct output for
   Russian, which has three plural forms.
3. Refactor components to read UI copy through Paraglide's generated message functions instead of
   inline strings — the mechanical bulk of this phase.

**Verify:** `pnpm run lint`, `pnpm run check` (Paraglide's generated functions give compile errors
on unknown message IDs), manual spot-check of a few screens per locale including a plural-bearing
string in Russian.

## Phase 8: Full verification and delivery

1. `pnpm run verify` once, commit-ready.
2. Visual verification checklist per `AGENTS.md` §8 across all changed routes, capped at 10
   screenshots, covering at least one Latin and one non-Latin locale, plus the Russian layout-stress
   check from Phase 6.
3. Confirm save import/export and transfer-encoding tests pass unmodified (spec's scope-boundary
   claim, already spot-checked against `transfer.ts` during the spec review).
4. Confirm `sitemap.xml` and `hreflang` output are valid (no `[locale]` literals, valid BCP 47 tags)
   across the deployed app, not just in route tests.
5. Record the Phase 3 payload-size measurement here or link to where it's recorded, so the
   per-category fallback design's actual cost is documented, not just assumed.

   **Recorded.** The Phase 3 NPC measurement lives in
   PR #277 (private beta) ("Payload measurement"): NPC chunk pair
   ~5.5 KB raw for all 8 locales, with an extrapolation to ~110 KB raw / ~30 KB gzip for an items
   chunk pair. That extrapolation held: at delivery, `en/items.json` is 114 KB raw / 26 KB gzip,
   `ja/items.json` 130 KB / 30 KB, `ru/items.json` 156 KB / 33 KB. Phase 8 then removed the runtime
   English fallback (the pipeline already English-fills every chunk, so all 4,866 keys are present
   in every locale), which halves what a non-English category route fetches: `/ja/almanac` now ships
   only `ja/items.json` (30 KB gzip) rather than `ja` + `en` (56 KB gzip). Sitewide search still
   loads `en` alongside the active locale because it matches English terms too. For scale, the
   pre-localization `tracker-data.json` at the Phase 8 merge-base was 957 KB raw / 84 KB gzip.

6. Update the spec's acceptance checklist, check off completed items.
7. Close out remaining sub-issues under #153, or leave open with clear scope if any phase slipped to
   a follow-up.

   **Follow-up filed:** #305 (private beta) covers the cosmetic
   slot headings (MFG's own grouping, no game string) and an audit of the Paraglide machine
   translations against the game's `misc_local` vocabulary.
