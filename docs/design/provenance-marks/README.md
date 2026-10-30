# Provenance marks design package

tl;dr: Mockups for drawing a checked box by where its fact came from (#276). The mark’s shape never
changes: completed is a green X and obtained is an amber slash. Only the tool that drew it varies.
The player inks it (`manual`), the save stamps it (`save`), we pencil it in (`inferred`), and the
old records were typed (`unknown`).

Status: proposed, awaiting the maintainer’s approval on the PR that adds this folder. Nothing in
`src/` changes until the marks are approved.

## What’s here

| Path                  | What it is                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| `marks.html`          | The mockup: key, variants, & tracker rows. Add `?theme=dark` for dark mode |
| `sheets/`             | One PNG per section & theme, rendered from `marks.html` at 2×              |
| `generator/shots.mjs` | Renders the sheets with the workspace Playwright                           |

`marks.html` copies its tokens from `src/app.css`, loads the app’s fonts from `static/fonts/`, and
draws each mark in `tracker-checkbox.svelte`’s 28-unit viewBox, so the marks drop into that
component as they are. Lint & Knip skip `docs/design/*/generator/`.

## Recommended marks

| Source     | Tool         | How it draws the X                                                         | Description (`en`)             | Key                               |
| ---------- | ------------ | -------------------------------------------------------------------------- | ------------------------------ | --------------------------------- |
| `manual`   | Pen          | Today’s X, loosened, with nib blots; overruns the box                      | “You checked this off by hand” | `tracker_row_provenance_manual`   |
| `save`     | Rubber stamp | Square-ended filled bars, a few degrees off, with specks & a pressure fade | “Filled in from your save”     | `tracker_row_provenance_save`     |
| `inferred` | Pencil       | Green colored pencil at 75% of the pen’s strength, grainy                  | “We filled this in for you”    | `tracker_row_provenance_inferred` |
| `unknown`  | Typewriter   | A small serifed x, struck a hair off level                                 | “From your older records”      | `tracker_row_provenance_unknown`  |

Every X uses `--color-tracker-checked` and every slash `--color-tracker-obtained`, so no new color
roles are needed. Only the inked X keeps the drawn-stroke animation, since it’s the only mark the
player draws.

### One moment or two

Most entries are done in one moment, so they get one X. A quest is obtained first and finished
later, so it gets two impressions: the slash, which turns from amber to green when the quest is
done, then the crossing stroke, slightly out of register. The two can come from different tools,
such as an inked stroke across a stamped slash.

### A seed per entry

Each entry’s id seeds a small generator, so a row’s mark never changes but no two rows match. The
seed picks:

- one of eight filter seeds for the tool’s texture (pen wobble, pencil grain, stamp specks, or
  ribbon ink),
- each pen stroke’s ends (±1.6 units), bow, & weight, so the overrun varies and some ends stop
  short,
- the stamp’s angle (±5°) & its pressure fade (any direction, 0% to about 45%, none for about a
  fifth of entries),
- the typewriter’s angle & offset,
- where a quest’s second stroke lands.

The checkbox draws no filter today; `pencil-filter.svelte`’s filters are used only by
`icon-completion.svelte`. The pen uses `pencil-sm`’s filter with the entry’s seed in place of its
fixed one, applied to the mark, not the box. The drawn-stroke animation runs inside the filter
unchanged.

## Accessibility

The checkbox keeps its accessible name (“Uncheck {name}”) & its state. A checked box adds
`aria-describedby` pointing at visually hidden text holding its provenance’s description. Unchecked
boxes get no description. The marks share one shape on purpose, so provenance is never conveyed by
the mark alone; the description carries it.

## Regenerating

From the repository root, with dependencies installed:

```bash
node docs/design/provenance-marks/generator/shots.mjs
```

## Sheets

| Sheet                                                                                      | Section                            |
| ------------------------------------------------------------------------------------------ | ---------------------------------- |
| [01-key-light.png](sheets/01-key-light.png), [dark](sheets/01-key-dark.png)                | The recommended set                |
| [02-variants-light.png](sheets/02-variants-light.png), [dark](sheets/02-variants-dark.png) | Variants, with the picks           |
| [03-context-light.png](sheets/03-context-light.png), [dark](sheets/03-context-dark.png)    | On tracker rows, both target sizes |
