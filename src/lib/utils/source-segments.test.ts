import { describe, expect, it } from "vitest";

import { deepMerge } from "./deep-partial.js";
import {
  buildBiomeLabel,
  buildPerkLabel,
  buildSourceSegments,
  buildStoreQualifier,
  formatDateLabel,
} from "./source-segments.js";

import type { Source } from "$lib/types/acquisition.js";
import type {
  ActivityId,
  AnimalId,
  DateId,
  FestivalId,
  ItemId,
  LocationId,
  MinesBiomeId,
  MonsterId,
  MuseumWingId,
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
} from "$lib/types/tracker-data.js";

import type { SegmentLookups } from "./source-segments.js";

const BASE_LOOKUPS: SegmentLookups = {
  animalNames: {},
  biomes: [
    { floors: { start: 1, end: 19 }, id: "upper_mines" as MinesBiomeId, name: "Upper Mines" },
    {
      floors: { start: 20, end: 39 },
      id: "tide_caverns" as MinesBiomeId,
      name: "The Tide Caverns",
    },
    {
      floors: { start: 40, end: 59 },
      id: "deep_earth" as MinesBiomeId,
      name: "Deep Earth",
    },
  ],
  categoryVisibility: {},
  entityVisibility: undefined,
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
  questTypes: {},
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
        condition: { type: "skillLevel", level: 1, skillId: "cooking" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 1)"],
        revealed: ["the Taste Maker perk (Cooking tier 1)"],
      },
    ]);
  });

  it("uses the final tier threshold for a tier-five perk", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      perks: {
        ...BASE_LOOKUPS.perks,
        ["master_chef" as PerkId]: {
          name: "Master Chef",
          skillId: "cooking" as SkillId,
          tier: 5,
        },
      },
    };

    expect(buildPerkLabel("master_chef" as PerkId, lookups)).toEqual([
      {
        condition: { type: "skillLevel", level: 20, skillId: "cooking" },
        redacted: ["the ", { redacted: true }, " perk (Cooking tier 5)"],
        revealed: ["the Master Chef perk (Cooking tier 5)"],
      },
    ]);
  });
});

