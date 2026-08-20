import { expectArray, expectStringArray } from "../data-shapes.js";
import { forEachItem } from "../extractor-helpers.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type {
  AlmanacCategory,
  AlmanacCategoryId,
  ItemId,
  TrackerData,
} from "$lib/types/tracker-data.js";

/**
 * Extracts both named item metadata and visible almanac rows. The metadata index includes every
 * accepted named item, while the almanac contains only items assigned to a UI-defined category.
 */
export type ItemMetadataIndex = Record<string, { category: string; name: string }>;

interface RawAlmanacCategory {
  key: string;
  tags: string[];
}

const CATEGORY_NAME_OVERRIDES: Record<string, string> = {
  fish: "Fishing and Diving",
};

export function extractAlmanac(fiddle: ParsedGameData): {
  almanac: TrackerData["almanac"];
  items: ItemMetadataIndex;
} {
  if (!fiddle.items) return { almanac: {}, items: {} };

  const rawCategories = readAlmanacCategories(fiddle);
  if (rawCategories.length === 0) {
    console.warn("  Warning: No almanac categories found in UI data, falling back to empty");
    return { almanac: {}, items: {} };
  }

  const chestIds = buildChestIdSet(fiddle);
  const namelessItems: string[] = [];

  const allItems: {
    id: string;
    name: string;
    recipeKey?: string;
    tags: string[];
    topCategory: string;
  }[] = [];

  forEachItem(fiddle, (itemId, item, topCategory, subCategory) => {
    if (topCategory === "other" && subCategory === "unreviewed_new_items") return;
    if (chestIds.has(itemId)) return;

    const rawName = item.name as string | undefined;
    if (!rawName) {
      namelessItems.push(`${topCategory}/${subCategory}/${itemId}`);
      return;
    }

    if (rawName.includes("/") && !rawName.startsWith("spr_")) {
      namelessItems.push(`${topCategory}/${subCategory}/${itemId} (localization path: ${rawName})`);
      return;
    }

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const recipeKey = item.recipe_key as string | undefined;

    allItems.push({
      id: itemId,
      name: rawName,
      recipeKey,
      tags,
      topCategory,
    });
  });

  const tagToCategoryIdx = new Map<string, number>();
  for (let i = 0; i < rawCategories.length; i++) {
    for (const tag of rawCategories[i].tags) {
      if (!tagToCategoryIdx.has(tag)) {
        tagToCategoryIdx.set(tag, i);
      }
    }
  }

  const categoryBuckets: Map<string, { id: string; name: string; recipeKey?: string }>[] =
    rawCategories.map(() => new Map());

  const items: ItemMetadataIndex = {};

  const ACQUISITION_TAGS = new Set(["dive", "fishable"]);

  for (const item of allItems) {
    let assignedIdx: number | undefined;
    let bestCategoryOrder = Infinity;
    let bestIsAcquisition = true;
    for (const tag of item.tags) {
      const idx = tagToCategoryIdx.get(tag);
      if (idx === undefined) continue;
      const isAcq = ACQUISITION_TAGS.has(tag);
      if (
        (!isAcq && bestIsAcquisition) ||
        (isAcq === bestIsAcquisition && idx < bestCategoryOrder)
      ) {
        bestCategoryOrder = idx;
        assignedIdx = idx;
        bestIsAcquisition = isAcq;
      }
    }

    const categoryKey =
      assignedIdx !== undefined ? rawCategories[assignedIdx].key : item.topCategory;
    items[item.id] = { category: categoryKey, name: item.name };

    if (assignedIdx !== undefined) {
      categoryBuckets[assignedIdx].set(item.id, {
        id: item.id,
        name: item.name,
        recipeKey: item.recipeKey,
      });
    }
  }

  const almanac: Record<AlmanacCategoryId, AlmanacCategory> = {};

  for (let i = 0; i < rawCategories.length; i++) {
    const cat = rawCategories[i];
    const bucket = categoryBuckets[i];
    if (bucket.size === 0) continue;

    const collapsed = collapseFurnitureColorways(bucket);

    const sortedIds = [...collapsed.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([id]) => id as ItemId);

    const displayName = CATEGORY_NAME_OVERRIDES[cat.key] ?? snakeToTitle(cat.key);

    almanac[cat.key as AlmanacCategoryId] = {
      items: sortedIds,
      name: displayName,
    };
  }

  const totalItems = Object.values(almanac).reduce((n, cat) => n + cat.items.length, 0);
  console.log(`  Almanac: ${Object.keys(almanac).length} categories, ${totalItems} items`);
  if (namelessItems.length > 0) {
    console.log(`  Nameless items skipped (${namelessItems.length}):`);
    for (const path of namelessItems) {
      console.log(`    - ${path}`);
    }
  }
  return { almanac, items };
}

function buildChestIdSet(fiddle: ParsedGameData): Set<string> {
  const fish = fiddle.fish as Record<string, Record<string, unknown>> | undefined;
  if (!fish) return new Set();

  const ids = new Set<string>();
  for (const [fishId, data] of Object.entries(fish)) {
    if (fishId === "default") continue;
    if (data.is_chest === true) {
      const itemId = (data.item as string | undefined) ?? "";
      if (itemId) ids.add(itemId);
    }
  }
  return ids;
}

function collapseFurnitureColorways(
  bucket: Map<string, { id: string; name: string; recipeKey?: string }>,
): Map<string, { name: string }> {
  const result = new Map<string, { name: string }>();
  const seenRecipeGroups = new Map<string, { count: number; representativeId: string }>();

  for (const [id, entry] of bucket) {
    if (entry.recipeKey) {
      const groupKey = `${entry.recipeKey}::${entry.name}`;
      const existing = seenRecipeGroups.get(groupKey);
      if (existing) {
        existing.count++;
        continue;
      }
      seenRecipeGroups.set(groupKey, { count: 1, representativeId: id });
      result.set(id, { name: entry.name });
    } else {
      result.set(id, { name: entry.name });
    }
  }

  return result;
}

function readAlmanacCategories(fiddle: ParsedGameData): RawAlmanacCategory[] {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const menus = ui?.menus as Record<string, unknown> | undefined;
  const subMenus = menus?.sub_menus as Record<string, unknown> | undefined;
  const almanac = subMenus?.almanac as Record<string, unknown> | undefined;
  if (!almanac?.categories) return [];

  const sourceFile = sourceFileFor(fiddle, "ui.menus.sub_menus.almanac.categories");
  const arr = expectArray<Record<string, unknown>>(almanac.categories, {
    fieldPath: "almanac.categories",
    sourcePath: sourceFile,
  });

  return arr.map((cat: Record<string, unknown>) => ({
    key: cat.key as string,
    tags: expectStringArray(cat.tags, {
      entityId: cat.key as string,
      fieldPath: "tags",
      sourcePath: sourceFile,
    }),
  }));
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
