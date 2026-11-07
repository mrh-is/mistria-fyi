import { trackerData } from "#lib/data/index.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
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

/** Every recipe is one step. Recipes gate on their own visibility. */
export function projectRecipes(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): RecipesProjection {
  const rows = recordEntries(trackerData.recipes).map(([id, recipe]): RecipeRow => ({
    ...shelfFacts(recipe, ctx.progress.almanacRecipes.has(id), ctx, options.showsSource),
    id,
    spoilered: isSpoilered(recipe.visibility, options.progressionState),
  }));
  return { rows, totals: countShelfRows(rows) };
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

const PET_TREAT_ITEMS = ["cat_treat", "dog_treat"] as ItemId[];

/**
 * Recipes made by almanac entries, grouped in almanac order. Ranching also lists the two pet
 * treats, which the Mill makes but the almanac leaves out. A shared recipe counts in each
 * section that shows it. The page total counts it once.
 */
export function recipePlacements(): {
  categoryId: AlmanacCategoryId;
  recipes: RecipePlacement[];
}[] {
  return recordEntries(trackerData.almanac).flatMap(([categoryId, category]) => {
    const seen = new Set<RecipeId>();
    const recipes: RecipePlacement[] = [];
    const itemIds = category.items.map((entry) => entry.itemIds[0]);
    if (categoryId === "ranching") {
      itemIds.push(...PET_TREAT_ITEMS.filter((id) => Object.hasOwn(trackerData.items, id)));
    }
    for (const itemId of itemIds) {
      const recipeId = recipeForItem(trackerData.items[itemId]);
      if (!recipeId || seen.has(recipeId)) continue;
      seen.add(recipeId);
      recipes.push({ itemId, recipeId });
    }
    return recipes.length > 0 ? [{ categoryId, recipes }] : [];
  });
}
