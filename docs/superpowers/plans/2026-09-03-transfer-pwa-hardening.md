# Transfer and PWA hardening implementation plan

Issues: #188 and #86

## Scope

Harden the versioned progress-transfer decoder so malformed or incomplete payloads fail before any
progress is returned. Add boundary and compatibility coverage for the current transfer format.

Add reproducible browser and CI evidence for the production service worker’s registration,
activation, caching, offline fallback, and progressive-enhancement behavior. Verified defects found
by that suite will be filed separately instead of prompting speculative service-worker changes.

## Task 1: Define strict transfer boundaries

- Modify `src/lib/engine/__tests__/transfer.test.ts` first.
- Cover maximum mine floor, renown, NPC level, skill level, and packed relationship values.
- Construct a fully populated `CompletedState` and require a lossless current-format round trip.
- Add current-format fixture coverage alongside the existing v1 and v5 fixtures, with explicit
  compatibility expectations.
- Cover malformed base64url, missing version or compressed bytes, truncated compressed data,
  truncated decompressed data, trailing decompressed data, and unsupported versions.
- Require every invalid payload to reject without returning partial or zero-filled progress.

## Task 2: Enforce all-or-nothing decoding

- Modify `src/lib/engine/transfer.ts` only as required by the failing tests.
- Validate the base64url envelope and version byte before decompression.
- Compute the exact decompressed byte length for each supported transfer version and reject any
  shorter or longer payload before decoding fields.
- Preserve versions 1 through 8 and their existing compatibility behavior; do not bump the format.
- Run `pnpm run test:app -- --run src/lib/engine/__tests__/transfer.test.ts`.

## Task 3: Add production PWA browser verification

- Add a dedicated Playwright configuration and suite under `tests/pwa/` so the existing
  accessibility suite continues blocking service workers.
- Against the production preview, verify registration and activation, precached static assets,
  runtime-cached routes while offline, uncached-navigation fallback, and normal online operation
  when service workers are blocked.
- Add a `test:pwa` package script and an independent GitHub Actions workflow that installs Chromium,
  runs the suite, and uploads diagnostics on failure.
- Extend workflow contract tests where needed so CI wiring remains unit-tested.
- Run the focused PWA suite locally in Chromium.

## Task 4: Document evidence and compatibility

- Add a transfer-format document that records supported fixtures, exact-length validation, and
  failure expectations.
- Add a PWA verification guide with exact Chromium developer-tools checks, automated coverage,
  tested install state, and explicit limits on claims about browsers not exercised in CI.
- Link the new documents from the existing architecture or development workflow documentation.

## Task 5: Verify and deliver

- Run `pnpm run lint:fix`, `pnpm run lint`, `pnpm run check`, `pnpm run test`, `pnpm run build`, and
  `pnpm run test:pwa`.
- Commit with the required Codex co-author trailer, push `codex/188-86-transfer-pwa`, and open an
  attributed PR containing `Closes #188` and `Closes #86`.
