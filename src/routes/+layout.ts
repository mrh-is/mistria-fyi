import { loadNames } from "#lib/data/names.js";
import { loadAcquisitionUi } from "#lib/i18n/acquisition-ui.js";
import { localeFromPath } from "#lib/i18n/locale-path.js";
import { getLocale } from "#lib/i18n/locale-runtime.js";
import { loadRouteUi } from "#lib/i18n/route-ui.js";
import { loadSharedUi } from "#lib/i18n/shared-ui.js";

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
export const load: LayoutLoad = async ({ route, url }) => {
  const locale = localeFromPath(url.pathname) ?? getLocale();
  const usesAcquisitionCopy =
    route.id === "/everything" || route.id?.startsWith("/(category)/") === true;
  const [, catalogLoadFailed] = await Promise.all([
    loadNames(locale, ["ui"]),
    Promise.all([
      loadSharedUi(locale),
      loadRouteUi(locale, url.pathname),
      usesAcquisitionCopy ? loadAcquisitionUi(locale) : undefined,
    ]).then(
      () => false,
      (error: unknown) => {
        // Keep the root layout available when a browser cannot fetch a catalog.
        // A broken build still needs to fail during server rendering and prerendering.
        if (import.meta.env.SSR) throw error;
        return true;
      },
    ),
  ]);
  return catalogLoadFailed ? { catalogLoadFailed, locale } : { locale };
};
