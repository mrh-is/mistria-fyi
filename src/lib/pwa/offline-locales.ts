import { baseLocale } from "#lib/paraglide/runtime.js";
import { CACHE_LOCALES_MESSAGE } from "#lib/pwa/service-worker-cache.js";

import type { CacheLocalesMessage, CacheLocalesReply } from "#lib/pwa/service-worker-cache.js";
import type { LocaleCode } from "#lib/types/locale.js";

/**
 * Asks the service worker to keep `locale` available offline: every name chunk for it, plus
 * English, which sitewide search always matches against. The worker remembers the request and
 * re-caches the same locales for each new version it installs.
 *
 * The worker does the fetching, not the page. Chunks the page loaded before the worker took
 * control never passed through it, and `loadNames` won't import them twice.
 *
 * A new version waiting to take over hears it too. It read the remembered locales when it
 * installed, and activating deletes the active worker's cache, so a locale added since then would
 * otherwise be missing offline after the update.
 */
export function keepLocaleOffline(
  locale: LocaleCode,
  container?: Pick<ServiceWorkerContainer, "ready">,
): void {
  // The DOM types promise a container, but browsers omit it outside secure contexts.
  const target = container ?? ("serviceWorker" in navigator ? navigator.serviceWorker : undefined);
  if (!target) return;
  const message: CacheLocalesMessage = {
    type: CACHE_LOCALES_MESSAGE,
    locales: [...new Set([baseLocale, locale])],
  };
  void (async () => {
    const registration = await target.ready;
    registration.active?.postMessage(message);
    registration.waiting?.postMessage(message);
  })();
}

/** How long a locale download may take before the switch gives up and reports it unavailable. */
const DOWNLOAD_TIMEOUT_MS = 15_000;

/**
 * Makes sure every name chunk for `locale` is in the controlling service worker's cache, fetching
 * whatever is missing. Resolves `true` once the whole locale is cached, `false` when any chunk
 * couldn't be (offline, or the worker didn't answer in time), and `undefined` when no worker
 * controls the page, so there's no offline cache to consult.
 *
 * The worker's answer is authoritative; the page's own module cache isn't. Chunks download
 * independently, so a locale can be partly cached, and modules the page already imported may come
 * from a cache that an update has since replaced.
 */
export function ensureLocaleCachedOffline(
  locale: LocaleCode,
  container?: Pick<ServiceWorkerContainer, "controller">,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
): Promise<boolean | undefined> {
  const target = container ?? ("serviceWorker" in navigator ? navigator.serviceWorker : undefined);
  const worker = target?.controller;
  if (!worker) return Promise.resolve(undefined);

  const channel = new MessageChannel();
  const message: CacheLocalesMessage = { type: CACHE_LOCALES_MESSAGE, locales: [locale] };
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    function finish(complete: boolean): void {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(complete);
    }
    channel.port1.addEventListener("message", ({ data }: MessageEvent<CacheLocalesReply>) => {
      finish(data.failed.length === 0);
    });
    // Unlike the `onmessage` setter, `addEventListener` doesn't start the port implicitly.
    channel.port1.start();
    worker.postMessage(message, [channel.port2]);
  });
}
