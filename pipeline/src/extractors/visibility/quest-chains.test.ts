import { describe, expect, it } from "vitest";

import { extractQuestChains } from "./quest-chains.js";

import type { NpcId, QuestId } from "$lib/types/tracker-data.js";

// Minimal fiddle factory for quest chain tests. Each override merges onto a bare skeleton so
// individual tests only specify the parts of the data they exercise.
function makeFiddle(overrides: {
  letters?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
  requirements?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
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
          npc: "adeline",
          quest_to_start: "repair_the_mill",
          requirements: { completed_quest: "replenishing_mistrias_food_reserves_1" },
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
          npc: "adeline",
          quest_to_start: "repair_the_mill",
          requirements: {
            completed_quest: { days_after: 3, quest: "replenishing_mistrias_food_reserves_1" },
          },
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

  it("leaves prerequisites empty when the letter has no completed_quest requirement", () => {
    const fiddle = makeFiddle({
      letters: {
        friday_at_the_sleeping_dragon_inn: {
          npc: "reina",
          quest_to_start: "friday_at_the_sleeping_dragon_inn",
          requirements: { reached_date: { day: 5, season: "spring" } },
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
  it("orders a single NPC's heart quests by level", () => {
    const fiddle = makeFiddle({
      letters: {
        the_unusual_seed: {
          npc: "celine",
          quest_to_start: "the_unusual_seed",
          requirements: { reached_heart_level: { celine: 2 } },
        },
        water_and_soil: {
          npc: "celine",
          quest_to_start: "water_and_soil",
          requirements: {
            completed_quest: "the_unusual_seed",
            reached_heart_level: { celine: 4 },
          },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["celine" as NpcId]).toEqual([
      { heartLevel: 2, questId: "the_unusual_seed" },
      { heartLevel: 4, prerequisiteQuest: "the_unusual_seed", questId: "water_and_soil" },
    ]);
  });

  it("does not set prerequisiteQuest below level 4", () => {
    const fiddle = makeFiddle({
      letters: {
        surprise_me: {
          npc: "march",
          quest_to_start: "surprise_me",
          requirements: { reached_heart_level: { march: 2 } },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["march" as NpcId]).toEqual([{ heartLevel: 2, questId: "surprise_me" }]);
  });

  it("uses the letter's reached_heart_level NPC key rather than the quest's npc_for_icon", () => {
    // Landen's "Bird Song" letter gates on Ryis's heart level, not Landen's — the letter's NPC
    // field ("landen") must not leak into the chain's NPC key.
    const fiddle = makeFiddle({
      letters: {
        bird_song: {
          npc: "landen",
          quest_to_start: "bird_song",
          requirements: { reached_heart_level: { ryis: 2 } },
        },
      },
      quests: {
        heart_quests: {
          bird_song: { npc_for_icon: "landen", stages: [] },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["ryis" as NpcId]).toEqual([{ heartLevel: 2, questId: "bird_song" }]);
    expect(result.heart["landen" as NpcId]).toBeUndefined();
  });

  it("chains level 4+ heart quests to the immediately preceding quest for that NPC", () => {
    const fiddle = makeFiddle({
      letters: {
        adeline_l2: {
          npc: "adeline",
          quest_to_start: "the_smell_of_drying_ink",
          requirements: { reached_heart_level: { adeline: 2 } },
        },
        adeline_l4: {
          npc: "adeline",
          quest_to_start: "a_rewarding_choice",
          requirements: {
            completed_quest: "the_smell_of_drying_ink",
            reached_heart_level: { adeline: 4 },
          },
        },
        adeline_l8: {
          npc: "adeline",
          quest_to_start: "adeline_8h",
          requirements: { reached_heart_level: { adeline: 8 } },
        },
      },
    });
    const result = extractQuestChains(fiddle as never);
    expect(result.heart["adeline" as NpcId]).toEqual([
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
