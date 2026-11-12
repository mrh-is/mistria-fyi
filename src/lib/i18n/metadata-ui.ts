import { createCatalogRuntime } from "./catalog-runtime.js";
import { loadCatalog } from "./catalogs/.wuchale/metadata.proxy.js";
import { getLocale } from "./locale-runtime.js";

import type { Runtime } from "wuchale/runtime";

const metadataUi = createCatalogRuntime("page metadata", (locale) => loadCatalog(0, locale));

export const loadMetadataUi = metadataUi.load;
export const readMetadataRuntime = (locale = getLocale()): Runtime => metadataUi.read(locale);
