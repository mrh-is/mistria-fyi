import { createCatalogRuntime } from "./catalog-runtime.js";
import { loadCatalog } from "./catalogs/.wuchale/metadata.proxy.js";

const metadataUi = createCatalogRuntime("page metadata", (locale) => loadCatalog(0, locale));

export const loadMetadataUi = metadataUi.load;
export const readMetadataRuntime = metadataUi.read;
