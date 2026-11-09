/// <reference lib="webworker" />

import { version } from "$app/env";

/** @type {ServiceWorkerGlobalScope} */
const worker = /** @type {never} */ (globalThis);
const cache = caches.open(`localization-pilot-${version}`);

/** @param {Request} request */
async function serve(request) {
  const store = await cache;
  const existing = await store.match(request);
  if (existing) return existing;
  const response = await fetch(request);
  if (response.ok) await store.put(request, response.clone());
  return response;
}

worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method === "GET" &&
    url.origin === worker.location.origin &&
    (url.pathname.endsWith("/pilot") || url.pathname.startsWith("/_app/immutable/"))
  ) {
    event.respondWith(serve(event.request));
  }
});
