import {
  cacheLocaleChunks,
  cacheLocaleHome,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  fetchStrategy,
  isLazyAsset,
  isSkipWaitingRequest,
  lastLocaleStore,
  obsoleteCaches,
  OFFLINE_LOCALES_CACHE,
  parseCacheLocalesMessage,
  parseCurrentLocale,
  readOfflineLocales,
  readRetainedCaches,
  rememberOfflineLocales,
  rememberRetainedCaches,
} from "#lib/pwa/service-worker-cache.js";
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";

// Bundled rather than precached from `static/`: Cloudflare Pages redirects `/offline.html` to
// `/offline`, which the locale middleware redirects again to a 404, & one failed precache request
// aborts the whole install (#226).
import OFFLINE_HTML from "./offline.html?raw";

import type { CacheLocalesReply, LocaleNameChunks } from "#lib/pwa/service-worker-cache.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** Inlined by `localeNameChunksPlugin` (src/lib/build/locale-name-chunks.ts); absent in dev. */
declare const __LOCALE_NAME_CHUNKS__: LocaleNameChunks | undefined;

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const SPRITES_CACHE = "sprites-v1";
// Manifest paths are relative to the base path, which is the registration scope's pathname.
const ASSETS = [...immutable, ...assets].map(
  ({ path }) => new URL(path, sw.registration.scope).pathname,
);
const ASSET_PATHS = new Set(ASSETS);
const LOCALE_NAME_CHUNKS: LocaleNameChunks =
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Only builds define this identifier; reading it bare throws a ReferenceError in dev.
  typeof __LOCALE_NAME_CHUNKS__ === "undefined" ? {} : __LOCALE_NAME_CHUNKS__;
const LOCALE_NAME_CHUNK_PATHS: ReadonlySet<string> = new Set(
  Object.values(LOCALE_NAME_CHUNKS).flat(),
);
const PRECACHED_ASSETS = ASSETS.filter((path) => !isLazyAsset(path, LOCALE_NAME_CHUNK_PATHS));
const LAST_LOCALE = lastLocaleStore(() => caches.open(OFFLINE_LOCALES_CACHE));

/**
 * Best-effort: caches `locale`'s home page in this version's cache, where an offline launch at
 * `start_url` lands (#728). A failure only costs that launch, and the page's next message retries.
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

/**
 * Deletes the `older` versions' caches, except one holding the only copy of the last-used locale's
 * home page, which stays until this version has cached it (#18). Records what it kept, so a later
 * message can finish the job.
 */
async function deleteObsoleteCaches(older: readonly string[]): Promise<void> {
  const lastLocale = await LAST_LOCALE.read();
  const obsolete = await obsoleteCaches(caches, CACHE, older, lastLocale, sw.registration.scope);
  await Promise.all(obsolete.map((name) => caches.delete(name)));
  const kept = older.filter((name) => !obsolete.includes(name));
  try {
    await rememberRetainedCaches(await caches.open(OFFLINE_LOCALES_CACHE), kept);
  } catch {
    // Out of quota: a kept cache then waits for the next version's activation to go.
  }
}

/**
 * Deletes the caches this version's activation kept, once it has the home page they were kept for.
 * Only the active worker does: a new version hears page messages while installing or waiting, when
 * the active one may still need them. Only recorded caches go, never a newer version's. Browsers
 * without `self.serviceWorker` leave them to the next activation.
 */
async function deleteRetainedCaches(): Promise<void> {
  const self: ServiceWorker | undefined = (sw as Partial<ServiceWorkerGlobalScope>).serviceWorker;
  if (self?.state !== "activated") return;
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
      // Activating deletes the old cache, home pages included, and the next launch may be offline.
      // Fetched fresh: the old version's page imports chunks that go with its cache.
      const lastLocale = await LAST_LOCALE.read();
      if (lastLocale) await keepLocaleHome(lastLocale);
      // No `skipWaiting()`. A first install activates at once; an update waits until a tab accepts
      // the update prompt, since taking over would delete the cache open tabs still import from.
    })(),
  );
});

sw.addEventListener("message", (event) => {
  if (isSkipWaitingRequest(event.data)) {
    event.waitUntil(sw.skipWaiting());
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
      // A home page this version couldn't fetch keeps the old cache instead.
      const keys = await caches.keys();
      await deleteObsoleteCaches(
        keys.filter(
          (key) => key !== CACHE && key !== SPRITES_CACHE && key !== OFFLINE_LOCALES_CACHE,
        ),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const strategy = fetchStrategy(event.request, ASSET_PATHS, sw.location.origin);
  // Without `respondWith`, the browser fetches the request itself.
  if (!strategy) return;
  const url = new URL(event.request.url);

  if (strategy === "asset") {
    event.respondWith(
      // Build assets are content-addressed, so a `Vary` header can't make a cached copy wrong. Vite's
      // CORS middleware adds `Vary: Origin`, which would otherwise miss for module imports: they
      // send an `Origin` header the precache requests didn't.
      (async () => {
        const cached = await caches.match(event.request, { ignoreVary: true });
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && isLazyAsset(url.pathname, LOCALE_NAME_CHUNK_PATHS)) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
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
          matchCache: (request) => caches.match(request),
          offlinePage: () =>
            new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
          waitUntil: (promise) => {
            event.waitUntil(promise);
          },
        });
      })(),
    );
  }
});
