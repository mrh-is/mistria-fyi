import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { findRecipesForQuest, recipeDisplayNames } from "../quest-rewards.js";

import type { QuestId, RecipeId } from "$lib/types/tracker-data.js";

// Find a quest that awards multiple recipes (same questId appears on 2+ recipes)
function findQuestWithMultipleRecipes(): undefined | { questId: QuestId; recipeIds: RecipeId[] } {
  const questToRecipes = new Map<string, RecipeId[]>();
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    for (const s of recipe.sources) {
      if (s.type === "quest") {
        const list = questToRecipes.get(s.questId) ?? [];
        list.push(id as RecipeId);
        questToRecipes.set(s.questId, list);
      }
    }
  }
  for (const [questId, recipeIds] of questToRecipes.entries()) {
    if (recipeIds.length > 1) {
      return { questId: questId as QuestId, recipeIds };
    }
  }
  return undefined;
}

// Find a quest that awards exactly one recipe
function findQuestWithOneRecipe(): undefined | { questId: QuestId; recipeId: RecipeId } {
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    const questSources = recipe.sources.filter((s) => s.type === "quest");
    if (questSources.length === 1) {
      return {
        questId: questSources[0].questId,
        recipeId: id as RecipeId,
      };
    }
  }
  return undefined;
}

describe("findRecipesForQuest", () => {
  it("returns recipe IDs for a quest that awards one recipe", () => {
    const fixture = findQuestWithOneRecipe();
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const result = findRecipesForQuest(fixture.questId);
    expect(result).toContain(fixture.recipeId);
  });

  it("returns all recipe IDs for a quest that awards multiple recipes", () => {
    const fixture = findQuestWithMultipleRecipes();
    if (!fixture) {
      // Skip test if no multi-recipe quest exists in the data
      return;
    }

    const result = findRecipesForQuest(fixture.questId);
    for (const recipeId of fixture.recipeIds) {
      expect(result).toContain(recipeId);
    }
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty array for a quest that awards no recipes", () => {
    const noRewardQuestId = "this_quest_id_does_not_exist" as QuestId;
    expect(findRecipesForQuest(noRewardQuestId)).toEqual([]);
  });

  it("matches only by questId, not questType", () => {
    const fixture = findQuestWithOneRecipe();
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const result = findRecipesForQuest(fixture.questId);
    // The recipeId must come from the actual sources
    for (const recipeId of result) {
      const recipe = trackerData.recipes[recipeId];
      const hasQuestSource = recipe.sources.some(
        (s) => s.type === "quest" && s.questId === fixture.questId,
      );
      expect(hasQuestSource).toBe(true);
    }
  });
});

describe("recipeDisplayNames", () => {
  it("returns the first presentation name for each recipe", () => {
    const fixture = findQuestWithOneRecipe();
    expect(fixture).toBeDefined();
    if (!fixture) return;

    const names = recipeDisplayNames([fixture.recipeId]);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe(trackerData.recipes[fixture.recipeId].presentations[0]?.name);
  });

  it("deduplicates presentation names", () => {
    const fixture = findQuestWithOneRecipe();
    expect(fixture).toBeDefined();
    if (!fixture) return;

    // Passing the same recipeId twice should only yield one name
    const names = recipeDisplayNames([fixture.recipeId, fixture.recipeId]);
    expect(names).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(recipeDisplayNames([])).toEqual([]);
  });
});
