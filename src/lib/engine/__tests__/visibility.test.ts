import { describe, expect, it } from "vitest";

import { deepMerge, type DeepPartial } from "$lib/utils/deep-partial.js";

import {
  deriveProgressionState,
  isConditionInvertible,
  isEntityNameVisible,
  isVisible,
  satisfyCondition,
} from "../visibility.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  SkillId,
  TrackerData,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { UserProgressionState } from "../visibility.js";

function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
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
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
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

function makeTrackerData(overrides: DeepPartial<TrackerData> = {}): TrackerData {
  const defaults: TrackerData = {
    almanac: {},
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    festivals: {},
    generatedAt: "",
    items: {},
    mines: { biomes: [], spells: {} },
    museum: [],
    npcs: {},
    perkTierLevels: [1, 15, 30, 45, 60],
    questChains: { crown: [], fetch: {}, heart: {}, stillwell: [], story: {}, tali: [] },
    questGates: {
      animalGates: {},
      itemGates: {},
      progressionFlagToQuests: {},
      spellGates: {},
    },
    quests: {
      cooking: {},
      crown: {},
      fetch: {},
      heart: {},
      mission: {},
      story: {},
    },
    recipes: {},
    skills: {},
    stores: {},
    townRanks: [],
    treasureChestTiers: {},
    version: "test",
  };
  return deepMerge(defaults, overrides);
}

describe("isVisible", () => {
  it("always returns true", () => {
    expect(isVisible({ type: "always" }, makeState())).toBe(true);
  });

  it("questCompleted checks questVisibility", () => {
    const state = makeState({
      questVisibility: { repair_the_inn: "completed" },
    });
    expect(isVisible({ type: "questCompleted", questId: "repair_the_inn" as QuestId }, state)).toBe(
      true,
    );
    expect(isVisible({ type: "questCompleted", questId: "other_quest" as QuestId }, state)).toBe(
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
      isVisible({ type: "questAvailable", questId: "available_quest" as QuestId }, state),
    ).toBe(true);
    expect(
      isVisible({ type: "questAvailable", questId: "completed_quest" as QuestId }, state),
    ).toBe(true);
    expect(
      isVisible({ type: "questAvailable", questId: "unavailable_quest" as QuestId }, state),
    ).toBe(false);
  });

  it("npcKnown checks knownNpcs set", () => {
    const state = makeState({ knownNpcs: new Set(["holt" as NpcId]) });
    expect(isVisible({ type: "npcKnown", npcId: "holt" as NpcId }, state)).toBe(true);
    expect(isVisible({ type: "npcKnown", npcId: "caldarus" as NpcId }, state)).toBe(false);
  });

  it("skillLevel checks >= threshold", () => {
    const state = makeState({ skillLevels: { farming: 30 } });
    expect(isVisible({ type: "skillLevel", level: 30, skillId: "farming" as never }, state)).toBe(
      true,
    );
    expect(isVisible({ type: "skillLevel", level: 31, skillId: "farming" as never }, state)).toBe(
      false,
    );
    expect(isVisible({ type: "skillLevel", level: 1, skillId: "mining" as never }, state)).toBe(
      false,
    );
  });

  it("perkUnlocked checks set membership", () => {
    const state = makeState({ unlockedPerks: new Set(["magic_design" as never]) });
    expect(isVisible({ type: "perkUnlocked", perkId: "magic_design" as never }, state)).toBe(true);
    expect(isVisible({ type: "perkUnlocked", perkId: "other_perk" as never }, state)).toBe(false);
  });

  it("minesLevel checks >= floor", () => {
    const state = makeState({ minesFloor: 40 });
    expect(isVisible({ type: "minesLevel", floor: 40 }, state)).toBe(true);
    expect(isVisible({ type: "minesLevel", floor: 41 }, state)).toBe(false);
  });

  it("heartLevel checks npcLevels >= level", () => {
    const state = makeState({ npcLevels: { ryis: 4 } });
    expect(isVisible({ type: "heartLevel", level: 4, npcId: "ryis" as NpcId }, state)).toBe(true);
    expect(isVisible({ type: "heartLevel", level: 5, npcId: "ryis" as NpcId }, state)).toBe(false);
  });

  it("renownLevel checks >= level", () => {
    const state = makeState({ renown: 50 });
    expect(isVisible({ type: "renownLevel", level: 50 }, state)).toBe(true);
    expect(isVisible({ type: "renownLevel", level: 51 }, state)).toBe(false);
  });

  it("married checks marriedNpc", () => {
    const state = makeState({ marriedNpc: "adeline" as NpcId });
    expect(isVisible({ type: "married", npcId: "adeline" as NpcId }, state)).toBe(true);
    expect(isVisible({ type: "married", npcId: "reina" as NpcId }, state)).toBe(false);
  });

  it("and requires all sub-conditions", () => {
    const state = makeState({ minesFloor: 20, renown: 30 });
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isVisible(condition, state)).toBe(true);

    const stateLow = makeState({ minesFloor: 20, renown: 10 });
    expect(isVisible(condition, stateLow)).toBe(false);
  });

  it("or requires any sub-condition", () => {
    const condition: VisibilityCondition = {
      type: "or",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isVisible(condition, makeState({ minesFloor: 20 }))).toBe(true);
    expect(isVisible(condition, makeState({ renown: 30 }))).toBe(true);
    expect(isVisible(condition, makeState())).toBe(false);
  });

  it("showSpoilers bypasses all conditions", () => {
    const state = makeState({ showSpoilers: true });
    expect(isVisible({ type: "questCompleted", questId: "any" as QuestId }, state)).toBe(true);
    expect(
      isVisible(
        {
          type: "and",
          conditions: [
            { type: "minesLevel", floor: 100 },
            { type: "renownLevel", level: 100 },
          ],
        },
        state,
      ),
    ).toBe(true);
  });
});

