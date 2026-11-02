---
id: 2026-11-01-build-only-service-workers
status: current
summary: >-
  Only builds register service workers; dev servers serve current source without worker caching.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/398
relationships: []
---

# Register workers in builds

## Context

Issue #398 reports a service worker registration error on every load in the desktop app’s dev
preview. SvelteKit automatically registers the worker in dev, where caching can also hide source
changes during verification.

## Decision

Enable automatic service worker registration only for Vite’s build command, regardless of mode.
Local builds, branch previews, & production keep the same registration behavior. Dev previews still
need existing workers unregistered when reusing an origin that previously served a build.

## Alternatives

Keeping dev registration would require debugging the desktop browser’s worker support while
retaining caching during source verification. Selecting by production mode would enable workers for
a dev server started with that mode, and disable them for builds using a custom mode.

## Revisit if

The app needs service worker development with hot reload, and its dev worker can avoid caching
source or interfering with preview verification. Until then, verify worker behavior against builds.
