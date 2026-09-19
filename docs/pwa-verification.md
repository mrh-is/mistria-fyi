# PWA verification

The production service worker precaches build and static assets, claims open clients after
activation, runtime-caches successful same-origin non-API requests, and serves `/offline.html` for
an uncached navigation when the network fails.

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
- the offline document for a previously uncached navigation; and
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
