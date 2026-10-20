import { describe, expect, it } from "vitest";

import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { deepMerge } from "#lib/test-utils/deep-partial.js";
import { recordKeys } from "#lib/utils/record.js";

import {
  canPlanConditionMutations,
  deriveProgressionState,
  isConditionVisible,
  planConditionMutations as planCondition,
} from "./visibility.js";

import type { DeepPartial } from "#lib/test-utils/deep-partial.js";
import type {
  PerkId,
  QuestId,
  QuestType,
  SkillId,
  StoryQuest,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { UserProgressionState } from "./visibility.js";

function makeState(overrides: Partial<UserProgressionState> = {}): UserProgressionState {
  return {
    hasUpperFloor: false,
    heartLevels: {},
    isDating: false,
    knownVillagers: new Set(),
    marriedVillager: null,
    mineFloor: 0,
    questVisibility: {},
    reachedSeason: "spring" as const,
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
    categoryVisibility: {
      cooking: { type: "always" },
      crown: { type: "always" },
      fetch: { type: "always" },
      heart: { type: "always" },
      mission: { type: "always" },
      story: { type: "always" },
    },
    cosmetics: {},
    cosmeticSlots: {} as TrackerData["cosmeticSlots"],
    dates: {},
    festivals: {},
    items: {},
    mines: { biomes: [], spells: {} },
    mount: { appearances: {} },
    museum: {},
    perkTierLevels: [1, 15, 30, 45, 60],
    pets: { cosmetics: {}, skins: {} },
    pregnancyQuestByVillager: {},
    questOrder: {},
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
    villagers: {},
  };
  return deepMerge(defaults, overrides);
}

describe("isConditionVisible", () => {
  it("always returns true", () => {
    expect(isConditionVisible({ type: "always" }, makeState())).toBe(true);
  });

  it("questCompleted checks questVisibility", () => {
    const state = makeState({
      questVisibility: { ["repair_the_inn" as QuestId]: "completed" },
    });
    expect(
      isConditionVisible({ type: "questCompleted", questId: "repair_the_inn" as QuestId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "questCompleted", questId: "other_quest" as QuestId }, state),
    ).toBe(false);
  });

  it("questAvailable matches available or completed", () => {
    const state = makeState({
      questVisibility: {
        ["available_quest" as QuestId]: "available",
        ["completed_quest" as QuestId]: "completed",
        ["unavailable_quest" as QuestId]: "unavailable",
      },
    });
    expect(
      isConditionVisible({ type: "questAvailable", questId: "available_quest" as QuestId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "questAvailable", questId: "completed_quest" as QuestId }, state),
    ).toBe(true);
    expect(
      isConditionVisible(
        { type: "questAvailable", questId: "unavailable_quest" as QuestId },
        state,
      ),
    ).toBe(false);
  });

  it("villagerKnown checks knownVillagers set", () => {
    const state = makeState({ knownVillagers: new Set(["holt" as VillagerId]) });
    expect(
      isConditionVisible({ type: "villagerKnown", villagerId: "holt" as VillagerId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "villagerKnown", villagerId: "caldarus" as VillagerId }, state),
    ).toBe(false);
  });

  it("skillLevel checks >= threshold", () => {
    const state = makeState({ skillLevels: { ["farming" as SkillId]: 30 } });
    expect(
      isConditionVisible({ type: "skillLevel", level: 30, skillId: "farming" as SkillId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "skillLevel", level: 31, skillId: "farming" as SkillId }, state),
    ).toBe(false);
    expect(
      isConditionVisible({ type: "skillLevel", level: 1, skillId: "mining" as SkillId }, state),
    ).toBe(false);
  });

  it("perkUnlocked checks set membership", () => {
    const state = makeState({ unlockedPerks: new Set(["magic_design" as PerkId]) });
    expect(
      isConditionVisible({ type: "perkUnlocked", perkId: "magic_design" as PerkId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "perkUnlocked", perkId: "other_perk" as PerkId }, state),
    ).toBe(false);
  });

  it("mineFloor checks >= floor", () => {
    const state = makeState({ mineFloor: 40 });
    expect(isConditionVisible({ type: "mineFloor", floor: 40 }, state)).toBe(true);
    expect(isConditionVisible({ type: "mineFloor", floor: 41 }, state)).toBe(false);
  });

  it("heartLevel checks heartLevels >= level", () => {
    const state = makeState({ heartLevels: { ["ryis" as VillagerId]: 4 } });
    expect(
      isConditionVisible({ type: "heartLevel", level: 4, villagerId: "ryis" as VillagerId }, state),
    ).toBe(true);
    expect(
      isConditionVisible({ type: "heartLevel", level: 5, villagerId: "ryis" as VillagerId }, state),
    ).toBe(false);
  });

  it("renownLevel checks >= level", () => {
    const state = makeState({ renown: 50 });
    expect(isConditionVisible({ type: "renownLevel", level: 50 }, state)).toBe(true);
    expect(isConditionVisible({ type: "renownLevel", level: 51 }, state)).toBe(false);
  });

  it("married checks marriedVillager", () => {
    const state = makeState({ marriedVillager: "adeline" as VillagerId });
    expect(
      isConditionVisible({ type: "married", villagerId: "adeline" as VillagerId }, state),
    ).toBe(true);
    expect(isConditionVisible({ type: "married", villagerId: "reina" as VillagerId }, state)).toBe(
      false,
    );
  });

  it("and requires all sub-conditions", () => {
    const state = makeState({ mineFloor: 20, renown: 30 });
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "mineFloor", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isConditionVisible(condition, state)).toBe(true);

    const stateLow = makeState({ mineFloor: 20, renown: 10 });
    expect(isConditionVisible(condition, stateLow)).toBe(false);
  });

  it("or requires any sub-condition", () => {
    const condition: VisibilityCondition = {
      type: "or",
      conditions: [
        { type: "mineFloor", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    expect(isConditionVisible(condition, makeState({ mineFloor: 20 }))).toBe(true);
    expect(isConditionVisible(condition, makeState({ renown: 30 }))).toBe(true);
    expect(isConditionVisible(condition, makeState())).toBe(false);
  });

  it("showSpoilers bypasses all conditions", () => {
    const state = makeState({ showSpoilers: true });
    expect(isConditionVisible({ type: "questCompleted", questId: "any" as QuestId }, state)).toBe(
      true,
    );
    expect(
      isConditionVisible(
        {
          type: "and",
          conditions: [
            { type: "mineFloor", floor: 100 },
            { type: "renownLevel", level: 100 },
          ],
        },
        state,
      ),
    ).toBe(true);
  });
});

describe("canPlanConditionMutations", () => {
  it("returns true for invertible primitives", () => {
    expect(canPlanConditionMutations({ type: "questCompleted", questId: "q" as QuestId })).toBe(
      true,
    );
    expect(
      canPlanConditionMutations({ type: "skillLevel", level: 10, skillId: "s" as SkillId }),
    ).toBe(true);
    expect(canPlanConditionMutations({ type: "mineFloor", floor: 10 })).toBe(true);
    expect(canPlanConditionMutations({ type: "perkUnlocked", perkId: "p" as PerkId })).toBe(true);
    expect(canPlanConditionMutations({ type: "married", villagerId: "n" as VillagerId })).toBe(
      true,
    );
  });

  it("returns false for isDating (requires Villager choice)", () => {
    expect(canPlanConditionMutations({ type: "isDating" })).toBe(false);
  });

  it("returns false for villagerKnown", () => {
    expect(
      canPlanConditionMutations({ type: "villagerKnown", villagerId: "n" as VillagerId }),
    ).toBe(false);
  });

  it("returns false for and containing villagerKnown", () => {
    expect(
      canPlanConditionMutations({
        type: "and",
        conditions: [
          { type: "villagerKnown", villagerId: "n" as VillagerId },
          { type: "mineFloor", floor: 10 },
        ],
      }),
    ).toBe(false);
  });

  it("returns true for and of invertible conditions", () => {
    expect(
      canPlanConditionMutations({
        type: "and",
        conditions: [
          { type: "mineFloor", floor: 10 },
          { type: "renownLevel", level: 20 },
        ],
      }),
    ).toBe(true);
  });
});

const story = "story" as QuestType;
const crown = "crown" as QuestType;
const repairTheInn = "repair_the_inn" as QuestId;
const theSecondQuest = "the_second_quest" as QuestId;
const firstQuest = "first_quest" as QuestId;
const breakingTheFinalSeal = "breaking_the_final_seal" as QuestId;
const breakingTheFireSeal = "breaking_the_fire_seal" as QuestId;
const seridia = "seridia" as VillagerId;
const caldarus = "caldarus" as VillagerId;
const holt = "holt" as VillagerId;

describe("deriveProgressionState", () => {
  it("marks completed quests as completed", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const completed = makeCompletedState({
      questStates: { [repairTheInn]: "completed" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.questVisibility[repairTheInn]).toBe("completed");
  });

  it("marks obtained quests as available", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: {
          [theSecondQuest]: {
            name: "Second",
            visibility: { type: "questCompleted", questId: firstQuest },
          },
        },
      },
    });
    const completed = makeCompletedState({
      questStates: { [theSecondQuest]: "obtained" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    // Obtained is unconditionally "available" even though its prerequisite isn't completed.
    expect(state.questVisibility[theSecondQuest]).toBe("available");
  });

  it("makes first story quest available when none completed", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [firstQuest]: { name: "First" } } },
    });
    const completed = makeCompletedState();

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.questVisibility[firstQuest]).toBe("available");
  });

  it("marks Villager as known when unlock quest is completed", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: { [breakingTheFinalSeal]: { name: "Breaking the Final Seal" } },
      },
      villagers: {
        [seridia]: {
          birthday: { day: 1, season: "spring" },
          visibility: { type: "questCompleted", questId: breakingTheFinalSeal },
        },
      },
    });

    const notYetCompleted = makeCompletedState();
    const notYetState = deriveProgressionState(notYetCompleted, trackerData, false);
    expect(notYetState.knownVillagers.has(seridia)).toBe(false);

    const completed = makeCompletedState({
      questStates: { [breakingTheFinalSeal]: "completed" },
    });
    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownVillagers.has(seridia)).toBe(true);
  });

  it("masks Villager heart level to 0 when Villager not known", () => {
    const trackerData = makeTrackerData({
      villagers: {
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
    });
    const completed = makeCompletedState({ heartLevels: { [caldarus]: 4 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownVillagers.has(caldarus)).toBe(false);
    expect(state.heartLevels[caldarus]).toBe(0);
  });

  it("passes through heart level when Villager is always-known", () => {
    const trackerData = makeTrackerData({
      villagers: {
        [holt]: {
          birthday: { day: 1, season: "spring" },
          dateable: true,
          visibility: { type: "always" },
        },
      },
    });
    const completed = makeCompletedState({ heartLevels: { [holt]: 5 } });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownVillagers.has(holt)).toBe(true);
    expect(state.heartLevels[holt]).toBe(5);
  });

  it("cascades heart level from heartLevelChanges once the triggering quest is completed", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: {
          [breakingTheFireSeal]: {
            heartLevelChanges: [{ level: 4, villagerId: caldarus }],
            name: "Breaking the Fire Seal",
          },
        },
      },
      villagers: {
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
    });
    const completed = makeCompletedState({
      questStates: { [breakingTheFireSeal]: "completed" },
    });

    const state = deriveProgressionState(completed, trackerData, false);
    expect(state.knownVillagers.has(caldarus)).toBe(true);
    expect(state.heartLevels[caldarus]).toBe(4);
  });

  it("uses recorded quest acquisition for ordered gates & derived availability for display", () => {
    const prerequisite = "prerequisite" as QuestId;
    const ordered = "ordered" as QuestId;
    const dependent = "dependent" as QuestId;
    const condition: VisibilityCondition = { type: "questAvailable", questId: prerequisite };
    const data = makeTrackerData({
      categoryVisibility: { crown: condition },
      questOrder: { crown: [ordered] },
      quests: {
        crown: { [ordered]: {} },
        story: {
          [dependent]: { visibility: condition },
          [prerequisite]: {},
        },
      },
    });
    const completed = makeCompletedState();
    const state = deriveProgressionState(completed, data, false);
    expect(state.questVisibility[prerequisite]).toBe("available");
    expect(state.questVisibility[dependent]).toBe("available");
    expect(state.questVisibility[ordered]).toBe("unavailable");
    expect(isConditionVisible(condition, state)).toBe(true);
    completed.questStates[prerequisite] = "obtained";
    expect(deriveProgressionState(completed, data, false).questVisibility[ordered]).toBe(
      "available",
    );
  });

  it("uses raw heart levels for quest gates & maximum cascaded levels for display", () => {
    const ordered = "ordered" as QuestId;
    const dependent = "dependent" as QuestId;
    const secondCascade = "second_cascade" as QuestId;
    const condition: VisibilityCondition = { type: "heartLevel", level: 3, villagerId: holt };
    const data = makeTrackerData({
      categoryVisibility: { crown: condition },
      questOrder: { crown: [ordered] },
      quests: {
        crown: { [ordered]: {} },
        story: {
          [breakingTheFireSeal]: {
            heartLevelChanges: [{ level: 4, villagerId: holt }],
          },
          [dependent]: { visibility: condition },
          [secondCascade]: {
            heartLevelChanges: [{ level: 2, villagerId: holt }],
          },
        },
      },
      villagers: { [holt]: { birthday: { day: 1, season: "spring" } } },
    });
    const completed = makeCompletedState({
      heartLevels: { [holt]: 1 },
      questStates: { [breakingTheFireSeal]: "completed", [secondCascade]: "completed" },
    });
    const state = deriveProgressionState(completed, data, false);
    expect(state.heartLevels[holt]).toBe(4);
    expect(state.questVisibility[ordered]).toBe("unavailable");
    expect(state.questVisibility[dependent]).toBe("unavailable");
    expect(isConditionVisible(condition, state)).toBe(true);
  });

  it("evaluates ordered villager-known gates from recorded progress", () => {
    const prerequisite = "prerequisite" as QuestId;
    const ordered = "ordered" as QuestId;
    const data = makeTrackerData({
      categoryVisibility: { crown: { type: "villagerKnown", villagerId: holt } },
      questOrder: { crown: [ordered] },
      quests: {
        crown: { [ordered]: {} },
        story: { [prerequisite]: {} },
      },
      villagers: {
        [holt]: {
          birthday: { day: 1, season: "spring" },
          visibility: { type: "questAvailable", questId: prerequisite },
        },
      },
    });
    const completed = makeCompletedState();
    const state = deriveProgressionState(completed, data, false);
    expect(state.knownVillagers.has(holt)).toBe(true);
    expect(state.questVisibility[ordered]).toBe("unavailable");
    completed.questStates[prerequisite] = "obtained";
    expect(deriveProgressionState(completed, data, false).questVisibility[ordered]).toBe(
      "available",
    );
  });

  describe("prerequisites on quests later in key order", () => {
    const summitStairs = "repair_the_summit_stairs" as QuestId;
    const generalStore = "repair_the_general_store" as QuestId;
    const signScroll = "crop_sign_scroll_bundle" as QuestId;
    const mission = "mission" as QuestType;

    // Dependents first, so a single pass in key order reads prerequisites it hasn't evaluated yet.
    const storyQuests: [QuestId, Partial<StoryQuest>][] = [
      [signScroll, { visibility: { type: "questAvailable", questId: generalStore } }],
      [generalStore, { visibility: { type: "questCompleted", questId: summitStairs } }],
    ];
    const missionQuests: [QuestId, Partial<StoryQuest>][] = [[summitStairs, {}]];

    function makeOrderedTrackerData(
      questTypeOrder: QuestType[],
      storyEntries: typeof storyQuests,
    ): TrackerData {
      const trackerData = makeTrackerData();
      const byType: Partial<Record<QuestType, typeof storyQuests>> = {
        [mission]: missionQuests,
        [story]: storyEntries,
      };
      const quests = Object.fromEntries(
        questTypeOrder.map((questType) => [questType, Object.fromEntries(byType[questType] ?? [])]),
      ) as TrackerData["quests"];
      return { ...trackerData, quests };
    }

    const allTypes = recordKeys(makeTrackerData().quests);

    it("resolves a chain whose prerequisites come later in key order", () => {
      const trackerData = makeOrderedTrackerData(
        [story, ...allTypes.filter((t) => t !== story)],
        storyQuests,
      );
      const completed = makeCompletedState({ questStates: { [summitStairs]: "completed" } });

      const state = deriveProgressionState(completed, trackerData, false);
      expect(state.questVisibility[generalStore]).toBe("available");
      expect(state.questVisibility[signScroll]).toBe("available");
    });

    it("produces identical visibility for every quest key order", () => {
      const completed = makeCompletedState({ questStates: { [summitStairs]: "completed" } });
      const typeOrders = [allTypes, [...allTypes].toReversed()];
      const storyOrders = [storyQuests, [...storyQuests].toReversed()];

      const results = typeOrders.flatMap((typeOrder) =>
        storyOrders.map(
          (storyOrder) =>
            deriveProgressionState(completed, makeOrderedTrackerData(typeOrder, storyOrder), false)
              .questVisibility,
        ),
      );
      for (const result of results) expect(result).toEqual(results[0]);
      expect(results[0][signScroll]).toBe("available");
    });

    it("leaves a prerequisite cycle unavailable", () => {
      const cycleA = "cycle_a" as QuestId;
      const cycleB = "cycle_b" as QuestId;
      const trackerData = makeTrackerData({
        quests: {
          [story]: {
            [cycleA]: { name: "A", visibility: { type: "questAvailable", questId: cycleB } },
            [cycleB]: { name: "B", visibility: { type: "questAvailable", questId: cycleA } },
          },
        },
      });

      const state = deriveProgressionState(makeCompletedState(), trackerData, false);
      expect(state.questVisibility[cycleA]).toBe("unavailable");
      expect(state.questVisibility[cycleB]).toBe("unavailable");
    });
  });
});

