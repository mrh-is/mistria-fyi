import { createCatalogRuntime } from "./catalog-runtime.js";
import { loadCatalog } from "./catalogs/.wuchale/acquisition.proxy.js";

const acquisition = createCatalogRuntime("acquisition and variants", (locale) =>
  loadCatalog(0, locale),
);

export const hasAcquisitionUi = acquisition.has;
export const loadAcquisitionUi = acquisition.load;
export const readAcquisitionRuntime = acquisition.read;
