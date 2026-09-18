/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import {
  fetchRuntimeRequest,
  isEligibleForRuntimeCaching,
  isLazyAsset,
} from "$lib/engine/service-worker-cache.js";
import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];
const PRECACHED_ASSETS = ASSETS.filter((path) => !isLazyAsset(path));

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHED_ASSETS))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      for (const key of keys) {
        if (key !== CACHE) await caches.delete(key);
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
        if (response.ok && isLazyAsset(url.pathname)) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      }),
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
