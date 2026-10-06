import { assert, describe, expect, it } from "vitest";

import { makeFiddle as makeFiddleWithProvenance } from "../../test-helpers.js";
import {
  assignEntityVisibility,
  CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
  extractCategoryVisibility,
  extractFetchQuestVisibility,
  extractHeartLevelChanges,
  stampStoreVisibility,
  stampVillagerVisibility,
} from "./entity-visibility.js";

import type { Source } from "#lib/types/acquisition.js";
import type {
  AnimalId,
  CosmeticId,
  ItemId,
  PerkId,
  QuestId,
  RecipeId,
  SkillId,
  SpellId,
  StoreId,
  TrackerData,
  VillagerId,
} from "#lib/types/tracker-data.js";

import type { CutsceneQuestMap } from "./cutscene-quest-map.js";
import type { QuestChainData } from "./quest-chains.js";

function assertSourceWithDetails(
  source: Source,
): asserts source is Exclude<Source, { type: "default" }> {
  assert(source.type !== "default", "expected a source with details, got { type: 'default' }");
}

const emptyCutsceneMap: CutsceneQuestMap = {};

// Minimal fiddle factory, following the pattern established in quest-chains.test.ts.
function makeFiddle(overrides: {
  cutscenes?: Record<string, Record<string, unknown>>;
  quests?: Record<string, Record<string, unknown>>;
  ranching?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  stores?: Record<string, unknown>;
}) {
  return makeFiddleWithProvenance({
    cutscenes: overrides.cutscenes ?? {},
    quests: overrides.quests ?? {},
    ranching: overrides.ranching ?? { animals: {} },
    requirements: overrides.requirements ?? {},
    stores: overrides.stores ?? {},
  });
}

function makeQuestChains(overrides: Partial<QuestChainData>): QuestChainData {
  return {
    cooking: [],
    crown: [],
    fetch: {},
    heart: {},
    mission: [],
    story: {},
    ...overrides,
  };
}

const DEFAULT_QUESTS = { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} };

function makeTrackerData(overrides: Record<string, unknown>): TrackerData {
  const { quests: questOverrides, ...rest } = overrides;
  return {
    almanac: {},
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    cosmeticSlots: {} as TrackerData["cosmeticSlots"],
    dates: {},
    festivals: {},
    items: {},
    mines: { biomes: [], spells: {} },
    museum: {},
    perkTierLevels: [1, 10, 20, 45, 60],
    pets: { cosmetics: {}, skins: {} },
    pregnancyQuestByVillager: {},
    questOrder: {},
    quests: { ...DEFAULT_QUESTS, ...(questOverrides as object) },
    recipes: {},
    skills: {},
    stores: {},
    townRanks: [],
    treasureChestTiers: {},
    version: "test",
    villagers: {},
    ...rest,
  };
}

describe("stampStoreVisibility", () => {
  it("does not stamp starter stores", () => {
    const trackerData = makeTrackerData({
      stores: {
        carpenter: { name: "Carpenter" },
        general: { name: "General" },
        hayden: { name: "Hayden" },
        inn: { name: "Inn" },
      },
    });
    stampStoreVisibility(trackerData);
    expect(trackerData.stores["carpenter" as StoreId].visibility).toBeUndefined();
    expect(trackerData.stores["general" as StoreId].visibility).toBeUndefined();
    expect(trackerData.stores["hayden" as StoreId].visibility).toBeUndefined();
    expect(trackerData.stores["inn" as StoreId].visibility).toBeUndefined();
  });

  it("stamps questCompleted for Villager market stalls", () => {
    const trackerData = makeTrackerData({
      stores: {
        darcy: { name: "Darcy" },
        wheedle: { name: "Wheedle" },
      },
    });
    stampStoreVisibility(trackerData);
    expect(trackerData.stores["darcy" as StoreId].visibility).toEqual({
      type: "questCompleted",
      questId: "repair_the_bridge",
    });
    expect(trackerData.stores["wheedle" as StoreId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market",
    });
  });

  it("leaves Balor without visibility", () => {
    const trackerData = makeTrackerData({
      stores: { balor: { name: "Balor" } },
    });
    stampStoreVisibility(trackerData);
    expect(trackerData.stores["balor" as StoreId].visibility).toBeUndefined();
  });
});

