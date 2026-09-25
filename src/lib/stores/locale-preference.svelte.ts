import { goto } from "$app/navigation";
import { page } from "$app/state";
import { loadNames } from "$lib/data/names";
import { deLocalizeHref, localizeHref, setLocale } from "$lib/paraglide/runtime.js";

import type { LocaleCode } from "$lib/types/locale";

/**
 * Persists a player's selected locale, then navigates to the current page in that locale. Paraglide
 * writes its long-lived locale cookie, which is also the preference read by bare-path redirects on
 * the server. Its own navigation would be a full `location.href` reload, so it is told not to and
 * SvelteKit's client router takes over: the root layout's `load()` re-resolves the locale from the
 * new URL and every rendered name re-derives without losing page state.
 */
export const localePreference = {
  /**
   * Resolves `false`, without switching, when `locale`'s names can't be loaded: the player is
   * offline and hasn't downloaded that locale yet. Its `ui` chunk is the probe: every page needs
   * it, and the service worker caches a kept-offline locale's chunks together, so a cached `ui`
   * chunk almost always means the rest are cached too.
   */
  async select(locale: LocaleCode): Promise<boolean> {
    try {
      await loadNames(locale, ["ui"]);
    } catch {
      return false;
    }
    void setLocale(locale, { reload: false });
    // The target is the page already being displayed, re-localized: `page.url.pathname` is the
    // router's own resolved path, so there is no route literal here for `resolve()` to check.
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(localizeHref(deLocalizeHref(page.url.pathname), { locale }));
    return true;
  },
};
