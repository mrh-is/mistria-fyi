import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { buildImportState, validatePlayerSave } from "../import-save";

import type { RecipeId } from "$lib/types/tracker-data.js";

import type { SaveBundle } from "../import-save";

function getDefaultRecipeIds(): Set<RecipeId> {
  const ids = new Set<RecipeId>();
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources.some((source) => source.type === "default")) {
      ids.add(id as RecipeId);
    }
  }
  return ids;
}

describe("buildImportState", () => {
  it("imports direct and item-derived recipe unlocks alongside default recipes", () => {
    const defaultRecipeIds = getDefaultRecipeIds();

    const { completed, result } = buildImportState({
      player: {
        recipe_unlocks: ["ocarina_sprite_statue", "animated_waterfall_v1", "unknown_recipe_unlock"],
      },
    });

    expect(completed.almanacRecipes).toEqual(
      new Set([...defaultRecipeIds, "animated_waterfall", "ocarina_sprite_statue"]),
    );
    expect(result.counts.almanacRecipes).toBe(defaultRecipeIds.size + 2);
    expect(result.warnings).toEqual([]);
  });

  it("imports perks from player.perks", () => {
    const bundle = {
      player: {
        perks: ["magic_design", "green_thumb", "unknown_perk"],
      },
    };
    const { completed, result } = buildImportState(bundle);
    const unlockedPerks = completed.unlockedPerks;
    if (unlockedPerks === undefined) {
      throw new Error("unlockedPerks should be defined");
    }
    expect(unlockedPerks.has("magic_design" as never)).toBe(true);
    expect(unlockedPerks.has("green_thumb" as never)).toBe(true);
    expect(unlockedPerks.has("unknown_perk" as never)).toBe(false);
    expect(result.warnings).toContain("Unknown perk: unknown_perk");
  });

  describe("new progression fields from save", () => {
    it("extracts hasUpperFloor from player.upper_floor", () => {
      const bundle: SaveBundle = {
        player: { items_acquired: [], upper_floor: true },
      };
      const { completed } = buildImportState(bundle);
      expect(completed.hasUpperFloor).toBe(true);
    });

    it("defaults hasUpperFloor to false when missing", () => {
      const bundle: SaveBundle = {
        player: { items_acquired: [] },
      };
      const { completed } = buildImportState(bundle);
      expect(completed.hasUpperFloor).toBe(false);
    });

    it("extracts villagerRelationships from t2_world_facts dating keys", () => {
      const bundle: SaveBundle = {
        gamedata: {
          t2_world_facts: {
            adeline_is_dating: 0,
            juniper_is_dating: 1,
            march_is_dating: 1,
          },
        },
      };
      const { completed } = buildImportState(bundle);
      expect(completed.villagerRelationships).toEqual({
        juniper: "romantic",
        march: "romantic",
      });
    });

    it("derives reachedSeason from gamedata.date timestamp", () => {
      const GAME_SEASON = 28 * 259200;
      const bundle: SaveBundle = {
        gamedata: { date: 2 * GAME_SEASON + 100 },
      };
      const { completed } = buildImportState(bundle);
      expect(completed.reachedSeason).toBe("fall");
    });

    it("returns winter for saves past year 1", () => {
      const GAME_SEASON = 28 * 259200;
      const bundle: SaveBundle = {
        gamedata: { date: 5 * GAME_SEASON },
      };
      const { completed } = buildImportState(bundle);
      expect(completed.reachedSeason).toBe("winter");
    });

    it("defaults reachedSeason to spring when date is missing", () => {
      const bundle: SaveBundle = { gamedata: {} };
      const { completed } = buildImportState(bundle);
      expect(completed.reachedSeason).toBe("spring");
    });
  });
});

describe("colorway normalization", () => {
  it("importing only a nonrepresentative colorway completes the canonical entry", () => {
    const bundle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v2"] },
    };
    const { completed } = buildImportState(bundle);
    const almanac = completed.almanac ?? new Set();
    expect(almanac.has("animated_waterfall_v1" as never)).toBe(true);
    expect(almanac.has("animated_waterfall_v2" as never)).toBe(false);
  });

  it("importing several members of one group counts as one completion", () => {
    const bundle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v1", "animated_waterfall_v2"] },
    };
    const { completed, result } = buildImportState(bundle);
    const almanac = completed.almanac ?? new Set();
    expect(almanac.has("animated_waterfall_v1" as never)).toBe(true);
    expect(result.counts.almanac).toBeGreaterThanOrEqual(1);
    const countWithBoth = result.counts.almanac;

    const bundleSingle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v1"] },
    };
    const { result: resultSingle } = buildImportState(bundleSingle);
    expect(resultSingle.counts.almanac).toBe(countWithBoth);
  });
});

describe("validatePlayerSave", () => {
  it("accepts a save containing recipe unlocks", () => {
    expect(validatePlayerSave({ recipe_unlocks: ["ocarina_sprite_statue"] })).toBe(true);
  });
});
