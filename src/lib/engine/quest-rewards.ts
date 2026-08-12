import { trackerData } from "$lib/data/index.js";

import type { QuestId, RecipeId } from "$lib/types/tracker-data.js";

/**
 * Returns the IDs of all recipes whose sources include a quest source for the
 * given `questId`. Pure function — no side effects.
 */
export function findRecipesForQuest(questId: QuestId): RecipeId[] {
  const result: RecipeId[] = [];
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources.some((s) => s.type === "quest" && s.questId === questId)) {
      result.push(id as RecipeId);
    }
  }
  return result;
}

/**
 * Returns a deduplicated list of display names for the given recipe IDs,
 * using the first presentation name for each recipe.
 */
export function recipeDisplayNames(recipeIds: RecipeId[]): string[] {
  const names = recipeIds.map((id) => trackerData.recipes[id].presentations[0]?.name ?? id);
  return [...new Set(names)];
}
