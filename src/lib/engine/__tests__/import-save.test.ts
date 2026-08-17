import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { buildImportState, validatePlayerSave } from "../import-save.js";

import type { RecipeId } from "$lib/types/tracker-data.js";

function getDefaultRecipeIds(): Set<RecipeId> {
  const ids = new Set<RecipeId>();
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources?.some((source) => source.type === "default")) {
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
});

describe("validatePlayerSave", () => {
  it("accepts a save containing recipe unlocks", () => {
    expect(validatePlayerSave({ recipe_unlocks: ["ocarina_sprite_statue"] })).toBe(true);
  });
});
