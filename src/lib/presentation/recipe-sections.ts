import { trackerData } from "#lib/data/index.js";
import { recipeForItem, recipePlacements } from "#lib/engine/projections/recipes.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type { AlmanacCategoryId, ItemId, RecipeId } from "#lib/types/tracker-data.js";

interface RecipeSection {
  categoryId?: AlmanacCategoryId;
  recipes: { itemId?: ItemId; recipeId: RecipeId }[];
}

export function recipeSections(): RecipeSection[] {
  // A shared recipe counts in each section that shows it. The page total counts it once.
  const sections: RecipeSection[] = recipePlacements();
  const placed = new Set(
    sections.flatMap(({ recipes }) => recipes.map(({ recipeId }) => recipeId)),
  );
  const otherIds = recordKeys(trackerData.recipes).filter((id) => !placed.has(id));
  if (otherIds.length === 0) return sections;

  const products = new Map<RecipeId, ItemId>();
  for (const [itemId, item] of recordEntries(trackerData.items)) {
    const recipeId = recipeForItem(item);
    if (recipeId && !products.has(recipeId)) products.set(recipeId, itemId);
  }

  const recipes = otherIds.map((recipeId) => ({ itemId: products.get(recipeId), recipeId }));
  return [...sections, { recipes }];
}
