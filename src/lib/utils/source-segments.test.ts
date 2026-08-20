import { describe, expect, it } from "vitest";

import {
  buildBiomeLabel,
  buildPerkLabel,
  buildSourceSegments,
  buildStoreQualifier,
  formatDateLabel,
} from "./source-segments.js";

import type {
  AcquisitionSource,
  ActivityId,
  AnimalId,
  DateId,
  FestivalId,
  ItemId,
  LocationId,
  MinesBiomeId,
  MonsterId,
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  RecipeId,
  SkillId,
  StationId,
  StoreId,
  TreasureChestTierId,
  WaterType,
  WingId,
} from "$lib/types/tracker-data.js";

import type { SegmentLookups } from "./source-segments.js";

const BASE_LOOKUPS: SegmentLookups = {
  animalNames: {},
  biomes: [
    { floors: { start: 1, end: 19 }, id: "biome_0" as MinesBiomeId, name: "Upper Mines" },
    {
      floors: { start: 20, end: 39 },
      id: "biome_1" as MinesBiomeId,
      name: "The Tide Caverns",
    },
    {
      floors: { start: 40, end: 59 },
      id: "biome_2" as MinesBiomeId,
      name: "Deep Earth",
    },
  ],
  categoryVisibility: {},
  entityVisibility: { type: "always" },
  festivals: {},
  itemNames: {},
  itemVisibility: {},
  locationNames: {},
  monsterNames: {},
  npcNames: {},
  npcVisibility: {},
  perks: {
    ["taste_maker" as PerkId]: {
      name: "Taste Maker",
      skillId: "cooking" as SkillId,
      tier: 1,
    },
  },
  perkTierLevels: [1, 5, 10, 15, 20],
  questNames: {},
  questNpcIds: {},
  recipeNames: {},
  skillNames: { ["cooking" as SkillId]: "Cooking" },
  stationNames: {},
  stores: {
    ["general" as StoreId]: {
      article: "the" as const,
      name: "General Store",
      upgradeAction: "repairing",
    },
    ["inn" as StoreId]: { article: "the" as const, name: "Sleeping Dragon Inn" },
  },
  storeVisibility: {},
  treasureChestTiers: {},
};

