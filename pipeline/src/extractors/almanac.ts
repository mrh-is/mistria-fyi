import type { AlmanacCategory, ItemId, TrackerData } from "$lib/types/tracker-data.js";

import type { FiddleData } from "../parse-fiddle.js";

/**
 * The almanac tracks "own 1 of each item type".
 *
 * Categories and item membership are defined by the in-game UI data at
 * `$.ui.menus.sub_menus.almanac.categories`. Each category specifies tag(s)
 * that items must match to appear in that section.
 *
 * Items are found across `$.items.*` (furniture, fish, mines, other).
 *
 * Furniture colorway collapsing: items sharing the same `recipe_key` are
 * colorways of the same base piece. We keep only the first per group and use
 * the recipe_key as the display name.
 */

// Items master registry (separate from almanac — used for lookups)
export type ItemsRegistry = Record<string, { category: string; name: string }>;

interface RawAlmanacCategory {
  key: string;
  local_key?: string;
  tags: string[];
}

export function extractAlmanac(fiddle: FiddleData): {
  almanac: TrackerData["almanac"];
  items: ItemsRegistry;
} {
  const itemsRoot = fiddle.items as
    | Record<string, Record<string, Record<string, Record<string, unknown>>>>
    | undefined;
  if (!itemsRoot) return { almanac: [], items: {} };

  // Read almanac category definitions from UI data
  const rawCategories = readAlmanacCategories(fiddle);
  if (rawCategories.length === 0) {
    console.warn("  Warning: No almanac categories found in UI data, falling back to empty");
    return { almanac: [], items: {} };
  }

  // Build set of treasure box IDs from the fish data (to exclude from almanac)
  const chestIds = buildChestIdSet(fiddle);

  // Track items skipped for lacking a name
  const namelessItems: string[] = [];

  // Collect ALL items across all top-level/sub-categories into a flat list
  const allItems: {
    id: string;
    name: string;
    recipeKey?: string;
    tags: string[];
    topCategory: string;
  }[] = [];

  for (const [topCategory, subCategories] of Object.entries(itemsRoot)) {
    for (const [subCategory, categoryItems] of Object.entries(subCategories)) {
      if (topCategory === "other" && subCategory === "unreviewed_new_items") continue;

      for (const [itemId, item] of Object.entries(categoryItems)) {
        if (itemId === "default") continue;
        if (typeof item !== "object" || item === null) continue;
        if (chestIds.has(itemId)) continue;

        const rawName = item.name as string | undefined;
        if (!rawName) {
          namelessItems.push(`${topCategory}/${subCategory}/${itemId}`);
          continue;
        }

        const tags = toStringArray(item.tags);
        const recipeKey = item.recipe_key as string | undefined;

        allItems.push({
          id: itemId,
          name: rawName,
          recipeKey,
          tags,
          topCategory,
        });
      }
    }
  }

  // Build a tag→category index for fast lookup
  const tagToCategoryIdx = new Map<string, number>();
  for (let i = 0; i < rawCategories.length; i++) {
    for (const tag of rawCategories[i].tags) {
      tagToCategoryIdx.set(tag, i);
    }
  }

  // Assign items to almanac categories by tag matching
  const categoryBuckets: Map<string, { id: string; name: string; recipeKey?: string }>[] =
    rawCategories.map(() => new Map());

  const items: ItemsRegistry = {};

  for (const item of allItems) {
    // Find the first matching almanac tag
    let assignedIdx: number | undefined;
    for (const tag of item.tags) {
      const idx = tagToCategoryIdx.get(tag);
      if (idx !== undefined) {
        assignedIdx = idx;
        break;
      }
    }

    // Always register in items registry (for search, sources, etc.)
    const categoryKey =
      assignedIdx !== undefined ? rawCategories[assignedIdx].key : item.topCategory;
    items[item.id] = { category: categoryKey, name: item.name };

    // Only add to almanac if it matches an almanac tag
    if (assignedIdx !== undefined) {
      categoryBuckets[assignedIdx].set(item.id, {
        id: item.id,
        name: item.name,
        recipeKey: item.recipeKey,
      });
    }
  }

  // Build the ordered almanac array
  const almanac: AlmanacCategory[] = [];

  for (let i = 0; i < rawCategories.length; i++) {
    const cat = rawCategories[i];
    const bucket = categoryBuckets[i];
    if (bucket.size === 0) continue;

    // Collapse furniture colorways: group by recipe_key, keep first per group
    const collapsed = collapseFurnitureColorways(bucket);

    // Build the items record, sorted by name
    const sortedEntries = [...collapsed.entries()].sort(([, a], [, b]) =>
      a.name.localeCompare(b.name),
    );

    const categoryItems: Record<ItemId, { name: string }> = {};
    for (const [id, entry] of sortedEntries) {
      categoryItems[id as ItemId] = { name: entry.name };
    }

    const displayName = cat.local_key ?? snakeToTitle(cat.key);

    almanac.push({
      id: cat.key,
      items: categoryItems,
      name: displayName,
    });
  }

  const totalItems = almanac.reduce((n, cat) => n + Object.keys(cat.items).length, 0);
  console.log(`  Almanac: ${almanac.length} categories, ${totalItems} items`);
  if (namelessItems.length > 0) {
    console.log(`  Nameless items skipped (${namelessItems.length}):`);
    for (const path of namelessItems) {
      console.log(`    - ${path}`);
    }
  }
  return { almanac, items };
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
 * Collapse furniture colorways: items sharing the same recipe_key are
 * color variants of the same base piece. Keep only the first item per
 * recipe_key group, and use the recipe_key as the display name.
 */
function collapseFurnitureColorways(
  bucket: Map<string, { id: string; name: string; recipeKey?: string }>,
): Map<string, { name: string }> {
  const result = new Map<string, { name: string }>();
  const seenRecipeKeys = new Set<string>();

  for (const [id, entry] of bucket) {
    if (entry.recipeKey) {
      if (seenRecipeKeys.has(entry.recipeKey)) continue; // skip duplicate colorway
      seenRecipeKeys.add(entry.recipeKey);
      result.set(id, { name: snakeToTitle(entry.recipeKey) });
    } else {
      result.set(id, { name: entry.name });
    }
  }

  return result;
}

/**
 * Read almanac category definitions from the UI data.
 * Returns categories in display order (array index order).
 */
function readAlmanacCategories(fiddle: FiddleData): RawAlmanacCategory[] {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const subMenus = menus?.sub_menus as Record<string, unknown> | undefined;
  const almanac = subMenus?.almanac as Record<string, unknown> | undefined;
  const categories = almanac?.categories as Record<string, Record<string, unknown>> | undefined;
  if (!categories) return [];

  // Categories are stored as numbered keys (0, 1, 2, ...) — sort by number
  const sorted = Object.entries(categories)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, cat]) => ({
      key: cat.key as string,
      local_key: cat.local_key as string | undefined,
      tags: toStringArray(cat.tags),
    }));

  return sorted;
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
