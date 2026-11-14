# Styling

The app mixes Tailwind utilities & scoped `<style>` blocks on purpose. Both draw from one set of
design tokens in `src/app.css`. Stylelint keeps scoped CSS on those tokens, and an ESLint rule does
the same for class strings in markup.

## Visual direction

The app is “the Field Guide”: a wire-bound naturalist’s field guide, folded back on its wire, that a
player marks up as they go. It’s a working tool that borrows a real book’s conventions, not a
picture of a notebook. Aim for cool, printed, & slightly irregular: slate paper, a petrol cloth
cover, cobalt where the guide speaks, and pencil where the player does. The mockup is
[`docs/design/field-guide/`](design/field-guide/README.md); its README lists what later decisions
superseded.

Many of the app’s users distrust AI-generated design, so every visual choice must pass one test:
could an LLM have generated this? If it could, choose something else. Avoid in particular:

- Purple-to-indigo gradients, glassmorphism, & blob or mesh backgrounds
- Inter, Geist, system sans, or sans-serif everywhere; thin-weight headings
- A centered hero with a call to action, three evenly spaced cards, & bento grids
- Excessive border radius, & Lucide or Heroicons as the primary visual
- Monochromatic schemes, perfectly symmetrical layouts, & fade-up-on-scroll animations
- Everything “too smooth”, rigid grids, Swiss minimalism, & maximalism

### The book’s grammar

Three kinds of mark each mean one thing. A screen that mixes them up reads as decoration.

- **Print is the guide’s voice.** Names, sources, rules, column heads, & anything the guide knows
  are set in type. Print that points or acts (a link, an active filter, a count of what’s left) uses
  `--color-guide-voice`, the cobalt.
