# Field guide design package

tl;dr: The working mockup for the field guide redesign (#477). The app becomes a wire-bound field
guide folded back on its wire, with colored thumb tabs as the category index, pencil marks for
progress, and pages drawn from real saves. Round ten is the last exploratory round; the next phase
splits it into a styling session and one session per screen.

Status: direction settled, details open. The decisions, the open polish notes, & the data fixes are
in the
[round-ten write-up on #477](https://github.com/mrh-is/mistria-fyi/issues/477#issuecomment-6775306384).
Earlier rounds are summarized in the same issue.

## What’s here

| Path                        | What it is                                                                      |
| --------------------------- | ------------------------------------------------------------------------------- |
| `round-ten.html`            | The mockup: every page at desktop, half-screen, & phone widths, on three saves  |
| `sheets/`                   | Screenshots of the mockup, rendered by `generator/shots.mjs`                    |
| `generator/export.test.mjs` | Exports the mockup’s data from three saves, through the app’s own projections   |
| `generator/bake.mjs`        | Bakes each sprite in full color, a category tint, & a silhouette                |
| `generator/inject.mjs`      | Swaps fresh data into `round-ten.html`                                          |
| `generator/shots.mjs`       | Renders `round-ten.html` & screenshots its frames with the workspace Playwright |

`round-ten.html` is the source. Edit its markup, styles, & script in place. Its data is inlined on
one line (`const DATA = …;`) so `inject.mjs` can replace it. Lint & Knip skip
`docs/design/*/generator/`.

Game sprites & Satoshi stay out of Git (see `docs/sprite-assets.md` & `docs/font-assets.md`). The
mockup loads Satoshi from `assets.mistria.fyi`, and its sprites from a gitignored `sprites.js`
beside it. Bake that file once after checkout; without it, rows draw no sprites:

```sh
node docs/design/field-guide/generator/bake.mjs
```

After that, the mockup opens from disk; offline, annotations fall back to the system sans.

## Saves

The mockup reads three of Dewey’s saves from `pipeline/input/`:

| Save      | File                                             | Date              |
| --------- | ------------------------------------------------ | ----------------- |
| Day one   | `v1.0.8/save/game-1720221376-autosave.sav`       | Spring 1, Year 1  |
| Mid game  | `archive/Save file/game-1315159680-autosave.sav` | Spring 14, Year 2 |
| Late game | `v1.0.8/save/game-1315159680-autosave.sav`       | Fall 2, Year 2    |

## Refreshing the data

Run these from the repository root. The export reads the three saves above from `pipeline/input/`,
which a linked worktree gets from `node scripts/setup-worktree.ts`. The export imports the app’s
Svelte stores, so it runs under Vitest’s `app` project, which only collects `.test.ts` files. Copy
it into `src/lib`, run it, and delete the copy:

```sh
cp docs/design/field-guide/generator/export.test.mjs src/lib/zz-field-guide-export.test.ts
R10_OUT=/tmp/field-guide-data.json pnpm exec vitest run --project app src/lib/zz-field-guide-export.test.ts
rm src/lib/zz-field-guide-export.test.ts
node docs/design/field-guide/generator/inject.mjs /tmp/field-guide-data.json
```

Rebake the sprites when the set of sprites changes. `bake.mjs` fetches each sprite from
`assets.mistria.fyi`:

```sh
node docs/design/field-guide/generator/bake.mjs /tmp/field-guide-data.json
```

## Stand-ins for missing data

The export fills a few gaps that the pipeline doesn’t cover yet. Each one is tracked:

- **Today’s count** applies #620’s gates over the app’s availability: mine floors, the replicator’s
  original, festival days, renown levels, & museum set counts.
- **Crafting stations** use the app’s method names (“Craft”, “Cook”, “Smith”, “Mill”, “Dragon
  Forge”) until #632 records each recipe’s station.
- **Full Restore** counts as learned from mines floor 10, until #628 gives it a source.
- **Renown** treats a level with no item reward as money, until #634 extracts money rewards.
