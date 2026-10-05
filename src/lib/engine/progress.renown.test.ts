import { describe, expect, it } from "vitest";

import { getCategoryProgress } from "./progress.js";

import type { CompletedState } from "#lib/types/user-progress.js";

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
});
