import { afterEach, describe, expect, it } from "vitest";

import { type CompletedState, userState } from "$lib/stores/user-state.svelte.js";

import { getRenownProgress } from "../progress.js";

function completedAtRenown(renown: number): CompletedState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    cosmetics: new Set(),
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    questStates: {},
    renown,
    skillLevels: {},
  };
}

describe("renown maximum", () => {
  afterEach(() => {
    userState.resetAll();
  });

  it("reports level 100 as complete", () => {
    const progress = getRenownProgress({
      availabilityMode: "everything",
      completed: completedAtRenown(100),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });

  it("normalizes progress saved above level 100", () => {
    const progress = getRenownProgress({
      availabilityMode: "everything",
      completed: completedAtRenown(110),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });

  it("clamps tracked renown to level 100", () => {
    userState.setRenown(110);

    expect(userState.state.completed.renown).toBe(100);
  });
});
