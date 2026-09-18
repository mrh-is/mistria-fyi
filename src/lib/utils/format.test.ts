import { describe, expect, it } from "vitest";

import { formatBiomeName, formatStoreName, withIndefiniteArticle } from "./format";

import type { MinesBiomeId, StoreId } from "$lib/types/tracker-data.js";

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
        floors: { start: 1, end: 19 },
        id: "biome_0" as MinesBiomeId,
        name: "The Tide Caverns",
      },
    ];
    expect(formatBiomeName("biome_0" as MinesBiomeId, biomes)).toBe("the Tide Caverns");
  });
  it("prepends 'the' for names without leading article", () => {
    const biomes = [
      {
        floors: { start: 20, end: 39 },
        id: "biome_1" as MinesBiomeId,
        name: "Upper Mines",
      },
    ];
    expect(formatBiomeName("biome_1" as MinesBiomeId, biomes)).toBe("the Upper Mines");
  });
});
