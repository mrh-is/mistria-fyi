# Browser font fidelity

## Context

#703 made the browser suites hermetic (see `2026-10-07-browser-network-fixtures.md`) by aborting
Satoshi & the locale fonts, so `geometry.spec.ts` measured system fallback fonts instead of the
production layout. #687 rules out weakening coverage. Satoshi’s ITF Free Font License v2.0 permits
self-hosting & backup copies on our own infrastructure but prohibits redistribution & derivative
works (#708).

## Decision

CI fetches `https://assets.mistria.fyi/fonts/satoshi-regular.woff2` before the accessibility suite
with `scripts/playwright-satoshi.ts`, which verifies a pinned SHA-256 and writes it to the
gitignored `tests/browser/fixtures/local/`. `actions/cache` keys the file on that script’s hash, so
changing the pinned hash refetches it. The shared fixture serves the file when present & aborts the
request otherwise. A geometry test asserts `document.fonts.check("1em Satoshi")` after loading; it
fails in CI and skips with a warning locally. Local runs fetch only when a developer runs the
script.

## Alternatives

- **Base64 Actions secret:** no network, but fork PRs get no secrets once the repository is public
  (#671).
- **Metric-compatible substitute:** none exists, and deriving one from Satoshi needs ITF’s consent.
- **Accept fallback fonts:** geometry would stop proving the production layout.

## Revisit if

- ITF changes the Free Font License.
- Cache misses or download failures become a real source of flakiness.
- Fork-PR CI makes the download a concern after the repository goes public.
- Locale fonts need the same fidelity; their licenses (expected OFL) may permit the same pattern.
