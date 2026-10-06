import { describe, expect, it } from "vitest";

import { deepMerge } from "#lib/test-utils/deep-partial.js";

import {
  buildBiomeLabel,
  buildPerkLabel,
  buildSourceSegments,
  buildStoreQualifier,
  formatDateLabel,
} from "./source-segments.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
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
  PerkId,
  QuestId,
  QuestType,
  RecipeId,
  SkillId,
  StationId,
  StoreId,
  TreasureChestTierId,
  VillagerId,
  WaterType,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { SegmentLookups } from "./source-segments.js";

const BASE_LOOKUPS: SegmentLookups = {
  animalNames: {},
  biomes: [
    {
      floors: { start: 1, end: 19 },
      id: "upper_mines" as MinesBiomeId,
      name: "Upper Mines",
    },
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
  bundleNames: {},
  categoryVisibility: {},
  entityVisibility: undefined,
  festivals: {},
  itemNames: {},
  itemVisibility: {},
  locale: "en",
  locationNames: {},
  monsterNames: {},
  museumWingNames: {},
  perks: {
    ["taste_maker" as PerkId]: {
      name: "Taste Maker",
      skillId: "cooking" as SkillId,
      tier: 1,
    },
  },
  perkTierLevels: [1, 5, 10, 15, 20],
  questNames: {},
  questTypes: {},
  questVillagerIds: {},
  recipeNames: {},
  seasonNames: { fall: "Fall", spring: "Spring", summer: "Summer", winter: "Winter" },
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
  villagerNames: {},
  villagerVisibility: {},
  waterNames: {},
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
  it("returns undefined when visibility is always", () => {
    expect(
      buildStoreQualifier(
        { type: "store", storeId: "inn" as StoreId, visibility: { type: "always" } },
        BASE_LOOKUPS,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when visibility is undefined", () => {
    expect(
      buildStoreQualifier({ type: "store", storeId: "inn" as StoreId }, BASE_LOOKUPS),
    ).toBeUndefined();
  });

  it("uses upgradeAction from store record", () => {
    const vis = { type: "questAvailable" as const, questId: "repair_the_general_store" as QuestId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      storeVisibility: {
        ["general" as StoreId]: {
          type: "questCompleted",
          questId: "repair_the_general_store" as QuestId,
        },
      },
    };
    const result = buildStoreQualifier(
      { type: "store", storeId: "general" as StoreId, visibility: vis },
      lookups,
    );
    expect(result).toEqual({
      condition: vis,
      redacted: [{ redacted: true }],
      revealed: ["after repairing"],
    });
  });

  it("defaults to upgrading when no upgradeAction", () => {
    const vis = { type: "questAvailable" as const, questId: "repair_the_inn" as QuestId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      storeVisibility: {
        ["inn" as StoreId]: {
          type: "questCompleted",
          questId: "repair_the_inn" as QuestId,
        },
      },
    };
    const result = buildStoreQualifier(
      { type: "store", storeId: "inn" as StoreId, visibility: vis },
      lookups,
    );
    expect(result).toMatchObject({
      revealed: ["after upgrading"],
    });
  });

  it("does not repeat a stock quest that is also the store gate", () => {
    const questId = "repair_the_general_store" as QuestId;
    const source: Source = {
      type: "store",
      availability: { type: "quest", questId, state: "completed" },
      storeId: "general" as StoreId,
      visibility: { type: "questAvailable", questId },
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      storeVisibility: {
        ["general" as StoreId]: { type: "questCompleted", questId },
      },
    };

    expect(buildStoreQualifier(source, lookups)).toEqual({
      condition: source.visibility,
      redacted: [{ redacted: true }],
      revealed: ["after repairing"],
    });
  });

  const STORE_LOOKUPS: SegmentLookups = {
    ...BASE_LOOKUPS,
    perks: {
      ...BASE_LOOKUPS.perks,
      ["taste_maker" as PerkId]: {
        name: "Taste Maker",
        skillId: "cooking" as SkillId,
        tier: 1,
      },
    },
    questNames: { ["stock_the_pantry" as QuestId]: "Stock the Pantry" },
    skillNames: {
      ...BASE_LOOKUPS.skillNames,
      ["woodcrafting" as SkillId]: "Woodcrafting",
    },
    villagerNames: { ["juniper" as VillagerId]: "Juniper" },
  };

  it.each([
    [
      { type: "perkUnlocked", perkId: "taste_maker" },
      { type: "perkUnlocked", perkId: "taste_maker" },
      "with the Taste Maker perk (Cooking tier 1)",
    ],
    [
      { type: "skillLevel", level: 15, skillId: "woodcrafting" },
      { type: "skillLevel", level: 15, skillId: "woodcrafting" },
      "at Woodcrafting level 15",
    ],
    [
      { type: "minesLevel", floor: 40 },
      { type: "minesLevel", floor: 40 },
      "after reaching Mines floor 40",
    ],
    [
      { type: "heartLevel", level: 4, villagerId: "juniper" },
      { type: "heartLevel", level: 4, villagerId: "juniper" },
      "at 4 hearts with Juniper",
    ],
    [
      { type: "quest", questId: "stock_the_pantry", state: "completed" },
      { type: "questAvailable", questId: "stock_the_pantry" },
      "after completing Stock the Pantry",
    ],
    [
      { type: "quest", questId: "stock_the_pantry", state: "available" },
      { type: "questAvailable", questId: "stock_the_pantry" },
      "once Stock the Pantry is available",
    ],
  ] as const)("renders stock availability %#", (availability, visibility, revealed) => {
    const source: Source = {
      type: "store",
      availability: availability as AvailabilityCondition,
      storeId: "general" as StoreId,
      visibility: visibility as unknown as VisibilityCondition,
    };

    expect(buildStoreQualifier(source, STORE_LOOKUPS)).toEqual({
      condition: source.visibility,
      redacted: [{ redacted: true }],
      revealed: [revealed],
    });
  });

  it("renders every supported all branch in traversal order", () => {
    const source: Source = {
      type: "store",
      availability: {
        type: "all",
        conditions: [
          { type: "minesLevel", floor: 40 },
          { type: "skillLevel", level: 15, skillId: "woodcrafting" as SkillId },
        ],
      },
      storeId: "general" as StoreId,
      visibility: { type: "minesLevel", floor: 40 },
    };

    expect(buildStoreQualifier(source, STORE_LOOKUPS)).toMatchObject({
      redacted: [{ redacted: true }, " and ", { redacted: true }],
      revealed: ["after reaching Mines floor 40 and at Woodcrafting level 15"],
    });
  });

  it("groups a fully supported any condition", () => {
    const source: Source = {
      type: "store",
      availability: {
        type: "any",
        conditions: [
          { type: "minesLevel", floor: 40 },
          { type: "skillLevel", level: 15, skillId: "woodcrafting" as SkillId },
        ],
      },
      storeId: "general" as StoreId,
      visibility: { type: "minesLevel", floor: 40 },
    };

    expect(buildStoreQualifier(source, STORE_LOOKUPS)).toMatchObject({
      revealed: ["after one of: reaching Mines floor 40 or Woodcrafting level 15"],
    });
  });

  it("omits an any condition containing an unsupported branch", () => {
    const source: Source = {
      type: "store",
      availability: {
        type: "any",
        conditions: [
          { type: "minesLevel", floor: 40 },
          { type: "gamePredicate", predicate: "native_flag", value: true },
        ],
      },
      storeId: "general" as StoreId,
      visibility: { type: "always" },
    };

    expect(buildStoreQualifier(source, STORE_LOOKUPS)).toBeUndefined();
  });

  it.each([
    { type: "season", seasons: ["spring"] },
    { type: "weather", weathers: ["sunny"] },
    { type: "time", start: 600, end: 1800 },
    { type: "not", condition: { type: "always" } },
    { type: "gamePredicate", predicate: "native_flag", value: true },
  ] as const)("omits unsupported stock qualifier %#", (availability) => {
    const source: Source = {
      type: "store",
      availability: availability as AvailabilityCondition,
      storeId: "general" as StoreId,
      visibility: { type: "always" },
    };

    expect(buildStoreQualifier(source, STORE_LOOKUPS)).toBeUndefined();
  });
});

describe("formatDateLabel", () => {
  it("formats as Season day", () => {
    expect(formatDateLabel("winter", 3, BASE_LOOKUPS.seasonNames, "en")).toBe("Winter 3");
    expect(formatDateLabel("fall", 10, BASE_LOOKUPS.seasonNames, "en")).toBe("Fall 10");
  });
});

describe("buildSourceSegments — simple types", () => {
  it("renders reviewed Void Herb foraging throughout the Mines", () => {
    const source: Source = {
      type: "forage",
      availability: {
        type: "quest",
        questId: "find_the_magic_key" as QuestId,
        state: "completed",
      },
      locationIds: ["mines" as LocationId],
    };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, locationNames: { mines: "Mines" } };

    expect(buildSourceSegments(source, lookups)).toEqual(["Forage at Mines"]);
  });

  it("default", () => {
    const source: Source = { type: "default" };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Available from the start"]);
  });

  it("renown", () => {
    const source: Source = { type: "renown", level: 3 };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual(["Get the town rank to level 3"]);
  });

  it("museum donation", () => {
    const source: Source = {
      type: "museum_donation",
      setCount: 3,
      wingId: "archaeology" as MuseumWingId,
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      museumWingNames: { archaeology: "Archaeology" },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
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

  it("chicken statue unlock reward", () => {
    const source: Source = {
      type: "chicken_statue",
      unlockCondition: "breed_all_chicken_tiers",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Chicken Statue after breeding every chicken tier",
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
      "Receive from Elsie after getting to 10 hearts with a dateable villager",
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
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      storeVisibility: {
        ["inn" as StoreId]: {
          type: "questCompleted",
          questId: "repair_the_inn" as QuestId,
        },
      },
    };
    const source: Source = {
      type: "store",
      storeId: "inn" as StoreId,
      visibility: vis,
    };
    const result = buildSourceSegments(source, lookups);
    expect(result).toEqual([
      "Purchase from ",
      {
        condition: { type: "questCompleted", questId: "repair_the_inn" },
        revealed: ["the Sleeping Dragon Inn"],
      },
      " (",
      {
        condition: vis,
        redacted: [{ redacted: true }],
        revealed: ["after upgrading"],
      },
      ")",
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
      storeVisibility: {
        ["general" as StoreId]: {
          type: "questCompleted",
          questId: "repair_the_general_store" as QuestId,
        },
      },
    };
    const source: Source = {
      type: "scroll_bundle",
      bundleName: "Fall Crop Sign Scroll Bundle",
      storeId: "general" as StoreId,
      visibility: sourceVisibility,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Purchase the ",
      {
        condition: { type: "questCompleted", questId: "repair_the_general_store" },
        revealed: ["Fall Crop Sign Scroll Bundle"],
      },
      " from ",
      {
        condition: { type: "questCompleted", questId: "repair_the_general_store" },
        revealed: ["the General Store"],
      },
      " (",
      {
        condition: sourceVisibility,
        redacted: [{ redacted: true }],
        revealed: ["after repairing"],
      },
      ")",
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
      type: "ship_item",
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
      type: "donate_item",
      triggerItemId: cave_kelp,
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after donating ",
      { condition: { type: "minesLevel", floor: 20 }, revealed: ["a Cave Kelp"] },
    ]);
  });

  it("renders a reached-date trigger without redaction", () => {
    const source: Source = {
      type: "reach_day",
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

  it("heart quest with Villager and quest name independently gated", () => {
    const lookups = {
      ...BASE_LOOKUPS,
      questNames: { tall_dark: "Tall, Dark and Mysterious" },
      questVillagerIds: { tall_dark: "balor" as VillagerId },
      villagerNames: { balor: "Balor" },
      villagerVisibility: {
        balor: { type: "questCompleted" as const, questId: "repair_the_bridge" as QuestId },
      },
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
      "’s ",
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

  it("fetch quest gates Villager and requested item independently", () => {
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
      questVillagerIds: { ["request_for_berries" as QuestId]: "eiland" as VillagerId },
      villagerNames: { ["eiland" as VillagerId]: "Eiland" },
      villagerVisibility: { ["eiland" as VillagerId]: { type: "always" } },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Complete Eiland’s request for ",
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
        cooking: { type: "villagerKnown", villagerId: "taliferro" },
      },
      recipeNames: { ["crispy_fried_earthshroom" as RecipeId]: "Crispy Fried Earthshroom" },
    });
    expect(buildSourceSegments(source, lookups)).toEqual([
      {
        condition: { type: "villagerKnown", villagerId: "taliferro" },
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
        cooking: { type: "villagerKnown", villagerId: "stillwell" },
      },
      questNames: { ["lost_relic" as QuestId]: "Lost Relic" },
    });
    expect(buildSourceSegments(source, lookups)[0]).toMatchObject({
      condition: { type: "villagerKnown", villagerId: "stillwell" },
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

  it("animal_product throws for an animal with no name", () => {
    const source: Source = { type: "animal_product", animalId: "dairy_cow" as AnimalId };
    expect(() => buildSourceSegments(source, BASE_LOOKUPS)).toThrow(
      'No "animalNames" entry for id "dairy_cow"',
    );
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
    expect(buildSourceSegments(source, lookups)).toEqual(["Dig up at Narrows or Eastern Road"]);
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
    expect(buildSourceSegments(source, lookups)).toEqual(["Catch at Narrows or Eastern Road"]);
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

  it("date_inspiration throws for an item with no name", () => {
    const source: Source = { type: "date_inspiration", itemId: "fancy_seashell" as ItemId };
    expect(() => buildSourceSegments(source, BASE_LOOKUPS)).toThrow(
      'No "itemNames" entry for id "fancy_seashell"',
    );
  });

  it("dive with water types", () => {
    const source: Source = { type: "dive", waterTypes: ["ocean" as WaterType] };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, waterNames: { ocean: "Ocean" } };
    expect(buildSourceSegments(source, lookups)).toEqual(["Dive in Ocean"]);
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
        ["harvest_festival" as FestivalId]: {
          date: { day: 10, season: "fall" },
          name: "Harvest Festival",
        },
      },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Participate in an activity at the Harvest Festival",
    ]);
  });

  it("fish with water types", () => {
    const source: Source = { type: "fish", waterTypes: ["river" as WaterType] };
    const lookups: SegmentLookups = { ...BASE_LOOKUPS, waterNames: { river: "River" } };
    const result = buildSourceSegments(source, lookups);
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
    const source: Source = { type: "proposal", villagerId: "elsie" as VillagerId };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      villagerNames: { elsie: "Elsie" } as Record<VillagerId, string>,
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

describe("buildSourceSegments — localized rendering", () => {
  const FR_LOOKUPS: SegmentLookups = {
    ...BASE_LOOKUPS,
    biomes: [
      { floors: { start: 20, end: 39 }, id: "tide_caverns" as MinesBiomeId, name: "Mines marines" },
    ],
    locale: "fr",
    stores: { ["general" as StoreId]: { article: "the" as const, name: "Magasin général" } },
    treasureChestTiers: { ["gold" as TreasureChestTierId]: { name: "Coffre au trésor en or" } },
  };

  it("drops English articles from store & chest names outside English", () => {
    expect(
      buildSourceSegments({ type: "store", storeId: "general" as StoreId }, FR_LOOKUPS),
    ).toEqual(["Acheter à : Magasin général"]);
    expect(
      buildSourceSegments(
        { type: "treasure_chest", tier: "gold" as TreasureChestTierId },
        FR_LOOKUPS,
      ),
    ).toEqual(["Pêcher : Coffre au trésor en or"]);
  });

  it("renders the biome label with the locale's floor range & redaction", () => {
    expect(buildBiomeLabel("tide_caverns" as MinesBiomeId, FR_LOOKUPS)).toEqual([
      {
        condition: { type: "minesLevel", floor: 20 },
        redacted: [
          { redacted: true },
          " (étages ",
          { redacted: true },
          " à ",
          { redacted: true },
          " des mines)",
        ],
        revealed: ["Mines marines (étages 20 à 39 des mines)"],
      },
    ]);
  });

  it("joins alternatives with the locale's disjunction", () => {
    const lookups: SegmentLookups = {
      ...FR_LOOKUPS,
      waterNames: { ocean: "Mer", pond: "Étang", river: "Rivière" },
    };
    expect(
      buildSourceSegments(
        {
          type: "fish",
          waterTypes: ["pond" as WaterType, "river" as WaterType, "ocean" as WaterType],
        },
        lookups,
      ),
    ).toEqual(["Pêcher : Étang, Rivière ou Mer"]);
  });

  it("places gated segments where the locale's word order puts them", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { ["wild_berries" as ItemId]: "野いちご" },
      locale: "ja",
      questVillagerIds: { ["request_for_berries" as QuestId]: "eiland" as VillagerId },
      villagerNames: { ["eiland" as VillagerId]: "エイランド" },
      villagerVisibility: {
        ["eiland" as VillagerId]: {
          type: "questCompleted",
          questId: "repair_the_bridge" as QuestId,
        },
      },
    };
    const source: Source = {
      type: "quest",
      questId: "request_for_berries" as QuestId,
      questType: "fetch" as QuestType,
      requestedItemId: "wild_berries" as ItemId,
      trigger: "completion",
      visibility: { type: "questAvailable", questId: "request_for_berries" as QuestId },
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      {
        condition: { type: "questCompleted", questId: "repair_the_bridge" },
        revealed: ["エイランド"],
      },
      "の依頼「",
      {
        condition: { type: "questAvailable", questId: "request_for_berries" },
        revealed: ["野いちご"],
      },
      "」を完了する",
    ]);
  });

  it("places the store qualifier where the locale's word order puts it", () => {
    const questId = "repair_the_general_store" as QuestId;
    const source: Source = {
      type: "store",
      availability: { type: "minesLevel", floor: 20 },
      storeId: "general" as StoreId,
      visibility: {
        type: "and",
        conditions: [
          { type: "questCompleted", questId },
          { type: "minesLevel", floor: 20 },
        ],
      },
    };
    const render = (locale: SegmentLookups["locale"], storeName: string) =>
      buildSourceSegments(source, {
        ...BASE_LOOKUPS,
        locale,
        stores: {
          ["general" as StoreId]: {
            article: "the" as const,
            name: storeName,
            upgradeAction: "repairing",
          },
        },
        storeVisibility: { ["general" as StoreId]: { type: "questCompleted", questId } },
      });
    const qualifier = (revealed: string, conjunction: string) => ({
      condition: source.visibility,
      redacted: [{ redacted: true }, conjunction, { redacted: true }],
      revealed: [revealed],
    });
    const storeGate = (name: string) => ({
      condition: { type: "questCompleted", questId },
      revealed: [name],
    });

    expect(render("en", "General Store")).toEqual([
      "Purchase from ",
      storeGate("the General Store"),
      " (",
      qualifier("after repairing and after reaching Mines floor 20", " and "),
      ")",
    ]);
    expect(render("ja", "雑貨屋")).toEqual([
      qualifier("修理後、鉱坑20階に到達した後", "、"),
      "、",
      storeGate("雑貨屋"),
      "で購入",
    ]);
  });

  it("strips each locale's crown request prefix", () => {
    const source: Source = {
      type: "quest",
      questId: "crown_crops" as QuestId,
      questType: "crown" as QuestType,
      trigger: "completion",
    };
    const render = (locale: SegmentLookups["locale"], name: string) =>
      buildSourceSegments(source, {
        ...BASE_LOOKUPS,
        locale,
        questNames: { ["crown_crops" as QuestId]: name },
      });
    expect(render("en", "Crown Request: Crops")).toEqual(["Complete the Crown Request for Crops"]);
    expect(render("ja", "ロイヤルリクエスト\n作物")).toEqual([
      "ロイヤルリクエスト「作物」を完了する",
    ]);
    expect(render("fr", "Requête royale : récoltes")).toEqual([
      "Terminer la requête royale : récoltes",
    ]);
  });

  it("keeps the story quest's own article outside English", () => {
    const source: Source = {
      type: "quest",
      questId: "the_caldosian_vault" as QuestId,
      questType: "story" as QuestType,
      trigger: "completion",
    };
    const render = (locale: SegmentLookups["locale"], name: string) =>
      buildSourceSegments(source, {
        ...BASE_LOOKUPS,
        locale,
        questNames: { ["the_caldosian_vault" as QuestId]: name },
      });
    expect(render("en", "The Caldosian Vault")).toEqual(["Complete the Caldosian Vault quest"]);
    expect(render("fr", "La chambre forte caldosienne")).toEqual([
      "Terminer la quête : La chambre forte caldosienne",
    ]);
  });
});
