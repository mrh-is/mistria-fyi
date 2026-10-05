import {
  cacheLocaleChunks,
  cacheLocalesRequest,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  isEligibleForRuntimeCaching,
  isExternalSpriteAsset,
  isLazyAsset,
  isSkipWaitingRequest,
  OFFLINE_LOCALES_CACHE,
  readOfflineLocales,
  rememberOfflineLocales,
} from "#lib/engine/service-worker-cache.js";
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";

import type { CacheLocalesReply, LocaleNameChunks } from "#lib/engine/service-worker-cache.js";

/** Inlined by `localeNameChunksPlugin` (src/lib/build/locale-name-chunks.ts); absent in dev. */
declare const __LOCALE_NAME_CHUNKS__: LocaleNameChunks | undefined;

const sw = globalThis as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const SPRITES_CACHE = "sprites-v1";
// Manifest paths are relative to the base path, which is the registration scope's pathname.
const ASSETS = [...immutable, ...assets].map(
  ({ path }) => new URL(path, sw.registration.scope).pathname,
);
const LOCALE_NAME_CHUNKS: LocaleNameChunks =
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Only builds define this identifier; reading it bare throws a ReferenceError in dev.
  typeof __LOCALE_NAME_CHUNKS__ === "undefined" ? {} : __LOCALE_NAME_CHUNKS__;
const LOCALE_NAME_CHUNK_PATHS: ReadonlySet<string> = new Set(
  Object.values(LOCALE_NAME_CHUNKS).flat(),
);
const PRECACHED_ASSETS = ASSETS.filter((path) => !isLazyAsset(path, LOCALE_NAME_CHUNK_PATHS));

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHED_ASSETS);
      // Carry the player's offline locales across the update. Best-effort: a failed chunk must not
      // block the install, and the page's next request retries it.
      const offlineLocales = await readOfflineLocales(await caches.open(OFFLINE_LOCALES_CACHE));
      await cacheLocaleChunks(cache, offlineLocales, LOCALE_NAME_CHUNKS);
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
  const locales = cacheLocalesRequest(event.data, LOCALE_NAME_CHUNKS);
  if (!locales) return;
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
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE && key !== SPRITES_CACHE && key !== OFFLINE_LOCALES_CACHE)
          .map((key) => caches.delete(key)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  const isAsset = ASSETS.includes(url.pathname);

  if (isAsset) {
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
  } else if (isExternalSpriteAsset(url)) {
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
  } else if (isEligibleForRuntimeCaching(url, sw.location.origin)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        return fetchRuntimeRequest(event.request, {
          assetPaths: ASSETS,
          cache,
          fetcher: (request) => fetch(request),
          matchCache: (request) => caches.match(request),
          waitUntil: (promise) => {
            event.waitUntil(promise);
          },
        });
      })(),
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});
