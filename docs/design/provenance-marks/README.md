# Provenance marks design package

tl;dr: Mockups for drawing a checked box by where its fact came from (#276). The mark’s shape never
changes: completed is a green X and obtained is an amber slash. Only the tool that drew it varies.
The player inks it (`manual`), the save stamps it (`save`), we pencil it in (`inferred`), and the
old records were typed (`unknown`).

Status: approved on the PR that adds this folder, with option A for quests. The decision record is
[2026-10-30-provenance-marks](../../decisions/2026-10-30-provenance-marks.md). Implementation is
separate work.

## What’s here

| Path                  | What it is                                                                 |
| --------------------- | -------------------------------------------------------------------------- |
| `marks.html`          | The mockup: key, variants, quests, & rows. Add `?theme=dark` for dark mode |
| `sheets/`             | One PNG per section & theme, rendered from `marks.html` at 2×              |
| `generator/shots.mjs` | Renders the sheets with the workspace Playwright                           |

`marks.html` copies its tokens from `src/app.css`, loads the app’s fonts from `static/fonts/`, and
draws each mark in `tracker-checkbox.svelte`’s 28-unit viewBox, so the marks drop into that
component as they are. Lint & Knip skip `docs/design/*/generator/`.

## Recommended marks

| Source     | Tool         | How it draws the X                                                         |
| ---------- | ------------ | -------------------------------------------------------------------------- |
| `manual`   | Pen          | Today’s X, loosened, with nib blots; overruns the box                      |
| `save`     | Rubber stamp | Square-ended filled bars, a few degrees off, with specks & a pressure fade |
| `inferred` | Pencil       | Green colored pencil at 75% of the pen’s strength, grainy                  |
| `unknown`  | Typewriter   | A small serifed x, struck a hair off level                                 |

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

Provenance is decorative. The checkbox keeps its accessible name (“Uncheck {name}”) & its state, and
the tool isn’t announced, so no description strings or keys are needed. The marks share one shape,
so the status a player acts on never depends on the tool.

## Quests from two sources

A quest can be obtained from one source and finished from another. The quests sheet compares two
models: each moment keeps its own tool (A), or the quest has one provenance and the finish redraws
the whole mark in its tool (B). The maintainer chose A.

## Regenerating

From the repository root, with dependencies installed:

```bash
node docs/design/provenance-marks/generator/shots.mjs
```

## Sheets

| Sheet                                                                                      | Section                             |
| ------------------------------------------------------------------------------------------ | ----------------------------------- |
| [01-key-light.png](sheets/01-key-light.png), [dark](sheets/01-key-dark.png)                | The recommended set                 |
| [02-variants-light.png](sheets/02-variants-light.png), [dark](sheets/02-variants-dark.png) | Per-entry variation & pencil weight |
| [03-context-light.png](sheets/03-context-light.png), [dark](sheets/03-context-dark.png)    | On tracker rows, both target sizes  |
| [04-quests-light.png](sheets/04-quests-light.png), [dark](sheets/04-quests-dark.png)       | Quests from two sources, A & B      |
