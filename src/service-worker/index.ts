// Bundled rather than precached from `static/`: Cloudflare Pages redirects `/offline.html` to
// `/offline`, which the locale middleware redirects again to a 404, & one failed precache request
// aborts the whole install (#226). `offlinePagePlugin` renders it with the app's fonts & theme,
// and every locale's text for the worker to pick from (#206).
import OFFLINE_PAGE from "virtual:mfg/offline-page";

import {
  cachesNoPageNeeds,
  CLIENT_VERSIONS_CACHE,
  parseClientVersionMessage,
  readClientVersions,
  rememberClientVersion,
  versionsInUse,
} from "#lib/pwa/client-versions.js";
import { IMMUTABLE_DIRECTORY, VERSION_METADATA_PATH } from "#lib/pwa/config.js";
import { offlinePageHtml } from "#lib/pwa/offline-page.js";
import {
  cacheLocaleChunks,
  cacheLocaleHome,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  fetchStrategy,
  isLazyAsset,
  isSkipWaitingRequest,
  lastLocaleStore,
  launchPagePaths,
  localeFontStylesheetAsset,
  mayDeleteRetainedCaches,
  obsoleteCaches,
  OFFLINE_LOCALES_CACHE,
  parseCacheLocalesMessage,
  parseCurrentLocale,
  precacheLaunchPages,
  readOfflineLocales,
  readRetainedCaches,
  rememberOfflineLocales,
  rememberRetainedCaches,
} from "#lib/pwa/service-worker-cache.js";
import { version } from "$app/env";
import { assets, immutable, prerendered } from "$app/manifest";

import type { CacheLocalesReply, LocaleNameChunks } from "#lib/pwa/service-worker-cache.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** Inlined by `localeNameChunksPlugin` (src/lib/build/locale-name-chunks.ts); absent in dev. */
declare const __LOCALE_NAME_CHUNKS__: LocaleNameChunks | undefined;

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

/** The cache holding `appVersion`'s build, named the same by every version's worker. */
function versionCache(appVersion: string): string {
  return `cache-${appVersion}`;
}

const CACHE = versionCache(version);
const SPRITES_CACHE = "sprites-v1";
// Manifest paths are relative to the base path, which is the registration scope's pathname.
const ASSETS = [...immutable, ...assets].map(
  ({ path }) => new URL(path, sw.registration.scope).pathname,
);
const ASSET_PATHS = new Set(ASSETS);
const VERSION_PATH = new URL(VERSION_METADATA_PATH, sw.registration.scope).pathname;
const IMMUTABLE_PREFIX = new URL(`${IMMUTABLE_DIRECTORY}/`, sw.registration.scope).pathname;
const LOCALE_NAME_CHUNKS: LocaleNameChunks =
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Only builds define this identifier; reading it bare throws a ReferenceError in dev.
  typeof __LOCALE_NAME_CHUNKS__ === "undefined" ? {} : __LOCALE_NAME_CHUNKS__;
const LOCALE_NAME_CHUNK_PATHS: ReadonlySet<string> = new Set(
  Object.values(LOCALE_NAME_CHUNKS).flat(),
);
const PRECACHED_ASSETS = ASSETS.filter((path) => !isLazyAsset(path, LOCALE_NAME_CHUNK_PATHS));
// Served at their extensionless paths (`/en`); `/en.html` reaches the Function and 404s.
const PRERENDERED_PATHS: ReadonlySet<string> = new Set(
  prerendered.map(({ path }) => new URL(path, sw.registration.scope).pathname),
);
const LAST_LOCALE = lastLocaleStore(() => caches.open(OFFLINE_LOCALES_CACHE));

/**
 * Best-effort: caches `locale`'s home page in this version's cache, where an offline launch at
 * `start_url` lands (#728), for a locale used since this version's install precached its homes. A
 * failure only costs that launch, and the page's next message retries.
 */
async function keepLocaleHome(locale: LocaleCode): Promise<void> {
  try {
    await cacheLocaleHome(await caches.open(CACHE), locale, sw.registration.scope, (request) =>
      fetch(request),
    );
  } catch {
    // Offline or out of quota: the launch falls back to another cached locale or the offline page.
  }
}

/** Every open page in scope, whichever worker (if any) controls it. */
async function openClientIds(): Promise<Set<string>> {
  const windows = await sw.clients.matchAll({ type: "window", includeUncontrolled: true });
  return new Set(windows.map((client) => client.id));
}

