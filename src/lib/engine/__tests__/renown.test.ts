import { afterEach, describe, expect, it } from "vitest";

import { type CompletedState, userState } from "$lib/stores/user-state.svelte.js";

import { getCategoryProgress } from "../progress";

function completedAtRenown(renown: number): CompletedState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    childChoice: "undeclared",
    cosmetics: new Set(),
    dates: new Set(),
    hasUpperFloor: false,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown,
    skillLevels: {},
    unlockedPerks: new Set(),
    villagerLevels: {},
    villagerRelationships: {},
  };
}

describe("renown maximum", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("reports max level as complete", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: "everything",
      completed: completedAtRenown(100),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });

  it("normalizes progress saved above max level", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: "everything",
      completed: completedAtRenown(120),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });

  it("clamps tracked renown to max level", () => {
    userState.setRenown(120);

    expect(userState.state.completed.renown).toBe(100);
  });
});
