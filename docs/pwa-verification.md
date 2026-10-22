# PWA verification

The production service worker precaches build and static assets, claims open clients after
activation, runtime-caches successful same-origin non-API requests, and serves a bundled offline
page for an uncached navigation when the network fails. Sprites from `assets.mistria.fyi/sprites/`
are served stale-while-revalidate from their own `sprites-v1` cache: a cached sprite returns at once
(so it works offline) while, once the copy is a day old, a background request, which bypasses the
HTTP cache, refreshes it or, on a 403/404/410, evicts it. That cache holds at most 400 sprites,
evicts the least recently used, and drops every sprite from an older `?g=` generation once a newer
one is cached.

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
  request to a version installing or waiting to take over (see [Update flow](#update-flow)), which
  read the remembered locales partway through its install and would otherwise miss a later language
  switch (#18).
- **An undownloaded language says so.** Before switching, the picker asks the controlling worker to
  cache every chunk for the new language and waits for its answer. The worker’s cache is the
  authority: a download the network cut off leaves a locale partly cached, and modules the page
  already imported may come from a cache an update has replaced. If any chunk is still missing, the
  page stays in place and shows “Go online to download the Japanese text, then try again.”
- **An offline launch opens the last-used language (#728).** The manifest’s `start_url` is `/`,
  whose prerendered stub picks a locale in the browser. An installed app’s first launch loads that
  page before the worker exists, and browsing after that is client-side, so no page load ever passes
  through the worker to cache it. Instead, each version’s install precaches its launch pages (#110):
  `/` and the prerendered home page (`/en`, `/ja`, …) of every offline locale and of the last-used
  one, picked from `$app/manifest`’s `prerendered` by extensionless path, since a request for
  `/en.html` reaches the Function and 404s. A prerendered page embeds its build’s version, so the
  copy in `cache-<version>` always matches that cache’s chunks. The precache is best-effort, like
  the name chunks: a page that fails doesn’t fail the install. The page’s `mfg:cache-locales`
  message names its current locale (on every load and every picker switch), and the worker records
  it as the last-used locale in `offline-locales-v1` and fetches that locale’s home page if its
  cache lacks it, which covers a language first used after the install, including a switch during
  that install. If the new version still lacks the last-used home page when it activates (its fetch
  failed, or the switch happened offline), activation keeps the old version’s cache, which holds the
  only working copy, and records it in `offline-locales-v1`. The active worker deletes it once a
  page message has cached the home page in the new version. The record is never cached in memory,
  because during an update two workers write it (#18). A full page load through the worker records
  its locale too. When a bare-path navigation fails offline, the worker redirects to the same path
  under the last-used locale, or under any locale whose page is cached, before trying the bare
  path's cached stub & then the offline page. Launch pages (`/`, `/en`, `/ja`, …) are exempt from
  runtime-cache eviction, and a navigation that comes back as a followed redirect is answered with
  the redirect itself and never cached.

### Byte budget

Name data is about 60 KB gzipped per locale; all eight measured 1.61 MB raw and 476 KB gzipped at
#313’s baseline. Install now downloads none of it; a first visit then downloads one locale (about 60
KB) for English readers or two (about 120 KB) for everyone else. `pnpm run check:built`, after a
production build, reports each build’s per-locale sizes and fails if any locale exceeds 100 KB
gzipped.

## Update flow

Decided in #111 (see [the decision record](decisions/2026-10-20-automatic-app-updates.md)), which
replaced #360’s consent prompt. Updates apply without a prompt, and never mid-task. Cloudflare Pages
serves only the current deployment, so a tab still running an older version’s JavaScript can load a
chunk only from that version’s cache.

- **A new version takes over once installed.** The worker’s install ends with `skipWaiting()`, and
  activation claims every tab. The first-ever install claims the page too; that isn’t an update.
- **Older caches stay while a page runs that version.** Each page reports its version to the active
  worker (`mfg:client-version`) when it loads; the worker records the reports in
  `client-versions-v1`, pruned to the pages still open. Activation deletes an older version’s
  `cache-<version>` only when every open page has reported and none runs that version; until then
  it’s recorded as kept, and each later report retries. A page that hasn’t reported (one still
  loading, or a tab from an earlier release) keeps every older cache. The kept home-page cache
  described in the offline contract follows the same rule.
- **Old pages keep loading their chunks.** Any same-origin `/_app/immutable/` request is answered
  from the caches, this version’s first, so an older page’s lazy route finds its chunk after the
  update.
- **Each page reloads at its own safe moment.** `watchForAppUpdate` (`src/lib/pwa/app-update.ts`)
  reports when a newer version takes control (`controllerchange` on a page that was already
  controlled). The root layout’s `AppUpdater` then reloads at once if the page isn’t busy, and
  otherwise waits (`src/lib/pwa/safe-reload.ts`). Busy means a task holds updates off
  (`holdUpdatesWhile`, used by save import, backup restore, & transfer), a dialog or panel is open,
  or a text field has focus. A waiting page re-checks when a hold is released, focus leaves a field,
  visibility changes, the browser comes online, & every second. Before reloading, it probes its own
  URL through the worker, as the reload would: offline, a 5xx, or a page no cache holds keeps it as
  it is, with the next probe 30 s later or on `online`. Client-side navigation finishes normally,
  then the destination is probed before the same guarded reload (links, back, forward, & `goto`).
  Offline navigation stays client-side, with the update pending. QR reception holds updates through
  image decoding, payload decoding, & the merge, then while its result is shown.
- **Long-lived tabs still find updates.** SvelteKit’s `updated` state checks `/_app/version.json`
  every 10 minutes, and on focus & visibility changes. The worker leaves that file to the browser,
  so an offline check can’t mistake cached metadata for a deploy. Detection calls
  `registration.update()` immediately. Failed or no-op installs retry on online, focus, & visible
  events, at most once every five minutes, plus an hourly fallback for unattended tabs. Retries stop
  once a new version is installing, or takes control. Without a controlling worker, a detected
  deploy reloads the page from the network at its safe moment.
- **Older tabs reload once.** Tabs from releases before #111 still reload on `controllerchange`,
  whatever they’re doing, when the first version with this flow takes over. The worker still honors
  their `mfg:skip-waiting` message.

Note: Progress data doesn’t depend on the app version, and the store persists on `pagehide`, so a
reload loses no progress. An old tab still can’t load a chunk its version never cached, such as
another language’s names, since the server no longer has it.

## Automated verification

During development, select the file covering the changed contract; for update behavior, use:

```sh
pnpm exec playwright test --config playwright.pwa.config.ts tests/pwa/update.spec.ts
```

Use `offline.spec.ts` or `offline-locales.spec.ts` for those contracts; `--grep` can select a
specific scenario. These checks still use a production build & service worker. Reuse a build with
`PLAYWRIGHT_SKIP_BUILD=true` only when it includes the current app changes. Full local verification
uses [the scoped exceptions](agent-verification.md#full-verification); the complete PWA suite
remains available for cross-contract verification and runs in CI.

Run the complete production-preview suite with:

```sh
pnpm run test:pwa
```

The command builds the application, starts an isolated preview on port 4188, and launches the
Chromium version pinned by Playwright. It deliberately refuses to reuse another preview server so a
stale build or service worker cannot supply false results.

The suite verifies:

- registration at `/service-worker.js`, activation, client control, and the expected cache shell;
- precached `/favicon.png` and hashed application assets;
- successful online navigation through the controlling worker and runtime caching of `/animals`;
- offline reload of the cached route and offline retrieval of a static asset;
- the offline document for a previously uncached navigation;
- an offline launch from `start_url` (`/`) into the home page, after one online launch with only
  client-side browsing, and into the language last chosen in the picker;
- a new version’s install precaching `/` and each offline locale’s home page, then an offline
  relaunch into the last-used language (#110);
- a new version’s install caching the last-used locale’s home page, and an offline relaunch into a
  language chosen while that install was underway (#18);
- an offline relaunch after a new version failed to fetch the last-used home page, served from the
  old version’s kept cache, which goes once the home page is cached online;
- no name chunks at install, then every chunk for the visited locale and none for another;
- offline navigation to an unopened category, offline search, and the offline language-switch
  message;
- an update with two tabs open: the new version takes over with no prompt, the idle tab reloads at
  once, the tab with a dialog open stays put until the dialog closes and then reloads, and the old
  cache stays until no open tab runs the old version;
- an old-version tab importing a route chunk after the update, which only the old version’s cache
  still holds;
- a pending update preserving offline navigation to an unopened category, back & forward, then
  reloading the destination once online;
- an uncontrolled tab reloading from the network on a detected deploy; and
- normal online rendering when Playwright blocks service workers.

The `pwa` job in `.github/workflows/ci.yml` runs the same Chromium suite for pull requests that
touch `src/`, `static/`, `tests/`, or their configs, main-branch pushes, and manual dispatches.
Failure traces, screenshots, and the HTML report are retained as CI artifacts.

## Browser record

| Browser                                                             | Platform                         | Install state                                | Result and evidence                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome for Testing 151.0.7922.34, Playwright Chromium revision 1234 | macOS, local production preview  | Browser tab; active worker, not OS-installed | Passed registration and activation on 2026-09-03. The complete suite passes after the separately tracked fetch-binding defect in #208 is fixed.                                                                                                                                   |
| Chrome for Testing 151.0.7922.34, Playwright Chromium revision 1234 | Ubuntu GitHub Actions            | Browser tab; active worker, not OS-installed | Evaluated by the PWA workflow on every pull request and main push.                                                                                                                                                                                                                |
| Safari (WebKit), iOS 27.2                                           | iPhone, PR #202’s branch preview | Home Screen web app                          | Passed on 2026-10-21 with the Safari steps below: registration & control; `/` & `/en` cached unredirected; offline launch from the icon into the last-used language (French); and an update whose install precached `/`, `/en`, & `/fr`, then another offline launch into French. |
| Chrome or Edge stable                                               | Not run                          | Not run                                      | Complete the manual procedure below before making browser-specific release claims.                                                                                                                                                                                                |
| Firefox stable                                                      | Not run                          | Not run                                      | Complete the manual procedure below; the automated suite does not claim Firefox coverage.                                                                                                                                                                                         |
| Safari stable                                                       | Not run                          | Not run                                      | Complete the manual procedure below; the automated suite does not claim Safari coverage.                                                                                                                                                                                          |
| Installed desktop or mobile PWA                                     | Not run                          | Not run                                      | Installation and standalone-window checks remain manual because CI exercises a browser tab.                                                                                                                                                                                       |

## Manual developer-tools check

Use a production deployment or `pnpm run test:pwa`’s preview, not the Vite development server.

1. Open the browser’s service-worker or application panel, clear site data, and reload.
2. Confirm `/service-worker.js` is registered for the `/` scope, reaches “activated”, and controls
   the page without an installation error.
3. Inspect Cache Storage. Confirm one current `cache-<version>` cache contains `/favicon.png` and
   hashed files under `/_app/immutable/`.
4. Visit `/animals` online. Confirm its document request succeeds and appears in the current cache.
5. Enable the browser’s offline network mode and reload `/animals`. Confirm the application route
   remains usable and a cached static asset still loads.
6. While offline, navigate to a same-origin path that has never been requested. Confirm the page
   displays the “You’re offline” heading. The worker bundles that page rather than precaching it,
   since Cloudflare Pages redirects `.html` paths (#226).
7. Still offline, open `/`. Confirm it lands on the language you last used online (for example
   `/en`), not the offline page. On an installed app, launch it from its icon instead. If it
   doesn’t, check Cache Storage for `/__last-locale` in `offline-locales-v1` and for `/` and the
   home page in `cache-<version>`. Then switch languages online, force-quit, and repeat offline: it
   should open the new language. On an iPhone, check this from the Home Screen app: WebKit refuses
   to render a cached navigation that was redirected, so the cached `/` and home pages must be plain
   200 responses.
8. Return online, unregister the worker or disable service workers, and reload `/animals`. Confirm
   the online application renders normally.
9. To check the update flow, keep two tabs open on the deployment, open a dialog (the About page’s
   “AI disclosure”) in one, deploy a new version, and leave both untouched for 10 minutes. Also
   check detection after focusing a tab or returning online after a failed install; don’t click
   “Update” in the service-worker panel. Confirm the new worker activates without a prompt, the idle
   tab reloads onto it, the other stays put with its dialog open and both `cache-<version>` caches
   remain, and closing the dialog reloads that tab, after which only the new cache is left.
10. Record the browser name and exact version, OS, whether the app was installed or in a tab, commit
    or release, date, and result. File each verified failure as a separate issue.

Note: Browser developer tools may bypass the worker when “Update on reload” or an equivalent option
is enabled. Disable that option during the offline checks.

### Safari on an iPhone, from a Mac

Safari’s Web Inspector has no service-worker or Cache Storage panel, so the checks above run from
the console instead.

1. **Connect.** On the iPhone, turn on Settings → Apps → Safari → Advanced → Web Inspector. On the
   Mac, turn on Safari → Settings → Advanced → “Show features for web developers”, then connect the
   iPhone by cable. Its pages appear under Develop → [the iPhone’s name]. Inspecting over the
   network works too, but it disconnects once the phone goes offline; a cable keeps the inspector
   attached through step 5.
2. **Test the right build in the right container.** Open the PR’s branch preview, not production.
   For the offline-launch check, add it to the Home Screen and inspect the Home Screen app: it has
   its own storage, worker, & caches, separate from Safari’s tabs, so a working Safari tab proves
   nothing about it. With the app open on the phone, it appears as its own entry in the Develop
   menu.
3. **Registration.** The worker is listed under its own Service Workers heading in the device’s
   Develop submenu once registered; opening it inspects the worker itself. To check control from the
   page’s console, wrap the code in an async function, since Safari’s console may reject a top-level
   `await` (“Unexpected identifier”):

   ```js
   (async () => {
     const r = await navigator.serviceWorker.getRegistration();
     console.log({
       scope: r?.scope,
       script: r?.active?.scriptURL,
       state: r?.active?.state,
       controlled: !!navigator.serviceWorker.controller,
     });
   })();
   ```

   Expect the `/` scope, `/service-worker.js`, `"activated"`, and `controlled: true`. All
   `undefined` means no worker yet: reload once and run it again.

4. **Caches.** List each cache’s entries outside `/_app/`:

   ```js
   (async () => {
     for (const name of await caches.keys()) {
       const keys = await (await caches.open(name)).keys();
       console.log(
         name,
         keys.map((k) => new URL(k.url).pathname).filter((p) => !p.startsWith("/_app/")),
       );
     }
   })();
   ```

   `cache-<version>` should hold `/` and the home page of each language used (`/en`, …), and
   `offline-locales-v1` should hold `/__last-locale`.

5. **Offline launch.** Safari’s Web Inspector can’t simulate offline, and the iPhone’s network
   conditioning needs Xcode, which this project doesn’t require, so take the phone offline for real.
   Turn on Airplane Mode and check that Wi-Fi is off too (Airplane Mode leaves it on if it was
   turned back on in Airplane Mode before). Force-quit the Home Screen app from the app switcher and
   launch it from its icon. It should open the last-used language’s home page, not the offline page.
   The landing page is the result, so inspecting over the network works too: note where the launch
   lands, then turn Airplane Mode off and inspect. Record the iOS version in the browser record.