- **Hand marks are the player’s.** A checked box, a heart, a level on a ruler, & the `80` in
  `80 / 95` are drawn in pencil (`--color-hand-pencil`), with the pencil filter in
  `src/lib/components/pencil-filter.svelte`. The guide never writes by hand, and the player never
  prints. How a mark shows who made it (#276) is undecided; until it’s settled, every mark is
  pencil.
- **Tape marks what’s time-sensitive.** A taped note holds something that expires: the next
  festival, a birthday this week. Its label uses `--color-tape-urgent`. Nothing permanent gets tape.

### Props

The book has four props, and each has one job:

| Prop           | Job                                                      | Tokens                                     |
| -------------- | -------------------------------------------------------- | ------------------------------------------ |
| The wire       | Binds the page to the cover; marks the book’s spine      | `--color-wire*`, `--size-book-wire-width`  |
| The thumb tabs | The category index, in each category’s color             | `--color-category-*`, `--shadow-thumb-tab` |
| The taped note | Holds one time-sensitive fact                            | `--color-tape-*`                           |
| The bookplate  | Names whose book this is: the farm & the save it follows | `--color-paper-raised`, `--color-rule`     |

A new prop needs the maintainer’s approval. Don’t add a paper clip, a coffee ring, a ribbon, or a
sticky note because a screen feels bare; a bare page is fine.

### Materials

Each theme is a material, not only a set of colors.

- **Light is slate paper.** A cool white page, blue-black ink, graphite pencil, & a petrol cover.
- **Dark is a cyanotype.** Pencil doesn’t read on dark paper, so the dark theme is a blueprint
  print: Prussian-blue paper where print & hand marks are both white, and the cover is near-black so
  the page stands off it. The hand marks keep their pencil filter. The category colors lighten to
  read on blue, and the ink on a thumb tab or ribbon turns dark.

A component reads the role tokens and gets both materials. If a mark needs a different shape in
dark, not only a different color, raise it instead of branching on `.dark` in the component.

### Sprites

A sprite’s treatment says which shelf its row is on. The treatments are CSS filters & masks applied
at runtime, so the project ships no derivative images, and a palette change stays a CSS change.

| Treatment   | Looks like                               | Means                          |
| ----------- | ---------------------------------------- | ------------------------------ |
| `todo`      | Printed in one ink, the category’s color | You can get this now           |
| `completed` | The game’s own colors, like a sticker    | Recorded                       |
| `not-now`   | Washed out, still recognizable           | Known, but out of reach today  |
| `spoiler`   | A flat silhouette                        | Not discovered; the shape only |

Wrap the image, name the treatment, & pass the image’s URL for the two masked treatments:

```svelte
<span data-sprite-treatment="todo" style:--sprite-url="url({src})" style:--sprite-tint={color}>
  <img {src} alt="" />
</span>
```

The rules live in `src/app.css`, next to the tracker row contract. Not now must never look like the
silhouette: “out of season” isn’t “never discovered”.

### Meters

Skills, Mines, & Renown share one ruler: a printed rule (`--color-meter-rule`, `--size-meter-rule`)
with minor & major ticks (`--color-meter-tick`, `--size-meter-tick`, `--size-meter-tick-major`), and
the player’s level drawn along it in pencil (`--color-meter-mark`, `--size-meter-mark`), with the
number in the hand face. Each page keeps its own direction: a skill reads left to right, the mines
go down as they get deeper, & renown climbs.

## Type roles

| Role       | Token               | Face (Latin)     | Used for                                        |
| ---------- | ------------------- | ---------------- | ----------------------------------------------- |
| Brand      | `--font-brand`      | Instrument Serif | The wordmark only                               |
| Display    | `--font-display`    | Instrument Serif | Page titles & a taped note’s headline           |
| Body       | `--font-body`       | Petrona          | Names, section heads, & running text            |
| Annotation | `--font-annotation` | Satoshi          | Sources, notes, & supporting text               |
| Controls   | `--font-controls`   | Fragment Mono    | Buttons, pickers, & the date                    |
| Data       | `--font-data`       | IBM Plex Mono    | Printed counts, column labels, & tick labels    |
| Hand       | `--font-hand`       | Undecided (#677) | The player’s numbers: digits & their separators |

The redesign replaces Petrona with Source Serif 4 for body text. That swap isn’t made yet, because
it adds a font file; until it lands, `--font-body` is still Petrona.

Every role except Hand has a stack per locale, set by the `html:lang()` rules in `src/app.css`; see
[font-assets.md](font-assets.md#locale-fonts). The Hand role is limited to digits & the separators
counts use, so one face serves every locale and it needs no CJK or Cyrillic. Never set a word in it.
Until #677 picks the face, `font-hand` falls back to the data face.

Sizes come from the scale, never from the mockup’s half pixels. The mockup’s sizes map like this:

| Mockup    | Use                        | Token             |
| --------- | -------------------------- | ----------------- |
| 30px      | Page title                 | `text-3xl`        |
| 19px      | Section head               | `text-xl` (20px)  |
| 15.5px    | Row name                   | `text-base` (16)  |
| 11.5–12.5 | Sources & notes            | `text-xs` (12px)  |
| 10.5–11   | Small prose                | `text-2xs` (11px) |
| 9.5–10    | Uppercase mono labels only | `text-3xs` (10px) |
| 22–28px   | The player’s numbers       | `text-2xl` (24px) |

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
- **Other kinds** keep their prefix: `--shadow-*`, `--filter-*`, `--blend-*`, `--radius-*`,
  `--size-*`, `--font-*`, `--text-*`, `--z-*`.
- **shadcn-svelte's names** (`--background`, `--primary`, `--muted-foreground`, `--card`, `--ring`,
  …) stay as they are, since `src/lib/components/ui/` reads them. They alias the Field Guide tokens.
- **Component-local custom properties** (set in one component, read by it or its children) are
  prefixed with the component's name, like `--tracker-row-gap`, and say what they hold.

Each color has one name. A color doesn't get both a `:root` name and an `@theme` alias; markup reads
it by reference, as `text-(--color-category-almanac)`.

### Hues & roles

The `--color-hue-*` tokens (green, amber, rose, blue, brown, cobalt, wax, & graphite) are raw ink
colors. Components never read them. Each use gets a role alias in `:root` that names what the color
means there: `--color-guide-voice`, `--color-hand-pencil`, `--color-status-success`,
`--color-season-fall`, and so on. Two roles can share a hue; they still get two names, so changing
one later doesn’t change the other. Add a role when a new use doesn’t fit an existing one.

The dark theme redefines the hues, and the roles follow. That’s how the pencil turns white on the
cyanotype: `--color-hue-graphite` changes, and `--color-hand-pencil` never does.

## Where tokens live

Every token is defined in `src/app.css`, and nowhere else.

| Kind          | Tokens                                                                                                                                                                                                                                  | Defined in                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Paper & ink   | `--color-paper`, `--color-paper-raised`, `--color-paper-sunken`, `--color-ink`, `--color-ink-muted`, `--color-ink-hairline`, `--color-rule`, `--color-rule-faint`                                                                       | `:root` (light) & `.dark`                             |
| Hues          | `--color-hue-green`, `-amber`, `-rose`, `-blue`, `-brown`, `-cobalt`, `-wax`, `-graphite` (only role aliases read these)                                                                                                                | `:root` & `.dark`                                     |
| Color roles   | `--color-guide-voice`, `--color-hand-pencil`, `--color-tape-urgent`, `--color-brand-*`, `--color-status-*`, `--color-tracker-*`, `--color-progress-*`, `--color-toolbar-*`, `--color-season-*`, `--color-feedback-*`, `--color-meter-*` | `:root` (aliases of hues)                             |
| Domain colors | `--color-category-*`, `--color-cover*`, `--color-wire*`, `--color-page-*`, `--color-tape-paper`, `--color-tape-strip`, `--color-home-accent`, `--color-ribbon-*`, `--color-tag-*`, `--color-sprite-*`                                   | `:root` & `.dark`                                     |
| Shadcn colors | `--background`, `--primary`, `--muted`, …                                                                                                                                                                                               | `:root` & `.dark`                                     |
| Elevation     | `--shadow-small`, `--shadow-medium`, `--shadow-large`, `--shadow-overlay`                                                                                                                                                               | `:root` & `.dark`                                     |
| Drop shadows  | `--shadow-ribbon`, `--shadow-sticker`, `--shadow-tag-string`, `--shadow-tag-ring`, `--filter-tag-shadow`                                                                                                                                | `:root`                                               |
| Type size     | `--text-3xs` (10px) & `--text-2xs` (11px), plus Tailwind's `--text-xs` (12px) and up                                                                                                                                                    | `@theme`                                              |
| Radius        | `--radius` (2px), `--radius-lg` (4px), `--radius-xl` (6px)                                                                                                                                                                              | `:root` & `@theme inline`                             |
| Sizes         | `--size-book-*`, `--size-page-inset`, `--size-page-inset-compact`, `--size-section-gap`, `--size-ledger-row`, `--size-ledger-gutter`, `--size-sprite`, `--size-meter-*`, `--size-ribbon-width`                                          | `:root`                                               |
| Level & rank  | `--color-relationship-level-1`…`--color-relationship-level-10` (villager marks), `--color-town-rank-1`…`--color-town-rank-11`, `--color-confetti-1`…`7`                                                                                 | `:root` (one palette, both themes)                    |
| Z-index       | `--z-section-header`, `--z-page-header`, `--z-home-header`, `--z-toolbar`, `--z-panel`, `--z-picker`, `--z-dialog`                                                                                                                      | `@theme`                                              |
| Font roles    | `--font-display`, `--font-body`, `--font-controls`, `--font-annotation`, `--font-data`, `--font-hand`                                                                                                                                   | `:root`, overridden per locale (except `--font-hand`) |
| Sprites       | `--filter-sprite-todo`, `--filter-sprite-completed`, `--filter-sprite-not-now`, `--blend-sprite-tint`                                                                                                                                   | `:root` & `.dark`                                     |

App colors sit in `:root`, not `@theme`: Tailwind would otherwise generate `bg-…` utilities nothing
uses, and it drops theme variables it can't see used, which breaks names built at runtime (like
`categoryColor(key)`). Code that passes a token around passes the whole `var()` reference:
`categoryColor("museum")` returns `"var(--color-category-museum)"`. Palette colors that JS picks by
index go through `src/lib/utils/palette.ts` (`relationshipLevelColor`, `townRankColor`,
`confettiColors`), never a hex array in a component. Z-index tokens cover layers that cross
component boundaries; stacking inside one component stays a small literal. Read one in a class as
`z-[var(--z-panel)]` (the shorthand `z-(--z-panel)` trips oxfmt's class sorter, which drops the
space after it).

Scoped CSS reads tokens with `var()`, and derives tints with `color-mix()`. The two rule weights
already have tokens (`--color-rule` & `--color-rule-faint`), so don’t mix the hairline again:

```css
.record {
  border: 1px solid var(--color-rule);
  border-radius: var(--radius);
  box-shadow: var(--shadow-small);
  font-size: var(--text-2xs);
}
```

Theme-dependent tokens (colors & shadows) go in `:root` with a `.dark` override, not in `@theme`, so
they switch with the theme. Put a token in `@theme` only when it's the same in both themes; Tailwind
then also generates a matching utility (e.g. `text-2xs`). Tailwind emits a theme variable only when
something uses it, and a `var()` in a scoped `<style>` block counts as a use.

Spacing has no scale of its own: fine spacing is Tailwind’s, and the `--size-*` tokens name only the
measures every screen shares, such as the page’s inset & a ledger row’s height.

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
