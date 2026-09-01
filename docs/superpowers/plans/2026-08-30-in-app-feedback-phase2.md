# In-app feedback: phase 2 implementation plan

Issue #18. Implements the element picker described in
[the approved design spec](../specs/2026-08-30-in-app-feedback-design.md) §§2–5 and §7.

## Scope

Phase 2 adds the reportable-element registry, an accessible picker overlay, `TrackerRow` metadata,
and selected-element submission. Phase 3’s save-data attachment and additional reportable component
types remain out of scope.

## 1. Shared contracts

Create `src/lib/feedback/types.ts` with the `ReportableElement` contract from the specification.
Keep the payload and UI on the same type so the client, picker, and endpoint cannot drift.

Create `src/lib/feedback/context.svelte.ts` with a layout-provided feedback context that:

- registers DOM elements and their metadata through a Svelte attachment;
- deregisters elements when they unmount;
- updates an existing registration when its attachment metadata changes;
- exposes the current registered elements to the picker overlay;
- coordinates picker activation, selection, cancellation, and focus restoration; and
- clears transient picker state when the route changes.

The context owns picker coordination only. Message and email drafts remain inside
`feedback-panel.svelte`, as in phase 1.

## 2. Layout provider

Initialize the feedback context in `src/routes/+layout.svelte` so both page content and the toolbar
share one registry. Mount the picker overlay beside the toolbar and toaster. Cancel picker mode on
navigation before the keyed page content is replaced.

## 3. Picker overlay

Create `src/lib/components/feedback-picker.svelte` and test it first. The overlay will:

- render at z-40 with a viewport scrim, a fixed cancel control, and one highlight for every visible
  registered element;
- recompute highlight geometry on scroll, resize, and animation frames while picker mode is active;
- keep ordinary page controls inert while allowing page scrolling and explicit reportable-element
  selection;
- select on pointer activation, Enter, or Space;
- cancel on Escape, the cancel control, or the scrim outside a highlight;
- trap Tab focus among visible reportable elements and the cancel control;
- announce itself as a modal picker and label every target with its display name; and
- suppress transitions when the user prefers reduced motion.

Use overlay buttons positioned from each element’s viewport rectangle. This keeps the underlying
tracker controls untouched and prevents picker clicks from toggling completion or navigation. Ignore
detached, fully clipped, or zero-sized registrations.

## 4. Panel integration

Extend `src/lib/components/feedback-panel.svelte` with a `pickerEnabled` prop. Toolbar usage enables
the picker; settings usage leaves it disabled.

When enabled, the panel will:

- show “Pick an item” when no element is selected;
- close visually while picker mode is active, without discarding the draft;
- reopen after selection or cancellation;
- show the selected category and display name;
- support “Change” and “Clear” actions;
- include `selectedElement` in the POST payload; and
- clear the selected element after successful submission or route-key reset.

Entering picker mode restores focus to the initiating picker button when it ends. Normal panel
dismissal retains phase 1’s opener-focus behavior.

## 5. Tracker row registration

Extend `src/lib/components/tracker-row.svelte` with required report metadata: category, entity ID,
and page context supplied by callers. Attach the reportable registration to the whole row.

Update every production `TrackerRow` call site so each visible row has accurate metadata. Search
results retain the item’s actual category and entity ID while recording the current page route.
Unit-test attachment lifecycle and representative metadata at the `TrackerRow` boundary.

## 6. Endpoint support

Extend `src/routes/api/feedback/+server.ts` to accept optional `selectedElement` metadata.

Validation will enforce the approved limits:

- `category`, `displayName`, and `page`: required non-empty strings, at most 200 characters each;
- `entityId`: optional string, at most 100 characters;
- `extra`: optional flat string or finite-number record, at most 10 keys; and
- unknown or nested element values: rejected with a generic 400 response.

Selected feedback will use `[Feedback] {category}: {displayName}` as the sanitized issue title. The
issue body will include a readable element-context section with the ID, page, and extra fields.
Submissions without a selected element retain phase 1 behavior.

## 7. Tests

Add or update focused tests before implementation:

- feedback context: registration, metadata update, cleanup, selection, and cancellation;
- picker overlay: visible highlights, pointer and keyboard selection, Escape cancellation, focus
  cycling, clipped-element filtering, and geometry refresh;
- feedback panel: picker availability by entry point, draft preservation, selected-element display,
  change/clear actions, payload inclusion, and route reset;
- tracker row: registration metadata without changing completion behavior; and
- endpoint: valid selected metadata, selected title/body formatting, each length limit, too many
  `extra` keys, nested or non-finite values, and unchanged no-selection behavior.

## 8. Verification and delivery

After focused tests pass, run the full verification matrix once:

1. `pnpm run lint:fix`
2. `pnpm run lint`
3. `pnpm run check`
4. `pnpm run test`
5. `pnpm run build`

Commit this approved plan before implementation code. Commit the completed phase 2 implementation,
push `18-in-app-feedback`, and update the existing pull request or create one with `Closes #18`.

## 9. Expected files

| File                                                | Change                                           |
| --------------------------------------------------- | ------------------------------------------------ |
| `src/lib/feedback/types.ts`                         | Shared reportable-element contract               |
| `src/lib/feedback/context.svelte.ts`                | Registry, attachment, and picker coordination    |
| `src/lib/feedback/context.test.ts`                  | Registry and picker-state tests                  |
| `src/lib/components/feedback-picker.svelte`         | Accessible scrim and highlight overlay           |
| `src/lib/components/feedback-picker.client.test.ts` | Picker interaction and geometry tests            |
| `src/lib/components/feedback-panel.svelte`          | Picker controls, selection summary, and payload  |
| `src/lib/components/feedback-panel.client.test.ts`  | Panel picker-flow tests                          |
| `src/lib/components/tracker-row.svelte`             | Reportable attachment and metadata props         |
| `src/lib/components/tracker-row.test.ts`            | Registration behavior tests                      |
| `src/routes/+layout.svelte`                         | Provider and global picker mount                 |
| `src/lib/components/toolbar-footer.svelte`          | Enable toolbar picker flow                       |
| `src/routes/settings/+page.svelte`                  | Explicitly disable picker for settings           |
| `src/routes/api/feedback/+server.ts`                | Selected-element validation and issue formatting |
| `src/routes/api/feedback/feedback.test.ts`          | Endpoint metadata tests                          |
| Tracker-row call sites                              | Accurate category, ID, and page metadata         |
