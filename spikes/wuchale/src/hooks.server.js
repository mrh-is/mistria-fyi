import { loadLocales, runWithLocale } from "wuchale/load-utils/server";

import { key, loadCatalog, loadCount } from "../catalogs/ui.loader.server.svelte.js";
import { locales } from "./locale.js";
import { localizeRequest } from "./request-locale.js";

// The loader is generated during extraction or build. Declare its interface for clean checkouts.
const ready = loadLocales(
  (key),
  (loadCount),
  (loadCatalog),
  locales,
);

/** @param {{event: Parameters<typeof localizeRequest>[0], resolve: Parameters<typeof localizeRequest>[1]}} input */
export const handle = async ({ event, resolve }) => {
  const { locale, render } = localizeRequest(event, resolve);
  await ready;
  return runWithLocale(locale, render);
};