function planConditionMutations(
  condition: VisibilityCondition,
  completed: ProgressState,
  data: TrackerData,
): void {
  for (const mutation of planCondition(condition, completed, data)) {
    switch (mutation.type) {
      case "hasUpperFloor":
        completed.hasUpperFloor = true;
        break;
      case "heartLevel":
        completed.heartLevels[mutation.villagerId] = mutation.level;
        break;
      case "married":
        completed.villagerRelationships[mutation.villagerId] = "married";
        break;
      case "mineFloor":
        completed.mineFloor = mutation.floor;
        break;
      case "perkUnlocked":
        completed.unlockedPerks.add(mutation.perkId);
        break;
      case "questCompleted":
        completed.questStates[mutation.questId] = "completed";
        break;
      case "reachedSeason":
        completed.reachedSeason = mutation.season;
        break;
      case "renownLevel":
        completed.renown = mutation.level;
        break;
      case "skillLevel":
        completed.skillLevels[mutation.skillId] = mutation.level;
        break;
    }
  }
}

describe("planConditionMutations", () => {
  it("returns mutations without changing nested records or sets", () => {
    const completed = makeCompletedState();
    const before = makeCompletedState();
    const perkId = "test_perk" as PerkId;
    const mutations = planCondition(
      {
        type: "and",
        conditions: [
          { type: "renownLevel", level: 20 },
          { type: "perkUnlocked", perkId },
          { type: "married", villagerId: holt },
        ],
      },
      completed,
      makeTrackerData(),
    );
    expect(completed).toEqual(before);
    expect(mutations).toEqual([
      { type: "renownLevel", level: 20 },
      { type: "perkUnlocked", perkId },
      { type: "married", villagerId: holt },
    ]);
  });

  it("does nothing for always", () => {
    const completed = makeCompletedState();
    planConditionMutations({ type: "always" }, completed, makeTrackerData());
    expect(completed).toEqual(makeCompletedState());
  });

  it("does nothing for villagerKnown (not invertible)", () => {
    const completed = makeCompletedState();
    planConditionMutations(
      { type: "villagerKnown", villagerId: holt },
      completed,
      makeTrackerData(),
    );
    expect(completed.questStates).toEqual({});
  });

  it("sets mineFloor to max of current and required", () => {
    const completed = makeCompletedState({ mineFloor: 10 });
    planConditionMutations({ type: "mineFloor", floor: 20 }, completed, makeTrackerData());
    expect(completed.mineFloor).toBe(20);
  });

  it("does not lower mineFloor", () => {
    const completed = makeCompletedState({ mineFloor: 40 });
    planConditionMutations({ type: "mineFloor", floor: 20 }, completed, makeTrackerData());
    expect(completed.mineFloor).toBe(40);
  });

  it("sets renownLevel", () => {
    const completed = makeCompletedState({ renown: 5 });
    planConditionMutations({ type: "renownLevel", level: 20 }, completed, makeTrackerData());
    expect(completed.renown).toBe(20);
  });

  it("sets skillLevel", () => {
    const completed = makeCompletedState();
    const skillId = "cooking" as SkillId;
    planConditionMutations(
      { type: "skillLevel", level: 15, skillId },
      completed,
      makeTrackerData(),
    );
    expect(completed.skillLevels[skillId]).toBe(15);
  });

  it("sets heartLevel", () => {
    const completed = makeCompletedState();
    planConditionMutations(
      { type: "heartLevel", level: 6, villagerId: holt },
      completed,
      makeTrackerData(),
    );
    expect(completed.heartLevels[holt]).toBe(6);
  });

  it("takes max of heartLevel", () => {
    const completed = makeCompletedState({ heartLevels: { [holt]: 8 } });
    planConditionMutations(
      { type: "heartLevel", level: 6, villagerId: holt },
      completed,
      makeTrackerData(),
    );
    expect(completed.heartLevels[holt]).toBe(8);
  });

  it("adds perkUnlocked", () => {
    const completed = makeCompletedState();
    const perkId = "magic_design" as PerkId;
    planConditionMutations({ type: "perkUnlocked", perkId }, completed, makeTrackerData());
    expect(completed.unlockedPerks.has(perkId)).toBe(true);
  });

  it("does not modify state for isDating (requires Villager choice)", () => {
    const completed = makeCompletedState();
    planConditionMutations({ type: "isDating" }, completed, makeTrackerData());
    expect(Object.keys(completed.villagerRelationships)).toHaveLength(0);
  });

  it("sets villagerRelationships to married", () => {
    const completed = makeCompletedState();
    planConditionMutations({ type: "married", villagerId: holt }, completed, makeTrackerData());
    expect(completed.villagerRelationships[holt]).toBe("married");
  });

  it("marks quest as completed for questCompleted", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const completed = makeCompletedState();
    planConditionMutations(
      { type: "questCompleted", questId: repairTheInn },
      completed,
      trackerData,
    );
    expect(completed.questStates[repairTheInn]).toBe("completed");
  });

  it("satisfies and by satisfying all sub-conditions", () => {
    const completed = makeCompletedState();
    const condition: VisibilityCondition = {
      type: "and",
      conditions: [
        { type: "mineFloor", floor: 20 },
        { type: "renownLevel", level: 30 },
      ],
    };
    planConditionMutations(condition, completed, makeTrackerData());
    expect(completed.mineFloor).toBe(20);
    expect(completed.renown).toBe(30);
  });

  it("satisfies or by picking the first invertible branch", () => {
    const completed = makeCompletedState();
    const condition: VisibilityCondition = {
      type: "or",
      conditions: [
        { type: "villagerKnown", villagerId: holt },
        { type: "mineFloor", floor: 20 },
      ],
    };
    planConditionMutations(condition, completed, makeTrackerData());
    expect(completed.mineFloor).toBe(20);
  });

  it("completes quest prerequisites when satisfying a chained quest", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: {
          [firstQuest]: { name: "First" },
          [theSecondQuest]: {
            name: "Second",
            visibility: { type: "questCompleted", questId: firstQuest },
          },
        },
      },
    });
    const completed = makeCompletedState();
    planConditionMutations(
      { type: "questCompleted", questId: theSecondQuest },
      completed,
      trackerData,
    );
    expect(completed.questStates[firstQuest]).toBe("completed");
    expect(completed.questStates[theSecondQuest]).toBe("completed");
  });

  it("marks ordered chain predecessors completed for questAvailable", () => {
    const thirdCrown = "crown_3" as QuestId;
    const trackerData = makeTrackerData({
      categoryVisibility: { crown: { type: "always" } },
      questOrder: { crown: [firstQuest, theSecondQuest, thirdCrown] },
      quests: {
        [crown]: {
          [firstQuest]: { name: "Crown 1" },
          [theSecondQuest]: { name: "Crown 2" },
          [thirdCrown]: { name: "Crown 3" },
        },
      },
    });
    const completed = makeCompletedState();
    planConditionMutations({ type: "questAvailable", questId: thirdCrown }, completed, trackerData);
    expect(completed.questStates[firstQuest]).toBe("completed");
    expect(completed.questStates[theSecondQuest]).toBe("completed");
    expect(completed.questStates[thirdCrown]).toBeUndefined();
  });
});

