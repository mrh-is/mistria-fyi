import type { StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

const KNOWN_STORES: Record<string, { article?: "the"; name: string }> = {
  balor: { name: "Balor's Wagon" },
  blacksmith: { article: "the", name: "Blacksmith's Shop" },
  carpenter: { article: "the", name: "Carpenter's Shop" },
  darcy: { name: "Darcy's Stall" },
  elsie_spring_festival: { name: "Clothing Stall" },
  general: { article: "the", name: "General Store" },
  hayden: { name: "Hayden's Shop" },
  inn: { article: "the", name: "Sleeping Dragon Inn" },
  louis: { name: "Louis' Stall" },
  maple_spring_festival: { name: "Food Stall" },
  merri: { name: "Merri's Stall" },
  nora_souvenir_stall: { name: "Souvenir Stall" },
  terithia: { article: "the", name: "Tackle Shop" },
  valens_clinic: { name: "Valen's Clinic" },
  vera: { name: "Vera's Stall" },
  wheedle: { name: "Wheedle's Stall" },
  zorel: { name: "Zorel's Stall" },
};

export function extractStoresMeta(
  fiddle: ParsedGameData,
): Record<StoreId, { article?: "the"; name: string }> {
  const stores = fiddle.stores as Record<string, Record<string, unknown>> | undefined;
  if (!stores) return {};

  const result = {} as Record<StoreId, { article?: "the"; name: string }>;

  for (const storeId of Object.keys(stores).sort()) {
    if (storeId === "default") continue;
    const store = stores[storeId];
    if (typeof store !== "object" || store === null) continue;

    const known = KNOWN_STORES[storeId];
    if (!known) {
      throw new Error(`Unknown store "${storeId}" — add it to KNOWN_STORES in stores-meta.ts`);
    }

    result[storeId as StoreId] = known;
  }

  console.log(`  Stores: ${Object.keys(result).length}`);
  return result;
}
