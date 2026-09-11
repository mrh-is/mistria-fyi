import { afterEach, describe, expect, it } from "vitest";

import { MAX_NPC_LEVEL } from "$lib/engine/progress.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { NpcId, QuestId, RecipeId } from "$lib/types/tracker-data.js";

const NO_REWARD_QUEST = "a_birdhouse" as QuestId;
const ONE_REWARD_QUEST = "bell_berry_bakewell_tart_challenge" as QuestId;
const ONE_REWARD_RECIPE = "kitchen_herb_planter" as RecipeId;
const MULTIPLE_REWARD_QUEST = "apiaries_and_terrariums" as QuestId;
const PREVIOUSLY_COMPLETE_RECIPE = "apiary" as RecipeId;
const NEWLY_COMPLETE_RECIPE = "terrarium" as RecipeId;

describe("NPC progression", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("clamps relationship levels to the twelve-mark range", () => {
    const npcId = "adeline" as NpcId;

    userState.setNpcLevel(npcId, MAX_NPC_LEVEL + 10);
    expect(userState.state.completed.npcLevels[npcId]).toBe(MAX_NPC_LEVEL);

    userState.setNpcLevel(npcId, -1);
    expect(userState.state.completed.npcLevels[npcId]).toBe(0);
  });

  it("closes other romantic paths and resets the household choice when a spouse changes", () => {
    const spouse = "adeline" as NpcId;
    const other = "celine" as NpcId;
    userState.setNpcRelationship(other, "romantic");
    userState.setChildChoice("yes");

    userState.setNpcRelationship(spouse, "married");

    expect(userState.state.completed.npcRelationships[spouse]).toBe("married");
    expect(userState.state.completed.npcRelationships[other]).toBe("platonic");
    expect(userState.state.completed.childChoice).toBe("undeclared");
  });
});

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
