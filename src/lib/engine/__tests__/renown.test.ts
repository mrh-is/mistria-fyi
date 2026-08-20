import { afterEach, describe, expect, it } from "vitest";

import { type CompletedState, userState } from "$lib/stores/user-state.svelte.js";

import { getCategoryProgress } from "../progress.js";

function completedAtRenown(renown: number): CompletedState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    cosmetics: new Set(),
    marriedNpc: null,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    questStates: {},
    renown,
    skillLevels: {},
    unlockedPerks: new Set(),
  };
}

describe("renown maximum", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("reports max level as complete", () => {
    const progress = getCategoryProgress("renown", {
      availabilityMode: "everything",
      completed: completedAtRenown(110),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 110, filtered: 0, total: 110 });
  });

  it("normalizes progress saved above max level", () => {
    const progress = getCategoryProgress("renown", {
      availabilityMode: "everything",
      completed: completedAtRenown(120),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 110, filtered: 0, total: 110 });
  });

  it("clamps tracked renown to max level", () => {
    userState.setRenown(120);

    expect(userState.state.completed.renown).toBe(110);
  });
});
