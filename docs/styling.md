# Styling

The app mixes Tailwind utilities & scoped `<style>` blocks on purpose. Both draw from one set of
design tokens in `src/app.css`. Stylelint keeps scoped CSS on those tokens, and an ESLint rule does
the same for class strings in markup.

## Visual direction

The app’s visual identity is “the Field Guide”: a naturalist’s journal applied to a tracker. It
isn’t a literal notebook; it’s a working tool that borrows the journal’s warmth. Aim for warm,
slightly irregular, & culturally rooted (a naturalist’s journal, not a SaaS dashboard). The current
type, palette, & dark mode live as tokens in `src/app.css`; hand-drawn icons get their organic edge
from the pencil filter in `src/lib/components/pencil-filter.svelte`.

Many of the app’s users distrust AI-generated design, so every visual choice must pass one test:
could an LLM have generated this? If it could, choose something else. Avoid in particular:

- Purple-to-indigo gradients, glassmorphism, & blob or mesh backgrounds
- Inter, Geist, system sans, or sans-serif everywhere; thin-weight headings
- A centered hero with a call to action, three evenly spaced cards, & bento grids
- Excessive border radius, & Lucide or Heroicons as the primary visual
- Monochromatic schemes, perfectly symmetrical layouts, & fade-up-on-scroll animations
- Everything “too smooth”, rigid grids, Swiss minimalism, & maximalism

## Utilities vs. scoped CSS

- **Tailwind utilities** handle layout, spacing, the utilitarian screens (data transfer, feedback,
  legal pages), and the project-owned `src/lib/components/ui/` layer (forked from shadcn-svelte).
- **Scoped `<style>` blocks** handle components with a designed visual identity: records, cards,
  paper stacks, tags, and ribbons.
- Follow whichever mode the surrounding component already uses. Don't convert one to the other in
  passing; a conversion is its own change.

## Token names

A token's name says what kind of value it holds, then what it's for: `--<kind>-<domain>-<role>`.

- **Colors** are `--color-<domain>-<role>`, in Tailwind v4's color namespace:
  `--color-paper-raised`, `--color-category-museum`, `--color-status-warning`.
- **Other kinds** keep their prefix: `--shadow-*`, `--filter-*`, `--radius-*`, `--size-*`,
  `--font-*`, `--text-*`, `--z-*`.
- **shadcn-svelte's names** (`--background`, `--primary`, `--muted-foreground`, `--card`, `--ring`,
  …) stay as they are, since `src/lib/components/ui/` reads them. They alias the Field Guide tokens.
- **Component-local custom properties** (set in one component, read by it or its children) are
  prefixed with the component's name, like `--tracker-row-gap`, and say what they hold.

Each color has one name. A color doesn't get both a `:root` name and an `@theme` alias; markup reads
it by reference, as `text-(--color-category-almanac)`.

### Hues & roles

The `--color-hue-*` tokens (green, amber, rose, blue, & brown) are raw ink colors. Components never
read them. Each use gets a role alias in `:root` that names what the color means there:
`--color-status-success`, `--color-season-fall`, `--color-tracker-obtained`, `--color-brand-mark`,
and so on. Two roles can share a hue; they still get two names, so changing one later doesn't change
the other. Add a role when a new use doesn't fit an existing one.

## Where tokens live

Every token is defined in `src/app.css`, and nowhere else.

