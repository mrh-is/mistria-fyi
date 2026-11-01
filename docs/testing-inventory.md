# Component testing inventory

tl;dr: Interactive Svelte components get happy-dom tests (`*.client.test.ts`) that drive them
through accessible queries; pure renderers keep server-render tests (`*.test.ts`); route-level
keyboard, focus, and axe checks live in Playwright. This page explains which layer to use & what
remains uncovered, so new work lands in the right layer instead of duplicating another.

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

## Remaining gaps

Ordered by risk:

1. **`quick-settings-theme-picker`**: theme choice and its `localStorage` persistence.
2. **`ai-disclosure-dialog`** & **`persistence-warning`**: open, dismiss, and dismissal memory.
3. **Category compositors** (`*-content.svelte`): a smoke test per page that a spoilered row opens
   `confirm-spoiler-dialog` and that "Yes, and update my progress" changes progression.
4. **Camera stream** in `transfer-card`: the real `getUserMedia` path belongs in the Playwright
   layer with a fake media stream, if it is covered at all.
5. **`animals-content` & its sections**: variant & cosmetic toggles (the store is tested).
6. **`restriction-badges`**: static, so a server-render test would suffice.

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
