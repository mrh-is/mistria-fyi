import { expect, it } from "vitest";

import { deriveRecipeProductSources } from "./recipe-products.js";
import { ItemSourceAccumulator } from "./source-accumulator.js";

import type { ItemId, RecipeId } from "#lib/types/tracker-data.js";

it("links each recipe product to its recipe", () => {
  const recipeId = "essence_stone_giant" as RecipeId;
  const itemId = "essence_stone_giant" as ItemId;
  const accumulator = new ItemSourceAccumulator();
  deriveRecipeProductSources(new Map([[recipeId, [itemId]]]), accumulator);
  expect(accumulator.get(itemId)).toEqual([{ type: "recipe", recipeId }]);
});
