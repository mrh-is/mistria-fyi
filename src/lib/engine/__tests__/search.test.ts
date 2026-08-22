import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { deriveProgressionState } from "$lib/engine/visibility.js";

import { searchItems } from "../search.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { RecipeId, Season, Weather } from "$lib/types/tracker-data.js";

function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
  const animalCosmetics: Record<string, Set<string>> = {};
  const animals: Record<string, Set<string>> = {};
  for (const id of Object.keys(trackerData.animals)) {
    animalCosmetics[id] = new Set();
    animals[id] = new Set();
  }
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics,
    animals,
    cosmetics: new Set(),
    marriedNpc: null,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  } as CompletedState;
}

const defaultWorld: { season: Season; weather: Weather } = {
  season: "spring",
  weather: "calm",
};

describe("searchItems", () => {
  describe("recipe visibility", () => {
    it("hides recipes gated by unmet visibility conditions", () => {
      const completed = makeCompleted();
      const progression = deriveProgressionState(completed, trackerData, false);

      const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
      const recipeResults = results.filter((r) => r.category === "recipes");

      expect(recipeResults).toHaveLength(0);
    });

    it("shows recipes when visibility conditions are met", () => {
      const completed = makeCompleted({
        questStates: { request_for_strawberries: "completed" },
      } as Partial<CompletedState>);
      const progression = deriveProgressionState(completed, trackerData, false);

      const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
      const recipeResults = results.filter((r) => r.category === "recipes");

      expect(recipeResults).toHaveLength(1);
      expect(recipeResults[0].name).toBe("Strawberry Shortcake");
    });

    it("shows recipes when showSpoilers is enabled", () => {
      const completed = makeCompleted();
      const progression = deriveProgressionState(completed, trackerData, true);

      const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
      const recipeResults = results.filter((r) => r.category === "recipes");

      expect(recipeResults).toHaveLength(1);
      expect(recipeResults[0].name).toBe("Strawberry Shortcake");
    });

    it("marks recipe results as completed when in almanacRecipes", () => {
      const completed = makeCompleted({
        almanacRecipes: new Set(["strawberry_shortcake" as RecipeId]),
        questStates: { request_for_strawberries: "completed" },
      } as Partial<CompletedState>);
      const progression = deriveProgressionState(completed, trackerData, false);

      const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
      const recipeResults = results.filter((r) => r.category === "recipes");

      expect(recipeResults[0].completed).toBe(true);
    });
  });
});
