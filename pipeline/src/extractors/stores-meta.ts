import { LOCALE_CODES } from "#lib/types/locale.js";

import { compareStrings } from "../ordering.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { StoreId, StoreUpgradeAction, TrackerData } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

/**
 * Every store the pipeline has reviewed. A new store throws so its English grammar
 * (`STORES_WITH_ARTICLE` in `src/lib/utils/en-grammar.ts`) and upgrade action get a look.
 */
const KNOWN_STORES: ReadonlySet<string> = new Set([
  "balor",
  "blacksmith",
  "carpenter",
  "darcy",
  "elsie_spring_festival",
  "general",
  "hayden",
  "inn",
  "louis",
  "maple_spring_festival",
  "merri",
  "nora_souvenir_stall",
  "terithia",
  "valens_clinic",
  "vera",
  "wheedle",
  "zorel",
]);

const UPGRADE_ACTIONS: Partial<Record<string, StoreUpgradeAction>> = {
  general: "repair",
};

export function extractStoresMeta(
  fiddle: ParsedGameData,
  localizer: Localizer,
): { localeNames: Record<LocaleCode, Record<StoreId, string>>; stores: TrackerData["stores"] } {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<StoreId, string>
  >;
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return { localeNames, stores: {} };

  const result = {} as TrackerData["stores"];

  for (const storeId of Object.keys(stores).toSorted(compareStrings)) {
    if (storeId === "default") continue;
    const store = stores[storeId];
    if (typeof store !== "object" || store === null) continue;

    if (!KNOWN_STORES.has(storeId)) {
      throw new Error(`Unknown store "${storeId}" — add it to KNOWN_STORES in stores-meta.ts`);
    }

    const name = store.name;
    if (typeof name !== "string") {
      throw new TypeError(`Store "${storeId}" has no name in stores.toml — check data assembly`);
    }

    const upgradeAction = UPGRADE_ACTIONS[storeId];
    result[storeId as StoreId] = upgradeAction ? { upgradeAction } : {};
    const { values } = localizer.localizeField({
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
