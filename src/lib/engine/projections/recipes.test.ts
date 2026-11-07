import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { recipeForItem, recipePlacements } from "#lib/engine/projections/recipes.js";
import { recordKeys } from "#lib/utils/record.js";

describe("recipePlacements", () => {
  const placements = recipePlacements();

  it("places every counted recipe on the page", () => {
    const placed = new Set(
      placements.flatMap(({ recipes }) => recipes.map(({ recipeId }) => recipeId)),
    );
    const missing = recordKeys(trackerData.recipes)
      .filter((id) => !placed.has(id))
      .map((id) => getName("recipes", id, "en"));

    expect(missing).toEqual([]);
  });

  it("places both pet treat recipes in Ranching", () => {
    const ranching = placements.find(({ categoryId }) => categoryId === "ranching");
    expect(ranching?.recipes).toEqual(
      expect.arrayContaining([
        { itemId: "cat_treat", recipeId: "cat_treat" },
        { itemId: "dog_treat", recipeId: "dog_treat" },
      ]),
    );
  });

  it("follows almanac category order, skipping categories with no recipes", () => {
    const order = Object.keys(trackerData.almanac);
    const ids = placements.map(({ categoryId }) => categoryId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(order.filter((id) => ids.includes(id as (typeof ids)[number])));
    for (const { recipes } of placements) expect(recipes.length).toBeGreaterThan(0);
  });

  it("lists each recipe once per category, pictured with an item it makes", () => {
    for (const { categoryId, recipes } of placements) {
      const ids = recipes.map(({ recipeId }) => recipeId);
      expect(new Set(ids).size, categoryId).toBe(ids.length);
      for (const { itemId, recipeId } of recipes) {
        expect(recipeForItem(trackerData.items[itemId])).toBe(recipeId);
      }
    }
  });

  it("pictures each recipe with the first almanac entry in its category that makes it", () => {
    for (const { categoryId, recipes } of placements) {
      const entries = trackerData.almanac[categoryId].items;
      for (const { itemId, recipeId } of recipes) {
        const first = entries.find(
          (entry) => recipeForItem(trackerData.items[entry.itemIds[0]]) === recipeId,
        );
        const ranchingTreat =
          categoryId === "ranching" && ["cat_treat", "dog_treat"].includes(itemId);
        expect(first?.itemIds[0] ?? (ranchingTreat ? itemId : undefined)).toBe(itemId);
      }
    }
  });
});