describe("buildBiomeLabel", () => {
  it("creates conditional node with floor range redacted", () => {
    const result = buildBiomeLabel("tide_caverns" as MinesBiomeId, BASE_LOOKUPS);
    expect(result).toEqual([
      {
        condition: { type: "minesLevel", floor: 20 },
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
    expect(buildStoreQualifier(undefined, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("returns empty array when visibility is undefined", () => {
    expect(buildStoreQualifier(undefined, BASE_LOOKUPS, "inn" as StoreId)).toEqual([]);
  });

  it("uses upgradeAction from store record", () => {
    const vis = { type: "questAvailable" as const, questId: "repair_the_general_store" as QuestId };
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
    const vis = { type: "questAvailable" as const, questId: "repair_the_inn" as QuestId };
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
    const source: Source = { type: "default" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Available from the start"]);
  });

  it("renown", () => {
    const source: Source = { type: "renown", level: 3 };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Get the town's renown rank to level 3",
    ]);
  });

  it("museum donation", () => {
    const source: Source = {
      type: "museum_donation",
      setCount: 3,
      wingId: "archaeology" as MuseumWingId,
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Complete 3 sets in the Archaeology wing",
    ]);
  });

  it("chicken statue", () => {
    const source: Source = {
      type: "chicken_statue",
      cost: 10,
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Chicken Statue (10 beads)",
    ]);
  });

  it("wishing well", () => {
    const source: Source = {
      type: "wishing_well",
      cost: 500,
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Wishing Well (500t)",
    ]);
  });

  it("treasure chest", () => {
    const source: Source = {
      type: "treasure_chest",
      tier: "gold" as TreasureChestTierId,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      treasureChestTiers: { ["gold" as TreasureChestTierId]: { name: "Golden Treasure Box" } },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Fish up a Golden Treasure Box"]);
  });

  it("lost and found", () => {
    const source: Source = { type: "lost_and_found" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Lost and Found chest",
    ]);
  });

  it("beach cave chest", () => {
    const source: Source = { type: "beach_cave_chest" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Find in the Gold Treasure Chest in the Beach Cave",
    ]);
  });

  it("upgrade — stairs", () => {
    const source: Source = {
      type: "upgrade",
      storeId: "carpenter" as StoreId,
      upgradeName: "stairs",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Upgrade your home a fourth time"]);
  });

  it("upgrade — farm_bridge", () => {
    const source: Source = {
      type: "upgrade",
      storeId: "carpenter" as StoreId,
      upgradeName: "farm_bridge",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Expand your farm"]);
  });

  it("engagement", () => {
    const source: Source = { type: "engagement" };
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
        darcy: { type: "questCompleted" as const, questId: "repair_the_bridge" as QuestId },
      },
    };
    const source: Source = { type: "store", storeId: "darcy" as StoreId };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Purchase from ",
      {
        condition: { type: "questCompleted", questId: "repair_the_bridge" },
        revealed: ["Darcy's Stall"],
      },
    ]);
  });

  it("store with visibility qualifier", () => {
    const vis = { type: "questAvailable" as const, questId: "repair_the_inn" as QuestId };
    const source: Source = {
      type: "store",
      storeId: "inn" as StoreId,
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
      type: "questAvailable" as const,
      questId: "repair_the_general_store" as QuestId,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      entityVisibility: {
        type: "questCompleted",
        questId: "repair_the_general_store" as QuestId,
      },
    };
    const source: Source = {
      type: "scroll_bundle",
      bundleName: "Fall Crop Sign Scroll Bundle",
      storeId: "general" as StoreId,
      visibility: sourceVisibility,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase ",
      {
        condition: { type: "questCompleted", questId: "repair_the_general_store" },
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
        [crystal_berries]: { type: "minesLevel", floor: 40 },
      },
    };
    const source: Source = {
      type: "letter",
      trigger: "shipped_item",
      triggerItemId: crystal_berries,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after shipping ",
      { condition: { type: "minesLevel", floor: 40 }, revealed: ["a Crystal Berries"] },
    ]);
  });

  it("gates a donated item name with item visibility", () => {
    const cave_kelp = "cave_kelp" as ItemId;
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { [cave_kelp]: "Cave Kelp" },
      itemVisibility: { [cave_kelp]: { type: "minesLevel", floor: 20 } },
    };
    const source: Source = {
      type: "letter",
      trigger: "donated_item",
      triggerItemId: cave_kelp,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after donating ",
      { condition: { type: "minesLevel", floor: 20 }, revealed: ["a Cave Kelp"] },
    ]);
  });

  it("renders a reached-date trigger without redaction", () => {
    const source: Source = {
      type: "letter",
      trigger: "reached_date",
      triggerDate: { day: 3, season: "winter" },
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Receive in a letter after reaching Winter 3",
    ]);
  });

  it("builds the perk grammar for a perk source", () => {
    const source: Source = { type: "perk", perkId: "taste_maker" as PerkId };
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
    const source: Source = {
      type: "festival",
      festivalId: "harvest" as FestivalId,
      storeId: "nora_souvenir_stall" as StoreId,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase from Souvenir Stall at the Harvest Festival (Fall 10)",
    ]);
  });
});

