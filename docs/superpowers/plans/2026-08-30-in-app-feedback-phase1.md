# In-app feedback — phase 1 implementation plan

Issue #18. Implements the core feedback loop as specified in
[the design spec](../specs/2026-08-30-in-app-feedback-design.md) §1–4, §6–8 (phase 1 scope).

## Scope

Phase 1 delivers: feedback panel, both entry points (settings + toolbar), server endpoint with
GitHub issue creation & private email storage, privacy policy update. No element picker, no save
data attachment (those are phases 2 & 3).

---

## 1. Platform bindings (`src/app.d.ts`)

Uncomment and type the `Platform` interface for Cloudflare Pages:

```typescript
interface Platform {
  env: {
    FEEDBACK_EMAIL_STORE: KVNamespace;
    GITHUB_FEEDBACK_TOKEN: string;
  };
}
```

Add `@cloudflare/workers-types` as a dev dependency for `KVNamespace`.

---

## 2. Server endpoint (`src/routes/api/feedback/+server.ts`)

A single `POST` handler:

1. **CORS** — `OPTIONS` preflight + `Access-Control-Allow-Origin` restricted to the app's own origin
   (derived from the request's `Origin` header matched against a known allowlist, or from
   `url.origin`).
2. **Parse & validate** — JSON body against the `FeedbackPayload` shape (phase 1 subset: `message`,
   `appVersion`, `gameDataVersion`, optional `email`; no `selectedElement` or `saveData` yet).
   Validation per spec §4. Return 400 on failure.
3. **Create GitHub issue** — `POST /repos/{owner}/{repo}/issues` via `fetch` with the
   `GITHUB_FEEDBACK_TOKEN` PAT. Title derivation per spec §4 (no-element path only for phase 1).
   Body includes message, versions, and a "📧 Contact email provided" note when applicable. Label
   `user feedback`. Handle 401/403/422/timeout → 503.
4. **Store email** — if email provided, write to `FEEDBACK_EMAIL_STORE` KV keyed by issue number. KV
   failure after issue creation is logged but returns success to the client.
5. **Return** — `{ issueUrl: string }` on success, `{ error: string }` on failure.

No KV-based rate limiting (Cloudflare dashboard rules handle that). No `wrangler.toml` needed;
bindings are configured in the Cloudflare Pages dashboard.

---

## 3. Feedback panel component (`src/lib/components/feedback-panel.svelte`)

A bottom-sheet overlay component. Props:

- `open: boolean` (bindable) — visibility state.
- `fromSettings: boolean` — controls whether the "Pick an item" button is shown (hidden for now in
  all contexts since element picker is phase 2, but the prop establishes the contract).

Internal state:

- `message` (bound to textarea), `email` (bound to input), `submitting`, `error`, `success`.
- Draft preserved in component state (not localStorage); cleared on navigation.

Form fields (phase 1):

1. **Message** — required textarea with placeholder text per spec.
2. **Context info** — read-only display of app version (`$app/environment.version`) and game data
   version (`trackerData.version`).
3. **Email** — optional input with basic format validation.
4. **Privacy notice** — static text per spec §3.
5. **Send button** — disabled while submitting. Posts to `/api/feedback`. On success: toast with
   issue link, clear form, close panel. On failure: show error with "Copy to clipboard" fallback.

Overlay coordination:

- Opening feedback closes visibility panel (and vice versa). This means `toolbar-footer.svelte`'s
  `ActivePanel` type expands to `"visibility" | "feedback" | null`.
- Z-index per spec: feedback panel at z-30 (same as visibility; mutually exclusive).
- Close on backdrop tap, `Escape` key, or navigation.

Transition: `fly` from bottom (matching visibility panel pattern).

---

## 4. Toolbar integration (`src/lib/components/toolbar-footer.svelte`)

Extend `ActivePanel` to `"visibility" | "feedback" | null`.

Add `MessageCircleWarning` icon button in the left slot (currently empty `<div>`). Same styling
pattern as the visibility filter button. When search is open, feedback button hides (existing
behavior: search replaces toolbar controls). If feedback panel is open, close it when search
activates.

---

## 5. Settings page entry point (`src/routes/settings/+page.svelte`)

Add a "Send feedback" card in the info footer section (after the version/privacy area, or as a
visible link alongside them). Clicking opens the feedback panel.

Since settings doesn't use the toolbar footer, the feedback panel here is embedded directly in the
settings page as a modal/overlay (same component, different mount point). This requires the feedback
panel to be self-contained and mountable from either location.

Implementation: mount `FeedbackPanel` in the settings page template, controlled by local state. The
panel is the same component used by the toolbar.

---

## 6. Privacy policy update (`src/routes/privacy/+page.svelte`)

Add sections covering:

- **Feedback feature** — what data is sent (message text, app version, game data version).
- **Public GitHub issues** — submissions create public issues; users should avoid personal info.
- **Email storage** — optional, stored privately in a separate system, never in the public issue.
- **Rate limiting** — IP addresses used transiently by Cloudflare's infrastructure, not stored by
  the app.

Update "The short version" and "What we collect" sections to reflect the new feedback channel
without invalidating the existing privacy posture for non-feedback usage.

---

## 7. Tests

### Server endpoint tests (`src/routes/api/feedback/feedback.test.ts`)

- Valid submission → 200 with `issueUrl`.
- Missing/invalid `message` → 400.
- Missing version fields → 400.
- Invalid email format → 400.
- Message too long → 400.
- Mock GitHub API failure → 503.
- KV failure after issue creation → 200 (graceful degradation).
- CORS: rejects cross-origin requests.

Mock `fetch` (GitHub API) and `platform.env` (KV namespace) in tests.

### Feedback panel tests (`src/lib/components/feedback-panel.test.ts`)

- Renders form fields when open.
- Submit button disabled while submitting.
- Successful submission shows confirmation, clears form.
- Failed submission shows error with copy button.
- Empty message prevents submission.

---

## 8. Implementation order

1. Platform bindings & types.
2. Server endpoint + tests.
3. Feedback panel component + tests.
4. Toolbar integration (expand `ActivePanel`, add button).
5. Settings page entry point.
6. Privacy policy update.
7. Full verification matrix, commit, push.

---

## 9. Files touched

| File                                        | Change                                  |
| ------------------------------------------- | --------------------------------------- |
| `src/app.d.ts`                              | Add `Platform` interface                |
| `package.json`                              | Add `@cloudflare/workers-types` dev dep |
| `src/routes/api/feedback/+server.ts`        | New: POST endpoint                      |
| `src/routes/api/feedback/feedback.test.ts`  | New: endpoint tests                     |
| `src/lib/components/feedback-panel.svelte`  | New: feedback form overlay              |
| `src/lib/components/feedback-panel.test.ts` | New: component tests                    |
| `src/lib/components/toolbar-footer.svelte`  | Add feedback button + panel integration |
| `src/routes/settings/+page.svelte`          | Add feedback entry point                |
| `src/routes/privacy/+page.svelte`           | Update privacy policy                   |

---

## 10. Deployment prerequisites (not code)

These are configured in Cloudflare/GitHub dashboards, not in application code:

- Create KV namespace `FEEDBACK_EMAIL_STORE`, bind to Pages project.
- Create fine-grained PAT (`issues: write`), add as `GITHUB_FEEDBACK_TOKEN` secret.
- Create `user feedback` label in the GitHub repo.
- Configure rate limiting rule for `/api/feedback` (5 req/hr/IP).
