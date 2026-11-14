import toRuntime from "wuchale/runtime";

import { getLocale } from "../locale-runtime.js";

import type { CatalogModule, Runtime } from "wuchale/runtime";

export function getRuntime(catalogs: Record<string, CatalogModule>): Runtime {
  const locale = getLocale();
  return toRuntime(catalogs[locale], locale);
}

export function getRuntimeRx(catalogs: Record<string, CatalogModule>): Runtime {
  return getRuntime(catalogs);
}
