import { localizePath } from "#lib/i18n/locale-path.js";
import { rememberLocale } from "#lib/i18n/locale-runtime.js";
import { ensureLocaleCachedOffline } from "#lib/pwa/offline-locales.js";
import { goto } from "$app/navigation";
import { page } from "$app/state";

import type { LocaleCode } from "#lib/types/locale.js";

/**
 * Persists a player's selected locale and navigates to the same page using SvelteKit's router.
 * The root layout reads the locale from the new URL, and bare-path redirects read the cookie.
 */
export const localePreference = {
  /**
   * Resolves `false`, without switching, when `locale` isn't fully downloaded and can't be now:
   * the player is offline. The service worker fetches any missing name chunks first, so a switch
   * never lands on a page whose names are missing. Without a controlling worker there's no
   * offline cache to check, and the switch goes ahead.
   */
  async select(locale: LocaleCode): Promise<boolean> {
    if ((await ensureLocaleCachedOffline(locale)) === false) return false;
    rememberLocale(locale);
    // The target is the page already being displayed, re-localized from the router's own path.
    void goto(localizePath(page.url.pathname, locale));
    return true;
  },
};