describe("buildSourceSegments — mines_chest (worked example: Chickpea Curry)", () => {
  it("matches spec worked example", () => {
    const source: Source = {
      type: "mines_chest",
      biomeId: "tide_caverns" as MinesBiomeId,
      perkId: "taste_maker" as PerkId,
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result).toEqual([
      "Find in a Treasure Chest in ",
      {
        condition: { type: "minesLevel", floor: 20 },
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
        condition: { type: "skillLevel", level: 1, skillId: "cooking" },
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
          visibility: { type: "skillLevel" as const, level: 10, skillId: "archaeology" as SkillId },
        },
      },
      skillNames: { ...BASE_LOOKUPS.skillNames, archaeology: "Archaeology" },
    };
    const source: Source = {
      type: "mines_dig_site",
      biomeId: "deep_earth" as MinesBiomeId,
      perkId: "natural_beauty" as PerkId,
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    const outer = result[0];
    expect(outer).toMatchObject({
      condition: { type: "perkUnlocked", perkId: "natural_beauty" },
    });
  });
});

describe("buildSourceSegments — quest types", () => {
  it("story quest with visibility gate", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      questNames: { unusual_seed: "The Unusual Seed" },
    };
    const source: Source = {
      type: "quest",
      questId: "unusual_seed" as QuestId,
      questType: "story" as QuestType,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "unusual_seed" as QuestId },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete the ",
      {
        condition: { type: "questAvailable", questId: "unusual_seed" },
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
        balor: { type: "questCompleted" as const, questId: "repair_the_bridge" as QuestId },
      },
      questNames: { tall_dark: "Tall, Dark and Mysterious" },
      questNpcIds: { tall_dark: "balor" as NpcId },
    };
    const source: Source = {
      type: "quest",
      questId: "tall_dark" as QuestId,
      questType: "heart" as QuestType,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "tall_dark" as QuestId },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Complete ",
      {
        condition: { type: "questCompleted", questId: "repair_the_bridge" },
        revealed: ["Balor"],
      },
      "'s ",
      {
        condition: { type: "questAvailable", questId: "tall_dark" },
        revealed: ["Tall, Dark and Mysterious"],
      },
      " quest",
    ]);
  });

  it("crown quest gated behind renown", () => {
    const lookups = deepMerge(BASE_LOOKUPS, {
      categoryVisibility: { crown: { type: "renownLevel" as const, level: 20 } },
      questNames: { ["crown_crops" as QuestId]: "Crown Request: Crops" },
    });
    const source: Source = {
      type: "quest",
      questId: "crown_crops" as QuestId,
      questType: "crown" as QuestType,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "crown_crops" as QuestId },
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      condition: { type: "renownLevel", level: 20 },
    });
  });

  it("fetch quest gates NPC and requested item independently", () => {
    const source: Source = {
      type: "quest",
      questId: "request_for_berries" as QuestId,
      questType: "fetch" as QuestType,
      requestedItemId: "wild_berries" as ItemId,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "request_for_berries" as QuestId },
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
        condition: { type: "questAvailable", questId: "request_for_berries" },
        revealed: ["Wild Berries"],
      },
    ]);
  });

  it("wraps cooking challenges in their category gate", () => {
    const source: Source = {
      type: "quest",
      challengeRecipeId: "crispy_fried_earthshroom" as RecipeId,
      questId: "tali_earthshroom" as QuestId,
      questType: "cooking" as QuestType,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "tali_earthshroom" as QuestId },
    };
    const lookups = deepMerge(BASE_LOOKUPS, {
      categoryVisibility: {
        cooking: { type: "npcKnown", npcId: "taliferro" },
      },
      recipeNames: { ["crispy_fried_earthshroom" as RecipeId]: "Crispy Fried Earthshroom" },
    });
    expect(buildSourceSegments(source, lookups)).toEqual([
      {
        condition: { type: "npcKnown", npcId: "taliferro" },
        revealed: [
          "Complete the ",
          {
            condition: { type: "questAvailable", questId: "tali_earthshroom" },
            revealed: ["Crispy Fried Earthshroom"],
          },
          " cooking challenge",
        ],
      },
    ]);
  });

  it("wraps mission quests in their category gate", () => {
    const source: Source = {
      type: "quest",
      questId: "lost_relic" as QuestId,
      questType: "cooking" as QuestType,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "lost_relic" as QuestId },
    };
    const lookups = deepMerge(BASE_LOOKUPS, {
      categoryVisibility: {
        cooking: { type: "npcKnown", npcId: "stillwell" },
      },
      questNames: { ["lost_relic" as QuestId]: "Lost Relic" },
    });
    expect(buildSourceSegments(source, lookups)[0]).toMatchObject({
      condition: { type: "npcKnown", npcId: "stillwell" },
    });
  });
});

