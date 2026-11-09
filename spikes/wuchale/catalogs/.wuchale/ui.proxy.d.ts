import type { CatalogModule } from "wuchale/runtime";

export const patterns: string[];
export function loadCatalog(id: number, locale: string): Promise<CatalogModule>;
