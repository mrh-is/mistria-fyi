import { describe, expect, it } from "vitest";

import {
  deriveProgressionState,
  isConditionInvertible,
  isVisible,
  redactionState,
} from "../visibility.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { NpcId, QuestId, TrackerData } from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { UserProgressionState } from "../visibility.js";

function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
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
    renown: 0,
    skillLevels: {},
    ...overrides,
  };
}

function makeState(overrides: Partial<UserProgressionState> = {}): UserProgressionState {
  return {
    knownNpcs: new Set(),
    marriedNpc: null,
    minesFloor: 0,
    npcLevels: {},
    questVisibility: {},
    renown: 0,
    showSpoilers: false,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

function makeTrackerData(overrides: Partial<TrackerData> = {}): TrackerData {
  return {
    almanac: [],
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    festivals: {},
    generatedAt: "",
    heartLevelChanges: {},
    items: {},
    mines: { biomes: [], maxFloors: 60, spells: {} },
    museum: [],
    npcs: {},
    npcVisibility: {},
    perks: {},
    perkTierLevels: [1, 15, 30, 45, 60],
    questChains: { crown: [], fetch: {}, heart: {}, stillwell: [], story: {}, tali: [] },
    questGates: {
      animalGates: {},
      itemGates: {},
      progressionFlagToQuests: {},
      spellGates: {},
    },
    quests: {},
    recipes: {},
    renown: { levelsPerRank: 10, ranks: [] },
    skills: {},
    sources: {},
    stores: {},
    storeVisibility: {},
    treasureChestTiers: {},
    version: "test",
    ...overrides,
  };
}

describe("isVisible", () => {
  it("always returns true", () => {
    expect(isVisible({ type: "always" }, makeState())).toBe(true);
  });

  it("questCompleted checks questVisibility", () => {
    const state = makeState({
      questVisibility: { repair_the_inn: "completed" },
    });
    expect(isVisible({ questId: "repair_the_inn" as QuestId, type: "questCompleted" }, state)).toBe(
      true,
    );
    expect(isVisible({ questId: "other_quest" as QuestId, type: "questCompleted" }, state)).toBe(
      false,
    );
  });

  it("questAvailable matches available or completed", () => {
    const state = makeState({
      questVisibility: {
        available_quest: "available",
        completed_quest: "completed",
        unavailable_quest: "unavailable",
      },
    });
    expect(
      isVisible({ questId: "available_quest" as QuestId, type: "questAvailable" }, state),
    ).toBe(true);
    expect(
      isVisible({ questId: "completed_quest" as QuestId, type: "questAvailable" }, state),
    ).toBe(true);
    expect(
      isVisible({ questId: "unavailable_quest" as QuestId, type: "questAvailable" }, state),
    ).toBe(false);
  });

  it("npcKnown checks knownNpcs set", () => {
    const state = makeState({ knownNpcs: new Set(["holt" as NpcId]) });
    expect(isVisible({ npcId: "holt" as NpcId, type: "npcKnown" }, state)).toBe(true);
    expect(isVisible({ npcId: "caldarus" as NpcId, type: "npcKnown" }, state)).toBe(false);
  });

  it("skillLevel checks >= threshold", () => {
    const state = makeState({ skillLevels: { farming: 30 } });
    expect(isVisible({ level: 30, skillId: "farming" as never, type: "skillLevel" }, state)).toBe(
      true,
    );
    expect(isVisible({ level: 31, skillId: "farming" as never, type: "skillLevel" }, state)).toBe(
      false,
    );
    expect(isVisible({ level: 1, skillId: "mining" as never, type: "skillLevel" }, state)).toBe(
      false,
    );
  });

  it("perkUnlocked checks set membership", () => {
    const state = makeState({ unlockedPerks: new Set(["magic_design" as never]) });
    expect(isVisible({ perkId: "magic_design" as never, type: "perkUnlocked" }, state)).toBe(true);
    expect(isVisible({ perkId: "other_perk" as never, type: "perkUnlocked" }, state)).toBe(false);
  });

  it("minesLevel checks >= floor", () => {
    const state = makeState({ minesFloor: 40 });
    expect(isVisible({ floor: 40, type: "minesLevel" }, state)).toBe(true);
    expect(isVisible({ floor: 41, type: "minesLevel" }, state)).toBe(false);
  });

  it("heartLevel checks npcLevels >= level", () => {
    const state = makeState({ npcLevels: { ryis: 4 } });
    expect(isVisible({ level: 4, npcId: "ryis" as NpcId, type: "heartLevel" }, state)).toBe(true);
    expect(isVisible({ level: 5, npcId: "ryis" as NpcId, type: "heartLevel" }, state)).toBe(false);
  });

  it("renownLevel checks >= level", () => {
    const state = makeState({ renown: 50 });
    expect(isVisible({ level: 50, type: "renownLevel" }, state)).toBe(true);
    expect(isVisible({ level: 51, type: "renownLevel" }, state)).toBe(false);
  });

  it("married checks marriedNpc", () => {
    const state = makeState({ marriedNpc: "adeline" as NpcId });
    expect(isVisible({ npcId: "adeline" as NpcId, type: "married" }, state)).toBe(true);
    expect(isVisible({ npcId: "reina" as NpcId, type: "married" }, state)).toBe(false);
  });

  it("and requires all sub-conditions", () => {
    const state = makeState({ minesFloor: 20, renown: 30 });
    const condition: VisibilityCondition = {
      conditions: [
        { floor: 20, type: "minesLevel" },
        { level: 30, type: "renownLevel" },
      ],
      type: "and",
    };
    expect(isVisible(condition, state)).toBe(true);

    const stateLow = makeState({ minesFloor: 20, renown: 10 });
    expect(isVisible(condition, stateLow)).toBe(false);
  });

  it("or requires any sub-condition", () => {
    const condition: VisibilityCondition = {
      conditions: [
        { floor: 20, type: "minesLevel" },
        { level: 30, type: "renownLevel" },
      ],
      type: "or",
    };
    expect(isVisible(condition, makeState({ minesFloor: 20 }))).toBe(true);
    expect(isVisible(condition, makeState({ renown: 30 }))).toBe(true);
    expect(isVisible(condition, makeState())).toBe(false);
  });

  it("showSpoilers bypasses all conditions", () => {
    const state = makeState({ showSpoilers: true });
    expect(isVisible({ questId: "any" as QuestId, type: "questCompleted" }, state)).toBe(true);
    expect(
      isVisible(
        {
          conditions: [
            { floor: 100, type: "minesLevel" },
            { level: 100, type: "renownLevel" },
          ],
          type: "and",
        },
        state,
      ),
    ).toBe(true);
  });
});

describe("redactionState", () => {
  it("returns visible when entity visibility is met", () => {
    const state = makeState({ minesFloor: 20 });
    expect(redactionState({ floor: 20, type: "minesLevel" }, undefined, state)).toBe("visible");
  });

  it("returns source-only when source is met but entity is not", () => {
    const state = makeState({ minesFloor: 20 });
    expect(
      redactionState({ floor: 40, type: "minesLevel" }, { floor: 20, type: "minesLevel" }, state),
    ).toBe("source-only");
  });

  it("returns redacted when neither is met", () => {
    const state = makeState();
    expect(
      redactionState({ floor: 40, type: "minesLevel" }, { floor: 20, type: "minesLevel" }, state),
    ).toBe("redacted");
  });

  it("returns redacted when entity not met and source is undefined", () => {
    const state = makeState();
    expect(redactionState({ floor: 40, type: "minesLevel" }, undefined, state)).toBe("redacted");
  });
});

describe("isConditionInvertible", () => {
  it("returns true for invertible primitives", () => {
    expect(isConditionInvertible({ questId: "q" as QuestId, type: "questCompleted" })).toBe(true);
    expect(isConditionInvertible({ level: 10, skillId: "s" as never, type: "skillLevel" })).toBe(
      true,
    );
    expect(isConditionInvertible({ floor: 10, type: "minesLevel" })).toBe(true);
    expect(isConditionInvertible({ perkId: "p" as never, type: "perkUnlocked" })).toBe(true);
    expect(isConditionInvertible({ npcId: "n" as NpcId, type: "married" })).toBe(true);
  });

  it("returns false for npcKnown", () => {
    expect(isConditionInvertible({ npcId: "n" as NpcId, type: "npcKnown" })).toBe(false);
  });

  it("returns false for and containing npcKnown", () => {
    expect(
      isConditionInvertible({
        conditions: [
          { npcId: "n" as NpcId, type: "npcKnown" },
          { floor: 10, type: "minesLevel" },
        ],
        type: "and",
      }),
    ).toBe(false);
  });

  it("returns true for and of invertible conditions", () => {
    expect(
      isConditionInvertible({
        conditions: [
          { floor: 10, type: "minesLevel" },
          { level: 20, type: "renownLevel" },
        ],
        type: "and",
      }),
    ).toBe(true);
  });
});

const repairTheInn = "repair_the_inn" as QuestId;
const theSecondQuest = "the_second_quest" as QuestId;
const firstQuest = "first_quest" as QuestId;
const breakingTheFinalSeal = "breaking_the_final_seal" as QuestId;
const breakingTheFireSeal = "breaking_the_fire_seal" as QuestId;
const seridia = "seridia" as NpcId;
const caldarus = "caldarus" as NpcId;
const holt = "holt" as NpcId;

const emptyStoryChains = {
  crown: [],
  fetch: {},
  heart: {},
  stillwell: [],
  story: {},
  tali: [],
};

describe("deriveProgressionState", () => {
  it("marks completed quests as completed", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
      quests: { story_quests: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const completed = makeCompleted({
      questStates: { [repairTheInn]: "completed" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.questVisibility[repairTheInn]).toBe("completed");
  });

  it("marks obtained quests as available", () => {
    const trackerData = makeTrackerData({
      questChains: {
        ...emptyStoryChains,
        story: { [theSecondQuest]: { prerequisites: [firstQuest] } },
      },
      quests: { story_quests: { [theSecondQuest]: { name: "Second" } } },
    });
    const completed = makeCompleted({
      questStates: { [theSecondQuest]: "obtained" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    // Obtained is unconditionally "available" even though its prerequisite isn't completed.
    expect(state.questVisibility[theSecondQuest]).toBe("available");
  });

  it("makes first story quest available when none completed", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [firstQuest]: { prerequisites: [] } } },
      quests: { story_quests: { [firstQuest]: { name: "First" } } },
    });
    const completed = makeCompleted();

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.questVisibility[firstQuest]).toBe("available");
  });

  it("marks NPC as known when unlock quest is completed", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [seridia]: { birthday: { day: 1, season: "spring" }, dateable: false, name: "Seridia" },
      },
      npcVisibility: {
        [seridia]: { questId: breakingTheFinalSeal, type: "questCompleted" },
      },
      questChains: {
        ...emptyStoryChains,
        story: { [breakingTheFinalSeal]: { prerequisites: [] } },
      },
      quests: {
        story_quests: { [breakingTheFinalSeal]: { name: "Breaking the Final Seal" } },
      },
    });

    const notYetCompleted = makeCompleted();
    const notYetState = deriveProgressionState(notYetCompleted, trackerData, false);
    expect(notYetState.knownNpcs.has(seridia)).toBe(false);

    const completed = makeCompleted({
      questStates: { [breakingTheFinalSeal]: "completed" },
    });
    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(seridia)).toBe(true);
  });

  it("masks NPC heart level to 0 when NPC not known", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [caldarus]: { birthday: { day: 1, season: "spring" }, dateable: false, name: "Caldarus" },
      },
      npcVisibility: {
        [caldarus]: { questId: breakingTheFireSeal, type: "questCompleted" },
      },
    });
    const completed = makeCompleted({ npcLevels: { [caldarus]: 4 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(caldarus)).toBe(false);
    expect(state.npcLevels[caldarus]).toBe(0);
  });

  it("passes through heart level when NPC is always-known", () => {
    const trackerData = makeTrackerData({
      npcs: { [holt]: { birthday: { day: 1, season: "spring" }, dateable: true, name: "Holt" } },
      npcVisibility: { [holt]: { type: "always" } },
    });
    const completed = makeCompleted({ npcLevels: { [holt]: 5 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(holt)).toBe(true);
    expect(state.npcLevels[holt]).toBe(5);
  });

  it("cascades heart level from heartLevelChanges once the triggering quest is completed", () => {
    const trackerData = makeTrackerData({
      heartLevelChanges: {
        [breakingTheFireSeal]: [{ level: 4, npcId: caldarus }],
      },
      npcs: {
        [caldarus]: { birthday: { day: 1, season: "spring" }, dateable: false, name: "Caldarus" },
      },
      npcVisibility: {
        [caldarus]: { questId: breakingTheFireSeal, type: "questCompleted" },
      },
      questChains: {
        ...emptyStoryChains,
        story: { [breakingTheFireSeal]: { prerequisites: [] } },
      },
      quests: {
        story_quests: { [breakingTheFireSeal]: { name: "Breaking the Fire Seal" } },
      },
    });
    const completed = makeCompleted({
      questStates: { [breakingTheFireSeal]: "completed" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(caldarus)).toBe(true);
    expect(state.npcLevels[caldarus]).toBe(4);
  });
});
