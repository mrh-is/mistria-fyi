import { trackerData } from "#lib/data/index.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { RecipeId } from "#lib/types/tracker-data.js";

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
