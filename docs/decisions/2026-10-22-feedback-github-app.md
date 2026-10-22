# Feedback GitHub App

Supersedes the **Feedback** bullet of
[2026-10-12-public-cutover-planning.md](2026-10-12-public-cutover-planning.md).

## Context

The feedback endpoint filed issues with a fine-grained personal access token on a 90-day expiry,
which needed a calendar reminder & a manual rotation (#114). A GitHub App installed only on this
repository issues hour-long installation tokens from a private key that doesn't expire. A leaked key
still works until it is deleted, so the gain is ending rotation, not a smaller blast radius.

## Decision

- **Auth:** the Worker signs an RS256 App JWT with Web Crypto, exchanges it for an installation
  token, & caches the token per isolate until five minutes before it expires. Concurrent requests
  share one exchange, & a rejected cached token is dropped. See
  [Feedback credentials](../app-architecture.md#8-feedback-credentials).
- **Permissions:** Issues: Read and write on `mrh-is/mistria-fyi` only, no webhook.
- **Configuration:** `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, & `GITHUB_APP_PRIVATE_KEY`
  (PKCS#8 PEM), all stored as production-only Pages secrets. `wrangler.toml` owns the project's
  configuration, so plain dashboard variables aren't available, and a per-environment block would
  have to restate the KV binding.
- **Transition:** the App is used once all three settings exist; until then the endpoint falls back
  to `GITHUB_FEEDBACK_TOKEN`, so production keeps filing issues between merge & setup. Failing App
  credentials return `503` rather than falling back, so a misconfiguration is visible.
- **Logging:** only variable names, GitHub statuses, & request IDs; never key material, JWTs, or
  tokens.

## Alternatives

- **Keep rotating the token:** rejected; rotation is the recurring chore this removes.
- **Switch with no fallback:** rejected; feedback would return `503` from merge until the maintainer
  creates the App & stores its key.
- **Fall back to the token when the App fails:** rejected; it would hide a broken App setup until
  the token was revoked.
- **`[vars]` for the IDs:** rejected for now; top-level vars reach previews, & an `[env.production]`
  block must restate every binding.

## Revisit if

The App files issues in production & the legacy token is revoked (remove the fallback), feedback
moves to another repository, or GitHub changes App JWT or installation-token lifetimes.
