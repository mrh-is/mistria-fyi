import { browser } from "$app/environment";
import { getLocale, getLocaleForUrl } from "$lib/paraglide/runtime.js";

import type { LayoutLoad } from "./$types.js";

/**
 * Resolves the route's locale once, at the top of the tree, so every page and component can source
 * it from `load()` data rather than ambient state. `getLocaleForUrl` is route-aware, which matters
 * because `hooks.ts` de-localizes the URL before SvelteKit matches routes — there is no `[locale]`
 * segment on disk to read.
 *
 * On the server, paraglide's `getLocaleForUrl` skips the URL strategy entirely and falls through to
 * the base locale, so SSR must read `getLocale()` instead, which `paraglideMiddleware` has already
 * resolved from the request. The URL form stays on the client because `load` runs before the
 * navigation commits, when `getLocale()` would still report the previous page's locale.
 */
export const load: LayoutLoad = ({ url }) => ({
  locale: browser ? getLocaleForUrl(url) : getLocale(),
});
