import modules from "virtual:mistria-route-catalogs";

import { createCatalogRuntime } from "./catalog-runtime.js";
import { loadCatalog as loadDataErrors } from "./catalogs/.wuchale/data-errors.proxy.js";
import { patterns } from "./catalogs/.wuchale/route.proxy.js";
import { stripLocale } from "./locale-path.js";
import { getLocale } from "./locale-runtime.js";
import { ROUTE_UI_GROUPS } from "./route-ui-groups.js";

import type { Runtime } from "wuchale/runtime";

import type { LocaleCode } from "#lib/types/locale.js";

const groups = ROUTE_UI_GROUPS.map(({ paths, pattern, shard }) => {
  const id = patterns.indexOf(pattern);
  if (id < 1) throw new Error(`No generated route catalog group for ${shard}`);
  const runtime = createCatalogRuntime(shard, (locale) => {
    const load = modules[`route.${id}.${locale}.compiled.js`];
    if (!load) throw new Error(`No route catalog for ${shard} in ${locale}`);
    return load();
  });
  return { id, paths, runtime };
});

const dataErrors = createCatalogRuntime("save-import diagnostics", (locale) =>
  loadDataErrors(0, locale),
);

export function readDataErrorRuntime(): Runtime {
  return dataErrors.read(getLocale());
}

export async function loadRouteUi(locale: LocaleCode, pathname: string): Promise<void> {
  const route = stripLocale(pathname).split("/")[1];
  const loads = groups.flatMap(({ paths, runtime }) =>
    paths.some((path) => path === route) ? [runtime.load(locale)] : [],
  );
  if (route === "data") loads.push(dataErrors.load(locale));
  await Promise.all(loads);
}

export function readRouteRuntime(group: number): Runtime {
  const catalog = groups.find(({ id }) => id === group);
  if (!catalog) throw new Error(`Unknown route catalog group ${group}`);
  return catalog.runtime.read(getLocale());
}