// Reports arrive concurrently; each read-modify-write of the record waits for the one before.
let clientVersionWrites: Promise<void> = Promise.resolve();

async function writeClientVersion(
  previous: Promise<void>,
  clientId: string,
  appVersion: string,
): Promise<void> {
  await previous;
  try {
    const cache = await caches.open(CLIENT_VERSIONS_CACHE);
    await rememberClientVersion(cache, clientId, appVersion, await openClientIds());
  } catch {
    // Out of quota: the page reads as unknown, which keeps every older cache until it reloads.
  }
}

/** Records the version a page reported. Best-effort: an unrecorded page reads as unknown. */
function recordClientVersion(clientId: string, appVersion: string): Promise<void> {
  clientVersionWrites = writeClientVersion(clientVersionWrites, clientId, appVersion);
  return clientVersionWrites;
}

/**
 * Deletes the `older` versions' caches that no open page needs (#111): a page still running an
 * older version imports its chunks from that version's cache, since the server no longer has
 * them. Of those, one holding the only copy of the last-used locale's home page stays until this
 * version has cached it (#18). Records what it kept, so a later message can finish the job.
 */
async function deleteObsoleteCaches(older: readonly string[]): Promise<void> {
  const [lastLocale, clientVersions, openClients] = await Promise.all([
    LAST_LOCALE.read(),
    caches.open(CLIENT_VERSIONS_CACHE).then(readClientVersions),
    openClientIds(),
  ]);
  const unneeded = cachesNoPageNeeds(
    older,
    versionsInUse(clientVersions, openClients),
    versionCache,
  );
  const obsolete = await obsoleteCaches(caches, CACHE, unneeded, lastLocale, sw.registration.scope);
  await Promise.all(obsolete.map((name) => caches.delete(name)));
  const kept = older.filter((name) => !obsolete.includes(name));
  try {
    await rememberRetainedCaches(await caches.open(OFFLINE_LOCALES_CACHE), kept);
  } catch {
    // Out of quota: a kept cache then waits for the next version's activation to go.
  }
}

/**
 * Deletes the caches this version's activation kept, once no open page runs their version and this
 * version has the home page they were kept for. Runs on page messages, since a closing or
 * reloading page tells the worker nothing; the next page to report its version settles it.
 * Only the active worker does, and only with no other version installing or waiting: that version
 * hears the same page messages, and a rollback's may reuse a kept cache's name. Browsers without
 * `self.serviceWorker` leave kept caches to the next activation.
 */
