import { createCatalogRuntime } from "./catalog-runtime.js";
import { loadCatalog } from "./catalogs/.wuchale/shared.proxy.js";
import { getLocale } from "./locale-runtime.js";

import type { Runtime } from "wuchale/runtime";

const sharedUi = createCatalogRuntime("shared UI", (locale) => loadCatalog(0, locale));

/** Loading a target locale during navigation does not change the current page's runtime. */
export const loadSharedUi = sharedUi.load;

export function readSharedRuntime(locale = getLocale()): Runtime {
  return sharedUi.read(locale);
}
