import { describe, expect, it } from "vitest";

import { findRecipesForQuest, recipeDisplayNames } from "../quest-rewards.js";

import type { QuestId, RecipeId } from "$lib/types/tracker-data.js";

const ONE_REWARD_QUEST = "bell_berry_bakewell_tart_challenge" as QuestId;
const ONE_REWARD_RECIPE = "kitchen_herb_planter" as RecipeId;
const MULTIPLE_REWARD_QUEST = "apiaries_and_terrariums" as QuestId;
const MULTIPLE_REWARD_RECIPES = ["apiary", "terrarium"] as RecipeId[];

describe("findRecipesForQuest", () => {
  it("returns recipe IDs for a quest that awards one recipe", () => {
    expect(findRecipesForQuest(ONE_REWARD_QUEST)).toEqual([ONE_REWARD_RECIPE]);
  });

  it("returns all recipe IDs for a quest that awards multiple recipes", () => {
    expect(findRecipesForQuest(MULTIPLE_REWARD_QUEST)).toEqual(MULTIPLE_REWARD_RECIPES);
  });

  it("returns an empty array for a quest that awards no recipes", () => {
    const noRewardQuestId = "this_quest_id_does_not_exist" as QuestId;
    expect(findRecipesForQuest(noRewardQuestId)).toEqual([]);
  });

  it("matches only by questId, not questType", () => {
    expect(findRecipesForQuest(ONE_REWARD_QUEST)).toEqual([ONE_REWARD_RECIPE]);
    expect(findRecipesForQuest(MULTIPLE_REWARD_QUEST)).toEqual(MULTIPLE_REWARD_RECIPES);
  });
});

describe("recipeDisplayNames", () => {
  it("returns the first presentation name for each recipe", () => {
    expect(recipeDisplayNames([ONE_REWARD_RECIPE])).toEqual(["Herb Planter"]);
  });

  it("deduplicates presentation names", () => {
    expect(recipeDisplayNames([ONE_REWARD_RECIPE, ONE_REWARD_RECIPE])).toEqual(["Herb Planter"]);
  });

  it("returns empty array for empty input", () => {
    expect(recipeDisplayNames([])).toEqual([]);
  });
});
