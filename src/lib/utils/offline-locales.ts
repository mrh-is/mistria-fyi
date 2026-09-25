import { CACHE_LOCALES_MESSAGE, type CacheLocalesMessage } from "$lib/engine/service-worker-cache";
import { baseLocale } from "$lib/paraglide/runtime.js";

import type { LocaleCode } from "$lib/types/locale";

/**
 * Asks the service worker to keep `locale` available offline: every name chunk for it, plus
 * English, which sitewide search always matches against. The worker remembers the request and
 * re-caches the same locales for each new version it installs.
 *
 * The worker does the fetching, not the page. Chunks the page loaded before the worker took
 * control never passed through it, and `loadNames` won't import them twice.
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
  void target.ready.then((registration) => {
    registration.active?.postMessage(message);
  });
}