describe("isConditionInvertible", () => {
  it("returns true for invertible primitives", () => {
    expect(isConditionInvertible({ type: "questCompleted", questId: "q" as QuestId })).toBe(true);
    expect(isConditionInvertible({ type: "skillLevel", level: 10, skillId: "s" as never })).toBe(
      true,
    );
    expect(isConditionInvertible({ type: "minesLevel", floor: 10 })).toBe(true);
    expect(isConditionInvertible({ type: "perkUnlocked", perkId: "p" as never })).toBe(true);
    expect(isConditionInvertible({ type: "married", npcId: "n" as NpcId })).toBe(true);
  });

  it("returns false for npcKnown", () => {
    expect(isConditionInvertible({ type: "npcKnown", npcId: "n" as NpcId })).toBe(false);
  });

  it("returns false for and containing npcKnown", () => {
    expect(
      isConditionInvertible({
        type: "and",
        conditions: [
          { type: "npcKnown", npcId: "n" as NpcId },
          { type: "minesLevel", floor: 10 },
        ],
      }),
    ).toBe(false);
  });

  it("returns true for and of invertible conditions", () => {
    expect(
      isConditionInvertible({
        type: "and",
        conditions: [
          { type: "minesLevel", floor: 10 },
          { type: "renownLevel", level: 20 },
        ],
      }),
    ).toBe(true);
  });
});

