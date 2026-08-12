import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { evaluateExpressions } from "../evaluate.js";
import { parseFiddle } from "../parse-fiddle.js";
import { extractRecipes } from "./recipes.js";

import type { RecipeId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    chicken_statue: {},
    dungeons: {},
    festivals: {},
    fishing: {},
    items: {},
    letters: {},
    misc: {
      chicken_statue: { high_price: 100, low_price: 10 },
      wishing_well: { high_price: 500, low_price: 100 },
    },
    museum_wings: {},
    quests: {},
    stores: {},
    wishing_well: {},
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractRecipes", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups colorway items by recipe_key into a single recipe", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            chair_blue: {
              name: "Sapling Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "sapling_chair",
            },
            chair_green: {
              name: "Sapling Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "sapling_chair",
            },
            chair_purple: {
              name: "Sapling Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "sapling_chair",
            },
            default: {},
          },
        },
      },
    });

    const { recipeIdByItemId, recipes } = extractRecipes(fiddle);
    const recipe = recipes["sapling_chair" as RecipeId];
    expect(recipe).toBeDefined();
    expect(recipe.memberItemIds).toEqual(["chair_blue", "chair_green", "chair_purple"]);
    expect(recipe.sources).toEqual([]);
    expect(recipe.presentations).toEqual([
      { itemIds: ["chair_blue", "chair_green", "chair_purple"], name: "Sapling Chair" },
    ]);
    expect(recipeIdByItemId.get("chair_blue")).toBe("sapling_chair");
  });

  it("emits default source when all members have recipe_is_default", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            basic_table: {
              name: "Basic Table",
              recipe: [{ count: 3, item: "wood" }],
              recipe_is_default: true,
              recipe_key: "basic_table",
            },
            basic_table_oak: {
              name: "Basic Table",
              recipe: [{ count: 3, item: "wood" }],
              recipe_is_default: true,
              recipe_key: "basic_table",
            },
            default: {},
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["basic_table" as RecipeId];
    expect(recipe.sources).toEqual([{ type: "default" }]);
    expect(recipe).not.toHaveProperty("defaultUnlocked");
  });

  it("warns and omits default source when members disagree on recipe_is_default", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            mixed_a: {
              name: "Mixed Item",
              recipe: [{ count: 1, item: "wood" }],
              recipe_is_default: true,
              recipe_key: "mixed_group",
            },
            mixed_b: {
              name: "Mixed Item",
              recipe: [{ count: 1, item: "wood" }],
              recipe_key: "mixed_group",
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    expect(recipes["mixed_group" as RecipeId].sources).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("mixed_group"));
  });

  it("maps quest crafting_scroll rewards to recipe sources", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            chair_green: {
              name: "Sapling Chair",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "sapling_chair",
            },
            default: {},
          },
        },
      },
      quests: {
        stillwell_challenges: {
          green_sapling_surprise: {
            name: "Green Sapling Surprise",
            rewards: [{ renown: 100 }, { crafting_scroll: "chair_green" }],
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["sapling_chair" as RecipeId];
    expect(recipe.sources).toEqual([
      {
        questId: "green_sapling_surprise",
        questType: "stillwell_challenges",
        type: "quest",
      },
    ]);
  });

  it("maps recipe_scroll rewards for cooked dishes without recipe_key", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            vegetable_soup: {
              name: "Vegetable Soup",
              recipe: [{ count: 1, item: "potato" }],
            },
          },
        },
      },
      quests: {
        story_quests: {
          cooking_101: {
            name: "Cooking 101",
            rewards: [{ recipe_scroll: "vegetable_soup" }, { renown: 20 }],
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["vegetable_soup" as RecipeId];
    expect(recipe).toBeDefined();
    expect(recipe.sources).toEqual([
      { questId: "cooking_101", questType: "story_quests", type: "quest" },
    ]);
    expect(recipe.memberItemIds).toEqual(["vegetable_soup"]);
    expect(recipe.presentations).toEqual([{ itemIds: ["vegetable_soup"], name: "Vegetable Soup" }]);
  });

  it("ignores recipe scroll rewards from quest groups outside the explicit subset", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            heart_chair: {
              name: "Heart Chair",
              recipe: [{ count: 5, item: "wood" }],
            },
          },
        },
      },
      quests: {
        heart_quests: {
          heart_chair_reward: {
            rewards: [{ crafting_scroll: "heart_chair" }],
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);

    expect(recipes["heart_chair" as RecipeId].sources).toEqual([]);
  });

  it("excludes items without a recipe array or recipe_key", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          crops_and_forage: {
            default: {},
            potato: { name: "Potato", tags: ["crop"] },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    expect(Object.keys(recipes)).toEqual([]);
  });

  it("sorts memberItemIds alphabetically", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            aaa_first: {
              name: "Widget",
              recipe: [{ count: 1, item: "wood" }],
              recipe_key: "widget",
            },
            default: {},
            zzz_last: {
              name: "Widget",
              recipe: [{ count: 1, item: "wood" }],
              recipe_key: "widget",
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    expect(recipes["widget" as RecipeId].memberItemIds).toEqual(["aaa_first", "zzz_last"]);
  });

  it("warns on unresolved scroll targets and skips them", () => {
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: {
          some_quest: {
            name: "Some Quest",
            rewards: [{ recipe_scroll: "unknown_dish" }],
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    expect(recipes["unknown_dish" as RecipeId]).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unknown_dish"));
  });

  it("maps letter recipe_scroll with shipped_item requirement", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            tomato_soup: {
              name: "Tomato Soup",
              recipe: [{ count: 2, item: "tomato" }],
            },
          },
        },
      },
      letters: {
        tomato_letter: {
          items: [{ recipe_scroll: "tomato_soup" }],
          requirements: { shipped_item: "tomato" },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["tomato_soup" as RecipeId];
    expect(recipe.sources).toEqual([
      { trigger: "shipped_item", triggerItemId: "tomato", type: "letter" },
    ]);
  });

  it("maps store recipe_scroll via categories[] to store source", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            fancy_lamp: {
              name: "Fancy Lamp",
              recipe: [{ count: 2, item: "glass" }],
            },
          },
        },
      },
      stores: {
        furniture_store: {
          categories: [{ constant_stock: [{ recipe_scroll: "fancy_lamp" }] }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["fancy_lamp" as RecipeId];
    expect(recipe.sources).toEqual([{ storeId: "furniture_store", type: "store" }]);
  });

  it("maps store include_recipe=true to store source", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            bookshelf: {
              name: "Bookshelf",
              recipe: [{ count: 10, item: "wood" }],
            },
            default: {},
          },
        },
      },
      stores: {
        general_store: {
          categories: [{ constant_stock: [{ include_recipe: true, item: "bookshelf" }] }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["bookshelf" as RecipeId];
    expect(recipe.sources).toEqual([{ storeId: "general_store", type: "store" }]);
  });

  it("maps store seasonal stock scrolls via categories[]", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            summer_chair: {
              name: "Summer Chair",
              recipe: [{ count: 3, item: "wood" }],
            },
          },
        },
      },
      stores: {
        seasonal_store: {
          categories: [{ seasonal: { summer: [{ crafting_scroll: "summer_chair" }] } }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["summer_chair" as RecipeId];
    expect(recipe.sources).toEqual([{ storeId: "seasonal_store", type: "store" }]);
  });

  it("maps museum wing crafting_scroll to museum_donation source", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            fossil_table: {
              name: "Fossil Table",
              recipe: [{ count: 5, item: "stone" }],
            },
          },
        },
      },
      museum_wings: {
        archaeology: {
          rewards: [{ entries: [{ crafting_scroll: "fossil_table" }] }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["fossil_table" as RecipeId];
    expect(recipe.sources).toEqual([
      { setCount: 1, type: "museum_donation", wingId: "archaeology" },
    ]);
  });

  it("maps chicken statue recipe_scroll to chicken_statue source", () => {
    const fiddle = makeFiddle({
      chicken_statue: {
        common: {
          small_roll: [{ recipe_scroll: "egg_dish" }],
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            egg_dish: {
              name: "Egg Dish",
              recipe: [{ count: 1, item: "egg" }],
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["egg_dish" as RecipeId];
    expect(recipe.sources).toEqual([{ cost: 10, type: "chicken_statue" }]);
  });

  it("rejects non-numeric chicken statue prices", () => {
    const fiddle = makeFiddle({
      chicken_statue: {
        common: {
          small_roll: [{ recipe_scroll: "egg_dish" }],
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            egg_dish: {
              name: "Egg Dish",
              recipe: [{ count: 1, item: "egg" }],
            },
          },
        },
      },
      misc: {
        chicken_statue: { high_price: 100, low_price: "10" },
        wishing_well: { high_price: 500, low_price: 100 },
      },
    });

    expect(() => extractRecipes(fiddle)).toThrow(
      'Invalid or missing numeric value "misc.chicken_statue.low_price"',
    );
  });

  it("maps fishing chest entries with kind=recipe to treasure_chest source", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          bronze: {
            items: [{ kind: "recipe", value: "fish_stew" }],
          },
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            fish_stew: {
              name: "Fish Stew",
              recipe: [{ count: 1, item: "fish" }],
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["fish_stew" as RecipeId];
    expect(recipe.sources).toEqual([{ tier: "bronze", type: "treasure_chest" }]);
  });

  it("maps wishing well recipe_scroll to wishing_well source", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            wish_cake: {
              name: "Wish Cake",
              recipe: [{ count: 1, item: "flour" }],
            },
          },
        },
      },
      wishing_well: {
        common: {
          large_roll: [{ recipe_scroll: "wish_cake" }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["wish_cake" as RecipeId];
    expect(recipe.sources).toEqual([{ cost: 500, type: "wishing_well" }]);
  });

  it("rejects missing wishing well prices", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            wish_cake: {
              name: "Wish Cake",
              recipe: [{ count: 1, item: "flour" }],
            },
          },
        },
      },
      misc: {
        chicken_statue: { high_price: 100, low_price: 10 },
        wishing_well: { low_price: 100 },
      },
      wishing_well: {
        common: {
          large_roll: [{ recipe_scroll: "wish_cake" }],
        },
      },
    });

    expect(() => extractRecipes(fiddle)).toThrow(
      'Invalid or missing numeric value "misc.wishing_well.high_price"',
    );
  });

  it("maps festival recipe_scroll via stocks[storeId] to festival source", () => {
    const fiddle = makeFiddle({
      festivals: {
        harvest: {
          stocks: {
            nora_souvenir_stall: [{ recipe_scroll: "festival_treat", tier_required: 2 }],
          },
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            festival_treat: {
              name: "Festival Treat",
              recipe: [{ count: 1, item: "sugar" }],
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["festival_treat" as RecipeId];
    expect(recipe.sources).toEqual([
      { festivalId: "harvest", storeId: "nora_souvenir_stall", type: "festival" },
    ]);
  });

  it("ignores dungeon_delicacies items (gives dishes, not recipes)", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            {
              dungeon_delicacies: ["cave_stew"],
              furniture: [],
              taste_maker: [],
            },
          ],
        },
      },
      items: {
        other: {
          cooked_dishes: {
            cave_stew: {
              name: "Cave Stew",
              recipe: [{ count: 2, item: "mushroom" }],
            },
            default: {},
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["cave_stew" as RecipeId];
    expect(recipe.sources).toEqual([]);
  });

  it("maps taste_maker items to mines_chest source", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            {
              dungeon_delicacies: [],
              furniture: [],
              taste_maker: ["spicy_soup"],
            },
          ],
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            spicy_soup: {
              name: "Spicy Soup",
              recipe: [{ count: 1, item: "pepper" }],
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["spicy_soup" as RecipeId];
    expect(recipe.sources).toEqual([
      { biomeId: "biome_0", perkId: "taste_maker", type: "mines_chest" },
    ]);
  });

  it("maps biome furniture items to mines_dig_site source", () => {
    const fiddle = makeFiddle({
      dungeons: {
        dungeons: {
          biomes: [
            {
              dungeon_delicacies: [],
              furniture: ["cave_shelf"],
              taste_maker: [],
            },
          ],
        },
      },
      items: {
        furniture: {
          cave_set: {
            cave_shelf: {
              name: "Cave Shelf",
              recipe: [{ count: 5, item: "stone" }],
            },
            default: {},
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["cave_shelf" as RecipeId];
    expect(recipe.sources).toEqual([
      { biomeId: "biome_0", perkId: "natural_beauty", type: "mines_dig_site" },
    ]);
  });

  it("logs diagnostic for items with recipe_is_default but no recipe array or recipe_key", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          materials: {
            default: {},
            ore_gold: {
              name: "Gold Ore",
              recipe_is_default: true,
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    expect(recipes["ore_gold" as RecipeId]).toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("ore_gold"));
  });

  it("emits store source with upgraded flag when requirements include repaired_*", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            inn_special: {
              name: "Inn Special",
              recipe: [{ count: 1, item: "flour" }],
            },
          },
        },
      },
      stores: {
        sleeping_dragon_inn: {
          categories: [
            {
              constant_stock: [
                {
                  recipe_scroll: "inn_special",
                  requirements: { repaired_inn: true },
                },
              ],
            },
          ],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["inn_special" as RecipeId];
    expect(recipe.sources).toEqual([
      { storeId: "sleeping_dragon_inn", type: "store", upgraded: true },
    ]);
  });

  it("emits store_with_perk source when requirements include has_perk", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            espresso: {
              name: "Espresso",
              recipe: [{ count: 1, item: "coffee_beans" }],
            },
          },
        },
      },
      stores: {
        darcy_stall: {
          categories: [
            {
              constant_stock: [
                {
                  include_recipe: true,
                  item: "espresso",
                  requirements: { has_perk: "espresso_yourself" },
                },
              ],
            },
          ],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["espresso" as RecipeId];
    expect(recipe.sources).toEqual([
      { perkId: "espresso_yourself", storeId: "darcy_stall", type: "store_with_perk" },
    ]);
  });

  it("maps letter recipe_scroll with reached_date requirement to letter source with triggerDate", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            seasonal_dish: {
              name: "Seasonal Dish",
              recipe: [{ count: 1, item: "pumpkin" }],
            },
          },
        },
      },
      letters: {
        fall_letter: {
          items: [{ recipe_scroll: "seasonal_dish" }],
          requirements: { reached_date: { day: 15, season: "fall" } },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["seasonal_dish" as RecipeId];
    expect(recipe.sources).toEqual([
      { trigger: "reached_date", triggerDate: { day: 15, season: "fall" }, type: "letter" },
    ]);
  });

  it("preserves distinct reached_date letter sources for the same recipe", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            seasonal_dish: {
              name: "Seasonal Dish",
              recipe: [{ count: 1, item: "pumpkin" }],
            },
          },
        },
      },
      letters: {
        first_letter: {
          items: [{ recipe_scroll: "seasonal_dish" }],
          requirements: { reached_date: { day: 15, season: "fall" } },
        },
        second_letter: {
          items: [{ recipe_scroll: "seasonal_dish" }],
          requirements: { reached_date: { day: 16, season: "fall" } },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["seasonal_dish" as RecipeId];
    expect(recipe.sources).toEqual([
      { trigger: "reached_date", triggerDate: { day: 15, season: "fall" }, type: "letter" },
      { trigger: "reached_date", triggerDate: { day: 16, season: "fall" }, type: "letter" },
    ]);
  });

  it("deduplicates identical sources from different chest tiers", () => {
    const fiddle = makeFiddle({
      fishing: {
        chest_tables: {
          bronze: { items: [{ kind: "recipe", value: "rare_fish" }] },
          gold: { items: [{ kind: "recipe", value: "rare_fish" }] },
          silver: { items: [{ kind: "recipe", value: "rare_fish" }] },
        },
      },
      items: {
        other: {
          cooked_dishes: {
            default: {},
            rare_fish: {
              name: "Rare Fish Dish",
              recipe: [{ count: 3, item: "fish" }],
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["rare_fish" as RecipeId];
    expect(recipe.sources).toEqual([
      { tier: "bronze", type: "treasure_chest" },
      { tier: "gold", type: "treasure_chest" },
      { tier: "silver", type: "treasure_chest" },
    ]);
  });

  it("sorts sources by type then by detail fields", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            multi_source_item: {
              name: "Multi Source",
              recipe: [{ count: 1, item: "wood" }],
            },
          },
        },
      },
      quests: {
        fetch_quests: {
          get_multi: {
            name: "Get Multi",
            rewards: [{ recipe_scroll: "multi_source_item" }],
          },
        },
      },
      stores: {
        aaa_store: {
          categories: [{ constant_stock: [{ recipe_scroll: "multi_source_item" }] }],
        },
        zzz_store: {
          categories: [{ constant_stock: [{ recipe_scroll: "multi_source_item" }] }],
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["multi_source_item" as RecipeId];
    expect(recipe.sources[0].type).toBe("quest");
    expect(recipe.sources[1]).toEqual({ storeId: "aaa_store", type: "store" });
    expect(recipe.sources[2]).toEqual({ storeId: "zzz_store", type: "store" });
  });

  it("creates separate presentations for items with different names under one recipe_key", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          beds: {
            default: {},
            mermaid_bed_double_blue: {
              name: "Mermaid Double Bed",
              recipe: [{ count: 8, item: "wood" }],
              recipe_key: "mermaid_bed",
            },
            mermaid_bed_single_blue: {
              name: "Mermaid Bed",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "mermaid_bed",
            },
            mermaid_bed_single_green: {
              name: "Mermaid Bed",
              recipe: [{ count: 5, item: "wood" }],
              recipe_key: "mermaid_bed",
            },
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["mermaid_bed" as RecipeId];
    expect(recipe.presentations).toEqual([
      {
        itemIds: ["mermaid_bed_single_blue", "mermaid_bed_single_green"],
        name: "Mermaid Bed",
      },
      {
        itemIds: ["mermaid_bed_double_blue"],
        name: "Mermaid Double Bed",
      },
    ]);
    expect(recipe.memberItemIds).toEqual([
      "mermaid_bed_double_blue",
      "mermaid_bed_single_blue",
      "mermaid_bed_single_green",
    ]);
  });

  it("produces empty results for empty data", () => {
    const fiddle = makeFiddle();

    const { recipeIdByItemId, recipes } = extractRecipes(fiddle);
    expect(Object.keys(recipes)).toEqual([]);
    expect(recipeIdByItemId.size).toBe(0);
  });

  it("resolves scroll targets that are recipe keys directly", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          test_set: {
            default: {},
            widget_blue: {
              name: "Widget",
              recipe: [{ count: 1, item: "wood" }],
              recipe_key: "widget",
            },
          },
        },
      },
      quests: {
        fetch_quests: {
          widget_quest: {
            name: "Widget Quest",
            rewards: [{ crafting_scroll: "widget" }],
          },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["widget" as RecipeId];
    expect(recipe.sources).toEqual([
      { questId: "widget_quest", questType: "fetch_quests", type: "quest" },
    ]);
  });

  it("maps letter recipe_scroll with donated_item requirement", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          cooked_dishes: {
            default: {},
            rare_stew: {
              name: "Rare Stew",
              recipe: [{ count: 1, item: "rare_mushroom" }],
            },
          },
        },
      },
      letters: {
        museum_reward_letter: {
          items: [{ recipe_scroll: "rare_stew" }],
          requirements: { donated_item: "ancient_fossil" },
        },
      },
    });

    const { recipes } = extractRecipes(fiddle);
    const recipe = recipes["rare_stew" as RecipeId];
    expect(recipe.sources).toEqual([
      { trigger: "donated_item", triggerItemId: "ancient_fossil", type: "letter" },
    ]);
  });
});

