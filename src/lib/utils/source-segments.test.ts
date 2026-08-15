import { describe, expect, it } from "vitest";

import {
  buildBiomeLabel,
  buildPerkLabel,
  buildStoreQualifier,
  formatDateLabel,
} from "./source-segments.js";

import type { BiomeId, PerkId, QuestId, SkillId, StoreId } from "$lib/types/tracker-data.js";

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