describe("stampVillagerVisibility", () => {
  it("gates Caldarus behind breaking the fire seal", () => {
    const trackerData = makeTrackerData({
      villagers: {
        caldarus: { birthday: { day: 1, season: "spring" }, name: "Caldarus" },
      },
    });
    stampVillagerVisibility(trackerData);
    expect(trackerData.villagers["caldarus" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "breaking_the_fire_seal",
    });
  });

  it("gates Seridia behind breaking the final seal", () => {
    const trackerData = makeTrackerData({
      villagers: {
        seridia: { birthday: { day: 1, season: "spring" }, name: "Seridia" },
      },
    });
    stampVillagerVisibility(trackerData);
    expect(trackerData.villagers["seridia" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "breaking_the_final_seal",
    });
  });

  it("gates Saturday Market vendors in their respective waves", () => {
    const trackerData = makeTrackerData({
      villagers: {
        stillwell: { birthday: { day: 1, season: "spring" }, name: "Stillwell" },
        taliferro: { birthday: { day: 1, season: "spring" }, name: "Taliferro" },
        wheedle: { birthday: { day: 1, season: "spring" }, name: "Wheedle" },
        zorel: { birthday: { day: 1, season: "spring" }, name: "Zorel" },
      },
    });
    stampVillagerVisibility(trackerData);
    expect(trackerData.villagers["taliferro" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market",
    });
    expect(trackerData.villagers["wheedle" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market",
    });
    expect(trackerData.villagers["stillwell" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market_plaza",
    });
    expect(trackerData.villagers["zorel" as VillagerId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market_plaza",
    });
  });

  it("leaves regular Villagers without visibility", () => {
    const trackerData = makeTrackerData({
      villagers: {
        adeline: { birthday: { day: 1, season: "spring" }, name: "Adeline" },
        holt: { birthday: { day: 1, season: "spring" }, name: "Holt" },
      },
    });
    stampVillagerVisibility(trackerData);
    expect(trackerData.villagers["holt" as VillagerId].visibility).toBeUndefined();
    expect(trackerData.villagers["adeline" as VillagerId].visibility).toBeUndefined();
  });
});

describe("extractCategoryVisibility", () => {
  const mockVillagers = {
    celine: { birthday: { day: 1, season: "spring" as const }, dateable: true, name: "Celine" },
    holt: { birthday: { day: 2, season: "summer" as const }, name: "Holt" },
    reina: { birthday: { day: 3, season: "fall" as const }, dateable: true, name: "Reina" },
  } as unknown as TrackerData["villagers"];

  it("gates mission behind knowing Stillwell", () => {
    const result = extractCategoryVisibility(mockVillagers);
    expect(result.mission).toEqual({ type: "villagerKnown", villagerId: "stillwell" });
  });

  it("gates cooking behind knowing Taliferro", () => {
    const result = extractCategoryVisibility(mockVillagers);
    expect(result.cooking).toEqual({ type: "villagerKnown", villagerId: "taliferro" });
  });

  it("leaves story, heart, and fetch always visible", () => {
    const result = extractCategoryVisibility(mockVillagers);
    expect(result.story).toEqual({ type: "always" });
    expect(result.heart).toEqual({ type: "always" });
    expect(result.fetch).toEqual({ type: "always" });
  });

  it("gates crown behind the placeholder renown level", () => {
    const result = extractCategoryVisibility(mockVillagers);
    expect(result.crown).toEqual({
      type: "renownLevel",
      level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
    });
  });

  it("gates dates behind OR of dateable Villagers at heart level 8", () => {
    const result = extractCategoryVisibility(mockVillagers);
    expect(result.dates).toEqual({
      type: "or",
      conditions: [
        { type: "heartLevel", level: 8, villagerId: "celine" },
        { type: "heartLevel", level: 8, villagerId: "reina" },
      ],
    });
  });

  it("sets dates to always when no dateable Villagers exist", () => {
    const noDateable = {
      holt: { birthday: { day: 2, season: "summer" as const }, name: "Holt" },
    } as unknown as TrackerData["villagers"];
    const result = extractCategoryVisibility(noDateable);
    expect(result.dates).toEqual({ type: "always" });
  });
});

