# In-app feedback & issue reporting

Issue #18. Add a way for users to report data errors, UI bugs, and general feedback from within the
app, with an optional element picker that lets them point at the specific tracker item they mean.

Note: This spec supersedes issue #18's original "status: needs decision" scope. The decisions were
made in conversation on 2026-08-30: open-ended text (no forced categories), a custom server endpoint
(not GitHub issue forms), and phased delivery starting with a core feedback loop.

## Design goals

1. **Zero-friction reporting.** No account required, no GitHub knowledge assumed. The target
   audience is Fields of Mistria players, not developers.
2. **Structured context, open-ended text.** Auto-include non-identifying metadata (app version, game
   data version, selected element); let the user write whatever they want rather than forcing them
   into categories.
3. **Progressive disclosure.** A simple text box is the baseline. The element picker and save-data
   attachment are opt-in power features that surface richer context when the user wants to provide
   it.

---

## 1. Entry points

### Settings page

A "Send feedback" card in the settings page, grouped with the existing informational footer (app
version, game data version, privacy policy link). Always visible; opens the feedback panel described
in §3.

The settings entry point opens the feedback panel directly (no element picker available, since
settings has no reportable tracker elements). The "Pick an item" button is hidden when opened from
settings.

### Toolbar footer

A small `MessageCircleWarning` icon button in the toolbar footer bar, visible on all pages that show
the toolbar. Placement: consistently in the **left slot**.

This accompanies a toolbar layout reorganization defined in the
[visibility panel redesign](2026-08-30-visibility-panel-redesign.md) spec (prerequisite, can land in
the same PR):

| Left                              | Center                                   | Right                                     |
| --------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Feedback (`MessageCircleWarning`) | Search (`Search`, on pages that have it) | Visibility (merged filters + world state) |

When search is active (expanded to full bar width), the feedback and visibility buttons are hidden
(same as current behavior where search replaces the toolbar controls). The feedback panel, if open,
closes when search activates.

---

## 2. Element picker

An opt-in mode within the feedback panel. The user taps a "Pick an item" button, which activates
picker mode. The picker is optional; the user can also just type their feedback without selecting
anything. The "Pick an item" button is only shown when the feedback panel was opened from a page
that has reportable elements (not from settings).

### Picker UX

1. A **scrim overlay** covers the entire viewport (semi-transparent backdrop), clearly signaling
   "you're in a different mode now". No accidental checkbox toggles, no navigation.
2. **Reportable elements** are highlighted with a visible outline or border through the scrim,
   indicating "you can tap this".
3. Tapping a highlighted element **selects it**, exits picker mode, and returns to the feedback
   panel with the element's metadata pre-filled.
4. A **cancel button** (fixed-position, always visible above the scrim) or tapping the scrim outside
   any reportable element exits picker mode without selecting anything.
5. The page beneath the scrim remains **scrollable**: the scrim uses `pointer-events: none` on
   non-interactive areas, with `pointer-events: auto` only on the highlighted reportable elements
   and the cancel button. Scroll events pass through to the underlying page. Touch events on
   reportable elements are intercepted for selection; all other interactions (checkbox toggles,
   navigation) are blocked by the scrim's visual coverage and the interception layer.

### Accessibility

- **Keyboard:** `Escape` exits picker mode. `Tab` cycles through reportable elements. `Enter` or
  `Space` selects the focused element.
- **Focus management:** entering picker mode traps focus within the picker overlay (reportable
  elements + cancel button). Exiting restores focus to the "Pick an item" button.
- **Screen readers:** the picker overlay is announced as a dialog/region. Each reportable element
  has an `aria-label` describing what it is (e.g., "Report feedback about Tomato Soup").
