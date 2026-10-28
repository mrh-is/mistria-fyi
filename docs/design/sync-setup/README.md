# Sync setup design package

tl;dr: Everything a later agent needs to pick up the sync setup design (#131) without the session
transcripts: the rendered mockup sheets, the generator that drew them, & pointers to the design
docs, decision records, & review rounds. The design itself lives in
[sync-setup.md](../../sync-setup.md) (journey, screens, & copy) & [sync.md](../../sync.md) (the
protocol); this folder holds the evidence behind them.

Status: in review on PR #251. Three adversarial review rounds are resolved; whether to run a fourth
is the maintainer’s call. The sheets match canvas version 51.

## What’s here

| Path                    | What it is                                                                       |
| ----------------------- | -------------------------------------------------------------------------------- |
| `sheets/`               | One PNG per canvas row, PC boards cropped to the 512 px column                   |
| `generator/kit.mjs`     | The app’s pieces (column, header, cards, dialogs, toolbar), transcribed from src |
| `generator/boards.mjs`  | Every board, by row, & the canvas notes                                          |
| `generator/build.mjs`   | Writes the canvas’s `project/` files & `canvas.json` from `boards.mjs`           |
| `generator/shots.mjs`   | Renders each canvas row to one sheet with the workspace Playwright               |
| `generator/tabler.json` | The Tabler icon paths the kit draws                                              |

The generator is throwaway tooling, kept for reference & may be removed before #251 merges. Lint &
Knip skip `docs/design/*/generator/`, so it doesn’t follow the app’s code conventions.

## Where the design lives

- **Docs:** [sync-setup.md](../../sync-setup.md) & [sync.md](../../sync.md).
- **Decision records:** [pairing confirmation](../../decisions/2026-10-27-sync-pairing-confirm.md),
  [carrying the PC’s progress](../../decisions/2026-10-28-sync-carry-pc-progress.md),
  [handing off between trackers](../../decisions/2026-10-28-sync-progress-handoff.md) (deferred), &
  [staying account-less](../../decisions/2026-10-28-sync-stay-account-less.md).
- **Canvas:** the private design canvas, https://claude.ai/artifact/UhDfkQVf4Csu7eN9RcBStx. The
  generator is its source of truth; hand edits on the canvas would be lost on the next build.
- **Issues:** the epic #123, this design #131, & the follow-ups it routed: #269 (the deferred
  handoff), #135 (apply-time screens & restoring the farm-switch backup), #130 (Steam Deck & Flatpak
  checks), & #133 (measuring a late-game backup).

## Review history

All on PR #251, each round’s findings followed by its resolutions:

1. **First design review & re-review** (2026-10-27):
   [review](https://github.com/mrh-is/mistria-fyi/pull/251#pullrequestreview-5675837329),
   [resolutions](https://github.com/mrh-is/mistria-fyi/pull/251#issuecomment-6457380960),
   [re-review](https://github.com/mrh-is/mistria-fyi/pull/251#pullrequestreview-5676430882),
   [re-review resolutions](https://github.com/mrh-is/mistria-fyi/pull/251#issuecomment-6457680543).
2. **Adversarial round one** (Codex & Claude, merged):
   [findings](https://github.com/mrh-is/mistria-fyi/pull/251#pullrequestreview-5678299106),
   [protocol resolutions](https://github.com/mrh-is/mistria-fyi/pull/251#issuecomment-6461882441).
3. **Adversarial round two:**
   [findings](https://github.com/mrh-is/mistria-fyi/pull/251#pullrequestreview-5678643305),
   [resolutions](https://github.com/mrh-is/mistria-fyi/pull/251#issuecomment-6473159660). Two scope
   cuts came out of it: carried progress no longer merges, & the handoff is deferred to #269.
4. **Adversarial round three:**
   [findings](https://github.com/mrh-is/mistria-fyi/pull/251#pullrequestreview-5686381834), with the
   resolutions in the PR comment that follows it. The protocol & setup stayed in one PR, since
   they’re too interwoven to split.

What the rounds taught, for the next one: most findings came from material added to answer the
previous round, & from drift between the docs, the copy tables, & the sheets. Run a consistency pass
across all of them before each review. Round three added a second lesson: lifecycles written as
prose bullets kept hiding races, so `sync.md` now states them as tables of states & transitions.

## Sheets

| Sheet                                           | Row                                                        |
| ----------------------------------------------- | ---------------------------------------------------------- |
| [01-first.png](sheets/01-first.png)             | First look: the Home welcome card & the setup page         |
| [02-pc-setup.png](sheets/02-pc-setup.png)       | Setup on the PC, through the farm check & carried progress |
| [03-phone-setup.png](sheets/03-phone-setup.png) | Setup on the phone, including the PC’s-progress question   |
| [04-desktops.png](sheets/04-desktops.png)       | Mac & Linux                                                |
| [05-hiccups.png](sheets/05-hiccups.png)         | Setup hiccups on both devices                              |
| [06-data.png](sheets/06-data.png)               | Data management, regrouped into Pairing & Data             |
| [07-new-phone.png](sheets/07-new-phone.png)     | A new phone: back up, restore, then pair                   |
| [08-dash.png](sheets/08-dash.png)               | The relay dashboard & its delivery states                  |
| [09-trouble.png](sheets/09-trouble.png)         | When the relay needs you                                   |
| [10-phone.png](sheets/10-phone.png)             | Living with it on the phone                                |
| [11-iphone.png](sheets/11-iphone.png)           | Moving to the iPhone app                                   |
| [12-self.png](sheets/12-self.png)               | The self-updating tracker                                  |

## Regenerating

From the repository root, with dependencies installed (the generator borrows the workspace
Playwright). `PREV` is the current `project/canvas.json`, read from the canvas, whose keys the build
keeps:

```bash
node docs/design/sync-setup/generator/build.mjs "$OUT" "$PREV"
```

```bash
node docs/design/sync-setup/generator/shots.mjs "$OUT" docs/design/sync-setup/sheets "$PWD"
```

`build.mjs` writes `$OUT/project/` & a `manifest.json` naming the boards written & removed; publish
the changed files to the canvas, then re-render the sheets. Change a board in `boards.mjs`, never in
the built files.
