# PWA verification

The production service worker precaches build and static assets, claims open clients after
activation, runtime-caches successful same-origin non-API requests, and serves `/offline.html` for
an uncached navigation when the network fails.

## Offline contract

Decided in #313. After a player’s first online visit, **their language works fully offline**:
client-side navigation to any category, including ones they haven’t opened, and sitewide search.
Other languages download the first time the player uses them, then stay available offline too.

- **Install precaches no name data.** The 160 locale name chunks (8 locales × 20 categories) are
  excluded from the install-time precache. `localeNameChunksPlugin` (`src/lib/build/`) identifies
  them from the Vite client manifest by source module, never by hashed filename, and inlines the
  per-locale map into the service worker.
- **The page asks for its locale.** The root layout sends the active worker a `mfg:cache-locales`
  message naming the current locale plus English, which search always matches against. The worker
  fetches every missing chunk for those locales itself, since chunks loaded before it took control
  never passed through it.
- **Updates keep what the player had.** The worker records requested locales in the
  version-independent `offline-locales-v1` cache, and each new version’s install re-caches those
  locales’ chunks. This step is best-effort and never blocks the install.
- **An undownloaded language says so.** Before switching, the picker asks the controlling worker to
  cache every chunk for the new language and waits for its answer. The worker’s cache is the
  authority: a download the network cut off leaves a locale partly cached, and modules the page
  already imported may come from a cache an update has replaced. If any chunk is still missing, the
  page stays in place and shows “Go online to download the Japanese text, then try again.”

### Byte budget

Name data is about 60 KB gzipped per locale; all eight measured 1.61 MB raw and 476 KB gzipped at
#313’s baseline. Install now downloads none of it; a first visit then downloads one locale (about 60
KB) for English readers or two (about 120 KB) for everyone else. The PWA suite reports each build’s
per-locale sizes and fails if any locale exceeds 100 KB gzipped.

## Automated verification

Run the production-preview suite with:

```sh
pnpm run test:pwa
```

The command builds the application, starts an isolated preview on port 4188, and launches the
Chromium version pinned by Playwright. It deliberately refuses to reuse another preview server so a
stale build or service worker cannot supply false results.

The suite verifies:

- registration at `/service-worker.js`, activation, client control, and the expected cache shell;
- precached `/offline.html`, `/favicon.png`, and hashed application assets;
- successful online navigation through the controlling worker and runtime caching of `/animals`;
- offline reload of the cached route and offline retrieval of a static asset;
- the offline document for a previously uncached navigation;
- no name chunks at install, then every chunk for the visited locale and none for another;
- offline navigation to an unopened category, offline search, and the offline language-switch
  message; and
- normal online rendering when Playwright blocks service workers.

The `pwa` job in `.github/workflows/browser-tests.yml` runs the same Chromium suite for pull
requests that touch `src/`, `static/`, `tests/`, or their configs, main-branch pushes, and manual
dispatches. Failure traces, screenshots, and the HTML report are retained as CI artifacts.

## Browser record

| Browser                                                             | Platform                        | Install state                                | Result and evidence                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome for Testing 151.0.7922.34, Playwright Chromium revision 1234 | macOS, local production preview | Browser tab; active worker, not OS-installed | Passed registration and activation on 2026-09-03. The complete suite passes after the separately tracked fetch-binding defect in #208 is fixed. |
| Chrome for Testing 151.0.7922.34, Playwright Chromium revision 1234 | Ubuntu GitHub Actions           | Browser tab; active worker, not OS-installed | Evaluated by the PWA workflow on every pull request and main push.                                                                              |
| Chrome or Edge stable                                               | Not run                         | Not run                                      | Complete the manual procedure below before making browser-specific release claims.                                                              |
| Firefox stable                                                      | Not run                         | Not run                                      | Complete the manual procedure below; the automated suite does not claim Firefox coverage.                                                       |
| Safari stable                                                       | Not run                         | Not run                                      | Complete the manual procedure below; the automated suite does not claim Safari coverage.                                                        |
| Installed desktop or mobile PWA                                     | Not run                         | Not run                                      | Installation and standalone-window checks remain manual because CI exercises a browser tab.                                                     |

## Manual developer-tools check

Use a production deployment or `pnpm run test:pwa`’s preview, not the Vite development server.

1. Open the browser’s service-worker or application panel, clear site data, and reload.
2. Confirm `/service-worker.js` is registered for the `/` scope, reaches “activated”, and controls
   the page without an installation error.
3. Inspect Cache Storage. Confirm one current `cache-<version>` cache contains `/offline.html`,
   `/favicon.png`, and hashed files under `/_app/immutable/`.
4. Visit `/animals` online. Confirm its document request succeeds and appears in the current cache.
5. Enable the browser’s offline network mode and reload `/animals`. Confirm the application route
   remains usable and a cached static asset still loads.
6. While offline, navigate to a same-origin path that has never been requested. Confirm the page
   displays the “You’re offline” heading from `/offline.html`.
7. Return online, unregister the worker or disable service workers, and reload `/animals`. Confirm
   the online application renders normally.
8. Record the browser name and exact version, OS, whether the app was installed or in a tab, commit
   or release, date, and result. File each verified failure as a separate issue.

Note: Browser developer tools may bypass the worker when “Update on reload” or an equivalent option
is enabled. Disable that option during the offline checks.
