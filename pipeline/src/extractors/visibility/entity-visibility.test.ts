import { describe, expect, it } from "vitest";

import {
  assignEntityVisibility,
  CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
  extractCategoryVisibility,
  extractFetchQuestVisibility,
  extractHeartLevelChanges,
  extractNpcVisibility,
  extractStoreVisibility,
} from "./entity-visibility.js";

import type {
  AnimalId,
  CosmeticId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  RecipeId,
  SkillId,
  SpellId,
  StoreId,
  TrackerData,
} from "$lib/types/tracker-data.js";

import type { CutsceneQuestMap } from "./cutscene-quest-map.js";
import type { QuestChainData } from "./quest-chains.js";

const emptyCutsceneMap: CutsceneQuestMap = {};

// Minimal fiddle factory, following the pattern established in quest-chains.test.ts.
function makeFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
  ranching?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  stores?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    cutscenes: overrides.cutscenes ?? {},
    quests: overrides.quests ?? {},
    ranching: overrides.ranching ?? { animals: {} },
    requirements: overrides.requirements ?? {},
    stores: overrides.stores ?? {},
  };
}

function makeQuestChains(overrides: Partial<QuestChainData>): QuestChainData {
  return {
    crown: [],
    fetch: {},
    heart: {},
    stillwell: [],
    story: {},
    tali: [],
    ...overrides,
  };
}

function makeTrackerData(overrides: Record<string, unknown>): TrackerData {
  return {
    almanac: [],
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    festivals: {},
    generatedAt: "",
    heartLevelChanges: {},
    items: {},
    mines: { biomes: [], maxFloors: 100, spells: {} },
    museum: [],
    npcs: {},
    npcVisibility: {},
    perks: {},
    perkTierLevels: [1, 10, 20, 45, 60],
    questChains: { crown: [], fetch: {}, heart: {}, stillwell: [], story: [], tali: [] } as never,
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

describe("extractStoreVisibility", () => {
  it("returns always for starter stores", () => {
    const fiddle = makeFiddle({
      stores: { carpenter: {}, general: {}, hayden: {}, inn: {} },
    });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["carpenter" as StoreId]).toEqual({ type: "always" });
    expect(result["general" as StoreId]).toEqual({ type: "always" });
    expect(result["hayden" as StoreId]).toEqual({ type: "always" });
    expect(result["inn" as StoreId]).toEqual({ type: "always" });
  });

  it("returns questCompleted for NPC market stalls", () => {
    const fiddle = makeFiddle({ stores: { darcy: {}, wheedle: {} } });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["darcy" as StoreId]).toEqual({
      questId: "repair_the_bridge",
      type: "questCompleted",
    });
    expect(result["wheedle" as StoreId]).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
  });

  it("gates Wheedle behind the Saturday Market upgrade quest", () => {
    const fiddle = makeFiddle({ stores: { wheedle: {} } });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["wheedle" as StoreId]).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
  });

  it("leaves Balor always visible", () => {
    const fiddle = makeFiddle({ stores: { balor: {} } });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["balor" as StoreId]).toEqual({ type: "always" });
  });

  it("skips the default placeholder entry", () => {
    const fiddle = makeFiddle({ stores: { balor: {}, default: {} } });
    const result = extractStoreVisibility(fiddle as never);
    expect(result["default" as StoreId]).toBeUndefined();
  });
});

describe("extractNpcVisibility", () => {
  it("gates Caldarus behind breaking the fire seal", () => {
    const result = extractNpcVisibility();
    expect(result["caldarus" as NpcId]).toEqual({
      questId: "breaking_the_fire_seal",
      type: "questCompleted",
    });
  });

  it("gates Seridia behind breaking the final seal", () => {
    const result = extractNpcVisibility();
    expect(result["seridia" as NpcId]).toEqual({
      questId: "breaking_the_final_seal",
      type: "questCompleted",
    });
  });

  it("gates Saturday Market vendors in their respective waves", () => {
    const result = extractNpcVisibility();
    expect(result["taliferro" as NpcId]).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
    expect(result["wheedle" as NpcId]).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
    expect(result["stillwell" as NpcId]).toEqual({
      questId: "upgrade_the_saturday_market_plaza",
      type: "questCompleted",
    });
    expect(result["zorel" as NpcId]).toEqual({
      questId: "upgrade_the_saturday_market_plaza",
      type: "questCompleted",
    });
  });

  it("leaves regular NPCs absent, treating omission as always-visible", () => {
    const result = extractNpcVisibility();
    expect(result["holt" as NpcId]).toBeUndefined();
    expect(result["adeline" as NpcId]).toBeUndefined();
  });
});

