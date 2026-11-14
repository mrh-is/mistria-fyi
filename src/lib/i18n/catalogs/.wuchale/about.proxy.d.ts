import type { CatalogModule } from "wuchale/runtime";

export function loadCatalog(id: number, locale: string): Promise<CatalogModule>;
