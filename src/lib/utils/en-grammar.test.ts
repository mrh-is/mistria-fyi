import { describe, expect, it } from "vitest";

import {
  displayQuestName,
  formatBiomeName,
  formatStoreName,
  withIndefiniteArticle,
  withoutDefiniteArticle,
} from "./en-grammar.js";

import type { MinesBiomeId, StoreId } from "#lib/types/tracker-data.js";

describe("withIndefiniteArticle", () => {
  it("uses 'an' for vowel-starting names", () => {
    expect(withIndefiniteArticle("Apple", "en")).toBe("an Apple");
  });

  it("uses 'a' for consonant-starting names", () => {
    expect(withIndefiniteArticle("Potato", "en")).toBe("a Potato");
  });
});

describe("formatStoreName", () => {
  it("prepends article when present", () => {
    const stores = {
      general_store: { article: "the" as const, name: "General Store" },
    } as Record<StoreId, { article?: "the"; name: string }>;
    expect(formatStoreName("general_store" as StoreId, stores, "en")).toBe("the General Store");
  });

  it("omits article for possessive names", () => {
    const stores = {
      merri_stall: { name: "Merri's Stall" },
    } as Record<StoreId, { article?: "the"; name: string }>;
    expect(formatStoreName("merri_stall" as StoreId, stores, "en")).toBe("Merri's Stall");
  });

  it("throws for a store with no name", () => {
    expect(() => formatStoreName("unknown_shop" as StoreId, {}, "en")).toThrow(
      'No "stores" entry for id "unknown_shop"',
    );
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
    expect(formatBiomeName("biome_0" as MinesBiomeId, biomes, "en")).toBe("the Tide Caverns");
  });

  it("prepends 'the' for names without leading article", () => {
    const biomes = [
      {
        floors: { start: 20, end: 39 },
        id: "biome_1" as MinesBiomeId,
        name: "Upper Mines",
      },
    ];
    expect(formatBiomeName("biome_1" as MinesBiomeId, biomes, "en")).toBe("the Upper Mines");
  });

  it("throws for a biome with no name", () => {
    expect(() => formatBiomeName("biome_9" as MinesBiomeId, [], "en")).toThrow(
      'No biome for id "biome_9"',
    );
  });
});

describe("non-English locales", () => {
  const stores = { general_store: { article: "the" as const, name: "Boutique" } } as Record<
    StoreId,
    { article?: "the"; name: string }
  >;
  const biomes = [
    { floors: { start: 1, end: 19 }, id: "biome_0" as MinesBiomeId, name: "Les Cavernes" },
  ];

  it("pass names through without English articles", () => {
    expect(withIndefiniteArticle("Apple", "fr")).toBe("Apple");
    expect(formatStoreName("general_store" as StoreId, stores, "fr")).toBe("Boutique");
    expect(formatBiomeName("biome_0" as MinesBiomeId, biomes, "fr")).toBe("Les Cavernes");
    expect(withoutDefiniteArticle("The Tower", "fr")).toBe("The Tower");
  });

  it("leave quest names unshortened", () => {
    expect(displayQuestName("Request for an Apple", "fetch", "fr")).toBe("Request for an Apple");
  });
});

describe("displayQuestName", () => {
  it("strips English fetch & crown request prefixes", () => {
    expect(displayQuestName("Request for an Apple", "fetch", "en")).toBe("Apple");
    expect(displayQuestName("Important Request for a Moon Fruit", "fetch", "en")).toBe(
      "Moon Fruit (Important)",
    );
    expect(displayQuestName("Crown Request: Hat", "crown", "en")).toBe("Hat");
  });
});

describe("withoutDefiniteArticle", () => {
  it("drops a leading The in English only", () => {
    expect(withoutDefiniteArticle("The Tower", "en")).toBe("Tower");
    expect(withoutDefiniteArticle("Tower", "en")).toBe("Tower");
  });
});