describe("buildPerkLabel", () => {
  it("creates conditional node with skill name and tier always visible", () => {
    const result = buildPerkLabel("taste_maker" as PerkId, BASE_LOOKUPS);
    expect(result).toEqual([
      {
        condition: { level: 1, skillId: "cooking", type: "skillLevel" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });
});

describe("buildBiomeLabel", () => {
  it("creates conditional node with floor range redacted", () => {
    const result = buildBiomeLabel("biome_1" as MinesBiomeId, BASE_LOOKUPS);
    expect(result).toEqual([
      {
        condition: { floor: 20, type: "minesLevel" },
        redacted: [
          { redacted: true },
          " (Mines floors ",
          { redacted: true },
          "–",
          { redacted: true },
          ")",
        ],
        revealed: ["the Tide Caverns (Mines floors 20–39)"],
      },
    ]);
  });
});

describe("buildStoreQualifier", () => {
  it("returns empty array when visibility is always", () => {
    expect(buildStoreQualifier({ type: "always" }, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("returns empty array when visibility is undefined", () => {
    expect(buildStoreQualifier(undefined, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("uses upgradeAction from store record", () => {
    const vis = { questId: "repair_the_general_store" as QuestId, type: "questAvailable" as const };
    const result = buildStoreQualifier(vis, BASE_LOOKUPS, "general" as StoreId);
    expect(result).toEqual([
      {
        condition: vis,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after repairing)"],
      },
    ]);
  });

  it("defaults to upgrading when no upgradeAction", () => {
    const vis = { questId: "repair_the_inn" as QuestId, type: "questAvailable" as const };
    const result = buildStoreQualifier(vis, BASE_LOOKUPS, "inn" as StoreId);
    expect(result[0]).toMatchObject({
      revealed: [" (after upgrading)"],
    });
  });
});

describe("formatDateLabel", () => {
  it("formats as Season day", () => {
    expect(formatDateLabel("winter", 3)).toBe("Winter 3");
    expect(formatDateLabel("fall", 10)).toBe("Fall 10");
  });
});

describe("buildSourceSegments — simple types", () => {
  it("default", () => {
    const source: AcquisitionSource = { type: "default" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Available from the start"]);
  });

  it("renown", () => {
    const source: AcquisitionSource = { level: 3, type: "renown" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Get the town's renown rank to level 3",
    ]);
  });

  it("museum donation", () => {
    const source: AcquisitionSource = {
      setCount: 3,
      type: "museum_donation",
      wingId: "archaeology" as WingId,
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Complete 3 sets in the Archaeology wing",
    ]);
  });

  it("chicken statue", () => {
    const source: AcquisitionSource = {
      cost: 10,
      type: "chicken_statue",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Chicken Statue (10 beads)",
    ]);
  });

  it("wishing well", () => {
    const source: AcquisitionSource = {
      cost: 500,
      type: "wishing_well",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Wishing Well (500t)",
    ]);
  });

  it("treasure chest", () => {
    const source: AcquisitionSource = {
      tier: "gold" as TreasureChestTierId,
      type: "treasure_chest",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      treasureChestTiers: { ["gold" as TreasureChestTierId]: { name: "Golden Treasure Box" } },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Fish up a Golden Treasure Box"]);
  });

  it("beach cave chest", () => {
    const source: AcquisitionSource = { type: "beach_cave_chest" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Find in the Gold Treasure Chest in the Beach Cave",
    ]);
  });

  it("upgrade — House Stairs", () => {
    const source: AcquisitionSource = {
      storeId: "carpenter" as StoreId,
      type: "upgrade",
      upgradeName: "House Stairs",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Upgrade your home a fourth time"]);
  });

  it("upgrade — Starter Farm Bridge", () => {
    const source: AcquisitionSource = {
      storeId: "carpenter" as StoreId,
      type: "upgrade",
      upgradeName: "Starter Farm Bridge",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Expand your farm"]);
  });

  it("engagement", () => {
    const source: AcquisitionSource = { type: "engagement" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Receive from Elsie after getting to 10 hearts with a dateable character",
    ]);
  });
});

describe("buildSourceSegments — store", () => {
  it("store with non-always storeVisibility", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      stores: { ...BASE_LOOKUPS.stores, darcy: { name: "Darcy's Stall" } },
      storeVisibility: {
        darcy: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" as const },
      },
    };
    const source: AcquisitionSource = { storeId: "darcy" as StoreId, type: "store" };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Purchase from ",
      {
        condition: { questId: "repair_the_bridge", type: "questCompleted" },
        revealed: ["Darcy's Stall"],
      },
    ]);
  });

  it("store with visibility qualifier", () => {
    const vis = { questId: "repair_the_inn" as QuestId, type: "questAvailable" as const };
    const source: AcquisitionSource = {
      storeId: "inn" as StoreId,
      type: "store",
      visibility: vis,
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Purchase from the Sleeping Dragon Inn",
      {
        condition: vis,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after upgrading)"],
      },
    ]);
  });
});

describe("buildSourceSegments — scroll_bundle", () => {
  it("uses recipe visibility for the bundle and source visibility for the qualifier", () => {
    const sourceVisibility = {
      questId: "repair_the_general_store" as QuestId,
      type: "questAvailable" as const,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      entityVisibility: {
        questId: "repair_the_general_store" as QuestId,
        type: "questCompleted",
      },
    };
    const source: AcquisitionSource = {
      bundleName: "Fall Crop Sign Scroll Bundle",
      storeId: "general" as StoreId,
      type: "scroll_bundle",
      visibility: sourceVisibility,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase ",
      {
        condition: { questId: "repair_the_general_store", type: "questCompleted" },
        revealed: ["the Fall Crop Sign Scroll Bundle"],
      },
      " from the General Store",
      {
        condition: sourceVisibility,
        redacted: [" (after ", { redacted: true }, ")"],
        revealed: [" (after repairing)"],
      },
    ]);
  });
});

describe("buildSourceSegments — letter and perk", () => {
  it("gates a shipped item name with item visibility", () => {
    const crystal_berries = "crystal_berries" as ItemId;
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { [crystal_berries]: "Crystal Berries" },
      itemVisibility: {
        [crystal_berries]: { floor: 40, type: "minesLevel" },
      },
    };
    const source: AcquisitionSource = {
      trigger: "shipped_item",
      triggerItemId: crystal_berries,
      type: "letter",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after shipping ",
      { condition: { floor: 40, type: "minesLevel" }, revealed: ["a Crystal Berries"] },
    ]);
  });

  it("gates a donated item name with item visibility", () => {
    const cave_kelp = "cave_kelp" as ItemId;
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { [cave_kelp]: "Cave Kelp" },
      itemVisibility: { [cave_kelp]: { floor: 20, type: "minesLevel" } },
    };
    const source: AcquisitionSource = {
      trigger: "donated_item",
      triggerItemId: cave_kelp,
      type: "letter",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after donating ",
      { condition: { floor: 20, type: "minesLevel" }, revealed: ["a Cave Kelp"] },
    ]);
  });

  it("renders a reached-date trigger without redaction", () => {
    const source: AcquisitionSource = {
      trigger: "reached_date",
      triggerDate: { day: 3, season: "winter" },
      type: "letter",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Receive in a letter after reaching Winter 3",
    ]);
  });

  it("builds the perk grammar for a perk source", () => {
    const source: AcquisitionSource = { perkId: "taste_maker" as PerkId, type: "perk" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)[0]).toBe("Unlock ");
  });
});

