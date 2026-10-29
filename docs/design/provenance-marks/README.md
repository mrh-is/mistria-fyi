# Provenance marks design package

tl;dr: Mockups for drawing a checked box by where its fact came from (#276). The player inks it
(`manual`), the save stamps it (`save`), we pencil it in (`inferred`), and the old records were
typed (`unknown`). Hand marks wander & break the box; machine marks land square inside it.

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

| Source     | Mark                                                    | Color role (proposed)                  | Description (`en`)             | Key                               |
| ---------- | ------------------------------------------------------- | -------------------------------------- | ------------------------------ | --------------------------------- |
| `manual`   | Inked X: today’s X with a nib blot, overrunning the box | `--color-tracker-mark-manual` (green)  | “You checked this off by hand” | `tracker_row_provenance_manual`   |
| `save`     | Rubber-stamped check: one filled, square-ended shape    | `--color-tracker-mark-save` (green)    | “Filled in from your save”     | `tracker_row_provenance_save`     |
| `inferred` | Pencil ditto: two short graphite strokes                | `--color-tracker-mark-inferred` (grey) | “We filled this in for you”    | `tracker_row_provenance_inferred` |
| `unknown`  | Typed x: small, serifed, never touching the box         | `--color-tracker-mark-unknown` (green) | “From your older records”      | `tracker_row_provenance_unknown`  |

The amber single slash for `obtained` stays as it is. Only the inked X keeps the drawn-stroke
animation, since it’s the only mark the player draws.

## Accessibility

The checkbox keeps its accessible name (“Uncheck {name}”) & its state. A checked box adds
`aria-describedby` pointing at visually hidden text holding its provenance’s description. Unchecked
boxes get no description. The four marks differ in shape (an overrunning X, a filled check, two
short strokes, a small serifed x), not only in color or weight.

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
