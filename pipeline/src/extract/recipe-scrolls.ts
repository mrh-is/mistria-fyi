import { expectNonEmptyString, expectStringArray } from "../data-shapes.js";
import { forEachItem } from "../extractor-helpers.js";
import { compareStrings } from "../ordering.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";

import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";

/** Fixed LearnRecipe scrolls unlock every recipe whose product carries their native set tag. */
export function extractRecipeScrollUnlocks(
  fiddle: ParsedGameData,
  recipeIdByItemId: ReadonlyMap<string, RecipeId>,
): Partial<Record<ItemId, RecipeId[]>> {
  const recipesByTag = new Map<string, Set<RecipeId>>();
  forEachItem(fiddle, (itemId, item, category, subcategory) => {
    const recipeId = recipeIdByItemId.get(itemId);
    if (!recipeId || item.tags === undefined) return;
    const tags = expectStringArray(item.tags, {
      entityId: itemId,
      fieldPath: "tags",
      sourcePath: sourceFileFor(fiddle, `items.${category}.${subcategory}.${itemId}`),
    });
    for (const tag of tags) {
      const recipes = recipesByTag.get(tag) ?? new Set<RecipeId>();
      recipes.add(recipeId);
      recipesByTag.set(tag, recipes);
    }
  });

  const unlocks: Partial<Record<ItemId, RecipeId[]>> = {};
  forEachItem(fiddle, (itemId, item, category, subcategory) => {
    if (item.set_unlock === undefined) return;
    const sourcePath = sourceFileFor(fiddle, `items.${category}.${subcategory}.${itemId}`);
    const tag = expectNonEmptyString(item.set_unlock, {
      entityId: itemId,
      fieldPath: "set_unlock",
      sourcePath,
    });
    const recipes = recipesByTag.get(tag);
    if (!recipes?.size) {
      throw new Error(
        `Recipe scroll "${itemId}" set_unlock "${tag}" has no matching recipe in ${sourcePath}`,
      );
    }
    unlocks[itemId as ItemId] = [...recipes].toSorted(compareStrings);
  });
  return unlocks;
}
