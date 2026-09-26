/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import {
  cacheLocaleChunks,
  type CacheLocalesReply,
  cacheLocalesRequest,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  isEligibleForRuntimeCaching,
  isExternalSpriteAsset,
  isLazyAsset,
  type LocaleNameChunks,
  OFFLINE_LOCALES_CACHE,
  readOfflineLocales,
  rememberOfflineLocales,
} from "$lib/engine/service-worker-cache.js";
import { build, files, version } from "$service-worker";

/** Inlined by `localeNameChunksPlugin` (src/lib/build/locale-name-chunks.ts); absent in dev. */
declare const __LOCALE_NAME_CHUNKS__: LocaleNameChunks | undefined;

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const SPRITES_CACHE = "sprites-v1";
const ASSETS = [...build, ...files];
const LOCALE_NAME_CHUNKS: LocaleNameChunks =
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
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("message", (event) => {
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
        reply?.postMessage({ failed } satisfies CacheLocalesReply);
      }
      await rememberOfflineLocales(await caches.open(OFFLINE_LOCALES_CACHE), locales);
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      for (const key of keys) {
        if (key !== CACHE && key !== SPRITES_CACHE && key !== OFFLINE_LOCALES_CACHE) {
          await caches.delete(key);
        }
      }
      await sw.clients.claim();
    }),
  );
});

sw.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  const isAsset = ASSETS.includes(url.pathname);

  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok && isLazyAsset(url.pathname, LOCALE_NAME_CHUNK_PATHS)) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      }),
    );
  } else if (isExternalSpriteAsset(url)) {
    event.respondWith(
      caches.open(SPRITES_CACHE).then((cache) =>
        fetchSpriteRequest(event.request, {
          cache,
          fetcher: (request) => fetch(request),
          waitUntil: (promise) => {
            event.waitUntil(promise);
          },
        }),
      ),
    );
  } else if (isEligibleForRuntimeCaching(url, sw.location.origin)) {
    const response = caches.open(CACHE).then((cache) =>
      fetchRuntimeRequest(event.request, {
        assetPaths: ASSETS,
        cache,
        fetcher: (request) => fetch(request),
        matchCache: (request) => caches.match(request),
      }),
    );
    event.respondWith(response);
    event.waitUntil(response.then(() => undefined));
  } else {
    event.respondWith(fetch(event.request));
  }
});