describe("buildSourceSegments — festival", () => {
  it("includes the festival store, name, and required date", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      festivals: {
        ["harvest" as FestivalId]: { date: { day: 10, season: "fall" }, name: "Harvest Festival" },
      },
      stores: { ["nora_souvenir_stall" as StoreId]: { name: "Souvenir Stall" } },
    };
    const source: AcquisitionSource = {
      festivalId: "harvest" as FestivalId,
      storeId: "nora_souvenir_stall" as StoreId,
      type: "festival",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase from Souvenir Stall at the Harvest Festival (Fall 10)",
    ]);
  });
});

describe("buildSourceSegments — mines_chest (worked example: Chickpea Curry)", () => {
  it("matches spec worked example", () => {
    const source: AcquisitionSource = {
      biomeId: "biome_1" as MinesBiomeId,
      perkId: "taste_maker" as PerkId,
      type: "mines_chest",
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Find in a Treasure Chest in ",
      {
        condition: { floor: 20, type: "minesLevel" },
        redacted: [
          { redacted: true },
          " (Mines floors ",
          { redacted: true },
          "–",
          { redacted: true },
          ")",
        ],
        revealed: ["the Tide Caverns (Mines floors 20–39)"],
      },
      ", with ",
      {
        condition: { level: 1, skillId: "cooking", type: "skillLevel" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });
});

describe("buildSourceSegments — mines_dig_site (worked example: Stalactite Arch)", () => {
  it("wraps in mechanic gate", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      perks: {
        ...BASE_LOOKUPS.perks,
        natural_beauty: {
          name: "Natural Beauty",
          skillId: "archaeology",
          tier: 3,
          visibility: { level: 10, skillId: "archaeology" as SkillId, type: "skillLevel" as const },
        },
      },
      skillNames: { ...BASE_LOOKUPS.skillNames, archaeology: "Archaeology" },
    };
    const source: AcquisitionSource = {
      biomeId: "biome_2" as MinesBiomeId,
      perkId: "natural_beauty" as PerkId,
      type: "mines_dig_site",
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    const outer = result[0];
    expect(outer).toMatchObject({
      condition: { perkId: "natural_beauty", type: "perkUnlocked" },
    });
  });
});

describe("buildSourceSegments — quest types", () => {
  it("story quest with visibility gate", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      questNames: { unusual_seed: "The Unusual Seed" },
    };
    const source: AcquisitionSource = {
      questId: "unusual_seed" as QuestId,
      questType: "story_quests" as QuestType,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "unusual_seed" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete the ",
      {
        condition: { questId: "unusual_seed", type: "questAvailable" },
        revealed: ["Unusual Seed"],
      },
      " quest",
    ]);
  });

  it("heart quest with NPC and quest name independently gated", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      npcNames: { balor: "Balor" },
      npcVisibility: {
        balor: { questId: "repair_the_bridge" as QuestId, type: "questCompleted" as const },
      },
      questNames: { tall_dark: "Tall, Dark and Mysterious" },
      questNpcIds: { tall_dark: "balor" as NpcId },
    };
    const source: AcquisitionSource = {
      questId: "tall_dark" as QuestId,
      questType: "heart_quests" as QuestType,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "tall_dark" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete ",
      {
        condition: { questId: "repair_the_bridge", type: "questCompleted" },
        revealed: ["Balor"],
      },
      "'s ",
      {
        condition: { questId: "tall_dark", type: "questAvailable" },
        revealed: ["Tall, Dark and Mysterious"],
      },
      " quest",
    ]);
  });

  it("crown quest gated behind renown", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: { crown_quests: { level: 20, type: "renownLevel" as const } },
      questNames: { crown_crops: "Crown Request: Crops" },
    };
    const source: AcquisitionSource = {
      questId: "crown_crops" as QuestId,
      questType: "crown_quests" as QuestType,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "crown_crops" as QuestId, type: "questAvailable" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      condition: { level: 20, type: "renownLevel" },
    });
  });

  it("fetch quest gates NPC and requested item independently", () => {
    const source: AcquisitionSource = {
      questId: "request_for_berries" as QuestId,
      questType: "fetch_quests" as QuestType,
      requestedItemId: "wild_berries" as ItemId,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "request_for_berries" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["wild_berries" as ItemId]: "Wild Berries" },
      npcNames: { ["eiland" as NpcId]: "Eiland" },
      npcVisibility: { ["eiland" as NpcId]: { type: "always" } },
      questNpcIds: { ["request_for_berries" as QuestId]: "eiland" as NpcId },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Complete Eiland's request for ",
      {
        condition: { questId: "request_for_berries", type: "questAvailable" },
        revealed: ["Wild Berries"],
      },
    ]);
  });

  it("wraps cooking challenges in their category gate", () => {
    const source: AcquisitionSource = {
      challengeRecipeId: "crispy_fried_earthshroom" as RecipeId,
      questId: "tali_earthshroom" as QuestId,
      questType: "tali_challenges" as QuestType,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "tali_earthshroom" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: {
        tali_challenges: { npcId: "taliferro" as NpcId, type: "npcKnown" },
      },
      recipeNames: { ["crispy_fried_earthshroom" as RecipeId]: "Crispy Fried Earthshroom" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      {
        condition: { npcId: "taliferro", type: "npcKnown" },
        revealed: [
          "Complete the ",
          {
            condition: { questId: "tali_earthshroom", type: "questAvailable" },
            revealed: ["Crispy Fried Earthshroom"],
          },
          " cooking challenge",
        ],
      },
    ]);
  });

  it("wraps mission quests in their category gate", () => {
    const source: AcquisitionSource = {
      questId: "lost_relic" as QuestId,
      questType: "stillwell_challenges" as QuestType,
      trigger: "completion",
      type: "quest",
      visibility: { questId: "lost_relic" as QuestId, type: "questAvailable" },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      categoryVisibility: {
        stillwell_challenges: { npcId: "stillwell" as NpcId, type: "npcKnown" },
      },
      questNames: { ["lost_relic" as QuestId]: "Lost Relic" },
    };
    expect(buildSourceSegments(source, lookups)[0]).toMatchObject({
      condition: { npcId: "stillwell", type: "npcKnown" },
    });
  });
});

