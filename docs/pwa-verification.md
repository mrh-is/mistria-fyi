# PWA verification

The production service worker precaches build and static assets, claims open clients after
activation, runtime-caches successful same-origin non-API requests, and serves `/offline.html` for
an uncached navigation when the network fails. Sprites from `assets.mistria.fyi/sprites/` are served
stale-while-revalidate from their own `sprites-v1` cache: a cached sprite returns at once (so it
works offline) while, once the copy is a day old, a background request, which bypasses the HTTP
cache, refreshes it or, on a 403/404/410, evicts it. That cache holds at most 400 sprites, evicts
the least recently used, and drops every sprite from an older `?g=` generation once a newer one is
cached.

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
  locales’ chunks. This step is best-effort and never blocks the install. The page also sends its
  request to a version waiting to take over (see [Update flow](#update-flow)), which installed
  before a later language switch and would otherwise miss it.
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

## Update flow

Decided in #360. A deploy never swaps the worker out from under an open tab. Cloudflare Pages serves
only the current deployment, so once the old version’s cache is gone, a tab still running the old
JavaScript can’t load any chunk it hasn’t imported yet.

- **A new version waits.** The worker doesn’t call `skipWaiting()` on install. With a previous
  version active, the new one installs into its own `cache-<version>` and waits; old tabs keep the
  old worker and its cache. The first-ever install has nothing to wait for, so it activates and
  claims the page at once.
- **Open tabs offer it.** `watchForAppUpdate` (`src/lib/pwa/app-update.ts`) finds a worker that is
  already waiting when the page loads, or one that finishes installing later, and the root layout’s
  `UpdatePrompt` shows a toast: “The Mistria Field Guide has been updated! Refresh to get the newest
  version.” The toast stays until the player acts on it, is announced through the toaster’s live
  region, and has “Refresh” and “Not now” buttons. Dismissing it hides it for that page; the next
  page load offers the update again.
- **Accepting updates every tab.** “Refresh” posts `mfg:skip-waiting` to the waiting worker, which
  activates, deletes the old cache, and claims every tab. Each tab that was already controlled
  reloads on `controllerchange`, including tabs that dismissed the prompt.
- **Long-lived tabs still find updates.** Browsers check for a new worker only on full navigations,
  and client-side routing never makes one, so a tab that becomes visible again calls
  `registration.update()`, at most once every five minutes.

Note: A player who ignores the prompt stays on the old version until they accept it or close every
tab. Progress data doesn’t depend on the app version, so that’s safe. An old tab still can’t load a
chunk its version never cached, such as another language’s names, since the server no longer has it.

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
  message;
- an update with two tabs open: the new version waits while the old tabs keep working on the old
  cache, both tabs offer it, dismissing it in one tab doesn’t block it, and accepting it in the
  other reloads both onto the new version and deletes the old cache; and
- normal online rendering when Playwright blocks service workers.

The `pwa` job in `.github/workflows/ci.yml` runs the same Chromium suite for pull requests that
touch `src/`, `static/`, `tests/`, or their configs, main-branch pushes, and manual dispatches.
Failure traces, screenshots, and the HTML report are retained as CI artifacts.

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
8. To check the update flow, keep a tab open on the deployment, deploy a new version, then switch
   away from the tab and back after five minutes (or click “Update” in the service-worker panel).
   Confirm the new worker shows as waiting, the tab shows the update toast, and “Refresh” reloads
   onto the new version with only the new `cache-<version>` left.
9. Record the browser name and exact version, OS, whether the app was installed or in a tab, commit
   or release, date, and result. File each verified failure as a separate issue.

Note: Browser developer tools may bypass the worker when “Update on reload” or an equivalent option
is enabled. Disable that option during the offline checks.
