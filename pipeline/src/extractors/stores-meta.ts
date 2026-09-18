import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize";

import type { LocaleCode } from "$lib/types/locale.js";
import type { StoreId } from "$lib/types/tracker-data.js";
import type { TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

const KNOWN_STORES: Record<string, { article?: "the" }> = {
  balor: {},
  blacksmith: { article: "the" },
  carpenter: { article: "the" },
  darcy: {},
  elsie_spring_festival: {},
  general: { article: "the" },
  hayden: {},
  inn: { article: "the" },
  louis: {},
  maple_spring_festival: {},
  merri: {},
  nora_souvenir_stall: {},
  terithia: { article: "the" },
  valens_clinic: {},
  vera: {},
  wheedle: {},
  zorel: {},
};

const UPGRADE_ACTIONS: Partial<Record<string, string>> = {
  general: "repairing",
};

export function extractStoresMeta(
  fiddle: ParsedGameData,
  assetsDir: string,
): { localeNames: Record<LocaleCode, Record<StoreId, string>>; stores: TrackerData["stores"] } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<StoreId, string>
  >;
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return { localeNames, stores: {} };

  const result = {} as TrackerData["stores"];

  for (const storeId of Object.keys(stores).sort()) {
    if (storeId === "default") continue;
    const store = stores[storeId];
    if (typeof store !== "object" || store === null) continue;

    const known = KNOWN_STORES[storeId];
    if (!known) {
      throw new Error(`Unknown store "${storeId}" — add it to KNOWN_STORES in stores-meta.ts`);
    }

    const name = store.name;
    if (typeof name !== "string") {
      throw new Error(`Store "${storeId}" has no name in stores.toml — check data assembly`);
    }

    const upgradeAction = UPGRADE_ACTIONS[storeId];
    result[storeId as StoreId] = {
      ...(known.article ? { article: known.article } : {}),
      ...(upgradeAction ? { upgradeAction } : {}),
    };
    const { values } = localizeField(assetsDir, {
      category: "stores",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id: storeId,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][storeId as StoreId] = values[locale];
  }

  console.log(`  Stores: ${Object.keys(result).length}`);
  return { localeNames, stores: result };
}
