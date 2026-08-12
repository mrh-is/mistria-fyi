import { describe, expect, it } from "vitest";

import {
  formatBiomeName,
  formatStoreName,
  recipeSourceLabel,
  withIndefiniteArticle,
} from "./format.js";

import type { BiomeId, RecipeSource, StoreId } from "$lib/types/tracker-data.js";

import type { RecipeSourceLookups } from "./format.js";

const EMPTY_LOOKUPS: RecipeSourceLookups = {
  biomes: [],
  festivals: {},
  itemNames: {},
  perks: {},
  perkTierLevels: [],
  questNames: {},
  skillNames: {},
  stores: {},
  treasureChestTiers: {},
};

describe("withIndefiniteArticle", () => {
  it("uses 'an' for vowel-starting names", () => {
    expect(withIndefiniteArticle("Apple")).toBe("an Apple");
  });
  it("uses 'a' for consonant-starting names", () => {
    expect(withIndefiniteArticle("Potato")).toBe("a Potato");
  });
});

describe("formatStoreName", () => {
  it("prepends article when present", () => {
    const stores = {
      general_store: { article: "the" as const, name: "General Store" },
    } as Record<StoreId, { article?: "the"; name: string }>;
    expect(formatStoreName("general_store" as StoreId, stores)).toBe("the General Store");
  });
  it("omits article for possessive names", () => {
    const stores = {
      merri_stall: { name: "Merri's Stall" },
    } as Record<StoreId, { article?: "the"; name: string }>;
    expect(formatStoreName("merri_stall" as StoreId, stores)).toBe("Merri's Stall");
  });
  it("falls back to titleCase for unknown stores", () => {
    expect(
      formatStoreName(
        "unknown_shop" as StoreId,
        {} as Record<StoreId, { article?: "the"; name: string }>,
      ),
    ).toBe("Unknown Shop");
  });
});

describe("formatBiomeName", () => {
  it("lowercases leading 'The' in biome names", () => {
    const biomes = [
      {
        endFloor: 19,
        id: "biome_0" as BiomeId,
        name: "The Tide Caverns",
        startFloor: 1,
      },
    ];
    expect(formatBiomeName("biome_0" as BiomeId, biomes)).toBe("the Tide Caverns");
  });
  it("prepends 'the' for names without leading article", () => {
    const biomes = [
      {
        endFloor: 39,
        id: "biome_1" as BiomeId,
        name: "Upper Mines",
        startFloor: 20,
      },
    ];
    expect(formatBiomeName("biome_1" as BiomeId, biomes)).toBe("the Upper Mines");
  });
});

describe("recipeSourceLabel", () => {
  it("renders default source", () => {
    expect(recipeSourceLabel({ type: "default" }, EMPTY_LOOKUPS)).toBe("Available from the start");
  });
  it("renders store with upgrade", () => {
    const lookups = {
      ...EMPTY_LOOKUPS,
      stores: {
        inn: { article: "the" as const, name: "Sleeping Dragon Inn" },
      } as Record<StoreId, { article?: "the"; name: string }>,
    };
    expect(
      recipeSourceLabel({ storeId: "inn" as StoreId, type: "store", upgraded: true }, lookups),
    ).toBe("Purchase from the Sleeping Dragon Inn (after upgrade)");
  });
  it("renders letter with reached_date", () => {
    const source: RecipeSource = {
      trigger: "reached_date",
      triggerDate: { day: 28, season: "summer" },
      type: "letter",
    };
    expect(recipeSourceLabel(source, EMPTY_LOOKUPS)).toBe(
      "Receive in a letter after reaching Summer 28",
    );
  });
  it("renders treasure_chest with tier name", () => {
    const lookups = {
      ...EMPTY_LOOKUPS,
      treasureChestTiers: { gold: { name: "Golden Treasure Box" } },
    };
    const source: RecipeSource = {
      tier: "gold" as RecipeSource & { type: "treasure_chest" } extends { tier: infer T }
        ? T
        : never,
      type: "treasure_chest",
    };
    expect(recipeSourceLabel(source, lookups)).toBe("Fish up a Golden Treasure Box");
  });
});
