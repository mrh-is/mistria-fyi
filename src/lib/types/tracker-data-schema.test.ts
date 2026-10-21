import * as v from "valibot";
import { describe, expect, expectTypeOf, it } from "vitest";

import trackerDataJson from "../data/tracker-data.json";
import { TrackerDataSchema } from "./tracker-data-schema.js";

import type { ItemId, Source, TrackerData } from "./tracker-data.js";

describe("TrackerDataSchema", () => {
  it("accepts the committed output without stripping or transforming fields", () => {
    expect(v.parse(TrackerDataSchema, trackerDataJson)).toEqual(trackerDataJson);
    expectTypeOf<v.InferOutput<typeof TrackerDataSchema>>().toEqualTypeOf<TrackerData>();
    expectTypeOf<TrackerData["items"][ItemId]["sources"][0]>().toEqualTypeOf<Source>();
  });

  it.each([
    ["version", 123],
    ["festivals", { test: { date: { day: 1, season: "autumn" } } }],
    ["villagers", { test: { birthday: { day: "3", season: "spring" } } }],
    ["skills", { test: { perkTiers: [{}, {}, {}, {}] } }],
    ["perkTierLevels", [1, 2, 3, 4, 5, 6]],
    [
      "cosmetics",
      { test: { slot: "unknown", sources: [{ type: "default" }], subCategory: "hat" } },
    ],
    ["items", { test: { category: "crop", sources: [] } }],
    ["items", { test: { category: "crop", sources: [{ type: "unknown" }] } }],
    ["items", { test: { category: "crop", sources: [{ type: "store" }] } }],
    ["quests", { ...trackerDataJson.quests, cooking: { test: { sources: [] } } }],
    ["mount", { appearances: { test: { sources: [] } } }],
    [
      "animals",
      {
        test: {
          cosmetics: {},
          variantTiers: [{ test: { source: { type: "store", storeId: "shop" } } }],
        },
      },
    ],
    ["townRanks", [{ levels: { start: 1, end: Infinity } }]],
  ])("rejects a malformed %s section", (key, value) => {
    expect(v.safeParse(TrackerDataSchema, { ...trackerDataJson, [key]: value }).success).toBe(
      false,
    );
  });

  it.each([
    { type: "all", conditions: [] },
    { type: "not", condition: { type: "season", seasons: ["autumn"] } },
    { type: "gamePredicate", predicate: "unknown", value: undefined },
    { type: "quest", questId: "quest", state: "unavailable" },
    { type: "always", unexpected: true },
  ])("rejects malformed nested availability: $type", (availability) => {
    const data = {
      ...trackerDataJson,
      recipes: { test: { sources: [{ type: "store", availability, storeId: "shop" }] } },
    };
    expect(v.safeParse(TrackerDataSchema, data).success).toBe(false);
  });

  it("rejects unknown fields instead of silently discarding pipeline mistakes", () => {
    expect(v.safeParse(TrackerDataSchema, { ...trackerDataJson, unexpected: true }).success).toBe(
      false,
    );
    expect(
      v.safeParse(TrackerDataSchema, {
        ...trackerDataJson,
        villagers: { test: { birthday: { day: 1, season: "spring" }, name: "Untranslated" } },
      }).success,
    ).toBe(false);
  });

  it("accepts recursive conditions and JSON-safe unknown game predicates", () => {
    const availability = {
      type: "all",
      conditions: [
        { type: "not", condition: { type: "dateUnlocked" } },
        { type: "gamePredicate", predicate: "unknown", value: { nested: [null, true, 1, "x"] } },
      ],
    };
    expect(
      v.safeParse(TrackerDataSchema, {
        ...trackerDataJson,
        categoryVisibility: { dates: { type: "and", conditions: [{ type: "always" }] } },
        recipes: { test: { sources: [{ type: "store", availability, storeId: "shop" }] } },
      }).success,
    ).toBe(true);
  });
});