describe("buildSourceSegments — item/cosmetic source types", () => {
  it("animal_product with known animal name", () => {
    const source: Source = { type: "animal_product", animalId: "alpaca" as AnimalId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      animalNames: { ["alpaca" as AnimalId]: "Alpaca" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Collect from Alpaca"]);
  });

  it("animal_product falls back to title-cased id", () => {
    const source: Source = { type: "animal_product", animalId: "dairy_cow" as AnimalId };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Collect from Dairy Cow"]);
  });

  it("artifact_dig with locations", () => {
    const source: Source = {
      type: "artifact_dig",
      locationIds: ["narrows" as LocationId, "eastern_road" as LocationId],
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { eastern_road: "Eastern Road", narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dig up at Narrows, Eastern Road"]);
  });

  it("artifact_dig without locations", () => {
    const source: Source = { type: "artifact_dig" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dig up at an artifact dig site"]);
  });

  it("artifact_replicator", () => {
    const source: Source = {
      type: "artifact_replicator",
      originalItemId: "ancient_vase" as ItemId,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["ancient_vase" as ItemId]: "Ancient Vase" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Replicate from Ancient Vase"]);
  });

  it("bug_catch with locations", () => {
    const source: Source = {
      type: "bug_catch",
      locationIds: ["narrows" as LocationId, "eastern_road" as LocationId],
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { eastern_road: "Eastern Road", narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Catch at Narrows, Eastern Road"]);
  });

  it("bug_catch without locations", () => {
    const source: Source = { type: "bug_catch" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Catch"]);
  });

  it("crop from seed", () => {
    const source: Source = {
      type: "crop",
      seedItemId: "turnip_seeds" as ItemId,
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
    const source: Source = { type: "date", dateId: "date_1" as DateId };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Receive on a date"]);
  });

  it("date_inspiration with known item name", () => {
    const source: Source = { type: "date_inspiration", itemId: "inn_menu" as ItemId };
    const lookups = { ...BASE_LOOKUPS, itemNames: { inn_menu: "Inn Menu" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Find the Inn Menu"]);
  });

  it("date_inspiration falls back to title case", () => {
    const source: Source = { type: "date_inspiration", itemId: "fancy_seashell" as ItemId };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Find the Fancy Seashell"]);
  });

  it("dive with water types", () => {
    const source: Source = { type: "dive", waterTypes: ["ocean" as WaterType] };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dive in Ocean"]);
  });

  it("dive without water types", () => {
    const source: Source = { type: "dive" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Dive"]);
  });

  it("equipment", () => {
    const source: Source = { type: "equipment", itemId: "fishing_rod" as ItemId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["fishing_rod" as ItemId]: "Fishing Rod" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Use Fishing Rod"]);
  });

  it("festival_activity", () => {
    const source: Source = {
      type: "festival_activity",
      activityId: "harvest_race" as ActivityId,
      festivalId: "harvest_festival" as FestivalId,
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
    const source: Source = { type: "fish", waterTypes: ["river" as WaterType] };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toContain("Catch");
    expect(result).toEqual(["Catch in River"]);
  });

  it("fish without water types", () => {
    const source: Source = { type: "fish" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Catch while fishing"]);
  });

  it("fish_trap", () => {
    const source: Source = {
      type: "fish_trap",
      baitItemIds: ["fish_bait_common" as ItemId],
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Catch in a fish trap (requires bait)",
    ]);
  });

  it("forage with locations", () => {
    const source: Source = {
      type: "forage",
      locationIds: ["narrows" as LocationId],
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      locationNames: { narrows: "Narrows" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Forage at Narrows"]);
  });

  it("forage without locations", () => {
    const source: Source = { type: "forage" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Forage in the wild"]);
  });

  it("mine wraps biome label", () => {
    const source: Source = { type: "mine", biomeId: "upper_mines" as MinesBiomeId };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Mine in ");
    expect(result[1]).toMatchObject({
      condition: { type: "minesLevel", floor: 1 },
      revealed: ["the Upper Mines (Mines floors 1–19)"],
    });
  });

  it("monster", () => {
    const source: Source = { type: "monster", monsterId: "slime" as MonsterId };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, monsterNames: { slime: "Slime" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dropped by Slime"]);
  });

  it("monster_feed", () => {
    const source: Source = { type: "monster_feed", monsterId: "slime" as MonsterId };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, monsterNames: { slime: "Slime" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Feed Slime"]);
  });

  it("perk_drop", () => {
    const source: Source = {
      type: "perk_drop",
      activity: "crop_harvest",
      perkId: "taste_maker" as PerkId,
    };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Random drop with ");
    expect(result[1]).toMatchObject({ revealed: ["the Taste Maker perk (Cooking tier 1)"] });
  });

  it("proposal", () => {
    const source: Source = { type: "proposal", npcId: "elsie" as NpcId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      npcNames: { elsie: "Elsie" } as Record<NpcId, string>,
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Propose to Elsie"]);
  });

  it("recipe", () => {
    const source: Source = {
      type: "recipe",
      method: "dragon_forge",
      recipeId: "iron_ingot" as RecipeId,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      recipeNames: { iron_ingot: "Iron Ingot" } as Record<RecipeId, string>,
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dragon Forge via Iron Ingot"]);
  });

  it("ritual_chamber", () => {
    const source: Source = { type: "ritual_chamber", perkId: "taste_maker" as PerkId };
    const result = buildSourceSegments(source, BASE_LOOKUPS);
    expect(result[0]).toBe("Craft at the Ritual Chamber with ");
    expect(result[1]).toMatchObject({ revealed: ["the Taste Maker perk (Cooking tier 1)"] });
  });

  it("station", () => {
    const source: Source = { type: "station", stationId: "forge" as StationId };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, stationNames: { forge: "Forge" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Process at Forge"]);
  });

  it("tree", () => {
    const source: Source = { type: "tree", saplingItemId: "apple_sapling" as ItemId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["apple_sapling" as ItemId]: "Apple Sapling" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual(["Harvest from Apple Sapling"]);
  });

  it("wedding", () => {
    const source: Source = { type: "wedding" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Receive after getting married"]);
  });
});
