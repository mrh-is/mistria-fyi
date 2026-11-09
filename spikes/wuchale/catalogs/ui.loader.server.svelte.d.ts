import type { loadLocales } from "wuchale/load-utils/server";

// Wuchale generates the corresponding JavaScript module at extraction and build time.
export const key: string;
export const loadCount: number;
export const loadCatalog: Parameters<typeof loadLocales>[2];
