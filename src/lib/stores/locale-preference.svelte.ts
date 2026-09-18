import { goto } from "$app/navigation";
import { page } from "$app/state";
import { deLocalizeHref, localizeHref, setLocale } from "$lib/paraglide/runtime.js";

import type { LocaleCode } from "$lib/types/locale.js";

/**
 * Persists a player's selected locale, then navigates to the current page in that locale. Paraglide
 * writes its long-lived locale cookie, which is also the preference read by bare-path redirects on
 * the server. Its own navigation would be a full `location.href` reload, so it is told not to and
 * SvelteKit's client router takes over: the root layout's `load()` re-resolves the locale from the
 * new URL and every rendered name re-derives without losing page state.
 */
export const localePreference = {
  select(locale: LocaleCode): void {
    void setLocale(locale, { reload: false });
    // The target is the page already being displayed, re-localized: `page.url.pathname` is the
    // router's own resolved path, so there is no route literal here for `resolve()` to check.
    // eslint-disable-next-line svelte/no-navigation-without-resolve
    void goto(localizeHref(deLocalizeHref(page.url.pathname), { locale }));
  },
};