describe("extractCategoryVisibility", () => {
  it("gates stillwell_challenges behind knowing Stillwell", () => {
    const result = extractCategoryVisibility();
    expect(result.stillwell_challenges).toEqual({ npcId: "stillwell", type: "npcKnown" });
  });

  it("gates tali_challenges behind knowing Taliferro", () => {
    const result = extractCategoryVisibility();
    expect(result.tali_challenges).toEqual({ npcId: "taliferro", type: "npcKnown" });
  });

  it("leaves story_quests, heart_quests, and fetch_quests always visible", () => {
    const result = extractCategoryVisibility();
    expect(result.story_quests).toEqual({ type: "always" });
    expect(result.heart_quests).toEqual({ type: "always" });
    expect(result.fetch_quests).toEqual({ type: "always" });
  });

  it("gates crown_quests behind the placeholder renown level", () => {
    const result = extractCategoryVisibility();
    expect(result.crown_quests).toEqual({
      level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
      type: "renownLevel",
    });
  });
});

describe("extractFetchQuestVisibility", () => {
  it("resolves a request board requirement into questCompleted", () => {
    const fetchRequirements = {
      deliver_the_goods: { predicate: "completed_quest", value: "repair_the_bridge" },
    };
    const result = extractFetchQuestVisibility(fetchRequirements, emptyCutsceneMap);
    expect(result["deliver_the_goods" as QuestId]).toEqual({
      questId: "repair_the_bridge",
      type: "questCompleted",
    });
  });

  it("resolves an unconstrained requirement to always", () => {
    const fetchRequirements = { open_fetch: { all: [] } };
    const result = extractFetchQuestVisibility(fetchRequirements, emptyCutsceneMap);
    expect(result["open_fetch" as QuestId]).toEqual({ type: "always" });
  });
});

describe("extractHeartLevelChanges", () => {
  it("groups heart-level bumps by the quest the cutscene maps to", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        break_water_seal: {
          heart_level_changes: [
            { heart_level: 2, npc_id: "caldarus" },
            { heart_level: 1, npc_id: "seridia" },
          ],
        },
      },
    });
    const cutsceneMap: CutsceneQuestMap = {
      break_water_seal: { phase: "completed", questId: "breaking_the_water_seal" as QuestId },
    };
    const result = extractHeartLevelChanges(fiddle as never, cutsceneMap);
    expect(result["breaking_the_water_seal" as QuestId]).toEqual([
      { level: 2, npcId: "caldarus" },
      { level: 1, npcId: "seridia" },
    ]);
  });

  it("groups the final-seal heart bumps under their quest", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        break_fire_seal: {
          heart_level_changes: [
            { heart_level: 6, npc_id: "caldarus" },
            { heart_level: 6, npc_id: "seridia" },
          ],
        },
      },
    });
    const cutsceneMap: CutsceneQuestMap = {
      break_fire_seal: { phase: "completed", questId: "breaking_the_final_seal" as QuestId },
    };
    const result = extractHeartLevelChanges(fiddle as never, cutsceneMap);
    expect(result["breaking_the_final_seal" as QuestId]).toEqual([
      { level: 6, npcId: "caldarus" },
      { level: 6, npcId: "seridia" },
    ]);
  });

  it("skips cutscenes with empty heart_level_changes", () => {
    const fiddle = makeFiddle({
      cutscenes: { default: { heart_level_changes: [] } },
    });
    const result = extractHeartLevelChanges(fiddle as never, emptyCutsceneMap);
    expect(result).toEqual({});
  });

  it("skips cutscenes that don't map to a quest", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        unmapped_cutscene: { heart_level_changes: [{ heart_level: 1, npc_id: "holt" }] },
      },
    });
    const result = extractHeartLevelChanges(fiddle as never, emptyCutsceneMap);
    expect(result).toEqual({});
  });
});

