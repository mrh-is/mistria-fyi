import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

import type { ItemSourceAccumulator } from "./source-accumulator.js";

export function deriveRecipeProductSources(
  recipeMemberItems: Map<RecipeId, ItemId[]>,
  accumulator: ItemSourceAccumulator,
): void {
  for (const [recipeId, itemIds] of recipeMemberItems) {
    for (const itemId of itemIds) {
      accumulator.add(itemId, { type: "recipe", recipeId });
    }
  }
}
