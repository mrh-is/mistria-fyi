# Browser sprite fixtures

The accessibility & PWA suites fulfill sprite requests from four synthetic WebP icons. Their native
dimensions match the production sprites; `sprite-dimensions.json` maps each entity ID to its
measured size. A `null` entry preserves a production 404, & an unknown ID fails the network guard
instead of contacting the CDN.

The manifest was measured from the production WebP files on 2026-10-07 against game data 1.0.5. The
source images were decoded with Sharp; only their dimensions are retained. The fixtures contain no
game artwork. The four sizes are 16×16, 18×18, 24×20, & 72×18 (an animation strip). Update the
manifest deliberately when adding sprites or changing their dimensions; tests never refresh it from
the network.

The shared fixture in `../test.ts` routes at the browser-context level so additional tabs &
service-worker fetches remain isolated. It observes requests independently of routing, so a spec’s
page-route override cannot silently bypass the guard.

Satoshi is proprietary & cannot be committed. Its request, & the versioned locale fonts named in the
checked-in CSS, are aborted locally to exercise the application’s existing system-font fallback.
These tests verify fallback typography; they do not verify the live font or CDN artwork. Turnstile’s
script is fulfilled with a local widget-completion stub for feedback UI tests; it produces a
synthetic token, not an accepted server challenge. Production code, asset URLs, & service-worker
caching are unchanged.
