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
  BiomeId,
  FestivalId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  QuestType,
  RecipeId,
  SkillId,
  StoreId,
  TreasureChestTier,
  WingId,
} from "$lib/types/tracker-data.js";

import type { SegmentLookups } from "./source-segments.js";

const BASE_LOOKUPS: SegmentLookups = {
  biomes: [
    { endFloor: 19, id: "biome_0" as BiomeId, name: "Upper Mines", startFloor: 1 },
    { endFloor: 39, id: "biome_1" as BiomeId, name: "The Tide Caverns", startFloor: 20 },
    { endFloor: 59, id: "biome_2" as BiomeId, name: "Deep Earth", startFloor: 40 },
  ],
  categoryVisibility: {},
  festivalDates: {},
  festivals: {},
  itemNames: {},
  itemVisibility: {},
  npcNames: {},
  npcVisibility: {},
  perks: {
    taste_maker: {
      name: "Taste Maker",
      skillId: "cooking",
      tier: 1,
      visibility: { level: 1, skillId: "cooking" as SkillId, type: "skillLevel" },
    },
  },
  perkTierLevels: [1, 5, 10, 15, 20],
  questNames: {},
  questNpcIds: {},
  recipeNames: {},
  recipeVisibility: { type: "always" },
  skillNames: { cooking: "Cooking" },
  stores: {
    general: { article: "the" as const, name: "General Store", upgradeAction: "repairing" },
    inn: { article: "the" as const, name: "Sleeping Dragon Inn" },
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
    const result = buildBiomeLabel("biome_1" as BiomeId, BASE_LOOKUPS);
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
      cost: { amount: 10, currency: "beads" },
      type: "chicken_statue",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Chicken Statue (10 beads)",
    ]);
  });

  it("wishing well", () => {
    const source: AcquisitionSource = {
      cost: { amount: 500, currency: "tesserae" },
      type: "wishing_well",
    };
    expect(buildSourceSegments(source, BASE_LOOKUPS)).toEqual([
      "Obtain from the Wishing Well (500t)",
    ]);
  });

  it("treasure chest", () => {
    const source: AcquisitionSource = {
      tier: "gold" as TreasureChestTier,
      type: "treasure_chest",
    };
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      treasureChestTiers: { gold: { name: "Golden Treasure Box" } },
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
      recipeVisibility: {
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
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { crystal_berries: "Crystal Berries" },
      itemVisibility: {
        ["crystal_berries" as ItemId]: { floor: 40, type: "minesLevel" },
      },
    };
    const source: AcquisitionSource = {
      trigger: "shipped_item",
      triggerItemId: "crystal_berries" as ItemId,
      type: "letter",
    };
    expect(buildSourceSegments(source, lookups)).toEqual([
      "Receive in a letter after shipping ",
      { condition: { floor: 40, type: "minesLevel" }, revealed: ["a Crystal Berries"] },
    ]);
  });

  it("gates a donated item name with item visibility", () => {
    const lookups: SegmentLookups = {
      ...BASE_LOOKUPS,
      itemNames: { cave_kelp: "Cave Kelp" },
      itemVisibility: { ["cave_kelp" as ItemId]: { floor: 20, type: "minesLevel" } },
    };
    const source: AcquisitionSource = {
      trigger: "donated_item",
      triggerItemId: "cave_kelp" as ItemId,
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
      festivalDates: { ["harvest" as FestivalId]: { day: 10, season: "fall" } },
      festivals: { harvest: { name: "Harvest Festival" } },
      stores: { nora_souvenir_stall: { name: "Souvenir Stall" } },
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
      biomeId: "biome_1" as BiomeId,
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
      biomeId: "biome_2" as BiomeId,
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
      itemNames: { wild_berries: "Wild Berries" },
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
      questNames: { lost_relic: "Lost Relic" },
    };
    expect(buildSourceSegments(source, lookups)[0]).toMatchObject({
      condition: { npcId: "stillwell", type: "npcKnown" },
    });
  });
});
