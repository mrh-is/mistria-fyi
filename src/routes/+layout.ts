import { loadNames } from "#lib/data/names.js";
import { getLocale, getLocaleForUrl } from "#lib/paraglide/runtime.js";
import { browser } from "$app/env";

import type { LayoutLoad } from "./$types";

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
 *
 * The `ui` chunk (the game's own vocabulary: category names, seasons, quest types, …) is awaited
 * here because sitewide chrome reads it on every route.
 */
export const load: LayoutLoad = async ({ url }) => {
  const locale = browser ? getLocaleForUrl(url) : getLocale();
  await loadNames(locale, ["ui"]);
  return { locale };
};
