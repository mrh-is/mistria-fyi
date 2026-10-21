import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractRecipeScrollUnlocks } from "./recipe-scrolls.js";

import type { RecipeId } from "#lib/types/tracker-data.js";

const recipeIds = new Map([
  ["ring", "ring" as RecipeId],
  ["chair_blue", "chair" as RecipeId],
  ["chair_green", "chair" as RecipeId],
]);

describe("extractRecipeScrollUnlocks", () => {
  it("maps native scroll tags to deduplicated recipe identities across item variants", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          misc: {
            chair_blue: { tags: ["furniture_set"] },
            chair_green: { tags: ["furniture_set"] },
            furniture_scroll: { set_unlock: "furniture_set" },
            recipe_scroll: {},
            ring: { tags: ["ring_set"] },
            ring_scroll: { set_unlock: "ring_set" },
          },
        },
      },
    });
    expect(extractRecipeScrollUnlocks(fiddle, recipeIds)).toEqual({
      furniture_scroll: ["chair"],
      ring_scroll: ["ring"],
    });
  });

  it("rejects a fixed scroll whose set has no matching recipe", () => {
    const fiddle = makeFiddle({
      items: { other: { misc: { orphan_scroll: { set_unlock: "missing_set" } } } },
    });
    expect(() => extractRecipeScrollUnlocks(fiddle, recipeIds)).toThrow(
      /orphan_scroll.*no matching recipe/,
    );
  });

  it("does not infer a recipe from acquisition of a generic runtime-target scroll", () => {
    const fiddle = makeFiddle({ items: { other: { misc: { recipe_scroll: {} } } } });
    expect(extractRecipeScrollUnlocks(fiddle, recipeIds)).toEqual({});
  });

  it("rejects malformed native scroll tags instead of dropping them", () => {
    const fiddle = makeFiddle({
      items: { other: { misc: { ring_scroll: { set_unlock: null } } } },
    });
    expect(() => extractRecipeScrollUnlocks(fiddle, recipeIds)).toThrow(/set_unlock/);
  });
});
