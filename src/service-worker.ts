/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];
const MAX_RUNTIME_ENTRIES = 50;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
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

async function evictOldestEntries(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  const runtimeKeys = keys.filter((req) => !ASSETS.includes(new URL(req.url).pathname));
  const excess = runtimeKeys.length - MAX_RUNTIME_ENTRIES;
  if (excess > 0) {
    for (const key of runtimeKeys.slice(0, excess)) {
      await cache.delete(key);
    }
  }
}

function isEligibleForCaching(url: URL): boolean {
  if (url.origin !== sw.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

sw.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  const isAsset = ASSETS.includes(url.pathname);

  if (isAsset) {
    event.respondWith(caches.match(event.request).then((r) => r ?? fetch(event.request)));
  } else if (isEligibleForCaching(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then(async (cache) => {
              await cache.put(event.request, clone);
              await evictOldestEntries(cache);
            });
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then(
              (r) =>
                r ??
                (event.request.mode === "navigate" ? caches.match("/offline.html") : undefined),
            )
            .then((r) => r ?? Response.error()),
        ),
    );
  } else {
    event.respondWith(fetch(event.request));
  }
});
