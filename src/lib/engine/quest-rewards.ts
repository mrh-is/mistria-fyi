import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { recordEntries } from "#lib/utils/record.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { QuestId, Recipe, RecipeId } from "#lib/types/tracker-data.js";

function unlockQuest(recipe: Recipe): QuestId | undefined {
  return trackerData.stations[recipe.stationId]?.unlockQuestId;
}

/** Native defaults become known as soon as the station can be used. */
export function availableDefaultRecipeIds(
  isQuestCompleted: (questId: QuestId) => boolean,
): RecipeId[] {
  return recordEntries(trackerData.recipes)
    .filter(([, recipe]) => {
      const questId = unlockQuest(recipe);
      return (
        recipe.sources.some((source) => source.type === "default") &&
        (questId === undefined || isQuestCompleted(questId))
      );
    })
    .map(([id]) => id);
}

/**
 * Returns direct recipe rewards and default recipes that become known at a station this quest opens.
 */
export function findRecipesForQuest(questId: QuestId): RecipeId[] {
  const result: RecipeId[] = [];
  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    if (
      recipe.sources.some(
        (source) =>
          (source.type === "quest" && source.questId === questId) ||
          (source.type === "default" && unlockQuest(recipe) === questId),
      )
    ) {
      result.push(id);
    }
  }
  return result;
}

/**
 * Returns a deduplicated list of display names for the given recipe IDs,
 * using the first presentation name for each recipe.
 */
export function recipeDisplayNames(recipeIds: RecipeId[], locale: LocaleCode): string[] {
  const names = recipeIds.map((id) => getName("recipes", id, locale));
  return [...new Set(names)];
}