describe("extractFetchQuestVisibility", () => {
  it("resolves a request board requirement into questCompleted", () => {
    const fetchRequirements = {
      deliver_the_goods: { predicate: "completed_quest", value: "repair_the_bridge" },
    };
    const result = extractFetchQuestVisibility(fetchRequirements, emptyCutsceneMap);
    expect(result["deliver_the_goods" as QuestId]).toEqual({
      type: "questCompleted",
      questId: "repair_the_bridge",
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
    const result = extractHeartLevelChanges(fiddle, cutsceneMap);
    expect(result["breaking_the_water_seal" as QuestId]).toEqual([
      { level: 2, villagerId: "caldarus" },
      { level: 1, villagerId: "seridia" },
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
    const result = extractHeartLevelChanges(fiddle, cutsceneMap);
    expect(result["breaking_the_final_seal" as QuestId]).toEqual([
      { level: 6, villagerId: "caldarus" },
      { level: 6, villagerId: "seridia" },
    ]);
  });

  it("skips cutscenes with empty heart_level_changes", () => {
    const fiddle = makeFiddle({
      cutscenes: { default: { heart_level_changes: [] } },
    });
    const result = extractHeartLevelChanges(fiddle, emptyCutsceneMap);
    expect(result).toEqual({});
  });

  it("skips cutscenes that don't map to a quest", () => {
    const fiddle = makeFiddle({
      cutscenes: {
        unmapped_cutscene: { heart_level_changes: [{ heart_level: 1, npc_id: "holt" }] },
      },
    });
    const result = extractHeartLevelChanges(fiddle, emptyCutsceneMap);
    expect(result).toEqual({});
  });
});

describe("assignEntityVisibility — items", () => {
  it("leaves a non-gated item always visible", () => {
    const trackerData = makeTrackerData({
      items: {
        seed_turnip: {
          category: "seeds",
          name: "Turnip Seed",
          sources: [{ type: "default" }],
        },
      },
      stores: { general: { name: "General Store" } },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    expect(trackerData.items["seed_turnip" as ItemId].visibility).toBeUndefined();
  });

  it("derives item visibility from inline acquisition sources", () => {
    const trackerData = makeTrackerData({
      items: {
        fancy_seed: {
          category: "seeds",
          name: "Fancy Seed",
          sources: [{ type: "store", storeId: "general" }],
        },
      },
      stores: {
        general: {
          name: "General Store",
          visibility: { type: "questCompleted", questId: "repair_the_general_store" as QuestId },
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    expect(trackerData.items["fancy_seed" as ItemId].visibility).toEqual({
      type: "questCompleted",
      questId: "repair_the_general_store",
    });
  });

  it("ORs multiple inline acquisition sources for item visibility", () => {
    const trackerData = makeTrackerData({
      items: {
        dual_source_item: {
          category: "other",
          name: "Dual Source Item",
          sources: [
            { type: "store", storeId: "general" },
            { type: "quest", questId: "find_the_thing" as QuestId, trigger: "completion" },
          ],
        },
      },
      stores: {
        general: {
          name: "General Store",
          visibility: { type: "questCompleted", questId: "repair_the_general_store" as QuestId },
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    expect(trackerData.items["dual_source_item" as ItemId].visibility).toEqual({
      type: "or",
      conditions: [
        { type: "questCompleted", questId: "repair_the_general_store" },
        { type: "questCompleted", questId: "find_the_thing" },
      ],
    });
  });

  it("ANDs a store gate with supported stock availability", () => {
    const trackerData = makeTrackerData({
      items: {
        gated_stock: {
          category: "other",
          name: "Gated Stock",
          sources: [
            {
              type: "store",
              availability: { type: "skillLevel", level: 15, skillId: "woodcrafting" },
              storeId: "carpenter",
            },
          ],
        },
      },
      stores: {
        carpenter: {
          name: "Carpenter",
          visibility: { type: "questCompleted", questId: "upgrade_the_carpenters_shop" },
        },
      },
    });

    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    const item = trackerData.items["gated_stock" as ItemId];
    expect(item.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "upgrade_the_carpenters_shop" },
        { type: "skillLevel", level: 15, skillId: "woodcrafting" },
      ],
    });
    expect(item.sources?.[0]).toMatchObject({
      visibility: {
        type: "and",
        conditions: [
          { type: "questAvailable", questId: "upgrade_the_carpenters_shop" },
          { type: "skillLevel", level: 15, skillId: "woodcrafting" },
        ],
      },
    });
  });

  it("ORs alternative acquisition paths after composing each source", () => {
    const trackerData = makeTrackerData({
      items: {
        alternative_paths: {
          category: "other",
          name: "Alternative Paths",
          sources: [
            {
              type: "store",
              availability: { type: "perkUnlocked", perkId: "heavy_duty" },
              storeId: "carpenter",
            },
            { type: "forage" },
          ],
        },
      },
      stores: {
        carpenter: {
          name: "Carpenter",
          visibility: { type: "questCompleted", questId: "upgrade_the_carpenters_shop" },
        },
      },
    });

    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    expect(trackerData.items["alternative_paths" as ItemId].visibility).toBeUndefined();
  });

  it("does not mutate a source object shared by two fixtures", () => {
    const shared: Source = { type: "store", storeId: "general" as StoreId };
    const first = makeTrackerData({
      items: {
        first: {
          category: "other",
          name: "First",
          sources: [shared],
        },
      },
    });
    const second = makeTrackerData({
      items: {
        second: {
          category: "other",
          name: "Second",
          sources: [shared],
        },
      },
    });

    assignEntityVisibility(first, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    assignEntityVisibility(second, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    expect(shared).not.toHaveProperty("visibility");
    expect(first.items["first" as ItemId].sources?.[0]).not.toBe(shared);
    expect(second.items["second" as ItemId].sources?.[0]).not.toBe(shared);
  });

  it("projects the reviewed Void Herb quest gate into entity visibility", () => {
    const trackerData = makeTrackerData({
      items: {
        void_herb: {
          category: "other",
          name: "Void Herb",
          sources: [
            {
              type: "forage",
              availability: {
                type: "quest",
                questId: "find_the_magic_key",
                state: "completed",
              },
              locationIds: ["mines"],
            },
          ],
        },
      },
    });

    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    expect(trackerData.items["void_herb" as ItemId].visibility).toEqual({
      type: "questCompleted",
      questId: "find_the_magic_key",
    });
  });
});

describe("assignEntityVisibility — recipes", () => {
  it("projects supported recipe-source availability", () => {
    const trackerData = makeTrackerData({
      recipes: {
        expert_dish: {
          name: "Expert Dish",
          sources: [
            {
              type: "forage",
              availability: { type: "skillLevel", level: 30, skillId: "cooking" },
            },
          ],
        },
      },
    });

    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    const recipe = trackerData.recipes["expert_dish" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "skillLevel", level: 30, skillId: "cooking" });
    expect(recipe.sources[0]).toMatchObject({
      visibility: { type: "skillLevel", level: 30, skillId: "cooking" },
    });
  });

  it("gives a perk-sourced recipe an entity gate of perkUnlocked and a source gate of skillLevel", () => {
    const trackerData = makeTrackerData({
      recipes: {
        stew: {
          name: "Test Recipe",
          sources: [{ type: "perk", perkId: "taste_maker" as PerkId }],
        },
      },
      skills: {
        cooking: {
          name: "Cooking",
          perkTiers: [{}, {}, { taste_maker: { name: "Taste Maker" } }, {}, {}],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["stew" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "perkUnlocked", perkId: "taste_maker" });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "skillLevel",
      level: 20,
      skillId: "cooking",
    });
  });

  it("gives a store-sourced recipe entity questCompleted and source questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        stairs: {
          name: "Test Recipe",
          sources: [{ type: "store", storeId: "carpenter" as StoreId }],
        },
      },
      stores: {
        carpenter: {
          name: "Carpenter",
          visibility: { type: "questCompleted", questId: "upgrade_the_carpenters_shop" as QuestId },
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["stairs" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_carpenters_shop",
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "questAvailable",
      questId: "upgrade_the_carpenters_shop",
    });
  });

  it("leaves a default recipe always visible", () => {
    const trackerData = makeTrackerData({
      recipes: {
        basic_dish: {
          name: "Test Recipe",
          sources: [{ type: "default" }],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["basic_dish" as RecipeId];
    expect(recipe.visibility).toBeUndefined();
    expect(recipe.sources?.[0]).toEqual({ type: "default" });
  });

  it("gives a quest-sourced recipe entity questCompleted and source questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        scroll_of_the_sword: {
          name: "Test Recipe",
          sources: [
            {
              type: "quest",
              questId: "the_final_showdown" as QuestId,
              questType: "story_quests" as never,
            },
          ],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["scroll_of_the_sword" as RecipeId];
    expect(recipe.visibility).toEqual({ type: "questCompleted", questId: "the_final_showdown" });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "questAvailable",
      questId: "the_final_showdown",
    });
  });

  it("gives a mines_chest source an and(minesLevel, perkUnlocked) entity gate and a bare minesLevel source gate", () => {
    const trackerData = makeTrackerData({
      mines: {
        biomes: [
          { floors: { start: 1, end: 20 }, id: "upper_mines" as never, name: "Upper Mines" },
        ],
        maxFloors: 100,
        spells: {},
      },
      recipes: {
        crystal_lamp: {
          name: "Test Recipe",
          sources: [
            {
              type: "mines_chest",
              biomeId: "upper_mines" as never,
              perkId: "taste_maker" as PerkId,
            },
          ],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["crystal_lamp" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "minesLevel", floor: 1 },
        { type: "perkUnlocked", perkId: "taste_maker" },
      ],
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({ type: "minesLevel", floor: 1 });
  });

  it("leaves a museum_donation source's entity and source both always", () => {
    const trackerData = makeTrackerData({
      recipes: {
        set_reward: {
          name: "Test Recipe",
          sources: [{ type: "museum_donation", setCount: 1, wingId: "wing_a" as never }],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["set_reward" as RecipeId];
    expect(recipe.visibility).toBeUndefined();
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toBeUndefined();
  });

  it("treats scroll_bundle sources the same as store sources", () => {
    const trackerData = makeTrackerData({
      recipes: {
        bundle_recipe: {
          name: "Test Recipe",
          sources: [{ type: "scroll_bundle", bundleName: "Void Set", storeId: "zorel" as StoreId }],
        },
      },
    });
    trackerData.stores = {
      ...trackerData.stores,
      ["zorel" as StoreId]: {
        name: "Zorel",
        visibility: {
          type: "questCompleted",
          questId: "upgrade_the_saturday_market_plaza" as QuestId,
        },
      },
    };
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["bundle_recipe" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market_plaza",
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "questAvailable",
      questId: "upgrade_the_saturday_market_plaza",
    });
  });

  it("keeps a starter-store recipe's entity condition as questCompleted while the source becomes questAvailable", () => {
    const trackerData = makeTrackerData({
      recipes: {
        general_dish: {
          name: "Test Recipe",
          sources: [
            {
              type: "store",
              storeId: "general" as StoreId,
              visibility: {
                type: "questCompleted",
                questId: "repair_the_general_store" as QuestId,
              },
            },
          ],
        },
      },
    });
    trackerData.stores = {
      ...trackerData.stores,
      ["general" as StoreId]: { name: "General" },
    };
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["general_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "questCompleted",
      questId: "repair_the_general_store",
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "questAvailable",
      questId: "repair_the_general_store",
    });
  });

  it("composes the store gate and stock gate for a perk-locked store recipe (perk gate dropped)", () => {
    const trackerData = makeTrackerData({
      recipes: {
        espresso: {
          name: "Test Recipe",
          sources: [
            {
              type: "store",
              storeId: "darcy" as StoreId,
              visibility: {
                type: "questCompleted",
                questId: "repair_the_general_store" as QuestId,
              },
            },
          ],
        },
      },
    });
    trackerData.stores = {
      ...trackerData.stores,
      ["darcy" as StoreId]: {
        name: "Darcy",
        visibility: { type: "questCompleted", questId: "repair_the_bridge" as QuestId },
      },
    };
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["espresso" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "repair_the_bridge" },
        { type: "questCompleted", questId: "repair_the_general_store" },
      ],
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "questAvailable", questId: "repair_the_bridge" },
        { type: "questAvailable", questId: "repair_the_general_store" },
      ],
    });
  });

  it("only converts the nested questCompleted leaf to questAvailable in an and(questCompleted, skillLevel) stock gate", () => {
    const trackerData = makeTrackerData({
      recipes: {
        and_gated_dish: {
          name: "Test Recipe",
          sources: [
            {
              type: "store",
              storeId: "general" as StoreId,
              visibility: {
                type: "and",
                conditions: [
                  { type: "questCompleted", questId: "repair_the_general_store" as QuestId },
                  { type: "skillLevel", level: 10, skillId: "cooking" as SkillId },
                ],
              },
            },
          ],
        },
      },
    });
    trackerData.stores = {
      ...trackerData.stores,
      ["general" as StoreId]: { name: "General" },
    };
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["and_gated_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "questCompleted", questId: "repair_the_general_store" },
        { type: "skillLevel", level: 10, skillId: "cooking" },
      ],
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "and",
      conditions: [
        { type: "questAvailable", questId: "repair_the_general_store" },
        { type: "skillLevel", level: 10, skillId: "cooking" },
      ],
    });
  });

  it("only converts the nested questCompleted leaf to questAvailable in an or(questCompleted, minesLevel) stock gate", () => {
    const trackerData = makeTrackerData({
      recipes: {
        or_gated_dish: {
          name: "Test Recipe",
          sources: [
            {
              type: "store",
              storeId: "general" as StoreId,
              visibility: {
                type: "or",
                conditions: [
                  { type: "questCompleted", questId: "repair_the_general_store" as QuestId },
                  { type: "minesLevel", floor: 5 },
                ],
              },
            },
          ],
        },
      },
    });
    trackerData.stores = {
      ...trackerData.stores,
      ["general" as StoreId]: { name: "General" },
    };
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["or_gated_dish" as RecipeId];
    expect(recipe.visibility).toEqual({
      type: "or",
      conditions: [
        { type: "questCompleted", questId: "repair_the_general_store" },
        { type: "minesLevel", floor: 5 },
      ],
    });
    const source = recipe.sources?.[0];
    assert(source);
    assertSourceWithDetails(source);
    expect(source.visibility).toEqual({
      type: "or",
      conditions: [
        { type: "questAvailable", questId: "repair_the_general_store" },
        { type: "minesLevel", floor: 5 },
      ],
    });
  });

  it("takes the weakest (or-combined) condition across multiple sources", () => {
    const trackerData = makeTrackerData({
      recipes: {
        multi_source: {
          name: "Test Recipe",
          sources: [
            { type: "default" },
            { type: "quest", questId: "some_quest" as QuestId, questType: "story_quests" as never },
          ],
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    const recipe = trackerData.recipes["multi_source" as RecipeId];
    expect(recipe.visibility).toBeUndefined();
  });
});

// Perk visibility is now inferred from skill tier levels at the app layer,
// no longer stamped by assignEntityVisibility.

describe("assignEntityVisibility — animals", () => {
  it("gates barn animals behind repair_haydens_barn", () => {
    const trackerData = makeTrackerData({
      animals: {
        horse: {
          cosmetics: {},
          name: "Horse",
          variantTiers: [],
        },
      },
    });
    const fiddle = makeFiddle({
      ranching: {
        animals: { horse: { core: { requirements: { repaired_haydens_farm: true } } } },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, fiddle, makeQuestChains({}));
    expect(trackerData.animals["horse" as AnimalId].visibility).toEqual({
      type: "questCompleted",
      questId: "repair_haydens_barn",
    });
  });

  it("leaves starting animals always visible", () => {
    const trackerData = makeTrackerData({
      animals: { chicken: { cosmetics: {}, name: "Chicken", variantTiers: [] } },
    });
    const fiddle = makeFiddle({ ranching: { animals: { chicken: { core: {} } } } });
    assignEntityVisibility(trackerData, emptyCutsceneMap, fiddle, makeQuestChains({}));
    expect(trackerData.animals["chicken" as AnimalId].visibility).toBeUndefined();
  });
});

describe("assignEntityVisibility — cosmetics", () => {
  it("derives cosmetic visibility from inline acquisition sources", () => {
    const trackerData = makeTrackerData({
      cosmetics: {
        fancy_hat: {
          name: "Fancy Hat",
          slot: "head",
          sources: [{ type: "store", storeId: "wheedle" }],
        },
      },
      stores: {
        wheedle: {
          name: "Wheedle",
          visibility: { type: "questCompleted", questId: "upgrade_the_saturday_market" as QuestId },
        },
      },
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));
    expect(trackerData.cosmetics["fancy_hat" as CosmeticId].visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market",
    });
  });

  it("projects supported cosmetic-source availability", () => {
    const trackerData = makeTrackerData({
      cosmetics: {
        veteran_hat: {
          name: "Veteran Hat",
          slot: "head",
          sources: [
            {
              type: "forage",
              availability: { type: "skillLevel", level: 30, skillId: "combat" },
            },
          ],
        },
      },
    });

    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), makeQuestChains({}));

    const cosmetic = trackerData.cosmetics["veteran_hat" as CosmeticId];
    expect(cosmetic.visibility).toEqual({ type: "skillLevel", level: 30, skillId: "combat" });
    expect(cosmetic.sources?.[0]).toMatchObject({
      visibility: { type: "skillLevel", level: 30, skillId: "combat" },
    });
  });
});

describe("assignEntityVisibility — spells", () => {
  it("maps a spell to the tablet quest chain via the cutscene-quest map", () => {
    const trackerData = makeTrackerData({
      mines: { biomes: [], spells: { summon_rain: { name: "Summon Rain" } } },
    });
    const fiddle = makeFiddle({
      cutscenes: { post_water_seal: { spell_to_unlock: "summon_rain" } },
    });
    const cutsceneMap: CutsceneQuestMap = {
      post_water_seal: { phase: "completed", questId: "the_water_tablet" as QuestId },
    };
    assignEntityVisibility(trackerData, cutsceneMap, fiddle, makeQuestChains({}));
    expect(trackerData.mines.spells["summon_rain" as SpellId].visibility).toEqual({
      type: "questCompleted",
      questId: "the_water_tablet",
    });
  });
});

describe("assignEntityVisibility — quests", () => {
  it("gates a heart quest behind villagerKnown, heartLevel, and the prerequisite quest", () => {
    const trackerData = makeTrackerData({
      quests: { heart: { bird_song: { name: "Bird Song" } } },
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
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), questChains);
    expect(trackerData.quests.heart["bird_song" as QuestId].visibility).toEqual({
      type: "and",
      conditions: [
        { type: "villagerKnown", villagerId: "ryis" },
        { type: "heartLevel", level: 4, villagerId: "ryis" },
        { type: "questCompleted", questId: "bird_song_prereq" },
      ],
    });
  });

  it("gates the first crown quest behind renownLevel and the second behind renownLevel + the prior quest", () => {
    const trackerData = makeTrackerData({
      quests: {
        crown: {
          first_crown_quest: { name: "First" },
          second_crown_quest: { name: "Second" },
        },
      },
    });
    const questChains = makeQuestChains({
      crown: ["first_crown_quest", "second_crown_quest"] as never,
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), questChains);
    expect(trackerData.quests.crown["first_crown_quest" as QuestId].visibility).toEqual({
      type: "renownLevel",
      level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER,
    });
    expect(trackerData.quests.crown["second_crown_quest" as QuestId].visibility).toEqual({
      type: "and",
      conditions: [
        { type: "renownLevel", level: CROWN_QUEST_RENOWN_LEVEL_PLACEHOLDER },
        { type: "questCompleted", questId: "first_crown_quest" },
      ],
    });
  });

  it("resolves a fetch quest's request board requirement", () => {
    const trackerData = makeTrackerData({
      quests: { fetch: { deliver_the_goods: { name: "Deliver the Goods", villager: "holt" } } },
    });
    const questChains = makeQuestChains({
      fetch: {
        deliver_the_goods: { predicate: "completed_quest", value: "repair_the_bridge" },
      } as never,
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), questChains);
    expect(trackerData.quests.fetch["deliver_the_goods" as QuestId].visibility).toEqual({
      type: "questCompleted",
      questId: "repair_the_bridge",
    });
  });

  it("leaves a story quest without prerequisites always visible", () => {
    const trackerData = makeTrackerData({
      quests: { story: { crafting_tutorial: { name: "Crafting Tutorial" } } },
    });
    const questChains = makeQuestChains({
      story: { crafting_tutorial: { prerequisites: [] } } as never,
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), questChains);
    expect(trackerData.quests.story["crafting_tutorial" as QuestId].visibility).toBeUndefined();
  });

  it("gates a story quest behind its prerequisite", () => {
    const trackerData = makeTrackerData({
      quests: { story: { repair_the_mill: { name: "Repair the Mill" } } },
    });
    const questChains = makeQuestChains({
      story: { repair_the_mill: { prerequisites: ["prior_quest" as QuestId] } } as never,
    });
    assignEntityVisibility(trackerData, emptyCutsceneMap, makeFiddle({}), questChains);
    expect(trackerData.quests.story["repair_the_mill" as QuestId].visibility).toEqual({
      type: "questCompleted",
      questId: "prior_quest",
    });
  });
});