describe("assignEntityVisibility — items", () => {
  it("leaves a non-gated item always visible", () => {
    const trackerData = makeTrackerData({
      items: { seed_turnip: { category: "seeds", name: "Turnip Seed" } },
      sources: { seed_turnip: [{ location: "general", type: "store" }] },
    });
    assignEntityVisibility(
      trackerData,
      { general: { type: "always" } } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.items["seed_turnip" as ItemId].visibility).toEqual({ type: "always" });
  });

  it("derives item visibility from inline acquisition sources", () => {
    const trackerData = makeTrackerData({
      items: {
        fancy_seed: {
          acquisitionSources: [{ storeId: "general", type: "store" }],
          category: "seeds",
          name: "Fancy Seed",
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        general: { questId: "repair_the_general_store" as QuestId, type: "questCompleted" },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.items["fancy_seed" as ItemId].visibility).toEqual({
      questId: "repair_the_general_store",
      type: "questCompleted",
    });
  });

  it("ORs multiple inline acquisition sources for item visibility", () => {
    const trackerData = makeTrackerData({
      items: {
        dual_source_item: {
          acquisitionSources: [
            { storeId: "general", type: "store" },
            { questId: "find_the_thing" as QuestId, trigger: "completion", type: "quest" },
          ],
          category: "other",
          name: "Dual Source Item",
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        general: { questId: "repair_the_general_store" as QuestId, type: "questCompleted" },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.items["dual_source_item" as ItemId].visibility).toEqual({
      conditions: [
        { questId: "repair_the_general_store", type: "questCompleted" },
        { questId: "find_the_thing", type: "questCompleted" },
      ],
      type: "or",
    });
  });

  it("defaults an item with no sources to always", () => {
    const trackerData = makeTrackerData({
      items: { mystery_item: { category: "other", name: "Mystery Item" } },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.items["mystery_item" as ItemId].visibility).toEqual({ type: "always" });
  });
});

describe("assignEntityVisibility — recipes", () => {
  it("gives a perk-sourced recipe an entity gate of perkUnlocked and a source gate of skillLevel", () => {
    const trackerData = makeTrackerData({
      perks: { taste_maker: { name: "Taste Maker", skillId: "cooking" as SkillId, tier: 3 } },
      recipes: {
        stew: {
          memberItemIds: [],
          presentations: [],
          sources: [{ perkId: "taste_maker" as PerkId, type: "perk" }],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["stew" as RecipeId];
    expect(recipe.visibility).toEqual({ perkId: "taste_maker", type: "perkUnlocked" });
    expect(recipe.sources[0].visibility).toEqual({
      level: 20,
      skillId: "cooking",
      type: "skillLevel",
    });
  });

  it("gives a store-sourced recipe entity questCompleted and source questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        stairs: {
          memberItemIds: [],
          presentations: [],
          sources: [{ storeId: "carpenter" as StoreId, type: "store" }],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        carpenter: {
          questId: "upgrade_the_carpenters_shop" as QuestId,
          type: "questCompleted",
        },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["stairs" as RecipeId];
    expect(recipe.visibility).toEqual({
      questId: "upgrade_the_carpenters_shop",
      type: "questCompleted",
    });
    expect(recipe.sources[0].visibility).toEqual({
      questId: "upgrade_the_carpenters_shop",
      type: "questAvailable",
    });
  });

  it("leaves a default recipe always visible", () => {
    const trackerData = makeTrackerData({
      recipes: {
        basic_dish: {
          memberItemIds: [],
          presentations: [],
          sources: [{ type: "default" }],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["basic_dish" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "always" });
    expect(recipe.sources[0].visibility).toEqual({ type: "always" });
  });

  it("gives a quest-sourced recipe entity questCompleted and source questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        scroll_of_the_sword: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              questId: "the_final_showdown" as QuestId,
              questType: "story_quests" as never,
              type: "quest",
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["scroll_of_the_sword" as RecipeId];
    expect(recipe.visibility).toEqual({ questId: "the_final_showdown", type: "questCompleted" });
    expect(recipe.sources[0].visibility).toEqual({
      questId: "the_final_showdown",
      type: "questAvailable",
    });
  });

  it("gives a mines_chest source an and(minesLevel, perkUnlocked) entity gate and a bare minesLevel source gate", () => {
    const trackerData = makeTrackerData({
      mines: {
        biomes: [{ endFloor: 20, id: "biome_0" as never, name: "Biome 1", startFloor: 1 }],
        maxFloors: 100,
        spells: {},
      },
      recipes: {
        crystal_lamp: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              biomeId: "biome_0" as never,
              perkId: "taste_maker" as PerkId,
              type: "mines_chest",
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["crystal_lamp" as RecipeId];
    expect(recipe.visibility).toEqual({
      conditions: [
        { floor: 1, type: "minesLevel" },
        { perkId: "taste_maker", type: "perkUnlocked" },
      ],
      type: "and",
    });
    expect(recipe.sources[0].visibility).toEqual({ floor: 1, type: "minesLevel" });
  });

  it("leaves a museum_donation source's entity and source both always", () => {
    const trackerData = makeTrackerData({
      recipes: {
        set_reward: {
          memberItemIds: [],
          presentations: [],
          sources: [{ setCount: 1, type: "museum_donation", wingId: "wing_a" as never }],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["set_reward" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "always" });
    expect(recipe.sources[0].visibility).toEqual({ type: "always" });
  });

  it("treats scroll_bundle sources the same as store sources", () => {
    const trackerData = makeTrackerData({
      recipes: {
        bundle_recipe: {
          memberItemIds: [],
          presentations: [],
          sources: [{ bundleName: "Void Set", storeId: "zorel" as StoreId, type: "scroll_bundle" }],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        zorel: {
          questId: "upgrade_the_saturday_market_plaza" as QuestId,
          type: "questCompleted",
        },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["bundle_recipe" as RecipeId];
    expect(recipe.visibility).toEqual({
      questId: "upgrade_the_saturday_market_plaza",
      type: "questCompleted",
    });
    expect(recipe.sources[0].visibility).toEqual({
      questId: "upgrade_the_saturday_market_plaza",
      type: "questAvailable",
    });
  });

  it("keeps a starter-store recipe's entity condition as questCompleted while the source becomes questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        general_dish: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              storeId: "general" as StoreId,
              type: "store",
              upgraded: true,
              visibility: {
                questId: "repair_the_general_store" as QuestId,
                type: "questCompleted",
              },
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      { general: { type: "always" } } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["general_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      questId: "repair_the_general_store",
      type: "questCompleted",
    });
    expect(recipe.sources[0].visibility).toEqual({
      questId: "repair_the_general_store",
      type: "questAvailable",
    });
  });

  it("composes the store gate, stock gate, and perkUnlocked for a store_with_perk recipe", () => {
    const trackerData = makeTrackerData({
      recipes: {
        espresso: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              perkId: "espresso_yourself" as PerkId,
              storeId: "darcy" as StoreId,
              type: "store_with_perk",
              visibility: {
                questId: "repair_the_general_store" as QuestId,
                type: "questCompleted",
              },
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        darcy: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["espresso" as RecipeId];
    expect(recipe.visibility).toEqual({
      conditions: [
        { questId: "repair_the_bridge", type: "questCompleted" },
        { questId: "repair_the_general_store", type: "questCompleted" },
        { perkId: "espresso_yourself", type: "perkUnlocked" },
      ],
      type: "and",
    });
    expect(recipe.sources[0].visibility).toEqual({
      conditions: [
        { questId: "repair_the_bridge", type: "questAvailable" },
        { questId: "repair_the_general_store", type: "questAvailable" },
        { perkId: "espresso_yourself", type: "perkUnlocked" },
      ],
      type: "and",
    });
  });

  it("only converts the nested questCompleted leaf to questAvailable in an and(questCompleted, skillLevel) stock gate", () => {
    const trackerData = makeTrackerData({
      recipes: {
        and_gated_dish: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              storeId: "general" as StoreId,
              type: "store",
              visibility: {
                conditions: [
                  { questId: "repair_the_general_store" as QuestId, type: "questCompleted" },
                  { level: 10, skillId: "cooking" as SkillId, type: "skillLevel" },
                ],
                type: "and",
              },
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      { general: { type: "always" } } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["and_gated_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      conditions: [
        { questId: "repair_the_general_store", type: "questCompleted" },
        { level: 10, skillId: "cooking", type: "skillLevel" },
      ],
      type: "and",
    });
    expect(recipe.sources[0].visibility).toEqual({
      conditions: [
        { questId: "repair_the_general_store", type: "questAvailable" },
        { level: 10, skillId: "cooking", type: "skillLevel" },
      ],
      type: "and",
    });
  });

  it("only converts the nested questCompleted leaf to questAvailable in an or(questCompleted, minesLevel) stock gate", () => {
    const trackerData = makeTrackerData({
      recipes: {
        or_gated_dish: {
          memberItemIds: [],
          presentations: [],
          sources: [
            {
              storeId: "general" as StoreId,
              type: "store",
              visibility: {
                conditions: [
                  { questId: "repair_the_general_store" as QuestId, type: "questCompleted" },
                  { floor: 5, type: "minesLevel" },
                ],
                type: "or",
              },
            },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      { general: { type: "always" } } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["or_gated_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      conditions: [
        { questId: "repair_the_general_store", type: "questCompleted" },
        { floor: 5, type: "minesLevel" },
      ],
      type: "or",
    });
    expect(recipe.sources[0].visibility).toEqual({
      conditions: [
        { questId: "repair_the_general_store", type: "questAvailable" },
        { floor: 5, type: "minesLevel" },
      ],
      type: "or",
    });
  });

  it("takes the weakest (or-combined) condition across multiple sources", () => {
    const trackerData = makeTrackerData({
      recipes: {
        multi_source: {
          memberItemIds: [],
          presentations: [],
          sources: [
            { type: "default" },
            { questId: "some_quest" as QuestId, questType: "story_quests" as never, type: "quest" },
          ],
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    const recipe = trackerData.recipes["multi_source" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "always" });
  });
});

describe("assignEntityVisibility — perks", () => {
  it("stamps tier 1 as skillLevel(skillId, 1) literally, even though it simplifies to always at use-time", () => {
    const trackerData = makeTrackerData({
      perks: { basic_perk: { name: "Basic Perk", skillId: "farming" as SkillId, tier: 1 } },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.perks["basic_perk" as PerkId].visibility).toEqual({
      level: 1,
      skillId: "farming",
      type: "skillLevel",
    });
  });

  it("stamps tier 4 as skillLevel(skillId, 45)", () => {
    const trackerData = makeTrackerData({
      perks: { advanced_perk: { name: "Advanced Perk", skillId: "mining" as SkillId, tier: 4 } },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.perks["advanced_perk" as PerkId].visibility).toEqual({
      level: 45,
      skillId: "mining",
      type: "skillLevel",
    });
  });
});

describe("assignEntityVisibility — animals", () => {
  it("gates barn animals behind repair_haydens_barn", () => {
    const trackerData = makeTrackerData({
      animals: {
        horse: {
          cosmetics: {},
          name: "Horse",
          variants: {},
        },
      },
    });
    const fiddle = makeFiddle({
      ranching: {
        animals: { horse: { core: { requirements: { repaired_haydens_farm: true } } } },
      },
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, fiddle as never, makeQuestChains({}));
    expect(trackerData.animals["horse" as AnimalId].visibility).toEqual({
      questId: "repair_haydens_barn",
      type: "questCompleted",
    });
  });

  it("leaves starting animals always visible", () => {
    const trackerData = makeTrackerData({
      animals: { chicken: { cosmetics: {}, name: "Chicken", variants: {} } },
    });
    const fiddle = makeFiddle({ ranching: { animals: { chicken: { core: {} } } } });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, fiddle as never, makeQuestChains({}));
    expect(trackerData.animals["chicken" as AnimalId].visibility).toEqual({ type: "always" });
  });
});

describe("assignEntityVisibility — cosmetics", () => {
  it("derives cosmetic visibility from inline acquisition sources", () => {
    const trackerData = makeTrackerData({
      cosmetics: {
        fancy_hat: {
          acquisitionSources: [{ storeId: "wheedle", type: "store" }],
          defaultUnlocked: false,
          name: "Fancy Hat",
          slot: "head",
        },
      },
    });
    assignEntityVisibility(
      trackerData,
      {
        wheedle: {
          questId: "upgrade_the_saturday_market" as QuestId,
          type: "questCompleted",
        },
      } as never,
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.cosmetics["fancy_hat" as CosmeticId].visibility).toEqual({
      questId: "upgrade_the_saturday_market",
      type: "questCompleted",
    });
  });

  it("leaves visibility unstamped for cosmetics without a known source (issue #78)", () => {
    const trackerData = makeTrackerData({
      cosmetics: { unsourced_hat: { defaultUnlocked: false, name: "Unsourced Hat", slot: "head" } },
    });
    assignEntityVisibility(
      trackerData,
      {},
      emptyCutsceneMap,
      makeFiddle({}) as never,
      makeQuestChains({}),
    );
    expect(trackerData.cosmetics["unsourced_hat" as CosmeticId].visibility).toBeUndefined();
  });
});

describe("assignEntityVisibility — spells", () => {
  it("maps a spell to the tablet quest chain via the cutscene-quest map", () => {
    const trackerData = makeTrackerData({
      mines: { biomes: [], maxFloors: 100, spells: { summon_rain: { name: "Summon Rain" } } },
    });
    const fiddle = makeFiddle({
      cutscenes: { post_water_seal: { spell_to_unlock: "summon_rain" } },
    });
    const cutsceneMap: CutsceneQuestMap = {
      post_water_seal: { phase: "completed", questId: "the_water_tablet" as QuestId },
    };
    assignEntityVisibility(trackerData, {}, cutsceneMap, fiddle as never, makeQuestChains({}));
    expect(trackerData.mines.spells["summon_rain" as SpellId].visibility).toEqual({
      questId: "the_water_tablet",
      type: "questCompleted",
    });
  });
});

describe("assignEntityVisibility — quests", () => {
  it("gates a heart quest behind npcKnown, heartLevel, and the prerequisite quest", () => {
    const trackerData = makeTrackerData({
      quests: { heart_quests: { bird_song: { name: "Bird Song" } } },
    });
    const questChains = makeQuestChains({
      heart: {
        ryis: [
          { heartLevel: 2, questId: "bird_song_prereq" as QuestId },
          {
            heartLevel: 4,
            prerequisiteQuest: "bird_song_prereq" as QuestId,
            questId: "bird_song" as QuestId,
          },
        ],
      } as never,
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, makeFiddle({}) as never, questChains);
    expect(trackerData.quests.heart_quests["bird_song" as QuestId].visibility).toEqual({
      conditions: [
        { npcId: "ryis", type: "npcKnown" },
        { level: 4, npcId: "ryis", type: "heartLevel" },
        { questId: "bird_song_prereq", type: "questCompleted" },
      ],
      type: "and",
    });
  });

  it("gates the first crown quest behind renownLevel and the second behind renownLevel + the prior quest", () => {
    const trackerData = makeTrackerData({
      quests: {
        crown_quests: {
          first_crown_quest: { name: "First" },
          second_crown_quest: { name: "Second" },
        },
      },
    });
    const questChains = makeQuestChains({
      crown: ["first_crown_quest", "second_crown_quest"] as never,
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, makeFiddle({}) as never, questChains);
    expect(trackerData.quests.crown_quests["first_crown_quest" as QuestId].visibility).toEqual({
      level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
      type: "renownLevel",
    });
    expect(trackerData.quests.crown_quests["second_crown_quest" as QuestId].visibility).toEqual({
      conditions: [
        { level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER, type: "renownLevel" },
        { questId: "first_crown_quest", type: "questCompleted" },
      ],
      type: "and",
    });
  });

  it("resolves a fetch quest's request board requirement", () => {
    const trackerData = makeTrackerData({
      quests: { fetch_quests: { deliver_the_goods: { name: "Deliver the Goods" } } },
    });
    const questChains = makeQuestChains({
      fetch: {
        deliver_the_goods: { predicate: "completed_quest", value: "repair_the_bridge" },
      } as never,
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, makeFiddle({}) as never, questChains);
    expect(trackerData.quests.fetch_quests["deliver_the_goods" as QuestId].visibility).toEqual({
      questId: "repair_the_bridge",
      type: "questCompleted",
    });
  });

  it("leaves a story quest without prerequisites always visible", () => {
    const trackerData = makeTrackerData({
      quests: { story_quests: { crafting_tutorial: { name: "Crafting Tutorial" } } },
    });
    const questChains = makeQuestChains({
      story: { crafting_tutorial: { prerequisites: [] } } as never,
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, makeFiddle({}) as never, questChains);
    expect(trackerData.quests.story_quests["crafting_tutorial" as QuestId].visibility).toEqual({
      type: "always",
    });
  });

  it("gates a story quest behind its prerequisite", () => {
    const trackerData = makeTrackerData({
      quests: { story_quests: { repair_the_mill: { name: "Repair the Mill" } } },
    });
    const questChains = makeQuestChains({
      story: { repair_the_mill: { prerequisites: ["prior_quest" as QuestId] } } as never,
    });
    assignEntityVisibility(trackerData, {}, emptyCutsceneMap, makeFiddle({}) as never, questChains);
    expect(trackerData.quests.story_quests["repair_the_mill" as QuestId].visibility).toEqual({
      questId: "prior_quest",
      type: "questCompleted",
    });
  });
});
