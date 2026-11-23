declare module "virtual:mistria-route-catalogs" {
  import type { CatalogModule } from "wuchale/runtime";

  const modules: Partial<Record<string, () => Promise<CatalogModule>>>;
  export default modules;
}
