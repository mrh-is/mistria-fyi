import toRuntime from "wuchale/runtime";

import { loadCatalog } from "./catalogs/.wuchale/shared.proxy.js";
import { getLocale } from "./locale-runtime.js";

import type { Runtime } from "wuchale/runtime";

import type { LocaleCode } from "#lib/types/locale.js";

const runtimes = new Map<LocaleCode, Runtime>();

/** Loading a target locale during navigation does not change the current page's runtime. */
export async function loadSharedUi(locale: LocaleCode): Promise<void> {
  if (runtimes.has(locale)) return;
  const catalog = await loadCatalog(0, locale);
  runtimes.set(locale, toRuntime(catalog, locale));
}

export function readSharedRuntime(): Runtime {
  const locale = getLocale();
  const runtime = runtimes.get(locale);
  if (!runtime) throw new Error(`Shared UI catalog was not loaded for ${locale}`);
  return runtime;
}
