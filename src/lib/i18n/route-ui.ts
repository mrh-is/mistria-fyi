import { createCatalogRuntime } from "./catalog-runtime.js";
import { stripLocale } from "./locale-path.js";
import { getLocale } from "./locale-runtime.js";
import { ROUTE_UI_GROUPS } from "./route-ui-groups.js";

import type { CatalogModule, Runtime } from "wuchale/runtime";

import type { LocaleCode } from "#lib/types/locale.js";

// Each route loads its group. The aggregate catalog (group 0) is never needed by the app.
const modules: Partial<Record<string, () => Promise<CatalogModule>>> =
  import.meta.glob<CatalogModule>([
    "./catalogs/.wuchale/route.*.*.compiled.js",
    "!./catalogs/.wuchale/route.0.*.compiled.js",
  ]);

const groups = ROUTE_UI_GROUPS.map(({ shard }, index) =>
  createCatalogRuntime(shard, (locale) => {
    const load = modules[`./catalogs/.wuchale/route.${index + 1}.${locale}.compiled.js`];
    if (!load) throw new Error(`No route catalog for ${shard} in ${locale}`);
    return load();
  }),
);

export async function loadRouteUi(locale: LocaleCode, pathname: string): Promise<void> {
  const route = stripLocale(pathname).split("/")[1];
  await Promise.all(
    ROUTE_UI_GROUPS.flatMap(({ paths }, index) =>
      paths.some((path) => path === route) ? [groups[index].load(locale)] : [],
    ),
  );
}

export function readRouteRuntime(group: number): Runtime {
  const catalog = group > 0 ? groups.at(group - 1) : undefined;
  if (!catalog) throw new Error(`Unknown route catalog group ${group}`);
  return catalog.read(getLocale());
}
