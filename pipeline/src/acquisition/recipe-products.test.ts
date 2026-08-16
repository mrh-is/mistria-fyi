import { describe, expect, it } from "vitest";

import { deriveProductionMethod, deriveRecipeProductSources } from "./recipe-products.js";
import { ItemSourceAccumulator } from "./source-accumulator.js";

import type { ItemId, RecipeId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    items: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

function makeRecipes(
  entries: Record<string, { memberItemIds: string[] }>,
): Record<RecipeId, { memberItemIds: ItemId[] }> {
  return Object.fromEntries(
    Object.entries(entries).map(([id, r]) => [
      id as RecipeId,
      { memberItemIds: r.memberItemIds as ItemId[] },
    ]),
  );
}

describe("deriveProductionMethod", () => {
  it("derives 'cook' for items in other/cooked_dishes", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            turnip_soup: { name: "Turnip Soup", recipe: [{ count: 1, item: "turnip" }] },
          },
        },
      },
    });

    expect(deriveProductionMethod("turnip_soup" as ItemId, fiddle)).toBe("cook");
  });

  it("derives 'mill' for items with a 'milling' tag", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          mill: {
            default: {},
            flour: { name: "Flour", recipe: [], tags: ["milling", "milled_ingredients"] },
          },
        },
      },
    });

    expect(deriveProductionMethod("flour" as ItemId, fiddle)).toBe("mill");
  });

  it("derives 'smith' for items with a 'blacksmithing' tag", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          blacksmithing: {
            copper_ingot: {
              default: {},
              name: "Copper Ingot",
              recipe: [],
              tags: ["blacksmithing", "ingot"],
            },
          },
        },
      },
    });

    expect(deriveProductionMethod("copper_ingot" as ItemId, fiddle)).toBe("smith");
  });

  it("derives 'dragon_forge' for dragon_forged_ items with blacksmithing tag", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          blacksmithing: {
            default: {},
            dragon_forged_fang: {
              name: "Dragon Forged Fang",
              recipe: [],
              tags: ["blacksmithing"],
            },
          },
        },
      },
    });

    expect(deriveProductionMethod("dragon_forged_fang" as ItemId, fiddle)).toBe("dragon_forge");
  });

  it("derives 'craft' for furniture items with a recipe", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          kitchen_set: {
            default: {},
            kitchen_salt_and_pepper_shakers: {
              name: "Salt & Pepper Shakers",
              recipe: [{ count: 2, item: "rock_salt" }],
              recipe_key: "kitchen_salt_and_pepper_shakers",
              tags: ["furniture", "kitchen_set"],
            },
          },
        },
      },
    });

    expect(deriveProductionMethod("kitchen_salt_and_pepper_shakers" as ItemId, fiddle)).toBe(
      "craft",
    );
  });

  it("returns undefined for items without a production method", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          misc: {
            default: {},
            rock: { name: "Rock" },
          },
        },
      },
    });

    expect(deriveProductionMethod("rock" as ItemId, fiddle)).toBeUndefined();
  });
});

describe("deriveRecipeProductSources", () => {
  it("adds a recipe source to every member item", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            turnip_soup: { name: "Turnip Soup", recipe: [{ count: 1, item: "turnip" }] },
          },
        },
      },
    });

    const recipes = makeRecipes({
      turnip_soup: { memberItemIds: ["turnip_soup"] },
    });

    const accumulator = new ItemSourceAccumulator();
    deriveRecipeProductSources(fiddle, recipes, accumulator);

    expect(accumulator.get("turnip_soup" as ItemId)).toEqual([
      { method: "cook", recipeId: "turnip_soup", type: "recipe" },
    ]);
  });

  it("adds recipe sources to all members of a multi-item recipe", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            chair_blue: {
              name: "Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "chair",
              tags: ["furniture"],
            },
            chair_green: {
              name: "Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "chair",
              tags: ["furniture"],
            },
            default: {},
          },
        },
      },
    });

    const recipes = makeRecipes({
      chair: { memberItemIds: ["chair_blue", "chair_green"] },
    });

    const accumulator = new ItemSourceAccumulator();
    deriveRecipeProductSources(fiddle, recipes, accumulator);

    const expected = [{ method: "craft", recipeId: "chair", type: "recipe" }];
    expect(accumulator.get("chair_blue" as ItemId)).toEqual(expected);
    expect(accumulator.get("chair_green" as ItemId)).toEqual(expected);
  });

  it("skips recipes whose members have no derivable production method", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          misc: {
            default: {},
            mystery_item: { name: "Mystery" },
          },
        },
      },
    });

    const recipes = makeRecipes({
      mystery_item: { memberItemIds: ["mystery_item"] },
    });

    const accumulator = new ItemSourceAccumulator();
    deriveRecipeProductSources(fiddle, recipes, accumulator);

    expect(accumulator.get("mystery_item" as ItemId)).toEqual([]);
  });

  it("uses the first member's method for the recipe when members agree", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            pie_apple: { name: "Apple Pie", recipe: [] },
            pie_cherry: { name: "Cherry Pie", recipe: [] },
          },
        },
      },
    });

    const recipes = makeRecipes({
      pie: { memberItemIds: ["pie_apple", "pie_cherry"] },
    });

    const accumulator = new ItemSourceAccumulator();
    deriveRecipeProductSources(fiddle, recipes, accumulator);

    expect(accumulator.get("pie_apple" as ItemId)).toEqual([
      { method: "cook", recipeId: "pie", type: "recipe" },
    ]);
  });

  it("throws on conflicting production methods among recipe members", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            item_a: { name: "A", recipe: [], tags: ["furniture"] },
          },
        },
        other: {
          cooked_dishes: {
            default: {},
            item_b: { name: "B", recipe: [] },
          },
        },
      },
    });

    const recipes = makeRecipes({
      mixed_recipe: { memberItemIds: ["item_a", "item_b"] },
    });

    const accumulator = new ItemSourceAccumulator();
    expect(() => {
      deriveRecipeProductSources(fiddle, recipes, accumulator);
    }).toThrow(/conflicting production methods/);
  });

  it("proves kitchen_salt_and_pepper_shakers through its real acquisition path", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          kitchen_set: {
            default: {},
            kitchen_salt_and_pepper_shakers: {
              name: "Salt & Pepper Shakers",
              recipe: [{ count: 2, item: "rock_salt" }],
              recipe_key: "kitchen_salt_and_pepper_shakers",
              tags: ["furniture", "kitchen_decor", "kitchen_set"],
            },
          },
        },
      },
    });

    const recipes = makeRecipes({
      kitchen_salt_and_pepper_shakers: {
        memberItemIds: ["kitchen_salt_and_pepper_shakers"],
      },
    });

    const accumulator = new ItemSourceAccumulator();
    deriveRecipeProductSources(fiddle, recipes, accumulator);

    expect(accumulator.get("kitchen_salt_and_pepper_shakers" as ItemId)).toEqual([
      {
        method: "craft",
        recipeId: "kitchen_salt_and_pepper_shakers",
        type: "recipe",
      },
    ]);
  });
});