| Kind          | Tokens                                                                                                                                                  | Defined in                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Paper & ink   | `--color-paper`, `--color-paper-raised`, `--color-paper-sunken`, `--color-ink`, `--color-ink-muted`, `--color-ink-hairline`                             | `:root` (light) & `.dark`          |
| Hues          | `--color-hue-green`, `-amber`, `-rose`, `-blue`, `-brown` (only role aliases read these)                                                                | `:root` & `.dark`                  |
| Color roles   | `--color-brand-*`, `--color-status-*`, `--color-tracker-*`, `--color-progress-*`, `--color-toolbar-*`, `--color-season-*`                               | `:root` (aliases of hues)          |
| Domain colors | `--color-category-*`, `--color-home-accent`, `--color-ribbon-*`, `--color-tag-*`, `--color-sprite-slot-outline`                                         | `:root` & `.dark`                  |
| Shadcn colors | `--background`, `--primary`, `--muted`, …                                                                                                               | `:root` & `.dark`                  |
| Elevation     | `--shadow-small`, `--shadow-medium`, `--shadow-large`, `--shadow-overlay`                                                                               | `:root` & `.dark`                  |
| Drop shadows  | `--shadow-ribbon`, `--shadow-sticker`, `--shadow-tag-string`, `--shadow-tag-ring`, `--filter-tag-shadow`                                                | `:root`                            |
| Type size     | `--text-3xs` (10px) & `--text-2xs` (11px), plus Tailwind's `--text-xs` (12px) and up                                                                    | `@theme`                           |
| Radius        | `--radius` (2px), `--radius-lg` (4px), `--radius-xl` (6px)                                                                                              | `:root` & `@theme inline`          |
| Sizes         | `--size-ribbon-width`                                                                                                                                   | `:root`                            |
| Level & rank  | `--color-relationship-level-1`…`--color-relationship-level-10` (villager marks), `--color-town-rank-1`…`--color-town-rank-11`, `--color-confetti-1`…`7` | `:root` (one palette, both themes) |
| Z-index       | `--z-section-header`, `--z-page-header`, `--z-home-header`, `--z-toolbar`, `--z-panel`, `--z-picker`, `--z-dialog`                                      | `@theme`                           |
| Font roles    | `--font-display`, `--font-body`, `--font-controls`, `--font-annotation`, `--font-data`                                                                  | `:root`, overridden per locale     |

App colors sit in `:root`, not `@theme`: Tailwind would otherwise generate `bg-…` utilities nothing
uses, and it drops theme variables it can't see used, which breaks names built at runtime (like
`categoryColor(key)`). Code that passes a token around passes the whole `var()` reference:
`categoryColor("museum")` returns `"var(--color-category-museum)"`. Palette colors that JS picks by
index go through `src/lib/utils/palette.ts` (`relationshipLevelColor`, `townRankColor`,
`confettiColors`), never a hex array in a component. Z-index tokens cover layers that cross
component boundaries; stacking inside one component stays a small literal. Read one in a class as
`z-[var(--z-panel)]` (the shorthand `z-(--z-panel)` trips oxfmt's class sorter, which drops the
space after it).

Scoped CSS reads tokens with `var()`, and derives tints with `color-mix()`:

```css
.record {
  border: 1px solid color-mix(in srgb, var(--color-ink-hairline) 58%, transparent);
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

## Firefox scrollbar flash

On Firefox for macOS, expanding or collapsing a recipe source (`source-paper.svelte`) briefly
reveals the auto-hiding overlay scrollbar (#3). The cause is the open animation: the panel
transitions `grid-template-rows` from `0fr` to `1fr` over 260ms, so the document’s `scrollHeight`
changes on every frame (in Chromium it steps through 15 distinct values during one open). Firefox
reveals an overlay scrollbar when the scrollable extent changes, and any in-flow expansion changes
it. The app accepts this native behavior:

- Do not hide scrollbars to avoid it. `scrollbar-width: none` stops the flash but removes the
  draggable affordance everywhere.
- Do not rely on `scrollbar-gutter: stable` or a forced `overflow-y: scroll`. Neither affects
  overlay-scrollbar visibility.
- Shorter or instant transitions are not a fix; the final height still differs.
- Revisit only if sources move to a presentation that leaves the document height unchanged, such as
  an overlay panel. That is a design change, not a CSS fix.

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

`src/app.css` is exempt, since it defines the tokens. So are `src/lib/components/ui/` and generated
files. The config is `stylelint.config.js`, and `scripts/stylelint-config.test.ts` covers it.

ESLint's `local/no-untokened-classes` covers what Stylelint can't see: class strings in `.svelte`
markup, including `class={...}` expressions (string, template, ternary, `cn(...)` arguments, &
object keys) and `class:` directives. It rejects:

- Arbitrary font sizes such as `text-[11px]`. Use the type scale (`text-3xs` is 10px, `text-2xs` is
  11px).
- Tailwind's raw palette hues such as `text-red-700` or `dark:bg-amber-950`. Use a semantic utility
  (`text-destructive`, `text-muted-foreground`) or a palette token by reference
  (`text-(--color-status-success)`, `border-(--color-status-warning)/40`); tokens already switch
  with the theme, so they need no `dark:` twin.

Arbitrary values that read a token, like `z-[var(--z-panel)]`, pass. `src/lib/components/ui/` and
`*.test-harness.svelte` files are exempt. The rule lives in `eslint-rules/no-untokened-classes.ts`.

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

This matches the ESLint policy in [verification policy](agent-verification.md).
