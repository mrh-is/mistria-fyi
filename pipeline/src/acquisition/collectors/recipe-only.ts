import { expectStringArray } from "../../data-shapes.js";
import { forEachItem } from "../../extractor-helpers.js";
import {
  EXCEPTIONS,
  isDragonForgedItem,
  PERK_BY_ITEM_ID,
  PERK_BY_SUBCATEGORY,
} from "../../overrides/game-facts.js";
import { sourceFileFor } from "../../parse/parse-fiddle.js";
import { canonicalSourceJson } from "../source-accumulator.js";

import type { Source } from "#lib/types/acquisition.js";
import type { PerkId, RecipeId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../../parse/parse-fiddle.js";
import type { RecipeAcquisitionContext } from "../recipe-target.js";

/** Sources whose facts have no corresponding native item-acquisition table. */
export function collectRecipeOnlySources(
  fiddle: ParsedGameData,
  recipes: RecipeAcquisitionContext,
): void {
  const nativeSources = new Map(
    [...recipes.recipeIdByItemId.values()].map((id) => [
      id,
      recipes.sources.get(id).map((source) => canonicalSourceJson(source)),
    ]),
  );
  const addReviewed = (recipeId: RecipeId, source: Source): void => {
    if (nativeSources.get(recipeId)?.includes(canonicalSourceJson(source))) {
      throw new Error(
        `Obsolete reviewed recipe source for ${recipeId}: native data now encodes ${canonicalSourceJson(source)}`,
      );
    }
    recipes.sources.add(recipeId, source);
  };
  forEachItem(fiddle, (itemId, item, category, subcategory) => {
    const recipeId = recipes.recipeIdByItemId.get(itemId);
    if (!recipeId) return;

    const perkId = PERK_BY_ITEM_ID[itemId] ?? PERK_BY_SUBCATEGORY[subcategory];
    if (perkId) addReviewed(recipeId, { type: "perk", perkId: perkId as PerkId });

    if (!item.recipe_is_default && isDragonForgedItem(itemId)) {
      const tags =
        item.tags === undefined
          ? []
          : expectStringArray(item.tags, {
              entityId: itemId,
              fieldPath: "tags",
              sourcePath: sourceFileFor(fiddle, `items.${category}.${subcategory}.${itemId}`),
            });
      if (tags.includes("blacksmithing")) addReviewed(recipeId, { type: "default" });
    }

    const exception = EXCEPTIONS[itemId];
    if (exception) addReviewed(recipeId, exception);
  });
}
