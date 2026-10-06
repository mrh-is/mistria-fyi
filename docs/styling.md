# Styling

The app mixes Tailwind utilities & scoped `<style>` blocks on purpose. Both draw from one set of
design tokens in `src/app.css`. Stylelint keeps scoped CSS on those tokens, and an ESLint rule does
the same for class strings in markup.

## Utilities vs. scoped CSS

- **Tailwind utilities** handle layout, spacing, the utilitarian screens (data transfer, feedback,
  legal pages), and the vendored shadcn-svelte layer in `src/lib/components/ui/`.
- **Scoped `<style>` blocks** handle components with a designed visual identity: records, cards,
  paper stacks, tags, and ribbons.
- Follow whichever mode the surrounding component already uses. Don't convert one to the other in
  passing; a conversion is its own change.

## Where tokens live

Every token is defined in `src/app.css`, and nowhere else.

| Kind          | Tokens                                                                                                                                                  | Defined in                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Palette       | `--paper`, `--ink`, `--hairline`, `--fg-*`, `--cat-*`, `--tag-*`, …                                                                                     | `:root` (light) & `.dark`          |
| Shadcn colors | `--background`, `--primary`, `--muted`, …                                                                                                               | `:root` & `.dark`                  |
| Elevation     | `--shadow-small`, `--shadow-medium`, `--shadow-large`, `--shadow-overlay`                                                                               | `:root` & `.dark`                  |
| Drop shadows  | `--shadow-ribbon`, `--shadow-sticker`, `--tag-shadow`                                                                                                   | `:root`                            |
| Type size     | `--text-3xs` (10px) & `--text-2xs` (11px), plus Tailwind's `--text-xs` (12px) and up                                                                    | `@theme`                           |
| Radius        | `--radius` (2px), `--radius-lg` (4px), `--radius-xl` (6px)                                                                                              | `:root` & `@theme inline`          |
| Level & rank  | `--color-relationship-level-1`…`--color-relationship-level-12` (villager marks), `--color-town-rank-1`…`--color-town-rank-11`, `--color-confetti-1`…`7` | `:root` (one palette, both themes) |
| Z-index       | `--z-section-header`, `--z-page-header`, `--z-home-header`, `--z-toolbar`, `--z-panel`, `--z-picker`, `--z-dialog`                                      | `@theme`                           |
| Font roles    | `--font-display`, `--font-body`, `--font-controls`, `--font-annotation`, `--font-data`                                                                  | `:root`, overridden per locale     |

