import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";

import { buildPerkUnlocks, perkUnlocksFor } from "./perk-unlocks.js";

import type { PerkId, TrackerData } from "#lib/types/tracker-data.js";

const perk = (id: string): PerkId => id as PerkId;

const fixture = {
  almanac: {
    flowers: {
      items: [{ itemIds: ["rose", "rose_gold"] }, { itemIds: ["tulip"] }],
    },
  },
  cosmetics: {
    hat_a: { sources: [{ type: "ritual_chamber", perkId: "p1" }] },
    hat_b: { sources: [{ type: "store", storeId: "s" }] },
  },
  items: {
    mist_held: { sources: [{ type: "perk", perkId: "p1" }] },
    rose: { sources: [{ type: "perk", perkId: "p1" }] },
    rose_gold: { sources: [{ type: "perk", perkId: "p1" }] },
    tulip: { sources: [{ type: "store", storeId: "s" }] },
  },
  recipes: {
    r1: {
      sources: [
        { type: "perk", perkId: "p2" },
        { type: "mines_chest", biomeId: "b" },
        { type: "mines_dig_site", biomeId: "b", perkId: "p2" },
      ],
    },
    r2: { sources: [{ type: "mines_chest", biomeId: "b", perkId: "p1" }] },
    r3: {
      sources: [
        { type: "store", storeId: "s", visibility: { type: "perkUnlocked", perkId: "p3" } },
      ],
    },
  },
} as unknown as TrackerData;

describe("buildPerkUnlocks", () => {
  const index = buildPerkUnlocks(fixture);

  it("indexes recipes, almanac entries, & cosmetics by the perk their sources name", () => {
    expect(index.get(perk("p1"))).toEqual({
      almanac: ["rose"],
      cosmetics: ["hat_a"],
      recipes: ["r2"],
    });
  });

  it("counts a recipe once however many of its sources name the perk", () => {
    expect(index.get(perk("p2"))).toEqual({ almanac: [], cosmetics: [], recipes: ["r1"] });
  });

  it("ignores perks that only gate a source's visibility", () => {
    expect(index.has(perk("p3"))).toBe(false);
  });
});

describe("perkUnlocksFor", () => {
  it("is undefined for a perk nothing links to", () => {
    expect(perkUnlocksFor(perk("nonexistent"))).toBeUndefined();
  });

  it("indexes the shipped data, with no empty entries", () => {
    const linked = [...buildPerkUnlocks(trackerData).values()];
    expect(linked.length).toBeGreaterThan(0);
    for (const unlocks of linked) {
      expect(
        unlocks.almanac.length + unlocks.cosmetics.length + unlocks.recipes.length,
      ).toBeGreaterThan(0);
    }
  });
});