describe("buildSourceSegments — item/cosmetic source types", () => {
  it("animal_product with known animal name", () => {
    const source: AcquisitionSource = { animalId: "alpaca" as AnimalId, type: "animal_product" };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      animalNames: { ["alpaca" as AnimalId]: "Alpaca" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Collect from Alpaca"]);
  });

  it("animal_product falls back to title-cased id", () => {
    const source: AcquisitionSource = { animalId: "dairy_cow" as AnimalId, type: "animal_product" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Collect from Dairy Cow"]);
  });

  it("artifact_dig with locations", () => {
    const source: AcquisitionSource = {
      locationIds: ["narrows" as LocationId, "eastern_road" as LocationId],
      type: "artifact_dig",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { eastern_road: "Eastern Road", narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dig up at Narrows, Eastern Road"]);
  });

  it("artifact_dig without locations", () => {
    const source: AcquisitionSource = { type: "artifact_dig" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dig up at an artifact dig site"]);
  });

  it("artifact_replicator", () => {
    const source: AcquisitionSource = {
      originalItemId: "ancient_vase" as ItemId,
      type: "artifact_replicator",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["ancient_vase" as ItemId]: "Ancient Vase" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Replicate from Ancient Vase"]);
  });

  it("bug_catch with locations", () => {
    const source: AcquisitionSource = {
      locationIds: ["narrows" as LocationId, "eastern_road" as LocationId],
      type: "bug_catch",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { eastern_road: "Eastern Road", narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Catch at Narrows, Eastern Road"]);
  });

  it("bug_catch without locations", () => {
    const source: AcquisitionSource = { type: "bug_catch" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Catch"]);
  });

  it("crop from seed", () => {
    const source: AcquisitionSource = {
      seedItemId: "turnip_seeds" as ItemId,
      type: "crop",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["turnip_seeds" as ItemId]: "Turnip Seeds" },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result[0]).toContain("Grow");
    expect(result).toEqual(["Grow from Turnip Seeds"]);
  });

  it("date", () => {
    const source: AcquisitionSource = { dateId: "date_1" as DateId, type: "date" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Receive on a date"]);
  });

  it("dive with water types", () => {
    const source: AcquisitionSource = { type: "dive", waterTypes: ["ocean" as WaterType] };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dive in Ocean"]);
  });

  it("dive without water types", () => {
    const source: AcquisitionSource = { type: "dive" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dive"]);
  });

  it("equipment", () => {
    const source: AcquisitionSource = { itemId: "fishing_rod" as ItemId, type: "equipment" };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["fishing_rod" as ItemId]: "Fishing Rod" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Use Fishing Rod"]);
  });

  it("festival_activity", () => {
    const source: AcquisitionSource = {
      activityId: "harvest_race" as ActivityId,
      festivalId: "harvest_festival" as FestivalId,
      type: "festival_activity",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      festivals: {
        ["harvest" as FestivalId]: { date: { day: 10, season: "fall" }, name: "Harvest Festival" },
      },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Participate in an activity at the Harvest Festival",
    ]);
  });

  it("fish with water types", () => {
    const source: AcquisitionSource = { type: "fish", waterTypes: ["river" as WaterType] };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toContain("Catch");
    expect(result).toEqual(["Catch in River"]);
  });

  it("fish without water types", () => {
    const source: AcquisitionSource = { type: "fish" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Catch while fishing"]);
  });

  it("fish_trap", () => {
    const source: AcquisitionSource = { type: "fish_trap" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Catch in a fish trap"]);
  });

  it("forage with locations", () => {
    const source: AcquisitionSource = {
      locationIds: ["narrows" as LocationId],
      type: "forage",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Forage at Narrows"]);
  });

  it("forage without locations", () => {
    const source: AcquisitionSource = { type: "forage" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Forage in the wild"]);
  });

  it("mine wraps biome label", () => {
    const source: AcquisitionSource = { biomeId: "biome_0" as MinesBiomeId, type: "mine" };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Mine in ");
    expect(result[1]).toMatchObject({
      condition: { floor: 1, type: "minesLevel" },
      revealed: ["the Upper Mines (Mines floors 1–19)"],
    });
  });

  it("monster", () => {
    const source: AcquisitionSource = { monsterId: "slime" as MonsterId, type: "monster" };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, monsterNames: { slime: "Slime" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dropped by Slime"]);
  });

  it("monster_feed", () => {
    const source: AcquisitionSource = { monsterId: "slime" as MonsterId, type: "monster_feed" };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, monsterNames: { slime: "Slime" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Feed Slime"]);
  });

  it("perk_drop", () => {
    const source: AcquisitionSource = {
      activity: "crop_harvest",
      perkId: "taste_maker" as PerkId,
      type: "perk_drop",
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Random drop with ");
    expect(result[1]).toMatchObject({ revealed: ["the Taste Maker perk (Cooking tier 1)"] });
  });

  it("proposal", () => {
    const source: AcquisitionSource = { npcId: "elsie" as NpcId, type: "proposal" };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      npcNames: { elsie: "Elsie" } as Record<NpcId, string>,
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Propose to Elsie"]);
  });

  it("recipe", () => {
    const source: AcquisitionSource = {
      method: "dragon_forge",
      recipeId: "iron_ingot" as RecipeId,
      type: "recipe",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      recipeNames: { iron_ingot: "Iron Ingot" } as Record<RecipeId, string>,
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dragon Forge via Iron Ingot"]);
  });

  it("ritual_chamber", () => {
    const source: AcquisitionSource = { perkId: "taste_maker" as PerkId, type: "ritual_chamber" };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Craft at the Ritual Chamber with ");
    expect(result[1]).toMatchObject({ revealed: ["the Taste Maker perk (Cooking tier 1)"] });
  });

  it("station", () => {
    const source: AcquisitionSource = { stationId: "forge" as StationId, type: "station" };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, stationNames: { forge: "Forge" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Process at Forge"]);
  });

  it("tree", () => {
    const source: AcquisitionSource = { saplingItemId: "apple_sapling" as ItemId, type: "tree" };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["apple_sapling" as ItemId]: "Apple Sapling" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Harvest from Apple Sapling"]);
  });

  it("wedding", () => {
    const source: AcquisitionSource = { type: "wedding" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Receive after getting married"]);
  });
});
