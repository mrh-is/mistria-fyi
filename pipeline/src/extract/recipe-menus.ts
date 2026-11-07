import { expectArray, expectRecord, expectStringArray } from "../data-shapes.js";
import { forEachItem } from "../extractor-helpers.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

const STATION_MENUS = [
  "blacksmithing",
  "cooking",
  "dragon_forging",
  "milling",
  "refining",
  "woodcrafting",
];

/** Full extraction requires the shipped station definitions. */
export function requireCraftingMenus(fiddle: ParsedGameData): void {
  for (const menu of STATION_MENUS) sourceFileFor(fiddle, `ui.crafting.${menu}`);
}

/** Mirrors the item selection in CraftingMenu.gml. Partial fiddles can omit the menu data. */
export function craftingMenuProducts(fiddle: ParsedGameData): Set<string> | undefined {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  if (ui?.crafting === undefined) return undefined;

  const products = new Set<string>();
  const tags = new Set<string>();
  const menus = expectRecord(ui.crafting, { fieldPath: "crafting", sourcePath: "ui/crafting/" });
  for (const [name, menu] of Object.entries(menus)) {
    if (name === "layout") continue;
    const sourcePath = sourceFileFor(fiddle, `ui.crafting.${name}`);
    const { categories } = expectRecord(menu, { fieldPath: name, sourcePath });
    for (const category of expectArray<Record<string, unknown>>(categories, {
      fieldPath: "categories",
      sourcePath,
    })) {
      for (const subcategory of expectArray<Record<string, unknown>>(category.sub_categories, {
        fieldPath: "categories.sub_categories",
        sourcePath,
      })) {
        for (const id of expectStringArray(subcategory.manual_order ?? [], {
          fieldPath: "manual_order",
          sourcePath,
        })) {
          products.add(id);
        }
        for (const tag of expectStringArray(subcategory.tags ?? [], {
          fieldPath: "tags",
          sourcePath,
        })) {
          tags.add(tag);
        }
      }
    }
  }

  forEachItem(fiddle, (id, item) => {
    if (!Array.isArray(item.recipe)) return;
    const itemTags = Array.isArray(item.tags) ? item.tags : [];
    // The kitchen adds separate rank and tier lists after loading its TOML menu.
    const inKitchen =
      Object.hasOwn(menus, "cooking") &&
      ([1, 2, 3, 4, 5].includes(item.stars as number) ||
        [1, 2, 3].includes(item.kitchen_tier_requirement as number));
    if (inKitchen || itemTags.some((tag) => tags.has(tag as string))) products.add(id);
  });

  return products;
}
