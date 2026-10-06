# Component testing inventory

tl;dr: Interactive Svelte components get happy-dom tests (`*.client.test.ts`) that drive them
through accessible queries; pure renderers keep server-render tests (`*.test.ts`); route-level
keyboard, focus, and axe checks live in Playwright. This page lists which layer covers each
component and what remains uncovered, so new work lands in the right layer instead of duplicating
another.

## Test layers

| Layer          | Files                 | Runner                        | Use for                                                             |
| -------------- | --------------------- | ----------------------------- | ------------------------------------------------------------------- |
| Server render  | `*.test.ts`           | `pnpm run test:app`           | Static markup, invariants, SEO output, anything with no interaction |
| happy-dom      | `*.client.test.ts`    | `pnpm run test:client`        | Clicks, keyboard, focus, async state, store effects, dialogs        |
| Browser (a11y) | `tests/accessibility` | `pnpm run test:accessibility` | Full-route axe scans, reflow, forced colors, reduced motion         |

happy-dom tests share three setup files (`src/vitest-setup.ts`, `src/vitest-setup-app-state.ts`,
`src/vitest-setup-names.ts`). The first stubs `matchMedia` and `Element.animate()`; the `animate`
stub fires `onfinish` on the next macrotask so `transition:` outros actually remove their nodes. The
second mocks `$app/state` with a static `page`; a test that needs route changes mocks `$app/state`
itself with the reactive `pageStub` from `src/lib/test-utils/page-stub.svelte.ts`.

Components that read context (the feedback context, for example) get a sibling
`*.test-harness.svelte` that sets the context and renders the component under test.

## Coverage by component

"Server" means a `*.test.ts` file exists; "happy-dom" means a `*.client.test.ts` file exists.
Components marked "via parent" are exercised through a parent's happy-dom test rather than their
own.

### Toolbar & panels

| Component                        | Server | happy-dom  | Notes                                                                             |
| -------------------------------- | :----: | :--------: | --------------------------------------------------------------------------------- |
| `toolbar-footer`                 |        |     ✓      | Panel mutual exclusion, Escape/backdrop/close, route change, search, filter reset |
| `foldout-panel`                  |        |     ✓      | Dialog semantics, Escape, Tab wrap, non-dialog mode                               |
| `visibility-panel`               |   ✓    |     ✓      | Chips, season/weather strips, source groups, explainer, completed switch          |
| `quick-settings-panel`           |        |     ✓      | Language list, spoiler confirmation                                               |
| `quick-settings-language-picker` |        | via parent | Through `quick-settings-panel`                                                    |
| `quick-settings-theme-picker`    |        |            | Gap: theme selection and persistence                                              |
| `feedback-panel`                 |        |     ✓      | Form, Turnstile, submit states                                                    |
| `feedback-picker`                |        |     ✓      | Element picking                                                                   |
| `search-results`                 |        |     ✓      | Toggle and undo across categories                                                 |
| `search-results-loading`         |        |     ✓      |                                                                                   |
| `source-explainer-dialog`        |        | via parent | Open and dismiss through `visibility-panel`                                       |
| `blocky-switch`                  |        | via parent | Through `visibility-panel` and `quick-settings-panel`                             |

### Tracker rows & controls