- **Minimum target size:** reportable element hit targets are at least 44×44px (already satisfied by
  `TrackerRow`'s existing touch targets).
- **Reduced motion:** scrim and highlight transitions respect `prefers-reduced-motion`.

### What's reportable

Components opt in to being reportable by participating in a feedback context. Not every DOM element
is targetable; the set is defined explicitly:

| Component                              | Reportable unit           | Metadata captured                                        |
| -------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `TrackerRow`                           | The whole row             | Item/quest/entity ID, entity name, category, page        |
| `SkillRow`                             | The skill block           | Skill ID, skill name, current level                      |
| `Stepper` (mines floors, renown tiers) | The stepper + its section | Section context (biome name, renown tier), current value |
| NPC-related content (dates, quests)    | The NPC's section or row  | NPC ID, NPC name                                         |
| `ExpandableSection` headers            | The section               | Section label, page                                      |
| Other future components                | Opted in as needed        | Component-defined metadata                               |

### Metadata shape

```typescript
interface ReportableElement {
  /** What kind of thing this is, for human-readable context. */
  category: string; // e.g., "quest", "recipe", "skill", "mines", "museum set"
  /** Display name of the element, for the confirmation step. */
  displayName: string;
  /** Structured ID from tracker data, if applicable. */
  entityId?: string;
  /** Additional component-specific context (e.g., current level, biome name). */
  extra?: Record<string, string | number>;
  /** Which page/route this appeared on. */
  page: string;
}
```

The `extra` field accommodates component-specific metadata (skill level, stepper value, biome name)
without requiring the base interface to anticipate every component's needs.

### No client-side screenshots

Element screenshots were evaluated and deferred. Every viable library (`html-to-image` at ~11 KB,
`html2canvas` at ~40 KB, `SnapDOM` at ~8 KB) has iOS Safari reliability gaps: blank renders,
transparency failures, or insufficient real-world mobile validation. Since this app's primary
audience is mobile, shipping a feature that works on desktop but fails silently on phones is worse
than not having it.

The structured metadata from the picker (entity ID, display name, category, page) already identifies
the element precisely. For a data-accuracy tracker, knowing "recipe `tomato_soup` on the recipes
page" is more actionable than a screenshot of that row. If screenshot demand emerges from real
feedback submissions, spike `html-to-image` or `SnapDOM` with explicit iOS Safari testing.

---

## 3. Feedback panel

A bottom sheet or modal that opens from either entry point. Contains:

### Overlay coordination

The feedback panel, visibility panel, and element picker are mutually exclusive overlays:

- Opening the feedback panel closes the visibility panel (and vice versa).
- Entering picker mode closes the feedback panel's sheet temporarily (the scrim replaces it).
- Selecting or cancelling from the picker reopens the feedback panel with state preserved.
- Z-index ordering: scrim/picker (z-40) > feedback panel (z-30) > visibility panel (z-30). Only one
  of feedback or visibility is open at a time, so they share a z-level.

### Form fields

1. **Selected element** (optional, from picker): shows the element's display name and category. A
   "Change" button re-enters picker mode; an "×" clears the selection. If no element is picked and
   the current page has reportable elements, this section shows a "Pick an item" button to enter
   picker mode. Hidden when opened from settings.

2. **Message** (required): a free-text textarea. Placeholder text like "What's on your mind?
   Describe a problem, suggest an improvement, or tell us about a data error." No category dropdown;
   no forced structure.

3. **Auto-included context** (shown, not editable): app version, game data version. Displayed in a
   muted section so the user knows what's being sent but doesn't need to act on it.

4. **Attach save data** (optional toggle): a switch or checkbox labeled something like "Include my
   progress data (helps us reproduce issues)". Off by default. When toggled on, a brief explanation
   appears: "This sends your tracked completion state (items checked off, skill levels, etc.). It
   doesn't include any personal information. **This data will be publicly visible.**" The attached
   data is the serialized `CompletedState` in its JSON-safe form (see §4), not the full `UserState`
   (no UI preferences, no world state).

5. **Email** (optional): a text input for users who want a response. Labeled "Your email (optional,
   only if you'd like a reply)". Not validated beyond basic format checking.

### Privacy notice

A short note visible on the form before submission:

> Your feedback creates a public issue on our issue tracker to help us find and fix problems. It
> includes the game context shown above but nothing that identifies you. Avoid including personal
> information in your message. If you include your email, it's stored privately and never appears in
> the public issue.

### Draft preservation

If the user dismisses the feedback panel (tapping outside, navigating, entering picker mode), the
current form state (message text, selected element, toggle states) is preserved in component state
for the duration of the page session. Navigating to a different page clears the draft. The draft is
not persisted to localStorage.

### Submit behavior

The "Send" button is disabled while a submission is in flight (prevents double-tap). It posts to the
server endpoint (see §4). On success, show a brief confirmation toast with a link to the created
GitHub issue, clear the form, and close the panel. On network or server failure, show an error
message with a "Copy to clipboard" button so the user doesn't lose their text. The send button
re-enables on failure.

---

## 4. Server endpoint

A SvelteKit server route (`+server.ts`) co-located in the repo, deployed as a Cloudflare Pages
Function via the existing `adapter-cloudflare` setup. This keeps the endpoint versioned alongside
the app with no separate deployment.

### Route

`POST /api/feedback`

### CORS

The endpoint sets `Access-Control-Allow-Origin` to the app's own origin only. Preflight (`OPTIONS`)
returns appropriate CORS headers. Requests from other origins are rejected.

### Payload shape

```typescript
interface FeedbackPayload {
  /** App version string. */
  appVersion: string;
  /** User's email, if provided. */
  email?: string;
  /** Game data version string. */
  gameDataVersion: string;
  /** The user's free-text message. */
  message: string;
  /**
   * Serialized CompletedState, if the user opted in.
   * JSON-safe: Sets are serialized as sorted arrays, Records are plain objects.
   * Matches the existing serialize() format in user-state.svelte.ts.
   */
  saveData?: Record<string, unknown>;
  /** Picked element metadata, if an element was selected. */
  selectedElement?: ReportableElement;
}
```

### Server-side validation

The endpoint validates before processing:

- `message` is a non-empty string, max 5,000 characters.
- `appVersion` and `gameDataVersion` are non-empty strings, max 50 characters each.
- `email`, if present, is a string matching a basic email format, max 254 characters.
- `selectedElement`, if present, has `category`, `displayName`, and `page` as strings (max 200 chars
  each); `entityId` if present is a string (max 100 chars); `extra` if present is a flat
  string/number record (max 10 keys).
- `saveData`, if present, is a JSON object under 50 KB when stringified.
- Total payload size cap: 100 KB.
- Any field that fails validation causes a `400` response with a generic error message (no
  reflection of input).

### Issue title derivation

The GitHub issue title is derived from the submission:

- If an element was selected: `"[Feedback] {element.category}: {element.displayName}"` (e.g.,
  `"[Feedback] recipe: Tomato Soup"`).
- If no element: `"[Feedback] {first ~80 characters of message}"`, truncated at a word boundary with
  `"…"` if needed.
- Title is sanitized (no newlines, control characters stripped).

### Processing

The endpoint does two things:

1. **Creates a GitHub issue** via the GitHub API using a fine-grained personal access token (PAT)
   stored as a Cloudflare Pages environment secret (`GITHUB_FEEDBACK_TOKEN`). The PAT needs only the
   `issues: write` permission on the target repo. The issue body includes:
   - The user's message.
   - Selected element metadata (if any), formatted readably.
   - App version and game data version.
   - Save data as a collapsed `<details>` block (if attached), with a note that this data is
     publicly visible.
   - A `user feedback` label for triage.
   - A note "📧 Contact email provided" if the user included one (address itself is **never** in the
     issue body).

2. **Stores the email privately** (if provided) in a Cloudflare KV namespace
   (`FEEDBACK_EMAIL_STORE`), keyed by the created issue number (value = JSON with email +
   timestamp). GitHub's default notification emails cover awareness; no separate notification
   channel is needed.

### Error handling

- **GitHub API errors:**
  - `401` / `403` (token expired/revoked): log the error, return `503` to the client with a
    user-friendly message ("Feedback service temporarily unavailable. Please try again later or copy
    your message.").
  - `422` (validation/spam rejection): return `503` with the same message.
  - `403` with rate limit headers: respect `Retry-After`, return `503`.
  - Network timeout (10s): return `503`.
- **KV write failure** (after successful issue creation): the issue is already created. Log the
  error. The issue body says "Contact email provided" but the email isn't in KV. The endpoint still
  returns success to the user (the feedback was received). The maintainer can check server logs for
  KV failures and contact the user via the issue itself if needed.
- **Missing label:** if the `user feedback` label doesn't exist, the endpoint creates the issue
  without it and logs a warning. The label is a convenience, not a requirement.

### Rate limiting

Use Cloudflare's built-in rate limiting rules (configured in the Cloudflare dashboard, not in
application code) to limit submissions per IP. Target: 5 requests per hour per IP. This avoids the
eventual-consistency issues of KV-based counters and handles the rate limiting at the edge before
the Worker executes.

Note: IP addresses are used transiently by Cloudflare's rate limiting infrastructure. The
application code does not read, log, or store IP addresses.

The endpoint returns the created issue's URL so the client can show a link.

---

## 5. Reportable element registration

### Svelte attachment approach

A `FeedbackContext` at the layout level provides registration functions. Reportable components use a
Svelte attachment (5.29+) to register their DOM element and metadata with the context.

```svelte
<!-- In a reportable component -->
<div {@attach reportable({ category: "recipe", displayName: recipe.name, entityId: recipeId })}>
  ...
</div>
```

The attachment:

- On attach: registers the element + metadata with the feedback context.
- On detach (returned cleanup): deregisters.
- Handles virtual/dynamic lists (items that mount/unmount as the user scrolls or filters).
- Registration is keyed by DOM element reference; duplicate registrations for the same element
  update the metadata rather than adding a second entry.

### Highlight rendering

When picker mode is active, the overlay iterates registered elements, computes their bounding rects
relative to the viewport, and renders highlight outlines (via absolutely positioned divs or an SVG
overlay). The highlights update on scroll (`scroll` event listener on the scrollable container) and
on resize (`ResizeObserver` or `resize` event). A `requestAnimationFrame` loop during picker mode
keeps highlights synchronized with scroll position without layout thrashing.

---

## 6. Privacy considerations

- **No automatic PII collection.** Email is opt-in and stored privately, never in the public GitHub
  issue. IP addresses are used transiently for rate limiting at the Cloudflare edge; they are not
  read, logged, or stored by application code.
- **Public visibility notice.** The form explicitly tells users that their feedback (minus email)
  becomes a public GitHub issue. Users are warned not to include personal information in their
  message text.
- **Save data transparency.** When the user opts to attach save data, the form explicitly states
  that it will be **publicly visible**. The data is game progress (completion state), not personal
  information.
- **No screenshots.** No client-side capture of page content.
- **Privacy policy update** (`/privacy`) is a **phase 1 gate**. The current policy states "Nothing
  is ever sent to a server", which would be materially false once the feedback endpoint exists. The
  updated policy must describe: what the feedback feature sends, that submissions become public
  GitHub issues, that email is stored privately, and that IP addresses are used transiently for rate
  limiting.

### Triage & operations

Feedback submissions are received as GitHub issues labeled `user feedback` in the project
repository. The repository owner (project maintainer) receives GitHub's standard issue-creation
notifications and is responsible for triage. Private email addresses associated with feedback are
stored in the `FEEDBACK_EMAIL_STORE` KV namespace, accessible only to the maintainer via the
Cloudflare dashboard or Workers API.

---

## 7. Phased delivery

### Phase 1: core feedback loop

- **Privacy policy update** (deployment gate; must ship simultaneously).
- Feedback panel with free-text message, auto-included context, optional email, privacy notice.
- Settings page entry point.
- Toolbar footer entry point (`MessageCircleWarning` icon).
- SvelteKit server route at `/api/feedback`.
- GitHub issue creation with private email storage (KV).
- Toolbar layout reorganization (from the
  [visibility panel redesign](2026-08-30-visibility-panel-redesign.md) spec; the toolbar rewrite is
  shared work that lands in this PR).

### Phase 2: element picker

- Reportable element registration system (Svelte attachments).
- Picker overlay with scrim, highlights, selection, and accessibility.
- `TrackerRow` opted in as the first reportable component.
- Selected element metadata included in submissions and GitHub issues.

### Phase 3: richer context

- Optional save-data attachment with `<details>` block in issues.
- Additional components opted in to the reportable system (`SkillRow`, `Stepper`, NPC sections,
  `ExpandableSection`).
- Evaluate client-side screenshot capture if user demand warrants it (spike `html-to-image` or
  `SnapDOM` with iOS Safari testing).

---

## 8. Deployment prerequisites

Before phase 1 can ship:

- Create a Cloudflare KV namespace (`FEEDBACK_EMAIL_STORE`) and bind it to the Pages project.
- Create a GitHub fine-grained PAT with `issues: write` permission on the repo. Add it as a
  Cloudflare Pages environment secret (`GITHUB_FEEDBACK_TOKEN`).
- Create the `user feedback` label in the GitHub repo.
- Configure Cloudflare rate limiting rules for the `/api/feedback` path (5 req/hr per IP).
- Update the privacy policy page (`/privacy`) before or simultaneously with the feedback feature
  deployment.
