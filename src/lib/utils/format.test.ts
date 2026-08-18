import { describe, expect, it } from "vitest";

import { formatBiomeName, formatStoreName, withIndefiniteArticle } from "./format.js";

import type { BiomeId, StoreId } from "$lib/types/tracker-data.js";

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
