import toRuntime from "wuchale/runtime";

import { getLocale } from "../locale-runtime.js";

/** @param {Record<string, import('wuchale/runtime').CatalogModule>} catalogs */
export function getRuntime(catalogs, locale = getLocale()) {
  return toRuntime(catalogs[locale], locale);
}

/** @param {Record<string, import('wuchale/runtime').CatalogModule>} catalogs */
export function getRuntimeRx(catalogs) {
  return getRuntime(catalogs);
}
