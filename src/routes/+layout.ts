import { loadNames } from "#lib/data/names.js";
import { localeFromPath } from "#lib/i18n/locale-path.js";
import { getLocale } from "#lib/i18n/locale-runtime.js";

import type { LayoutLoad } from "./$types";

/**
 * Every page is prerendered once per locale (`PRERENDERED_ROUTES` in
 * `src/lib/i18n/prerender-entries.ts`), so pages are static files and an offline launch never waits
 * on a server. Only `/api` stays dynamic.
 */
export const prerender = true;

/**
 * Reads the target URL so preloading uses its locale without changing the current page.
 * Unprefixed errors can use the locale selected by the server hook.
 *
 * The `ui` chunk (the game's own vocabulary: category names, seasons, quest types, …) is awaited
 * here because sitewide chrome reads it on every route.
 */
export const load: LayoutLoad = async ({ url }) => {
  const locale = localeFromPath(url.pathname) ?? getLocale();
  await loadNames(locale, ["ui"]);
  return { locale };
};
