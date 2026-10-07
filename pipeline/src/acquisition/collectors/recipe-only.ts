import { expectStringArray } from "../../data-shapes.js";
import { forEachItem } from "../../extractor-helpers.js";
import { sourceFileFor } from "../../parse-fiddle.js";

import type { LocationId, Source } from "#lib/types/acquisition.js";
import type { PerkId, StoreId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse-fiddle.js";
import type { RecipeAcquisitionContext } from "../recipe-target.js";

/** Sources whose facts have no corresponding native item-acquisition table. */
export function collectRecipeOnlySources(
  fiddle: ParsedGameData,
  recipes: RecipeAcquisitionContext,
): void {
  const perkBySubCategory: Record<string, string> = {
    faux_plant_set: "ornamental",
    void_set: "void_crafting",
  };
  const perkByItemId: Record<string, string> = {
    big_bell: "the_bell_tolls",
    essence_stone_giant: "magic_design",
    ocarina_sprite_statue: "the_bell_tolls",
    water_sprite_statue_large_v1: "big_water_sprites",
  };
  const exceptions: Record<string, Source> = {
    engagement_ring: { type: "engagement" },
    farm_bridge: {
      type: "upgrade",
      storeId: "carpenter" as StoreId,
      upgradeId: "farm_bridge",
    },
    kitchen_salt_and_pepper_shakers: { type: "default" },
    stairs: { type: "upgrade", storeId: "carpenter" as StoreId, upgradeId: "stairs" },
    water_sprite_statue_v1: { type: "secret_chest", locationId: "beach_secret" as LocationId },
  };

  forEachItem(fiddle, (itemId, item, category, subcategory) => {
    const recipeId = recipes.recipeIdByItemId.get(itemId);
    if (!recipeId) return;

    const perkId = perkByItemId[itemId] ?? perkBySubCategory[subcategory];
    if (perkId) recipes.sources.add(recipeId, { type: "perk", perkId: perkId as PerkId });

    if (!item.recipe_is_default && itemId.startsWith("dragon_forged_")) {
      const tags =
        item.tags === undefined
          ? []
          : expectStringArray(item.tags, {
              entityId: itemId,
              fieldPath: "tags",
              sourcePath: sourceFileFor(fiddle, `items.${category}.${subcategory}.${itemId}`),
            });
      if (tags.includes("blacksmithing")) recipes.sources.add(recipeId, { type: "default" });
    }

    const exception = exceptions[itemId];
    if (exception) recipes.sources.add(recipeId, exception);
  });
}
