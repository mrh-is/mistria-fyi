import { describe, expect, it } from "vitest";

import { extractQuestChains } from "./quest-chains.js";

import type { QuestId, VillagerId } from "#lib/types/tracker-data.js";

// Minimal fiddle factory for quest chain tests. Each override merges onto a bare skeleton so
// individual tests only specify the parts of the data they exercise.
function makeFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  letters?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
  requirements?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    cutscenes: overrides.cutscenes ?? {},
    letters: overrides.letters ?? {},
    quests: overrides.quests ?? {},
    requirements: overrides.requirements ?? {},
  };
}

describe("extractQuestChains — story chain", () => {
  it("extracts a story quest prerequisite from a letter's completed_quest requirement", () => {
    const fiddle = makeFiddle({
      letters: {
        repair_the_mill: {
          quest_to_start: "repair_the_mill",
          requirements: { completed_quest: "replenishing_mistrias_food_reserves_1" },
          villager: "adeline",
        },
      },
      quests: {
        story_quests: {
          repair_the_mill: { npc_for_icon: "adeline", stages: [] },
          replenishing_mistrias_food_reserves_1: { npc_for_icon: "adeline", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["repair_the_mill" as QuestId]).toEqual({
      prerequisites: ["replenishing_mistrias_food_reserves_1"],
    });
  });

  it("extracts a story quest prerequisite when completed_quest is an object with days_after", () => {
    const fiddle = makeFiddle({
      letters: {
        repair_the_mill: {
          quest_to_start: "repair_the_mill",
          requirements: {
            completed_quest: { days_after: 3, quest: "replenishing_mistrias_food_reserves_1" },
          },
          villager: "adeline",
        },
      },
      quests: {
        story_quests: {
          repair_the_mill: { npc_for_icon: "adeline", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["repair_the_mill" as QuestId]).toEqual({
      prerequisites: ["replenishing_mistrias_food_reserves_1"],
    });
  });

  it("leaves prerequisites empty for story quests without a letter trigger", () => {
    const fiddle = makeFiddle({
      quests: {
        story_quests: {
          crafting_tutorial: { npc_for_icon: "adeline", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["crafting_tutorial" as QuestId]).toEqual({ prerequisites: [] });
  });

  it("extracts a story quest prerequisite from a cutscene's completed_quest requirement", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        delivering_the_sealing_scroll: {
          quest_to_progress: "delivering_the_sealing_scroll",
          requirements: {
            completed_quest: { days_after: 1, quest: "procuring_the_sealing_scroll" },
          },
        },
      },
      quests: {
        story_quests: {
          delivering_the_sealing_scroll: { npc_for_icon: "balor", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["delivering_the_sealing_scroll" as QuestId]).toEqual({
      prerequisites: ["procuring_the_sealing_scroll"],
    });
  });

  it("extracts prerequisites from a cutscene with array quest_to_start", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        some_cutscene: {
          quest_to_start: ["quest_a", "quest_b"],
          requirements: { completed_quest: "prereq_quest" },
        },
      },
      quests: {
        story_quests: {
          prereq_quest: { stages: [] },
          quest_a: { stages: [] },
          quest_b: { stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["quest_a" as QuestId]).toEqual({ prerequisites: ["prereq_quest"] });
    expect(result.story["quest_b" as QuestId]).toEqual({ prerequisites: ["prereq_quest"] });
  });

  it("applies hardcoded prerequisite overrides for cutscene-started quests", () => {
    const fiddle = makeFiddle({
      quests: {
        story_quests: {
          breaking_the_final_seal: { stages: [] },
          breaking_the_fire_seal: { stages: [] },
          breaking_the_ruins_seal: { stages: [] },
          creating_the_void_mass: { stages: [] },
          delivering_the_sealing_scroll: { stages: [] },
          find_the_magic_key: { stages: [] },
          procuring_the_sealing_scroll: { stages: [] },
          the_dragonsworn_tablet: { stages: [] },
          the_fire_tablet: { stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["breaking_the_fire_seal" as QuestId].prerequisites).toEqual([
      "the_fire_tablet",
    ]);
    expect(result.story["delivering_the_sealing_scroll" as QuestId].prerequisites).toEqual([
      "procuring_the_sealing_scroll",
    ]);
    expect(result.story["find_the_magic_key" as QuestId].prerequisites).toEqual([
      "breaking_the_fire_seal",
    ]);
    expect(result.story["creating_the_void_mass" as QuestId].prerequisites).toEqual([
      "find_the_magic_key",
    ]);
    expect(result.story["breaking_the_ruins_seal" as QuestId].prerequisites).toEqual([
      "creating_the_void_mass",
    ]);
    expect(result.story["the_dragonsworn_tablet" as QuestId].prerequisites).toEqual([
      "breaking_the_ruins_seal",
    ]);
    expect(result.story["breaking_the_final_seal" as QuestId].prerequisites).toEqual([
      "the_dragonsworn_tablet",
    ]);
  });

  it("does not duplicate prerequisites when both a cutscene and an override supply the same one", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        some_cutscene: {
          quest_to_start: "breaking_the_fire_seal",
          requirements: { completed_quest: "the_fire_tablet" },
        },
      },
      quests: {
        story_quests: {
          breaking_the_fire_seal: { stages: [] },
          the_fire_tablet: { stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["breaking_the_fire_seal" as QuestId].prerequisites).toEqual([
      "the_fire_tablet",
    ]);
  });

  it("leaves prerequisites empty when the letter has no completed_quest requirement", () => {
    const fiddle = makeFiddle({
      letters: {
        friday_at_the_sleeping_dragon_inn: {
          quest_to_start: "friday_at_the_sleeping_dragon_inn",
          requirements: { reached_date: { day: 5, season: "spring" } },
          villager: "reina",
        },
      },
      quests: {
        story_quests: {
          friday_at_the_sleeping_dragon_inn: { npc_for_icon: "reina", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.story["friday_at_the_sleeping_dragon_inn" as QuestId]).toEqual({
      prerequisites: [],
    });
  });
});

describe("extractQuestChains — registry ordering", () => {
  it("extracts crown quest order from crown_registry", () => {
    const fiddle = makeFiddle({
      quests: {
        crown_registry: {
          order: ["crown_request_crops", "crown_request_fish"],
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.crown).toEqual(["crown_request_crops", "crown_request_fish"]);
  });

  it("extracts stillwell quest order from stillwell_registry", () => {
    const fiddle = makeFiddle({
      quests: {
        stillwell_registry: {
          order: ["green_sapling_surprise", "rock_clod_catastrophe"],
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.stillwell).toEqual(["green_sapling_surprise", "rock_clod_catastrophe"]);
  });

  it("extracts tali quest order from tali_registry", () => {
    const fiddle = makeFiddle({
      quests: {
        tali_registry: {
          order: ["rice_ball_challenge", "crystal_berry_pie_challenge"],
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.tali).toEqual(["rice_ball_challenge", "crystal_berry_pie_challenge"]);
  });

  it("defaults registry order to an empty array when the registry is absent", () => {
    const fiddle = makeFiddle({});
    const result = extractQuestChains(fiddle as never);
    expect(result.crown).toEqual([]);
    expect(result.stillwell).toEqual([]);
    expect(result.tali).toEqual([]);
  });
});

describe("extractQuestChains — heart chain", () => {
  it("orders a single Villager's heart quests by level", () => {
    const fiddle = makeFiddle({
      letters: {
        the_unusual_seed: {
          quest_to_start: "the_unusual_seed",
          requirements: { reached_heart_level: { celine: 2 } },
          villager: "celine",
        },
        water_and_soil: {
          quest_to_start: "water_and_soil",
          requirements: {
            completed_quest: "the_unusual_seed",
            reached_heart_level: { celine: 4 },
          },
          villager: "celine",
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["celine" as VillagerId]).toEqual([
      { heartLevel: 2, questId: "the_unusual_seed" },
      { heartLevel: 4, prerequisiteQuest: "the_unusual_seed", questId: "water_and_soil" },
    ]);
  });

  it("does not set prerequisiteQuest below level 4", () => {
    const fiddle = makeFiddle({
      letters: {
        surprise_me: {
          quest_to_start: "surprise_me",
          requirements: { reached_heart_level: { march: 2 } },
          villager: "march",
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["march" as VillagerId]).toEqual([
      { heartLevel: 2, questId: "surprise_me" },
    ]);
  });

  it("uses the letter's reached_heart_level villager key rather than the quest's npc_for_icon", () => {
    // Landen's "Bird Song" letter gates on Ryis's heart level, not Landen's — the letter's Villager
    // field ("landen") must not leak into the chain's Villager key.
    const fiddle = makeFiddle({
      letters: {
        bird_song: {
          quest_to_start: "bird_song",
          requirements: { reached_heart_level: { ryis: 2 } },
          villager: "landen",
        },
      },
      quests: {
        heart_quests: {
          bird_song: { npc_for_icon: "landen", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["ryis" as VillagerId]).toEqual([{ heartLevel: 2, questId: "bird_song" }]);
    expect(result.heart["landen" as VillagerId]).toBeUndefined();
  });

  it("chains level 4+ heart quests to the immediately preceding quest for that Villager", () => {
    const fiddle = makeFiddle({
      letters: {
        adeline_l2: {
          quest_to_start: "the_smell_of_drying_ink",
          requirements: { reached_heart_level: { adeline: 2 } },
          villager: "adeline",
        },
        adeline_l4: {
          quest_to_start: "a_rewarding_choice",
          requirements: {
            completed_quest: "the_smell_of_drying_ink",
            reached_heart_level: { adeline: 4 },
          },
          villager: "adeline",
        },
        adeline_l8: {
          quest_to_start: "adeline_8h",
          requirements: { reached_heart_level: { adeline: 8 } },
          villager: "adeline",
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["adeline" as VillagerId]).toEqual([
      { heartLevel: 2, questId: "the_smell_of_drying_ink" },
      {
        heartLevel: 4,
        prerequisiteQuest: "the_smell_of_drying_ink",
        questId: "a_rewarding_choice",
      },
      { heartLevel: 8, prerequisiteQuest: "a_rewarding_choice", questId: "adeline_8h" },
    ]);
  });
});

describe("extractQuestChains — fetch chain", () => {
  it("parses fetch quest requirements into raw requirement expressions", () => {
    const fiddle = makeFiddle({
      quests: {
        request_board: {
          tall_dark_and_mysterious: {
            requirements: {
              completed_quest: "repair_the_bridge",
              reached_heart_level: { balor: 2 },
            },
          },
        },
      },
      requirements: {
        completed_quest: {},
        reached_heart_level: {},
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.fetch["tall_dark_and_mysterious" as QuestId]).toEqual({
      all: [
        { predicate: "completed_quest", value: "repair_the_bridge" },
        { predicate: "reached_heart_level", value: { balor: 2 } },
      ],
    });
  });

  it("produces an unconstrained expression for entries without requirements", () => {
    const fiddle = makeFiddle({
      quests: {
        request_board: {
          greet_the_townsfolk: {},
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.fetch["greet_the_townsfolk" as QuestId]).toEqual({ all: [] });
  });

  it("skips the default template entry", () => {
    const fiddle = makeFiddle({
      quests: {
        request_board: {
          default: { randomly_selected: false, requirements: {} },
          real_quest: {},
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.fetch["default" as QuestId]).toBeUndefined();
    expect(result.fetch["real_quest" as QuestId]).toEqual({ all: [] });
  });
});
