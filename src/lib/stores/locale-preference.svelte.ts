import { setLocale } from "$lib/paraglide/runtime.js";

import type { LocaleCode } from "$lib/types/locale.js";

/**
 * Persists a player's selected locale before navigating to its URL. Paraglide writes its
 * long-lived locale cookie, which is also the preference read by bare-path redirects on the server.
 */
export const localePreference = {
  select(locale: LocaleCode): void {
    void setLocale(locale);
  },
};
