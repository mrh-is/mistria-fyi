import { LOCALE_CODES } from "$lib/types/locale.js";

import { expectArray, expectStringArray } from "../data-shapes.js";
import { forEachItem } from "../extractor-helpers.js";
import { localizeField } from "../localize.js";
import { type ParsedGameData, sourceFileFor } from "../parse-fiddle.js";

import type { LocaleCode } from "$lib/types/locale.js";
import type {
  AlmanacCategory,
  AlmanacCategoryId,
  AlmanacEntry,
  ItemId,
  RecipeId,
  TrackerData,
} from "$lib/types/tracker-data.js";

export interface ItemLocalizationReport {
  fallbackItemIds: Record<LocaleCode, ItemId[]>;
  nonLocalizableItems: string[];
}

/**
 * Extracts both named item metadata and visible almanac rows. The metadata index includes every
 * accepted named item, while the almanac contains only items assigned to a UI-defined category.
 */
export type ItemMetadataIndex = Record<string, { category: string; iconSprite: string }>;

export interface RawAlmanacCategory {
  key: string;
  tags: string[];
}

export function extractAlmanac(
  fiddle: ParsedGameData,
  assetsDir: string,
): {
  almanac: TrackerData["almanac"];
  items: ItemMetadataIndex;
  localeNames: Record<LocaleCode, Record<ItemId, string>>;
  localizationReport: ItemLocalizationReport;
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<ItemId, string>
  >;
  const fallbackItemIds = Object.fromEntries(
    LOCALE_CODES.map((locale) => [locale, [] as ItemId[]]),
  ) as unknown as Record<LocaleCode, ItemId[]>;
  const emptyResult = {
    almanac: {},
    items: {},
    localeNames,
    localizationReport: { fallbackItemIds, nonLocalizableItems: [] },
  };
  if (!fiddle.items) return emptyResult;

  const rawCategories = readAlmanacCategories(fiddle);
  if (rawCategories.length === 0) {
    console.warn("  Warning: No almanac categories found in UI data, falling back to empty");
    return emptyResult;
  }

  const chestIds = buildChestIdSet(fiddle);
  const namelessItems: string[] = [];

  const allItems: {
    iconSprite: string;
    id: string;
    name: string;
    recipeKey?: string;
    subCategory: string;
    tags: string[];
    topCategory: string;
  }[] = [];

  forEachItem(fiddle, (itemId, item, topCategory, subCategory) => {
    if (topCategory === "other" && subCategory === "unreviewed_new_items") return;
    if (chestIds.has(itemId)) return;

    const rawName = item.name as string | undefined;
    if (!rawName) {
      namelessItems.push(`${topCategory}/${subCategory}/${itemId} (missing name)`);
      return;
    }

    if (rawName.includes("/") && !rawName.startsWith("spr_")) {
      namelessItems.push(`${topCategory}/${subCategory}/${itemId} (localization path: ${rawName})`);
      return;
    }

    const iconSprite = item.icon_sprite as string | undefined;
    if (!iconSprite) {
      throw new Error(`Missing icon_sprite for item "${itemId}" in ${topCategory}/${subCategory}`);
    }

    const tags = Array.isArray(item.tags)
      ? (item.tags as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
    const recipeKey = item.recipe_key as string | undefined;

    allItems.push({
      iconSprite,
      id: itemId,
      name: rawName,
      recipeKey,
      subCategory,
      tags,
      topCategory,
    });
  });

  const tagToCategoryIndices = new Map<string, number[]>();
  for (let i = 0; i < rawCategories.length; i++) {
    for (const tag of rawCategories[i].tags) {
      const indices = tagToCategoryIndices.get(tag) ?? [];
      indices.push(i);
      tagToCategoryIndices.set(tag, indices);
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
    const matchedCategoryIndices = new Set<number>();
    for (const tag of item.tags) {
      const indices = tagToCategoryIndices.get(tag) ?? [];
      for (const idx of indices) {
        matchedCategoryIndices.add(idx);
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
    }

    const categoryKey =
      assignedIdx !== undefined ? rawCategories[assignedIdx].key : item.topCategory;
    const itemId = item.id as ItemId;
    items[item.id] = { category: categoryKey, iconSprite: item.iconSprite };
    const { fallbackLocales, values } = localizeField(assetsDir, {
      category: `items/${item.topCategory}/${item.subCategory}`,
      classification: "localizable",
      englishValue: item.name,
      field: "name",
      id: item.id,
      logMissing: false,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][itemId] = values[locale];
    for (const locale of fallbackLocales) fallbackItemIds[locale].push(itemId);

    for (const categoryIdx of matchedCategoryIndices) {
      categoryBuckets[categoryIdx].set(item.id, {
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

    const entries = collapseColorways(bucket);

    entries.sort((a, b) => a.sortName.localeCompare(b.sortName));

    almanac[cat.key as AlmanacCategoryId] = {
      items: entries.map(({ itemIds, recipeId }) => ({
        itemIds,
        ...(recipeId ? { recipeId } : {}),
      })),
    };
  }

  const totalEntries = Object.values(almanac).reduce((n, cat) => n + cat.items.length, 0);
  const totalColorways = Object.values(almanac).reduce(
    (n, cat) => n + cat.items.reduce((m, entry) => m + entry.itemIds.length, 0),
    0,
  );
  console.log(
    `  Almanac: ${Object.keys(almanac).length} categories, ${totalEntries} entries (${totalColorways} item IDs)`,
  );
  namelessItems.sort((a, b) => a.localeCompare(b));
  for (const locale of LOCALE_CODES) {
    fallbackItemIds[locale].sort((a, b) => a.localeCompare(b));
  }
  if (namelessItems.length > 0) {
    console.log(`  Nameless items skipped (${namelessItems.length}):`);
    for (const path of namelessItems) {
      console.log(`    - ${path}`);
    }
  }
  const fallbackSummary = LOCALE_CODES.map(
    (locale) => `${locale}: ${fallbackItemIds[locale].length.toString()}`,
  ).join(", ");
  console.log(`  Item localization fallbacks: ${fallbackSummary}`);
  return {
    almanac,
    items,
    localeNames,
    localizationReport: { fallbackItemIds, nonLocalizableItems: namelessItems },
  };
}

/**
 * The almanac's UI-defined categories, in game order. Their player-facing labels are game UI
 * strings keyed `misc_local/<key>`, localized by {@link extractUiStrings}, not stored here.
 */
export function readAlmanacCategories(fiddle: ParsedGameData): RawAlmanacCategory[] {
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

/**
 * Collapses colorway variants into single almanac entries. Items sharing the same
 * `recipe_key + name` are grouped. The canonical ID is the alphabetically-first
 * item ID, matching the game's own almanac icon selection.
 *
 * Grouping stays anchored to the English source name so locale-specific translations never change
 * structural IDs or completion behavior.
 */
function collapseColorways(
  bucket: Map<string, { id: string; name: string; recipeKey?: string }>,
): (AlmanacEntry & { sortName: string })[] {
  const result: (AlmanacEntry & { sortName: string })[] = [];
  const seenRecipeGroups = new Map<string, number>();

  for (const [id, entry] of bucket) {
    if (entry.recipeKey) {
      const groupKey = `${entry.recipeKey}::${entry.name}`;
      const existingIdx = seenRecipeGroups.get(groupKey);
      if (existingIdx !== undefined) {
        const existing = result[existingIdx];
        existing.itemIds.push(id as ItemId);
        continue;
      }
      seenRecipeGroups.set(groupKey, result.length);
      result.push({
        itemIds: [id as ItemId],
        recipeId: entry.recipeKey as RecipeId,
        sortName: entry.name,
      });
    } else {
      result.push({
        itemIds: [id as ItemId],
        sortName: entry.name,
      });
    }
  }

  // Sort member IDs alphabetically; canonical ID = first element
  for (const entry of result) {
    entry.itemIds.sort((a, b) => a.localeCompare(b));
  }

  return result;
}
