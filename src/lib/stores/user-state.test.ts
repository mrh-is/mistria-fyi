import { afterEach, describe, expect, it } from "vitest";

import { userState } from "$lib/stores/user-state.svelte.js";

import type { QuestId, RecipeId } from "$lib/types/tracker-data.js";

const NO_REWARD_QUEST = "a_birdhouse" as QuestId;
const ONE_REWARD_QUEST = "bell_berry_bakewell_tart_challenge" as QuestId;
const ONE_REWARD_RECIPE = "kitchen_herb_planter" as RecipeId;
const MULTIPLE_REWARD_QUEST = "apiaries_and_terrariums" as QuestId;
const PREVIOUSLY_COMPLETE_RECIPE = "apiary" as RecipeId;
const NEWLY_COMPLETE_RECIPE = "terrarium" as RecipeId;

describe("quest recipe rewards", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("changes none to obtained without completing recipe rewards", () => {
    const newlyAdded = userState.completeQuestWithRecipes(ONE_REWARD_QUEST);

    expect(userState.state.completed.questStates[ONE_REWARD_QUEST]).toBe("obtained");
    expect(newlyAdded).toEqual([]);
    expect(userState.state.completed.almanacRecipes.has(ONE_REWARD_RECIPE)).toBe(false);
  });

  it("completes every recipe reward when changing obtained to completed", () => {
    userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);

    const newlyAdded = userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);

    expect(userState.state.completed.questStates[MULTIPLE_REWARD_QUEST]).toBe("completed");
    expect(newlyAdded).toEqual([PREVIOUSLY_COMPLETE_RECIPE, NEWLY_COMPLETE_RECIPE]);
    expect(userState.state.completed.almanacRecipes.has(PREVIOUSLY_COMPLETE_RECIPE)).toBe(true);
    expect(userState.state.completed.almanacRecipes.has(NEWLY_COMPLETE_RECIPE)).toBe(true);
  });

  it("excludes an already-complete recipe from the completion result", () => {
    userState.toggleAlmanacRecipe(PREVIOUSLY_COMPLETE_RECIPE);
    userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);

    const newlyAdded = userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);

    expect(newlyAdded).toEqual([NEWLY_COMPLETE_RECIPE]);
    expect(userState.state.completed.almanacRecipes.has(PREVIOUSLY_COMPLETE_RECIPE)).toBe(true);
  });

  it("completes a quest without rewards without changing recipe state", () => {
    const recipesBefore = [...userState.state.completed.almanacRecipes];
    userState.completeQuestWithRecipes(NO_REWARD_QUEST);

    const newlyAdded = userState.completeQuestWithRecipes(NO_REWARD_QUEST);

    expect(newlyAdded).toEqual([]);
    expect([...userState.state.completed.almanacRecipes]).toEqual(recipesBefore);
  });

  it("resets a completed quest without removing its recipe rewards", () => {
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);
    userState.completeQuestWithRecipes(ONE_REWARD_QUEST);

    const newlyAdded = userState.completeQuestWithRecipes(ONE_REWARD_QUEST);

    expect(userState.state.completed.questStates[ONE_REWARD_QUEST]).toBe("none");
    expect(newlyAdded).toEqual([]);
    expect(userState.state.completed.almanacRecipes.has(ONE_REWARD_RECIPE)).toBe(true);
  });

  it("undoes completion while preserving recipes that were already complete", () => {
    userState.toggleAlmanacRecipe(PREVIOUSLY_COMPLETE_RECIPE);
    userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);
    const newlyAdded = userState.completeQuestWithRecipes(MULTIPLE_REWARD_QUEST);

    userState.undoQuestWithRecipes(MULTIPLE_REWARD_QUEST, newlyAdded);

    expect(userState.state.completed.questStates[MULTIPLE_REWARD_QUEST]).toBe("obtained");
    expect(userState.state.completed.almanacRecipes.has(PREVIOUSLY_COMPLETE_RECIPE)).toBe(true);
    expect(userState.state.completed.almanacRecipes.has(NEWLY_COMPLETE_RECIPE)).toBe(false);
  });
});
