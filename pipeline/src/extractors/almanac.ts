import type { ItemId, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

/**
 * The almanac tracks "own 1 of each item type".
 *
 * Items in fiddle are structured as:
 *   items -> { furniture, fish, mines, other }
 *     each -> { sub_category -> { item_id -> { name, tags, ... } } }
 *
 * We flatten this to: almanac -> { category -> { itemId -> { name } } }
 * where category combines the top-level + sub-category for clarity.
 */

// Items master registry (separate from almanac — used for lookups)
export interface ItemsRegistry {
  [id: string]: { category: string; name: string };
}

export function extractAlmanac(fiddle: FiddleData): {
  almanac: TrackerData["almanac"];
  items: ItemsRegistry;
} {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return { almanac: {} as TrackerData["almanac"], items: {} };

  const almanac = {} as Record<string, Record<ItemId, { name: string }>>;
  const items: ItemsRegistry = {};

  for (const [topCategory, subCategories] of Object.entries(itemsRoot)) {
    for (const [subCategory, categoryItems] of Object.entries(subCategories)) {
      const categoryKey = `${topCategory}/${subCategory}`;

      const categoryAlmanac = {} as Record<ItemId, { name: string }>;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;

        const itemData = item;
        const name = (itemData.name as string | undefined) ?? snakeToTitle(itemId);

        categoryAlmanac[itemId as ItemId] = { name };
        items[itemId] = { category: categoryKey, name };
      }

      if (Object.keys(categoryAlmanac).length > 0) {
        almanac[categoryKey] = categoryAlmanac;
      }
    }
  }

  const totalItems = Object.values(almanac).reduce((n, cat) => n + Object.keys(cat).length, 0);
  console.log(`  Almanac: ${Object.keys(almanac).length} categories, ${totalItems} items`);
  return { almanac, items };
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