const story_quests = "story_quests" as QuestType;
const crown_quests = "crown_quests" as QuestType;
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
      quests: { [story_quests]: { [repairTheInn]: { name: "Repair the Inn" } } },
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
      quests: { [story_quests]: { [theSecondQuest]: { name: "Second" } } },
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
      quests: { [story_quests]: { [firstQuest]: { name: "First" } } },
    });
    const completed = makeCompleted();

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.questVisibility[firstQuest]).toBe("available");
  });

  it("marks NPC as known when unlock quest is completed", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [seridia]: {
          birthday: { day: 1, season: "spring" },
          name: "Seridia",
          visibility: { type: "questCompleted", questId: breakingTheFinalSeal },
        },
      },
      questChains: {
        ...emptyStoryChains,
        story: { [breakingTheFinalSeal]: { prerequisites: [] } },
      },
      quests: {
        [story_quests]: { [breakingTheFinalSeal]: { name: "Breaking the Final Seal" } },
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
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          name: "Caldarus",
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
    });
    const completed = makeCompleted({ npcLevels: { [caldarus]: 4 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(caldarus)).toBe(false);
    expect(state.npcLevels[caldarus]).toBe(0);
  });

  it("passes through heart level when NPC is always-known", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [holt]: {
          birthday: { day: 1, season: "spring" },
          dateable: true,
          name: "Holt",
          visibility: { type: "always" },
        },
      },
    });
    const completed = makeCompleted({ npcLevels: { [holt]: 5 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownNpcs.has(holt)).toBe(true);
    expect(state.npcLevels[holt]).toBe(5);
  });

  it("cascades heart level from heartLevelChanges once the triggering quest is completed", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          name: "Caldarus",
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
      questChains: {
        ...emptyStoryChains,
        story: { [breakingTheFireSeal]: { prerequisites: [] } },
      },
      quests: {
        [story_quests]: {
          [breakingTheFireSeal]: {
            heartLevelChanges: [{ level: 4, npcId: caldarus }],
            name: "Breaking the Fire Seal",
          },
        },
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

describe("satisfyCondition", () => {
  it("does nothing for always", () => {
    const completed = makeCompleted();
    satisfyCondition({ type: "always" }, completed, makeTrackerData());
    expect(completed).toEqual(makeCompleted());
  });

  it("does nothing for npcKnown (not invertible)", () => {
    const completed = makeCompleted();
    satisfyCondition({ type: "npcKnown", npcId: holt }, completed, makeTrackerData());
    expect(completed.questStates).toEqual({});
  });

  it("sets minesLevel to max of current and required", () => {
    const completed = makeCompleted({ mines: { floor: 10, spells: new Set() } });
    satisfyCondition({ type: "minesLevel", floor: 20 }, completed, makeTrackerData());
    expect(completed.mines.floor).toBe(20);
  });

  it("does not lower minesLevel", () => {
    const completed = makeCompleted({ mines: { floor: 40, spells: new Set() } });
    satisfyCondition({ type: "minesLevel", floor: 20 }, completed, makeTrackerData());
    expect(completed.mines.floor).toBe(40);
  });

  it("sets renownLevel", () => {
    const completed = makeCompleted({ renown: 5 });
    satisfyCondition({ type: "renownLevel", level: 20 }, completed, makeTrackerData());
    expect(completed.renown).toBe(20);
  });

  it("sets skillLevel", () => {
    const completed = makeCompleted();
    const skillId = "cooking" as SkillId;
    satisfyCondition({ type: "skillLevel", level: 15, skillId }, completed, makeTrackerData());
    expect(completed.skillLevels[skillId as string]).toBe(15);
  });

  it("sets heartLevel", () => {
    const completed = makeCompleted();
    satisfyCondition({ type: "heartLevel", level: 6, npcId: holt }, completed, makeTrackerData());
    expect(completed.npcLevels[holt as string]).toBe(6);
  });

  it("takes max of heartLevel", () => {
    const completed = makeCompleted({ npcLevels: { [holt]: 8 } });
    satisfyCondition({ type: "heartLevel", level: 6, npcId: holt }, completed, makeTrackerData());
    expect(completed.npcLevels[holt as string]).toBe(8);
  });

  it("adds perkUnlocked", () => {
    const completed = makeCompleted();
    const perkId = "magic_design" as PerkId;
    satisfyCondition({ type: "perkUnlocked", perkId }, completed, makeTrackerData());
    expect(completed.unlockedPerks.has(perkId)).toBe(true);
  });

  it("sets marriedNpc", () => {
    const completed = makeCompleted();
    satisfyCondition({ type: "married", npcId: holt }, completed, makeTrackerData());
    expect(completed.marriedNpc).toBe(holt);
  });

  it("marks quest as completed for questCompleted", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
      quests: { [story_quests]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const completed = makeCompleted();
    satisfyCondition({ type: "questCompleted", questId: repairTheInn }, completed, trackerData);
    expect(completed.questStates[repairTheInn as string]).toBe("completed");
  });

  it("satisfies and by satisfying all sub-conditions", () => {
    const completed = makeCompleted();
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "minesLevel", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    satisfyCondition(condition, completed, makeTrackerData());
    expect(completed.mines.floor).toBe(20);
    expect(completed.renown).toBe(30);
  });

  it("satisfies or by picking the first invertible branch", () => {
    const completed = makeCompleted();
    const condition: VisibilityCondition = {
      type: "or",
      conditions: [
        { type: "npcKnown", npcId: holt },
        { type: "minesLevel", floor: 20 },
      ],
    };
    satisfyCondition(condition, completed, makeTrackerData());
    expect(completed.mines.floor).toBe(20);
  });

  it("completes quest prerequisites when satisfying a chained quest", () => {
    const trackerData = makeTrackerData({
      questChains: {
        ...emptyStoryChains,
        story: {
          [firstQuest]: { prerequisites: [] },
          [theSecondQuest]: { prerequisites: [firstQuest] },
        },
      },
      quests: {
        [story_quests]: {
          [firstQuest]: { name: "First" },
          [theSecondQuest]: { name: "Second" },
        },
      },
    });
    const completed = makeCompleted();
    satisfyCondition({ type: "questCompleted", questId: theSecondQuest }, completed, trackerData);
    expect(completed.questStates[firstQuest as string]).toBe("completed");
    expect(completed.questStates[theSecondQuest as string]).toBe("completed");
  });

  it("marks ordered chain predecessors completed for questAvailable", () => {
    const thirdCrown = "crown_3" as QuestId;
    const trackerData = makeTrackerData({
      categoryVisibility: { crown_quests: { type: "always" } },
      questChains: {
        ...emptyStoryChains,
        crown: [firstQuest, theSecondQuest, thirdCrown],
      },
      quests: {
        [crown_quests]: {
          [firstQuest]: { name: "Crown 1" },
          [theSecondQuest]: { name: "Crown 2" },
          [thirdCrown]: { name: "Crown 3" },
        },
      },
    });
    const completed = makeCompleted();
    satisfyCondition({ type: "questAvailable", questId: thirdCrown }, completed, trackerData);
    expect(completed.questStates[firstQuest as string]).toBe("completed");
    expect(completed.questStates[theSecondQuest as string]).toBe("completed");
    expect(completed.questStates[thirdCrown as string]).toBeUndefined();
  });
});

describe("satisfyCondition → deriveProgressionState round-trips", () => {
  it("hides then reveals an entity after satisfying its condition", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
      quests: { [story_quests]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };

    const completed = makeCompleted();
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isEntityNameVisible(entityCondition, stateBefore)).toBe(false);

    satisfyCondition(entityCondition, completed, trackerData);
    const stateAfter = deriveProgressionState(completed, trackerData, false);
    expect(isEntityNameVisible(entityCondition, stateAfter)).toBe(true);
  });

  it("reveals source detail and entity name at their separate thresholds", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
      quests: { [story_quests]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };
    const sourceCondition: VisibilityCondition = { type: "minesLevel", floor: 20 };

    const completed = makeCompleted();
    const state1 = deriveProgressionState(completed, trackerData, false);
    expect(isEntityNameVisible(entityCondition, state1)).toBe(false);
    expect(isVisible(sourceCondition, state1)).toBe(false);

    completed.mines.floor = 20;
    const state2 = deriveProgressionState(completed, trackerData, false);
    expect(isEntityNameVisible(entityCondition, state2)).toBe(false);
    expect(isVisible(sourceCondition, state2)).toBe(true);

    satisfyCondition(entityCondition, completed, trackerData);
    const state3 = deriveProgressionState(completed, trackerData, false);
    expect(isEntityNameVisible(entityCondition, state3)).toBe(true);
    expect(isVisible(sourceCondition, state3)).toBe(true);
  });

  it("satisfying a quest reveals NPC-gated content", () => {
    const trackerData = makeTrackerData({
      npcs: {
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          name: "Caldarus",
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
      questChains: {
        ...emptyStoryChains,
        story: { [breakingTheFireSeal]: { prerequisites: [] } },
      },
      quests: {
        [story_quests]: { [breakingTheFireSeal]: { name: "Breaking the Fire Seal" } },
      },
    });
    const npcKnownCondition: VisibilityCondition = { type: "npcKnown", npcId: caldarus };

    const completed = makeCompleted();
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isVisible(npcKnownCondition, stateBefore)).toBe(false);

    satisfyCondition(
      { type: "questCompleted", questId: breakingTheFireSeal },
      completed,
      trackerData,
    );
    const stateAfter = deriveProgressionState(completed, trackerData, false);
    expect(isVisible(npcKnownCondition, stateAfter)).toBe(true);
  });

  it("completing a chain quest cascades visibility to gated items", () => {
    const trackerData = makeTrackerData({
      questChains: {
        ...emptyStoryChains,
        story: {
          [firstQuest]: { prerequisites: [] },
          [theSecondQuest]: { prerequisites: [firstQuest] },
        },
      },
      quests: {
        [story_quests]: {
          [firstQuest]: { name: "First" },
          [theSecondQuest]: { name: "Second" },
        },
      },
    });
    const gatedBehindSecond: VisibilityCondition = {
      type: "questCompleted",
      questId: theSecondQuest,
    };

    const completed = makeCompleted();
    satisfyCondition(gatedBehindSecond, completed, trackerData);
    const state = deriveProgressionState(completed, trackerData, false);

    expect(state.questVisibility[firstQuest as string]).toBe("completed");
    expect(state.questVisibility[theSecondQuest as string]).toBe("completed");
    expect(isVisible(gatedBehindSecond, state)).toBe(true);
  });

  it("just-this-item does not cascade quest state", () => {
    const trackerData = makeTrackerData({
      questChains: { ...emptyStoryChains, story: { [repairTheInn]: { prerequisites: [] } } },
      quests: { [story_quests]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };

    const completed = makeCompleted();
    // "Just this item" means toggling the checkbox without calling satisfyCondition.
    // The quest state should not change.
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isVisible(entityCondition, stateBefore)).toBe(false);

    // Simulate: user checks item off but doesn't satisfy the condition.
    // The item is now "completed" in the almanac/recipes, but the underlying quest is untouched.
    expect(completed.questStates[repairTheInn as string]).toBeUndefined();
  });
});
