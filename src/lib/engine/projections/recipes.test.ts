import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { recipeForItem, recipePlacements } from "#lib/engine/projections/recipes.js";

describe("recipePlacements", () => {
  const placements = recipePlacements();

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
        expect(first?.itemIds[0]).toBe(itemId);
      }
    }
  });
});
