import type { StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

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
): Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return {};

  const result = {} as Record<StoreId, { article?: "the"; name: string; upgradeAction?: string }>;

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
      name,
      ...(upgradeAction ? { upgradeAction } : {}),
    };
  }

  console.log(`  Stores: ${Object.keys(result).length}`);
  return result;
}
