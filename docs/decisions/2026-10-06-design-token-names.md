---
id: 2026-10-06-design-token-names
status: needs-review
summary: >-
  Historical scope: Design token names. Current applicability is unverified.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-06-design-token-names.md#decision
relationships: []
---

# Design token names

## Context

Issue [mrh-is/mistria-fyi-private#579](https://github.com/mrh-is/mistria-fyi-private/issues/579):
many tokens in `src/app.css` didn't say what kind of value they held or what they were for.
`--cat-*` read as "cat", `--fg-green` named a hue rather than a use, and `--ink`, `--paper`, &
`--hairline` weren't recognizably colors. Category colors also had two names each (`--cat-museum` in
`:root` & `--color-cat-museum` in `@theme`).

## Decision

- Tokens are `--<kind>-<domain>-<role>`. Colors use Tailwind v4's `--color-*` namespace; other kinds
  keep `--shadow-*`, `--filter-*`, `--radius-*`, `--size-*`, `--font-*`, `--text-*`, & `--z-*`.
- The paper & ink metaphor stays, namespaced: `--color-paper-*`, `--color-ink-*`.
- Hues are a raw layer (`--color-hue-*`) that only role aliases read (`--color-status-success`,
  `--color-season-fall`, `--color-tracker-obtained`, …). Components read roles.
- Each color has one name, defined in `:root` & `.dark`. Markup reads it by reference
  (`text-(--color-category-almanac)`) instead of through an `@theme` alias.
- Helpers that pass a token around return the full `var()` reference, not a bare token name.
- shadcn-svelte's own names (`--primary`, `--card`, …) stay, since vendored components read them.

## Alternatives

- **Role tokens only, no hue layer.** Rejected: two roles sharing a hue would repeat the hex in both
  themes, so a palette tweak would have to find every copy.
- **Namespace the hues only (`--color-hue-*` in components).** Rejected: the smallest diff, but a
  reader still can't tell what an amber means at a given call site.
- **Generic surface/text names (`--color-surface`, `--color-text`).** Rejected: the paper & ink
  metaphor is the Field Guide's design language, and namespacing it already makes it a color.
- **Keep `@theme` aliases for Tailwind utilities.** Rejected: only three call sites used the
  generated `text-cat-*` utilities, and Tailwind prunes theme variables it can't see used, which
  breaks names built at runtime.

## Revisit if

- shadcn-svelte is replaced or its tokens are no longer read by vendored code, so its names could
  join the scheme.
- Enough markup wants category colors as utilities that `text-(--color-category-…)` becomes noise;
  then move the category colors into `@theme static` with `.dark` overrides.
