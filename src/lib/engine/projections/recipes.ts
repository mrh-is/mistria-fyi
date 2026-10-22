import { trackerData } from "#lib/data/index.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { AlmanacCategoryId, Item, ItemId, RecipeId } from "#lib/types/tracker-data.js";

export interface RecipeRow extends ChecklistRow {
  id: RecipeId;
}

export interface RecipesProjection extends CategoryProjection {
  rows: RecipeRow[];
}

/** Every recipe is one step, in scope until learned. Recipes gate on their own visibility. */
export function projectRecipes(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): RecipesProjection {
  const rows = recordEntries(trackerData.recipes).map(([id, recipe]): RecipeRow => ({
    completed: ctx.progress.almanacRecipes.has(id),
    id,
    inScope: true,
    spoilered: isSpoilered(recipe.visibility, options.progressionState),
  }));
  return { rows, totals: countChecklist(rows) };
}

/** The recipe that makes `item`, if any. */
export function recipeForItem(item: Item): RecipeId | undefined {
  return item.sources.find((source) => source.type === "recipe")?.recipeId;
}

export interface RecipePlacement {
  /** The canonical item of the first almanac entry in this category that the recipe makes. */
  itemId: ItemId;
  recipeId: RecipeId;
}

/**
 * How the Recipes page lays recipes out: for each almanac category, in almanac order, each recipe
 * made by one of its entries, once, pictured with the first such entry's canonical item. A recipe
 * can appear under more than one category; a recipe no almanac entry makes appears under none.
 */
export function recipePlacements(): {
  categoryId: AlmanacCategoryId;
  recipes: RecipePlacement[];
}[] {
  return recordEntries(trackerData.almanac).flatMap(([categoryId, category]) => {
    const seen = new Set<RecipeId>();
    const recipes: RecipePlacement[] = [];
    for (const entry of category.items) {
      const itemId = entry.itemIds[0];
      const recipeId = recipeForItem(trackerData.items[itemId]);
      if (!recipeId || seen.has(recipeId)) continue;
      seen.add(recipeId);
      recipes.push({ itemId, recipeId });
    }
    return recipes.length > 0 ? [{ categoryId, recipes }] : [];
  });
}