describe("planConditionMutations → deriveProgressionState round-trips", () => {
  it("hides then reveals an entity after satisfying its condition", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };

    const completed = makeCompletedState();
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, stateBefore)).toBe(false);

    planConditionMutations(entityCondition, completed, trackerData);
    const stateAfter = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, stateAfter)).toBe(true);
  });

  it("reveals source detail and entity name at their separate thresholds", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };
    const sourceCondition: VisibilityCondition = { type: "mineFloor", floor: 20 };

    const completed = makeCompletedState();
    const state1 = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, state1)).toBe(false);
    expect(isConditionVisible(sourceCondition, state1)).toBe(false);

    completed.mineFloor = 20;
    const state2 = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, state2)).toBe(false);
    expect(isConditionVisible(sourceCondition, state2)).toBe(true);

    planConditionMutations(entityCondition, completed, trackerData);
    const state3 = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, state3)).toBe(true);
    expect(isConditionVisible(sourceCondition, state3)).toBe(true);
  });

  it("satisfying a quest reveals Villager-gated content", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: { [breakingTheFireSeal]: { name: "Breaking the Fire Seal" } },
      },
      villagers: {
        [caldarus]: {
          birthday: { day: 1, season: "spring" },
          visibility: { type: "questCompleted", questId: breakingTheFireSeal },
        },
      },
    });
    const villagerKnownCondition: VisibilityCondition = {
      type: "villagerKnown",
      villagerId: caldarus,
    };

    const completed = makeCompletedState();
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(villagerKnownCondition, stateBefore)).toBe(false);

    planConditionMutations(
      { type: "questCompleted", questId: breakingTheFireSeal },
      completed,
      trackerData,
    );
    const stateAfter = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(villagerKnownCondition, stateAfter)).toBe(true);
  });

  it("completing a chain quest cascades visibility to gated items", () => {
    const trackerData = makeTrackerData({
      quests: {
        [story]: {
          [firstQuest]: { name: "First" },
          [theSecondQuest]: {
            name: "Second",
            visibility: { type: "questCompleted", questId: firstQuest },
          },
        },
      },
    });
    const gatedBehindSecond: VisibilityCondition = {
      type: "questCompleted",
      questId: theSecondQuest,
    };

    const completed = makeCompletedState();
    planConditionMutations(gatedBehindSecond, completed, trackerData);
    const state = deriveProgressionState(completed, trackerData, false);

    expect(state.questVisibility[firstQuest]).toBe("completed");
    expect(state.questVisibility[theSecondQuest]).toBe("completed");
    expect(isConditionVisible(gatedBehindSecond, state)).toBe(true);
  });

  it("just-this-item does not cascade quest state", () => {
    const trackerData = makeTrackerData({
      quests: { [story]: { [repairTheInn]: { name: "Repair the Inn" } } },
    });
    const entityCondition: VisibilityCondition = {
      type: "questCompleted",
      questId: repairTheInn,
    };

    const completed = makeCompletedState();
    // "Just this item" means toggling the checkbox without calling planConditionMutations.
    // The quest state should not change.
    const stateBefore = deriveProgressionState(completed, trackerData, false);
    expect(isConditionVisible(entityCondition, stateBefore)).toBe(false);

    // Simulate: user checks item off but doesn't satisfy the condition.
    // The item is now "completed" in the almanac/recipes, but the underlying quest is untouched.
    expect(completed.questStates[repairTheInn]).toBeUndefined();
  });
});
