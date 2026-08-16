import { describe, expect, it } from "vitest";

import { toLegacyRecipeSource } from "./legacy-recipe-adapter.js";

import type { Source } from "$lib/types/acquisition.js";

describe("toLegacyRecipeSource", () => {
  it("projects structured currency costs to the legacy scalar cost", () => {
    expect(
      toLegacyRecipeSource({
        cost: { amount: 10, currency: "beads" },
        type: "chicken_statue",
      }),
    ).toEqual({ cost: 10, type: "chicken_statue" });
  });

  it("faithfully flattens representable conjunctions into legacy restrictions", () => {
    const source: Source = {
      availability: {
        conditions: [
          { seasons: ["spring", "summer"], type: "season" },
          { type: "weather", weathers: ["calm"] },
          { start: 600, end: 1200, type: "time" },
          { floor: 20, type: "minesLevel" },
          { perkId: "prepared_picker" as never, type: "perkUnlocked" },
          { level: 15, skillId: "farming" as never, type: "skillLevel" },
          { type: "always" },
        ],
        type: "all",
      },
      storeId: "general" as never,
      type: "store",
    };

    expect(toLegacyRecipeSource(source)).toEqual({
      restrictions: [
        { seasons: ["spring", "summer"], type: "season" },
        { type: "weather", weathers: ["calm"] },
        { hours: [600, 1200], type: "time" },
        { level: 20, type: "minesLevel" },
        { perk: "prepared_picker", type: "perk" },
        { level: 15, skill: "farming", type: "skill" },
      ],
      storeId: "general",
      type: "store",
    });
  });

  it("rejects availability that the flat legacy contract cannot preserve", () => {
    expect(() =>
      toLegacyRecipeSource({
        availability: {
          conditions: [
            { seasons: ["spring"], type: "season" },
            { seasons: ["summer"], type: "season" },
          ],
          type: "any",
        },
        storeId: "general" as never,
        type: "store",
      }),
    ).toThrow(
      'Cannot project canonical store source to LegacyRecipeSource: availability type "any" is not flattenable',
    );
  });

  it("rejects a canonical source variant that cannot acquire a recipe", () => {
    expect(() =>
      toLegacyRecipeSource({ seedItemId: "turnip_seed" as never, type: "crop" }),
    ).toThrow(
      'Cannot project canonical crop source to LegacyRecipeSource: source type "crop" is not representable',
    );
  });
});
