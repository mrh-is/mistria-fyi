import { describe, expect, it } from "vitest";

import { evaluateExpressions } from "../parse/evaluate.js";
import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { assignRecipeStations, requireCraftingMenus } from "./recipe-menus.js";
import { extractRecipes } from "./recipes.js";

import type { RecipeId } from "#lib/types/tracker-data.js";

describe("extractRecipes — real assets", () => {
  it("assigns every extracted recipe to exactly one station", () => {
    const { data: fiddle } = parseFiddle(requireGameAssetsDir());
    requireCraftingMenus(fiddle);
    evaluateExpressions(fiddle);

    const { recipeMemberItems } = extractRecipes(fiddle);
    const stations = assignRecipeStations(fiddle, recipeMemberItems);
    expect(stations.size).toBe(recipeMemberItems.size);
    expect(stations.get("copper_armor" as RecipeId)).toBe("blacksmithing");
    expect(stations.get("blackberry_jam" as RecipeId)).toBe("kitchen");
    expect(stations.get("flour" as RecipeId)).toBe("mill");
    expect(stations.get("basic_wood_chest" as RecipeId)).toBe("woodcrafting");
    expect(stations.get("essence_stone_giant" as RecipeId)).toBe("stone_refinery");
    expect(stations.get("sword_dragon_forged" as RecipeId)).toBe("dragon_forge");
  });

  it("produces recipes with expected source type counts", () => {
    const { data: fiddle } = parseFiddle(requireGameAssetsDir());
    requireCraftingMenus(fiddle);
    evaluateExpressions(fiddle);

    const { recipeIdByItemId, recipeNameSources, recipes } = extractRecipes(fiddle);

    const totalRecipes = Object.keys(recipes).length;
    expect(totalRecipes).toBeGreaterThan(100);
    expect(recipes).toHaveProperty("cat_treat");
    expect(recipes).toHaveProperty("dog_treat");

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