The `--color-relationship-level-*`, `--color-town-rank-*`, & `--color-confetti-*` tokens sit in
`:root`, not `@theme`, like `--cat-*`: Tailwind would otherwise generate `bg-…` utilities nothing
uses. Palette colors that JS picks by index go through `src/lib/utils/palette.ts`
(`relationshipLevelColor`, `townRankColor`, `confettiColors`), never a hex array in a component.
Z-index tokens cover layers that cross component boundaries; stacking inside one component stays a
small literal. Read one in a class as `z-[var(--z-panel)]` (the shorthand `z-(--z-panel)` trips
oxfmt's class sorter, which drops the space after it).

Scoped CSS reads tokens with `var()`, and derives tints with `color-mix()`:

```css
.record {
  border: 1px solid color-mix(in srgb, var(--hairline) 58%, transparent);
  border-radius: var(--radius);
  box-shadow: var(--shadow-small);
  font-size: var(--text-2xs);
}
```

Theme-dependent tokens (colors & shadows) go in `:root` with a `.dark` override, not in `@theme`, so
they switch with the theme. Put a token in `@theme` only when it's the same in both themes; Tailwind
then also generates a matching utility (e.g. `text-2xs`). Tailwind emits a theme variable only when
something uses it, and a `var()` in a scoped `<style>` block counts as a use.

Sizes are in `rem`, so they follow the reader's browser font size. `--text-2xs` is 11px only at the
default 16px root.

## Minimum type size

- **11px (`--text-2xs`)** is the floor for anything read as prose: descriptions, annotations, and
  sentence-case labels. This matches Apple's 11pt minimum.
- **10px (`--text-3xs`)** is allowed only for uppercase labels in a mono face, where caps & letter
  spacing carry legibility. This matches Material's 10sp overline.
- Form fields stay at 16px or larger (`app.css` sets `max(16px, 1em)`), so iOS Safari doesn't zoom
  in on focus. Don't override that with a smaller scoped `font-size`.
- Don't add half steps between Tailwind sizes. Round to the nearest step, favoring the larger one.

WCAG sets no minimum size, but small text still needs 4.5:1 contrast (1.4.3) and must survive 200%
zoom (1.4.4), which `rem` sizing supports.

## Adding a token vs. a one-off

Add a token when:

- The value appears in more than one component, or is likely to.
- It's a palette color, even if only one component uses it today. Colors need a dark-mode value, and
  `app.css` is where both themes are visible side by side.
- It's a new step in a scale (type size, elevation, radius). Check first whether an existing step is
  close enough; two steps a pixel apart are drift, not a scale.

Keep a literal when the value is a deliberate one-off that shouldn't track the design system, such
as the fixed 1200×630 share image in `og-share-card.svelte`. Leave a comment saying why (see the
escape hatch below).

Values that aren't design decisions don't need tokens: `transparent`, `currentColor`, `inherit`,
`50%` radii for circles, and `em` sizes relative to the parent.

## Lint rules

`pnpm run lint` runs Stylelint over `src/**/*.{css,svelte}`, and CI enforces it. The rules are drift
prevention, not a style guide:

- No color literals: hex (`color-no-hex`), named colors (`color-named`), or color functions such as
  `rgb()`, `hsl()`, & `oklch()` (`function-disallowed-list`). This includes colors inside
  `color-mix()` or a shadow.
- No `px` or `rem` in `font-size`, `box-shadow`, or `border-*-radius`.

`src/app.css` is exempt, since it defines the tokens. So are the vendored `src/lib/components/ui/`
and generated files. The config is `stylelint.config.js`, and `scripts/stylelint-config.test.ts`
covers it.

ESLint's `local/no-untokened-classes` covers what Stylelint can't see: class strings in `.svelte`
markup, including `class={...}` expressions (string, template, ternary, `cn(...)` arguments, &
object keys) and `class:` directives. It rejects:

- Arbitrary font sizes such as `text-[11px]`. Use the type scale (`text-3xs` is 10px, `text-2xs` is
  11px).
- Tailwind's raw palette hues such as `text-red-700` or `dark:bg-amber-950`. Use a semantic utility
  (`text-destructive`, `text-muted-foreground`) or a palette token by reference
  (`text-(--fg-green)`, `border-(--fg-amber)/40`); tokens already switch with the theme, so they
  need no `dark:` twin.

Arbitrary values that read a token, like `z-[var(--z-panel)]`, pass. The vendored
`src/lib/components/ui/` and `*.test-harness.svelte` files are exempt. The rule lives in
`eslint-rules/no-untokened-classes.ts`.

For an error, warning, or success message box, use `StatusNote`
(`tone="error" | "warning" | "success"`) rather than restyling a `<div>`. It tints the background
from the tone's token and announces errors & warnings as alerts.

Tailwind class order isn't a lint rule: oxfmt sorts the classes in `class` attributes against
`src/app.css`, as `prettier-plugin-tailwindcss` did.

## Escape hatch

When a literal is deliberate, disable the narrowest rule on the narrowest range, with a
justification after `--`:

```css
/* stylelint-disable-next-line declaration-property-unit-disallowed-list -- an inset focus ring, not an elevation */
box-shadow: inset 0 0 0 1px currentColor;
```

- Prefer `stylelint-disable-next-line`. Use a `stylelint-disable` / `stylelint-enable` pair only for
  adjacent lines that share one reason (e.g. a `mask` and its `-webkit-mask` twin).
- Always name the rule. Stylelint rejects a disable without a `-- reason`, one that names no rule or
  an unknown rule, and one that no longer suppresses anything.
- If you reach for the same disable twice, add a token instead.

This matches the ESLint policy in [AGENTS.md §7](../AGENTS.md#7-verification).
