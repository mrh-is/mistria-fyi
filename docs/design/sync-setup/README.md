# Save file sync setup design package

tl;dr: The mockups for save file sync setup (#131): one rendered sheet per canvas row, & the
generator that draws them. The design itself lives in [sync-setup.md](../../sync-setup.md) (journey,
screens, & copy) & [sync.md](../../sync.md) (the protocol); this folder holds the evidence behind
them.

Status: approved on #131 (2026-10-28), after two design review rounds on PR #275, both resolved
there. The sheets match the canvas as generated from `generator/boards.mjs`.

## What’s here

| Path                    | What it is                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `sheets/`               | One PNG per canvas row, computer boards cropped to a 600 px strip around the column |
| `generator/kit.mjs`     | The app’s pieces (column, header, cards, dialogs, toolbar), transcribed from src    |
| `generator/boards.mjs`  | Every board, by row, & the canvas notes                                             |
| `generator/build.mjs`   | Writes the canvas’s `project/` files & `canvas.json` from `boards.mjs`              |
| `generator/shots.mjs`   | Renders each canvas row to one sheet with the workspace Playwright                  |
| `generator/tabler.json` | The Tabler icon paths the kit draws                                                 |

The kit & build scripts come from the earlier pairing design on #251, whose own canvas & sheets stay
on that PR as history. The generator is throwaway tooling kept for reference; lint & Knip skip
`docs/design/*/generator/`, so it doesn’t follow the app’s code conventions.

## Where the design lives

- **Docs:** [sync-setup.md](../../sync-setup.md), [sync.md](../../sync.md), & the copy voice in
  [voice.md](../../voice.md).
- **Decision record:**
  [follow the save, not a pairing](../../decisions/2026-10-28-sync-follow-the-save.md).
- **Canvas:** the private design canvas, https://claude.ai/artifact/5MG6rDBdx4HqjGmQyBbjrD. The
  generator is its source of truth; hand edits on the canvas would be lost on the next build.
- **Reviews:** rounds one & two on PR #275, each with its resolutions in the PR comment that follows
  it, & the maintainer’s two mockup passes.

## Sheets

| Sheet                                           | Row                                               |
| ----------------------------------------------- | ------------------------------------------------- |
| [01-start.png](sheets/01-start.png)             | Getting started: Home & “Where’s your save file?” |
| [02-computer.png](sheets/02-computer.png)       | On the gaming computer: one file, then a code     |
| [03-phone-setup.png](sheets/03-phone-setup.png) | On another device: scan, and it’s there           |
| [04-living.png](sheets/04-living.png)           | Living with it                                    |
| [05-trouble.png](sheets/05-trouble.png)         | Trouble on the gaming computer                    |
| [06-data.png](sheets/06-data.png)               | Data: new codes & leaving a lane                  |

## Regenerating

From the repository root, with dependencies installed (the generator borrows the workspace
Playwright). `PREV` is the live `project/canvas.json`, read from the canvas, whose keys the build
keeps; leave it off for a fresh canvas:

```bash
node docs/design/sync-setup/generator/build.mjs "$OUT" "$PREV"
```

```bash
node docs/design/sync-setup/generator/shots.mjs "$OUT" docs/design/sync-setup/sheets "$PWD"
```

`build.mjs` writes `$OUT/project/` & a `manifest.json` naming the boards written & removed; publish
the changed files to the canvas, then re-render the sheets. Change a board in `boards.mjs`, never in
the built files, & change copy in `sync-setup.md`’s copy table first.
