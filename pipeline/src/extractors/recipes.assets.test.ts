import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "../evaluate.js";
import { parseFiddle } from "../parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractRecipes } from "./recipes.js";

import type { RecipeId } from "$lib/types/tracker-data.js";

describe("extractRecipes — v1.0.2 assets", () => {
  it("produces recipes with expected source type counts", () => {
    const { data: fiddle } = parseFiddle(requireGameAssetsDir());
    evaluateExpressions(fiddle);

    const { recipeIdByItemId, recipeNameSources, recipes } = extractRecipes(fiddle);

    const totalRecipes = Object.keys(recipes).length;
    expect(totalRecipes).toBeGreaterThan(100);

    const withDefault = Object.values(recipes).filter((recipe) =>
      recipe.sources.some((source) => source.type === "default"),
    ).length;
    expect(withDefault).toBeGreaterThan(50);

    const withQuest = Object.values(recipes).filter((recipe) =>
      recipe.sources.some((source) => source.type === "quest"),
    ).length;
    expect(withQuest).toBeGreaterThan(10);

    const withLetterTrigger = Object.values(recipes).filter((recipe) =>
      recipe.sources.some(
        (source) =>
          source.type === "donate_item" ||
          source.type === "reach_day" ||
          source.type === "ship_item",
      ),
    ).length;
    expect(withLetterTrigger).toBeGreaterThan(10);

    const withStore = Object.values(recipes).filter((recipe) =>
      recipe.sources.some((source) => source.type === "store"),
    ).length;
    expect(withStore).toBeGreaterThan(10);

    for (const [, recipeId] of recipeIdByItemId) {
      expect(recipes[recipeId]).toBeDefined();
    }

    for (const nameSource of Object.values(recipeNameSources)) {
      expect(nameSource.englishName.length).toBeGreaterThan(0);
      expect(nameSource.itemId.length).toBeGreaterThan(0);
    }

    expect(recipeNameSources["mermaid_bed" as RecipeId]).toEqual({
      englishName: "Mermaid Bed",
      itemId: "mermaid_bed_v1",
    });
  });
});