| Component                    | Server | happy-dom  | Notes                                                     |
| ---------------------------- | :----: | :--------: | --------------------------------------------------------- |
| `tracker-row`                |   ✓    |     ✓      | Spoiler reveal, completion, source papers, focus movement |
| `tracker-row-stack`          |   ✓    |            | Layout only                                               |
| `tracker-checkbox`           |        |     ✓      | Label, click forwarding, visual states                    |
| `tracker-paper`              |        |            | Layout only; no interaction                               |
| `confirm-spoiler-dialog`     |        |     ✓      | Invertible vs. non-invertible choices, handler routing    |
| `skill-row`                  |        |     ✓      | Level editing                                             |
| `stepper`                    |        |     ✓      | Grouped controls                                          |
| `expandable-section`         |        |     ✓      | Disclosure, IDs, nesting, reporting                       |
| `spoiler`, `spoiler-section` |        | via parent | Through `tracker-row`                                     |
| `sprite-slot`                |        | via parent | Through `tracker-row`                                     |
| `source-card`                |   ✓    |            | Static rendering                                          |
| `source-paper`               |        | via parent | Through `tracker-row`                                     |
| `source-segment-text`        |   ✓    |            | Static rendering                                          |
| `source-filtered-content`    |   ✓    |            | Filtering logic is store-tested                           |
| `restriction-badges`         |        |            | Gap: static; server test would suffice                    |
| `mine-floor-record`          |        |     ✓      |                                                           |
| `renown-current-record`      |        |     ✓      |                                                           |
| `villager-record`            |        |     ✓      |                                                           |
| `villager-roster`            |        |     ✓      |                                                           |
| `villager-alphabet-index`    |        |     ✓      |                                                           |
| `rank-record` (renown)       |        |     ✓      |                                                           |

### Category content

| Component                                                                                                                      | Server | happy-dom | Notes                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | :----: | :-------: | --------------------------------------------------------------- |
| `almanac-content`                                                                                                              |        |     ✓     |                                                                 |
| `animals-content`, `animal-subcategory`, `animal-*-section`, `pet-collectibles-section`                                        |        |           | Gap: variant/cosmetic toggles; store is tested                  |
| `cosmetics-content`, `mines-content`, `museum-content`, `quests-content`, `recipes-content`, `dates-section`, `skills-content` |        |           | Gap: page compositors; rows and dialogs are tested individually |

### Data page

| Component          | Server | happy-dom  | Notes                                                                    |
| ------------------ | :----: | :--------: | ------------------------------------------------------------------------ |
| `import-card`      |   ✓    |     ✓      | Oversized-file rejection; atomicity                                      |
| `transfer-card`    |   ✓    |     ✓      | QR generation (in-flight, success, failure), image scan merge and errors |
| `backup-card`      |   ✓    |     ✓      | Export download, restore success and every error kind                    |
| `danger-zone-card` |   ✓    |     ✓      | Confirm, cancel, reset                                                   |
| `merge-summary`    |   ✓    |            | Static rendering                                                         |
| `data-card`        |   ✓    | via parent | Collapsed summaries; expand through the cards                            |

Camera scanning in `transfer-card` is not covered: it needs `getUserMedia`, which happy-dom lacks.

### Static & layout

| Component                                                                                           | Server  | happy-dom | Notes                                                 |
| --------------------------------------------------------------------------------------------------- | :-----: | :-------: | ----------------------------------------------------- |
| `category-card`, `category-grid`, `content-counters`, `overall-progress`, `page-header`, `seo-head` |    ✓    |           | Static                                                |
| `welcome-card`                                                                                      |         |     ✓     |                                                       |
| `persistence-warning`                                                                               |         |           | Gap: store-level lifecycle is tested                  |
| `ai-disclosure-dialog`                                                                              |         |           | Gap: open/dismiss                                     |
| `og-share-card`, `pencil-filter`, `icon/*`, `all-completed`                                         |         |           | Static; no test needed                                |
| Route `+page.svelte` files, `routes/all/*-section.svelte`                                           | partial |           | `about`, `data`, `privacy`, `error` have server tests |

## Remaining gaps

Ordered by risk:

1. **`quick-settings-theme-picker`**: theme choice and its `localStorage` persistence.
2. **`ai-disclosure-dialog`** and **`persistence-warning`**: open, dismiss, and dismissal memory.
3. **Category compositors** (`*-content.svelte`): a smoke test per page that a spoilered row opens
   `confirm-spoiler-dialog` and that "Yes, and update my progress" changes progression.
4. **Camera scanning** in `transfer-card`: belongs in the Playwright layer with a fake media stream,
   if it is covered at all.

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
