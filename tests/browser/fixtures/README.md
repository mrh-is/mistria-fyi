# Browser sprite fixtures

The accessibility & PWA suites fulfill sprite requests from four synthetic WebP icons. Their native
dimensions match the production sprites; `sprite-dimensions.json` maps each entity ID to its
measured size. A `null` entry preserves a production 404, & an unknown ID fails the network guard
instead of contacting the CDN.

The fixtures contain no game artwork. The four sizes are 16×16, 18×18, 24×20, & 72×18 (an animation
strip). Tests never refresh the manifest from the network.

## Regenerating the manifest

`fixtures.test.ts` fails when the manifest’s keys drift from the tracker data’s items & villagers,
for example after a pipeline run adds an item. To rebuild it from the sprites
`pnpm run sprites:upload` publishes:

1. Stage the complete sprite tree: `pnpm run pipeline -- <path> --sprites`.
2. Run `pnpm run sprites:manifest` (or `pnpm run sprites:manifest -- <sprites-dir>`).

The script reads only local files. An item or villager without a staged sprite gets `null`, matching
the production 404. If the manifest gains a size the fixtures lack, the script names it & exits
nonzero; add a synthetic `<width>x<height>.webp` (no game artwork) beside the others.

The shared fixture in `../test.ts` routes at the browser-context level so additional tabs &
service-worker fetches remain isolated. It observes requests independently of routing, so a spec’s
page-route override cannot silently bypass the guard.

## Fonts

Satoshi is proprietary & cannot be committed. When `local/satoshi-regular.woff2` (gitignored)
exists, the fixture serves it so geometry measures production metrics; otherwise it aborts the
request & the app falls back to system fonts. CI fetches & verifies that file with
`pnpm exec tsx scripts/playwright-satoshi.ts` before the accessibility suite, and `geometry.spec.ts`
fails there if Satoshi doesn’t load. Run the same command once locally for production metrics;
without it, the font check skips with a warning. Worktree setup links `local/` from the main
checkout. The versioned locale fonts named in the checked-in CSS are still aborted, so non-Latin
locales render with fallback typography.

## Turnstile

Turnstile’s script is fulfilled with a local widget-completion stub for feedback UI tests; it
produces a synthetic token, not an accepted server challenge. Production code, asset URLs, &
service-worker caching are unchanged.
