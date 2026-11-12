# Wuchale source extraction, not keyed messages

## Context

Agents write nearly all of the app’s code & English copy, and the maintainer reviews it. Paraglide
kept app-authored UI text behind message keys, in one large catalog per locale: a component called
`m.feedback_toast_copied()`, and its English & seven translations lived in eight
`messages/<locale>.json` files. Reviewing a copy change meant matching a key in the diff to entries
in several files, which made agent-written copy & translations hard to review (#438).

[#607](https://github.com/mrh-is/mistria-fyi/pull/607) migrated the whole app to Wuchale & was
measured against Paraglide 3.2.2 on the same main revision (`e920bf8a`). Cold Spanish page loads
requested 17–20% less gzip JavaScript (69–90 KB) on Home, Almanac, Data, & About. Navigation &
language switching showed no measurable difference
([measurements](https://github.com/mrh-is/mistria-fyi/pull/607#issuecomment-6835412890), using the
[cold](https://github.com/mrh-is/mistria-fyi/blob/bb1ade93/spikes/wuchale/compare-cold-app.js) &
[warm](https://github.com/mrh-is/mistria-fyi/blob/bb1ade93/spikes/wuchale/compare-warm-app.ts)
probes). In an authoring exercise done on both branches, the maintainer found the Wuchale diff much
easier to read (2026-11-12).

## Decision

- **English is written where it’s used.** Svelte components & `*-messages.ts` helpers hold the
  English sentence, including its links & inline markup. Wuchale extracts it; there are no message
  keys.
- **Each catalog entry holds every locale.** An entry is identified by its English text & optional
  context, and it carries all eight translations side by side. Rewording the English creates a new
  entry, so every translation of that sentence has to be done again.
- **Checked-in catalogs are the source of truth.** Installs & builds compile the committed catalogs
  & need no translation credentials. AI drafting is opt-in for authors. `pnpm run check:i18n` fails
  on stale extraction, obsolete entries, & missing or malformed translations.
- **Game vocabulary stays separate.** Names & terms from the game’s own tables still come from the
  pipeline & `getName(...)`, never from Wuchale catalogs.
- **The app owns the integration.** Locale URLs, the preference cookie, & per-request server locale
  moved from Paraglide into app code, alongside Wuchale’s adapters, custom loaders, & catalog
  storage.
- **A young dependency is an accepted risk.** `wuchale` (0.26.7) & `@wuchale/svelte` (0.21.4) are
  pre-1.0, with one maintainer. This is a side project, and better authoring & review are worth the
  risk here. Versions are pinned exactly, & upgrades are deliberate.
- **The rendered UI is the coverage backstop.** Extraction heuristics can miss copy without failing
  `check:i18n`, such as a lowercase script string or a helper outside the scanned files. Missed copy
  shows up in English in every locale. [#670](https://github.com/mrh-is/mistria-fyi/issues/670)
  checks the Japanese & Russian UI for leftover Latin text.

## Alternatives

- **Stay on Paraglide.** Rejected: the key layer & per-locale files were the review problem this
  change solves. Each compiled Paraglide message also contains all eight locales, which accounts for
  the extra cold JavaScript.
- **Paraglide 3’s per-locale builds.** Rejected: the opt-in can’t produce a deployable variant of
  this SvelteKit & Cloudflare Pages build ([#671](https://github.com/mrh-is/mistria-fyi/pull/671)).
- **Keyed messages compiled by Wuchale.** An intermediate stage of #607 kept the existing keys &
  compiled them with Wuchale. Rejected: it keeps the key layer that made review hard.

## Revisit if

- Wuchale goes about six months without a release, or an upgrade breaks the custom loaders or
  storage beyond a short fix.
- #670 keeps finding missed copy, or the extraction annotations keep growing, so that heuristics
  become a regular source of English in translated pages.
- Wuchale lags a Svelte or SvelteKit major that the app needs.

Backing out is possible but not cheap. The catalogs keep every translation side by side, so a script
could convert them back to keyed messages, but it would be another app-wide migration on the scale
of #607.
