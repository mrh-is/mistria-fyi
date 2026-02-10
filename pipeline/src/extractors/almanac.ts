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
 *
 * Special handling: "other/crops_and_forage" is split into:
 *   - other/crops (tags include "crop")
 *   - other/forageables (tags include "forageable")
 *   - other/seeds (tags include "seed" — seeds, saplings)
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

  // Build set of treasure box IDs from the fish data (to exclude from almanac)
  const chestIds = buildChestIdSet(fiddle);

  const almanac = {} as Record<string, Record<ItemId, { name: string }>>;
  const items: ItemsRegistry = {};

  for (const [topCategory, subCategories] of Object.entries(itemsRoot)) {
    for (const [subCategory, categoryItems] of Object.entries(subCategories)) {
      if (topCategory === "other" && subCategory === "crops_and_forage") {
        // Split crops_and_forage into subcategories by tags
        splitCropsAndForage(categoryItems, almanac, items);
        continue;
      }

      const categoryKey = `${topCategory}/${subCategory}`;

      const categoryAlmanac = {} as Record<ItemId, { name: string }>;
      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;
        if (chestIds.has(itemId)) continue; // Skip treasure boxes

        const itemData = item;
        const name = (itemData.name as string | undefined) ?? snakeToTitle(itemId);

        categoryAlmanac[itemId as ItemId] = { name };
        items[itemId] = { category: categoryKey, name };
      }

      // Deduplicate items with identical names within a category
      deduplicateNames(categoryAlmanac);

      if (Object.keys(categoryAlmanac).length > 0) {
        almanac[categoryKey] = categoryAlmanac;
      }
    }
  }

  const totalItems = Object.values(almanac).reduce((n, cat) => n + Object.keys(cat).length, 0);
  console.log(`  Almanac: ${Object.keys(almanac).length} categories, ${totalItems} items`);
  return { almanac, items };
}

/**
 * Split items/other/crops_and_forage into separate almanac categories
 * based on item tags.
 */
function splitCropsAndForage(
  categoryItems: Record<string, Record<string, unknown>>,
  almanac: Record<string, Record<ItemId, { name: string }>>,
  items: ItemsRegistry,
): void {
  const crops = {} as Record<ItemId, { name: string }>;
  const forageables = {} as Record<ItemId, { name: string }>;
  const seeds = {} as Record<ItemId, { name: string }>;

  for (const [itemId, item] of Object.entries(categoryItems)) {
    if (itemId === "default") continue;
    if (typeof item !== "object" || item === null) continue;

    const name = (item.name as string | undefined) ?? snakeToTitle(itemId);
    const tags = toStringArray(item.tags);

    let categoryKey: string;
    if (tags.includes("seed")) {
      categoryKey = "other/seeds";
      seeds[itemId as ItemId] = { name };
    } else if (tags.includes("forageable")) {
      categoryKey = "other/forageables";
      forageables[itemId as ItemId] = { name };
    } else if (tags.includes("crop")) {
      categoryKey = "other/crops";
      crops[itemId as ItemId] = { name };
    } else {
      // Fallback: items with unrecognized tags (e.g., material) → forageables
      categoryKey = "other/forageables";
      forageables[itemId as ItemId] = { name };
    }

    items[itemId] = { category: categoryKey, name };
  }

  if (Object.keys(crops).length > 0) almanac["other/crops"] = crops;
  if (Object.keys(forageables).length > 0) almanac["other/forageables"] = forageables;
  if (Object.keys(seeds).length > 0) almanac["other/seeds"] = seeds;

  console.log(
    `  Crops/Forage split: ${Object.keys(crops).length} crops, ` +
      `${Object.keys(forageables).length} forageables, ${Object.keys(seeds).length} seeds`,
  );
}

/**
 * Build a set of item IDs that are treasure chests (from the fish data).
 * These should be excluded from the almanac — they're loot containers, not collectibles.
 */
function buildChestIdSet(fiddle: FiddleData): Set<string> {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return new Set();

  const ids = new Set<string>();
  for (const [, data] of Object.entries(fish)) {
    if (data.is_chest) {
      const itemId = (data.item as string | undefined) ?? "";
      if (itemId) ids.add(itemId);
    }
  }
  return ids;
}

/**
 * When multiple items in a category share the same display name (e.g., 15 "Basic Wood Chest"
 * color variants), append the variant suffix to disambiguate.
 */
function deduplicateNames(category: Record<ItemId, { name: string }>): void {
  // Group IDs by name
  const byName = new Map<string, ItemId[]>();
  for (const [id, entry] of Object.entries(category)) {
    const ids = byName.get(entry.name) ?? [];
    ids.push(id as ItemId);
    byName.set(entry.name, ids);
  }

  // Only fix names that appear more than once
  for (const [name, ids] of byName) {
    if (ids.length <= 1) continue;

    // Find the common prefix among all IDs to strip it
    const prefix = longestCommonPrefix(ids);
    for (const id of ids) {
      const suffix = id.slice(prefix.length).replace(/^_/, "");
      if (suffix) {
        category[id] = { name: `${name} (${snakeToTitle(suffix)})` };
      }
    }
  }
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Extract string array from tags field (handles arrays and numbered-key objects). */
function toStringArray(data: unknown): string[] {
  if (Array.isArray(data)) return data.filter((v): v is string => typeof v === "string");
  if (data && typeof data === "object") {
    return Object.values(data as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string",
    );
  }
  return [];
}
