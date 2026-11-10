import toRuntime from "wuchale/runtime";

import type { CatalogModule, Runtime } from "wuchale/runtime";

import type { LocaleCode } from "#lib/types/locale.js";

interface CatalogRuntime {
  load: (locale: LocaleCode) => Promise<void>;
  read: (locale: LocaleCode) => Runtime;
}

export function createCatalogRuntime(
  name: string,
  loadCatalog: (locale: LocaleCode) => Promise<CatalogModule>,
): CatalogRuntime {
  const runtimes = new Map<LocaleCode, Runtime>();
  return {
    async load(locale: LocaleCode): Promise<void> {
      if (runtimes.has(locale)) return;
      const catalog = await loadCatalog(locale);
      if (!runtimes.has(locale)) runtimes.set(locale, toRuntime(catalog, locale));
    },
    read(locale: LocaleCode): Runtime {
      const runtime = runtimes.get(locale);
      if (!runtime) throw new Error(`The ${name} catalog was not loaded for ${locale}`);
      return runtime;
    },
  };
}
