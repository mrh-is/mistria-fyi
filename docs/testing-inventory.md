# Component testing inventory

tl;dr: Interactive Svelte components get happy-dom tests (`*.client.test.ts`) that drive them
through accessible queries; pure renderers keep server-render tests (`*.test.ts`); route-level
keyboard, focus, and axe checks live in Playwright. This page lists which layer covers each
component and what remains uncovered, so new work lands in the right layer instead of duplicating
another.

## Focused checks

For a changed module or component, run `pnpm exec vitest run path/to/file.test.ts`, including
`*.client.test.ts` files. The table below identifies test layers & broader runners; it does not make
a whole project suite the development default. For browser work, select the changed route or
interaction as described in [the workflow](development-workflow.md#full-local-matrix). Full local
verification uses only the exceptions in [agent-verification.md](agent-verification.md).

## Test layers

| Layer           | Files                              | Vitest project    | Runner                        | Use for                                                             |
| --------------- | ---------------------------------- | ----------------- | ----------------------------- | ------------------------------------------------------------------- |
| Server render   | `src/**/*.test.ts`                 | `app`             | `pnpm run test:app`           | Static markup, invariants, SEO output, anything with no interaction |
| Module mocks    | `src/**/*.isolated.test.ts`        | `isolated`        | `pnpm run test:app`           | Server-render tests that `vi.mock()` or reset modules               |
| Cold start      | `src/**/*.cold.test.ts`            | `cold`            | `pnpm run test:app`           | The names-cache loading boundary, with no names preloaded           |
| happy-dom       | `src/**/*.client.test.ts`          | `client`          | `pnpm run test:client`        | Clicks, keyboard, focus, async state, store effects, dialogs        |
| happy-dom mocks | `src/**/*.isolated.client.test.ts` | `client-isolated` | `pnpm run test:client`        | happy-dom tests that `vi.mock()` or reset modules                   |
| Browser (a11y)  | `tests/accessibility/*.ts`         | Playwright        | `pnpm run test:accessibility` | Full-route axe scans, reflow, forced colors, reduced motion         |

The a11y suite's own helpers have unit tests (`tests/accessibility/support/*.test.ts`), which run in
Vitest's `node` project with `pnpm run test`. `docs/development-workflow.md` describes every Vitest
project.

happy-dom tests share three setup files (`src/vitest-setup.ts`, `src/vitest-setup-app-state.ts`,
`src/vitest-setup-names.ts`). The first stubs `matchMedia` and `Element.animate()`; the `animate`
stub fires `onfinish` on the next macrotask so `transition:` outros actually remove their nodes. The
second mocks `$app/state` with the reactive `pageStub` (see “Shared helpers”) and resets it after
each file; a test that needs a different URL or status, or route changes, sets the stub and resets
it in `beforeEach`.

Components that read context (the feedback context, for example) get a sibling
`*.test-harness.svelte` that sets the context and renders the component under test. For the feedback
context specifically, `renderWithFeedback` & `renderToFragmentWithFeedback` (in
`src/lib/test-utils/`) wrap any component in one, since `getFeedbackContext()` throws outside a
provider.

## Coverage by component

"Server" means a `*.test.ts` file exists; "happy-dom" means a `*.client.test.ts` file exists.
Components marked "via parent" are exercised through a parent's happy-dom test rather than their
own. `tests/testing-inventory.test.ts` fails when a component is missing from these tables or a
single-component row's marks disagree with its test files.

### Toolbar & panels

| Component                        | Server | happy-dom  | Notes                                                                             |
| -------------------------------- | :----: | :--------: | --------------------------------------------------------------------------------- |
| `toolbar-footer`                 |        |     ✓      | Panel mutual exclusion, Escape/backdrop/close, route change, search, filter reset |
| `panel-overlay`                  |        | via parent | Shared overlay & focus through toolbar & feedback panel tests                     |
| `foldout-panel`                  |        |     ✓      | Dialog semantics, Escape, Tab wrap, non-dialog mode                               |
| `filter-panel`                   |   ✓    |     ✓      | Chips, season/weather strips, source groups, explainer, completed switch          |
| `quick-settings-panel`           |        |     ✓      | Language list, spoiler confirmation                                               |
| `quick-settings-language-picker` |        |     ✓      | Offline-unavailable message; locale list through `quick-settings-panel`           |
| `quick-settings-theme-picker`    |        |            | Gap: theme selection and persistence                                              |
| `feedback-panel`                 |        |     ✓      | Form, Turnstile, submit states                                                    |
| `feedback-picker`                |        |     ✓      | Element picking                                                                   |
| `search-results`                 |        |     ✓      | Toggle and undo across categories                                                 |
| `search-results-loading`         |        |     ✓      |                                                                                   |
| `source-explainer-dialog`        |        | via parent | Open and dismiss through `filter-panel`                                           |
| `tag-dialog`                     |        | via parent | Through `source-explainer-dialog` and `quick-settings-panel`                      |
| `villager-search-result`         |        | via parent | Record link through `search-results`                                              |
| `blocky-switch`                  |        | via parent | Through `filter-panel` and `quick-settings-panel`                                 |

### Tracker rows & controls

| Component                                 | Server | happy-dom  | Notes                                                     |
| ----------------------------------------- | :----: | :--------: | --------------------------------------------------------- |
| `tracker-row`                             |   ✓    |     ✓      | Spoiler, completion, source papers, focus, sprite preview |
| `tracker-row-stack`                       |   ✓    |            | Layout only                                               |
| `tracker-row-list`                        |        |     ✓      | Row cap, show more, progressive count, empty note         |
| `tracker-empty-state`                     |        | via parent | Through `tracker-row-list`                                |
| `tracker-checkbox`                        |        |     ✓      | Label, click forwarding, visual states                    |
| `tracker-paper`                           |        |            | Layout only; no interaction                               |
| `confirm-spoiler-dialog`                  |        |     ✓      | Invertible vs. non-invertible choices, handler routing    |
| `spoiler-guard-dialog`                    |        |     ✓      | Renders only while the guard holds a condition            |
| `skill-record`                            |        |     ✓      | Level editing                                             |
| `stepper`                                 |        |     ✓      | Grouped controls                                          |
| `dialog-close-button`                     |        |     ✓      | Localized close control, dismisses the dialog             |
| `status-note`                             |   ✓    |            | Tone classes; alert role for errors & warnings            |
| `expandable-section`                      |        |     ✓      | Disclosure, IDs, nesting, reporting                       |
| `section-groups`                          |        |     ✓      | Completed grouping, toggle hold window, kept expansion    |
| `section-group-item`, `completed-heading` |        | via parent | Through `section-groups`                                  |
| `spoiler`                                 |        | via parent | Through `tracker-row`                                     |
| `spoiler-section`                         |        |     ✓      | Hidden header without progress, reveal                    |
| `section-trigger`                         |        | via parent | Through `expandable-section` & `spoiler-section`          |
| `sprite-preview-button`                   |        | via parent | Through `tracker-row`                                     |
| `sprite-slot`                             |        | via parent | Through `tracker-row`                                     |
| `source-card`                             |   ✓    |            | Static rendering                                          |
| `source-paper`                            |        | via parent | Through `tracker-row`                                     |
| `source-segment-text`                     |   ✓    |            | Static rendering                                          |
| `source-filtered-content`                 |   ✓    |            | Filtering logic is store-tested                           |
| `restriction-badges`                      |        |            | Gap: static; server test would suffice                    |
| `mine-floor-record`                       |        |     ✓      |                                                           |
| `renown-current-record`                   |        |     ✓      |                                                           |
| `villager-record`                         |   ✓    |     ✓      | Server: sprite has no inline handler (CSP)                |
| `villagers-content`                       |        |     ✓      |                                                           |
| `villager-alphabet-index`                 |        |     ✓      |                                                           |
| `rank-record`                             |        |     ✓      |                                                           |

### Category content

| Component                                                                                                                                        | Server | happy-dom | Notes                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | :----: | :-------: | --------------------------------------------------------------- |
| `almanac-content`                                                                                                                                |        |     ✓     |                                                                 |
| `animals-content`, `animal-subcategory`, `animal-*-section`, `mount-appearances-section`, `pet-collectibles-section`                             |        |           | Gap: variant/cosmetic toggles; store is tested                  |
| `cosmetics-content`, `mines-content`, `museum-content`, `quests-content`, `recipes-content`, `renown-content`, `dates-section`, `skills-content` |        |           | Gap: page compositors; rows and dialogs are tested individually |

### Data page

| Component          | Server | happy-dom  | Notes                                                                    |
| ------------------ | :----: | :--------: | ------------------------------------------------------------------------ |
| `import-card`      |   ✓    |     ✓      | Oversized-file rejection; atomicity                                      |
| `transfer-card`    |   ✓    |     ✓      | QR generation (in-flight, success, failure), image & camera scan, errors |
| `backup-card`      |   ✓    |     ✓      | Export download, restore success and every error kind                    |
| `danger-zone-card` |   ✓    |     ✓      | Confirm, cancel, reset                                                   |
| `merge-summary`    |   ✓    |            | Static rendering                                                         |
| `data-card`        |   ✓    | via parent | Collapsed summaries; expand through the cards                            |

Camera scanning in `transfer-card` is covered with a mocked `startQrCamera`; the real `getUserMedia`
stream & decoder are not.

### Static & layout

| Component                                                                                                                    | Server  | happy-dom | Notes                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | :-----: | :-------: | -------------------------------------------------------------- |
| `category-card` (with `category-stripe`), `category-grid`, `content-counters`, `overall-progress`, `page-header`, `seo-head` |    ✓    |           | Static                                                         |
| `welcome-card`                                                                                                               |         |     ✓     |                                                                |
| `persistence-warning`                                                                                                        |         |           | Gap: store-level lifecycle is tested                           |
| `ai-disclosure-dialog`                                                                                                       |         |           | Gap: open/dismiss                                              |
| `app-updater`                                                                                                                |         |     ✓     | Idle reload, busy deferral, & guarded reloads after navigation |
| `og-share-card`, `pencil-filter`, `icon/*`, `all-completed`                                                                  |         |           | Static; no test needed                                         |
| Route `+page.svelte` files, `routes/everything/category-section.svelte`                                                      | partial |           | `about`, `data`, `privacy`, `error`, `everything` have tests   |

## Remaining gaps

Ordered by risk:

1. **`quick-settings-theme-picker`**: theme choice and its `localStorage` persistence.
2. **`ai-disclosure-dialog`** & **`persistence-warning`**: open, dismiss, and dismissal memory.
3. **Category compositors** (`*-content.svelte`): a smoke test per page that a spoilered row opens
   `confirm-spoiler-dialog` and that "Yes, and update my progress" changes progression.
4. **Camera stream** in `transfer-card`: the real `getUserMedia` path belongs in the Playwright
   layer with a fake media stream, if it is covered at all.

## Shared helpers

Reuse these from `src/lib/test-utils/` rather than copying a local version into a test file:

- **`makeCompletedState(overrides)`** (`completed-state.ts`): an empty `ProgressState` with every
  animal's sets present, plus overrides.
- **`deepMerge(base, overrides)`** (`deep-partial.ts`): merges a `DeepPartial` override into a
  fixture.
- **`memoryStorage(entries)`** (`memory-storage.ts`): an in-memory `Storage` for
  `vi.stubGlobal("localStorage", …)`. Wrap it to inject a failure on one method.
- **`pageStub`** (`page-stub.svelte.ts`): a reactive `$app/state` `page`, which the app & client
  setup already installs. Set `pageStub.status` or call `pageStub.navigate()`, and call
  `pageStub.reset()` in `beforeEach`.
- **`renderToFragment`** (`render-to-fragment.ts`): server-renders a component into a queryable
  fragment for `*.test.ts` files.

## Conventions

- Query by role, accessible name, or label text. Reach for `container.querySelector` only for
  decorative markup (an SVG stroke count, a class that drives a visual state).
- Assert observable outcomes: text, `aria-*` state, focus, and store state that the user would see
  reflected. Do not assert on internal component variables.
- Cover in-flight, success, and failure states for asynchronous actions, and always assert that a
  failure leaves progress untouched.
- Clean up with `cleanup()` and `userState.resetAll()`, then `await tick()` so the next test mounts
  on a settled DOM. Never sleep for real time: `waitFor` an observable condition, or use fake timers
  (`vi.useFakeTimers()`) for debounces, advancing by the exported constant (for example
  `PERSIST_DEBOUNCE_MS`) rather than a guessed number.
- Keep a component's test as a server-render test when it has no interaction to exercise.