const ASSETS_DIR = process.env.MISTRIA_ASSETS ?? "pipeline/input/assets";
const HAS_ASSETS = existsSync(`${ASSETS_DIR}/fiddle`);

describe.skipIf(!HAS_ASSETS)("extractRecipes — real data", () => {
  it("produces recipes with expected source type counts", () => {
    const { data: fiddle } = parseFiddle(ASSETS_DIR);
    evaluateExpressions(fiddle);

    const { recipeIdByItemId, recipes } = extractRecipes(fiddle);

    const totalRecipes = Object.keys(recipes).length;
    expect(totalRecipes).toBeGreaterThan(100);

    const withDefault = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "default"),
    ).length;
    expect(withDefault).toBeGreaterThan(50);

    const withQuest = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "quest"),
    ).length;
    expect(withQuest).toBeGreaterThan(10);

    const withLetter = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "letter"),
    ).length;
    expect(withLetter).toBeGreaterThan(10);

    const withStore = Object.values(recipes).filter((r) =>
      r.sources.some((s) => s.type === "store"),
    ).length;
    expect(withStore).toBeGreaterThan(10);

    for (const [, recipeId] of recipeIdByItemId) {
      expect(recipes[recipeId]).toBeDefined();
    }

    const multiPresentation = Object.values(recipes).filter((r) => r.presentations.length > 1);
    expect(multiPresentation.length).toBeGreaterThan(0);
  });
});
