import { createContext } from "svelte";
import toRuntime from "wuchale/runtime";

import { loadCatalog } from "./catalogs/.wuchale/about.proxy.js";

import type { CatalogModule, Runtime } from "wuchale/runtime";

import type { LocaleCode } from "#lib/types/locale.js";

const [readAboutRuntime, setAboutRuntime] = createContext<Runtime>();

export { readAboutRuntime };

export function loadAboutCatalog(locale: LocaleCode): Promise<CatalogModule> {
  return loadCatalog(0, locale);
}

export function provideAboutCatalog(catalog: CatalogModule, locale: LocaleCode): void {
  setAboutRuntime(toRuntime(catalog, locale));
}