async function deleteRetainedCaches(): Promise<void> {
  const self: ServiceWorker | undefined = (sw as Partial<ServiceWorkerGlobalScope>).serviceWorker;
  if (!mayDeleteRetainedCaches(self?.state, sw.registration)) return;
  const retained = await readRetainedCaches(await caches.open(OFFLINE_LOCALES_CACHE));
  const existing = new Set(await caches.keys());
  const older = retained.filter((name) => name !== CACHE && existing.has(name));
  if (older.length > 0) await deleteObsoleteCaches(older);
}

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHED_ASSETS);
      // Carry the player's offline locales across the update. Best-effort: a failed chunk must not
      // block the install, and the page's next request retries it.
      const offlineLocales = await readOfflineLocales(await caches.open(OFFLINE_LOCALES_CACHE));
      await cacheLocaleChunks(cache, offlineLocales, LOCALE_NAME_CHUNKS);
      // Activating deletes the old cache, launch pages included, and the next launch may be
      // offline. Fetched fresh: the old version's page imports chunks that go with its cache. The
      // last-used locale is normally an offline one already, but a page message records it first.
      const lastLocale = await LAST_LOCALE.read();
      await precacheLaunchPages(
        cache,
        launchPagePaths(
          [...(lastLocale ? [lastLocale] : []), ...offlineLocales],
          PRERENDERED_PATHS,
        ),
        sw.registration.scope,
        (request) => fetch(request),
      );
      // Take over as soon as installed, with no tab's consent: activation keeps every older cache
      // an open page still imports from, and each page reloads onto this version at its own safe
      // moment (#111).
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  // Sent by tabs from releases before #111 when the player accepts the update prompt. This
  // version activates on its own, so the request is only ever early.
  if (isSkipWaitingRequest(event.data)) {
    event.waitUntil(sw.skipWaiting());
    return;
  }
  const clientVersion = parseClientVersionMessage(event.data);
  if (clientVersion !== undefined) {
    const { source } = event;
    if (!(source instanceof Client)) return;
    event.waitUntil(
      (async () => {
        await recordClientVersion(source.id, clientVersion);
        // A page reporting in may be the reload that frees an older version's cache.
        await deleteRetainedCaches();
      })(),
    );
    return;
  }
  const locales = parseCacheLocalesMessage(event.data, LOCALE_NAME_CHUNKS);
  if (!locales) return;
  // The page's language is the last-used one, including after a client-side switch from the
  // picker, which never loads a page through the worker. Its home page is cached for an offline
  // launch, since the page itself may have loaded before this worker took control.
  const current = parseCurrentLocale(event.data);
  if (current) {
    event.waitUntil(
      (async () => {
        await Promise.all([LAST_LOCALE.remember(current), keepLocaleHome(current)]);
        // An older version's cache kept for its copy of a home page can go once this one has it.
        await deleteRetainedCaches();
      })(),
    );
  }
  // A reply is this version's cache speaking for itself, which a page can't infer: the modules it
  // already imported may come from a cache an update has since deleted.
  const [reply] = event.ports;
  event.waitUntil(
    (async () => {
      // Answer even if caching throws, so a waiting page never stalls until its timeout.
      let failed = ["cache unavailable"];
      try {
        failed = await cacheLocaleChunks(await caches.open(CACHE), locales, LOCALE_NAME_CHUNKS);
      } finally {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- `MessagePort.postMessage` takes no target origin
        reply?.postMessage({ failed } satisfies CacheLocalesReply);
      }
      await rememberOfflineLocales(await caches.open(OFFLINE_LOCALES_CACHE), locales);
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // No fetch here: until activation finishes, every fetch event waits, and the launch with it.
      // A home page this version couldn't fetch keeps the old cache instead, as does any open
      // page's version.
      const keys = await caches.keys();
      const persistent = new Set([
        CACHE,
        SPRITES_CACHE,
        OFFLINE_LOCALES_CACHE,
        CLIENT_VERSIONS_CACHE,
      ]);
      await deleteObsoleteCaches(keys.filter((key) => !persistent.has(key)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const strategy = fetchStrategy(
    event.request,
    ASSET_PATHS,
    sw.location.origin,
    VERSION_PATH,
    IMMUTABLE_PREFIX,
  );
  // Without `respondWith`, the browser fetches the request itself.
  if (!strategy) return;
  const url = new URL(event.request.url);

  if (strategy === "asset") {
    event.respondWith(
      // Build assets are content-addressed, so a `Vary` header can't make a cached copy wrong. Vite's
      // CORS middleware adds `Vary: Origin`, which would otherwise miss for module imports: they
      // send an `Origin` header the precache requests didn't. This version's cache answers first;
      // then every other one, so a page still on an older version finds its chunks in that
      // version's cache.
      (async () => {
        const current = await caches.open(CACHE);
        const cached =
          (await current.match(event.request, { ignoreVary: true })) ??
          (await caches.match(event.request, { ignoreVary: true }));
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && isLazyAsset(url.pathname, LOCALE_NAME_CHUNK_PATHS)) {
          await current.put(event.request, response.clone());
        }
        return response;
      })(),
    );
  } else if (strategy === "sprite") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SPRITES_CACHE);
        return fetchSpriteRequest(event.request, {
          cache,
          fetcher: (request) => fetch(request),
          waitUntil: (promise) => {
            event.waitUntil(promise);
          },
        });
      })(),
    );
  } else {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return fetchRuntimeRequest(event.request, {
          assetPaths: ASSET_PATHS,
          cache,
          fetcher: (request) => fetch(request),
          lastLocale: LAST_LOCALE,
          // This version's copy first: an older version's cache kept for an open page may hold
          // the same page from that version's build.
          matchCache: async (request) => (await cache.match(request)) ?? caches.match(request),
          offlinePage: (locale) =>
            new Response(
              offlinePageHtml(OFFLINE_PAGE, locale, localeFontStylesheetAsset(ASSETS, locale)),
              { headers: { "Content-Type": "text/html; charset=utf-8" } },
            ),
          waitUntil: (promise) => {
            event.waitUntil(promise);
          },
        });
      })(),
    );
  }
});
