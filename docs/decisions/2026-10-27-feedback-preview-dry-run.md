---
id: 2026-10-27-feedback-preview-dry-run
status: needs-review
summary: >-
  A Cloudflare Pages build of `main` is production; every other build runs feedback as a dry run.
  `vite.config.ts` reads `CF_PAGES_BRANCH` at build time & defines `__PRODUCTION_DEPLOYMENT__`,
  which `src/lib/server/deployment.ts` exports. The dry run keeps the origin, payload, & Turnstile
  token checks, verifies Turnstile when its secret is set, & returns `{ dryRun: true }` without
  touching GitHub or the email store. The panel shows a localized “Preview build” notice with no
  issue link.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-27-feedback-preview-dry-run.md#decision
relationships: []
---

# Dry-run feedback outside production

## Context

The GitHub App secrets that `/api/feedback` needs exist only in production, so every Pages preview
answered a submission with a `503`. Reviewers mistook it for a regression & couldn't exercise the
submit flow (#246). Preview URLs are public, so previews must never file real issues.

## Decision

A Cloudflare Pages build of `main` is production; every other build runs feedback as a dry run.
`vite.config.ts` reads `CF_PAGES_BRANCH` at build time & defines `__PRODUCTION_DEPLOYMENT__`, which
`src/lib/server/deployment.ts` exports. The dry run keeps the origin, payload, & Turnstile token
checks, verifies Turnstile when its secret is set, & returns `{ dryRun: true }` without touching
GitHub or the email store. The panel shows a localized “Preview build” notice with no issue link.

## Alternatives

- **Compare the request host with `mistria.fyi`:** rejected; the production deployment also answers
  at `mistria-fyi.pages.dev` & per-deployment hosts, which would silently dry-run real feedback.
- **Read `CF_PAGES_BRANCH` at runtime:** rejected; Cloudflare documents it only as a build variable.
- **A separate test App filing into a sandbox repository:** rejected; it adds a second credential
  set & lets anyone with a preview URL create issues.
- **Document the `503` only:** rejected; reviewers still couldn't test submission.

## Revisit if

The Pages production branch is renamed, production stops being built by Pages' Git integration (for
example, a direct upload from CI without `CF_PAGES_BRANCH`), or previews need to file real issues.
