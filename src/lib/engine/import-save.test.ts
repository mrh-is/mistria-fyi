import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
} from "$lib/engine/progress.js";
import { recordKeys, recordValues } from "$lib/utils.js";

import { buildImportState, parseSaveFiles, validatePlayerSave } from "./import-save";

import type { RecipeId, SkillId, VillagerId } from "$lib/types/tracker-data.js";

import type { SaveBundle } from "./import-save";

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
  it("imports tracked progress from a preceding 1.0.2 save shape", () => {
    const { completed, result } = buildImportState({
      player: { items_acquired: ["animated_waterfall_v2"] },
    });

    expect(completed.almanac).toContain("animated_waterfall_v1");
    expect(result.warnings).toEqual([]);
  });

  it("imports new 1.0.5 item, cosmetic, and recipe progress", () => {
    const { completed, result } = buildImportState({
      player: {
        cosmetic_unlocks: ["facial_hair_friendly_mutton_chops"],
        items_acquired: ["cottage_sofa_oak"],
        recipe_unlocks: ["cottage_sofa"],
      },
    });

    expect(completed.almanac).toContain("cottage_sofa_ash");
    expect(completed.cosmetics).toContain("facial_hair_friendly_mutton_chops");
    expect(completed.almanacRecipes).toContain("cottage_sofa");
    expect(result.warnings).toEqual([]);
  });

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

describe("numeric level domains", () => {
  const ADELINE = "adeline" as VillagerId;
  const FARMING = "farming" as SkillId;
  const facts = (extra: Record<string, unknown>) => ({ gamedata: { t2_world_facts: extra } });

  it("accepts in-domain levels without warnings", () => {
    const { completed, result } = buildImportState({
      gamedata: {
        maximum_mines_level: getMaxMineFloor(),
        t2_world_facts: {
          adeline_heart_level: MAX_VILLAGER_LEVEL,
          farming_level: MAX_SKILL_LEVEL,
          renown: getMaxRenownLevel(),
        },
      },
    });
    expect(completed.mines?.floor).toBe(getMaxMineFloor());
    expect(completed.villagerLevels?.[ADELINE]).toBe(MAX_VILLAGER_LEVEL);
    expect(completed.skillLevels?.[FARMING]).toBe(MAX_SKILL_LEVEL);
    expect(completed.renown).toBe(getMaxRenownLevel());
    expect(result.warnings).toEqual([]);
  });

  it("clamps above-maximum levels and warns, except renown which clamps silently", () => {
    const { completed, result } = buildImportState({
      gamedata: {
        maximum_mines_level: 9999,
        t2_world_facts: { adeline_heart_level: 99, farming_level: 999, renown: 9999 },
      },
    });
    expect(completed.mines?.floor).toBe(getMaxMineFloor());
    expect(completed.villagerLevels?.[ADELINE]).toBe(MAX_VILLAGER_LEVEL);
    expect(completed.skillLevels?.[FARMING]).toBe(MAX_SKILL_LEVEL);
    expect(completed.renown).toBe(getMaxRenownLevel());
    expect(result.counts.renown).toBe(getMaxRenownLevel());
    expect(result.warnings).toEqual([
      `maximum_mines_level 9999 exceeds the maximum of ${getMaxMineFloor()}; clamped to ${getMaxMineFloor()}`,
      `adeline_heart_level 99 exceeds the maximum of ${MAX_VILLAGER_LEVEL}; clamped to ${MAX_VILLAGER_LEVEL}`,
      `farming_level 999 exceeds the maximum of ${MAX_SKILL_LEVEL}; clamped to ${MAX_SKILL_LEVEL}`,
    ]);
  });

  it("floors fractional levels silently", () => {
    const { completed, result } = buildImportState(
      facts({ adeline_heart_level: 3.9, farming_level: 7.2, renown: 2.5 }),
    );
    expect(completed.villagerLevels?.[ADELINE]).toBe(3);
    expect(completed.skillLevels?.[FARMING]).toBe(7);
    expect(completed.renown).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it("ignores negative levels with a warning", () => {
    const { completed, result } = buildImportState(
      facts({ adeline_heart_level: -1, farming_level: -0.5, renown: -3 }),
    );
    expect(completed.villagerLevels?.[ADELINE]).toBeUndefined();
    expect(completed.skillLevels?.[FARMING]).toBeUndefined();
    expect(completed.renown).toBe(0);
    expect(result.warnings).toEqual([
      "adeline_heart_level -1 is negative; ignored",
      "farming_level -0.5 is negative; ignored",
    ]);
  });

  it("ignores nonfinite and wrong-type levels with a warning", () => {
    const { completed, result } = buildImportState({
      gamedata: {
        maximum_mines_level: Number.NaN,
        t2_world_facts: {
          adeline_heart_level: "12",
          farming_level: Number.POSITIVE_INFINITY,
          renown: null,
        },
      },
    });
    expect(completed.mines?.floor).toBe(0);
    expect(completed.villagerLevels?.[ADELINE]).toBeUndefined();
    expect(completed.skillLevels?.[FARMING]).toBeUndefined();
    expect(completed.renown).toBe(0);
    expect(result.warnings).toEqual([
      "maximum_mines_level NaN is not a number; ignored",
      'adeline_heart_level "12" is not a number; ignored',
      "farming_level Infinity is not a number; ignored",
    ]);
  });

  it("treats missing and zero levels as unset without warnings", () => {
    const { completed, result } = buildImportState(facts({ adeline_heart_level: 0 }));
    expect(completed.mines?.floor).toBe(0);
    expect(completed.villagerLevels).toEqual({});
    expect(completed.renown).toBe(0);
    expect(result.warnings).toEqual([]);
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

describe("validatePlayerSave rejections", () => {
  it.each([
    ["null", null],
    ["an array", [{ perks: [] }]],
    ["an empty object", {}],
    ["null-valued record fields", { animal_variant_unlocks: null, items_sold: null }],
    ["wrongly typed list fields", { perks: "cook_perk", recipe_unlocks: { id: true } }],
  ])("rejects %s", (_label, data) => {
    expect(validatePlayerSave(data)).toBe(false);
  });
});

describe("malformed save fields", () => {
  const perkId = recordKeys(recordValues(trackerData.skills)[0].perkTiers[0])[0];

  it("drops a string list field with a warning instead of iterating its characters", () => {
    const { completed, result } = buildImportState({
      player: { cosmetic_unlocks: [], perks: perkId },
    });

    expect(completed.unlockedPerks?.size).toBe(0);
    expect(result.warnings).toEqual(["player.perks is not a list; ignored"]);
  });

  it("drops non-text entries from a list and keeps the rest", () => {
    const { completed, result } = buildImportState({
      player: { perks: [perkId, 7, null, { id: perkId }] },
    });

    expect([...(completed.unlockedPerks ?? [])]).toEqual([perkId]);
    expect(result.warnings).toEqual(["player.perks has 3 non-text entries; ignored"]);
  });

  it("drops wrongly shaped gamedata fields without throwing", () => {
    const { completed, result } = buildImportState({
      gamedata: { museum_progress: { 0: "anything" }, t2_world_facts: [1, 2] },
    });

    expect(completed.museum?.size).toBe(0);
    expect(completed.renown).toBe(0);
    expect(result.warnings).toEqual([
      "gamedata.museum_progress is not a list; ignored",
      "gamedata.t2_world_facts is not an object; ignored",
    ]);
  });

  it("drops null and array records with a warning", () => {
    const animalId = recordKeys(trackerData.animals)[0];
    const { completed, result } = buildImportState({
      player: {
        animal_cosmetic_unlocks: { [animalId]: "not-a-list" },
        animal_variant_unlocks: ["not", "a", "record"],
        cosmetic_unlocks: [],
        items_sold: null,
      },
    });

    expect(completed.animals?.[animalId]?.size).toBe(0);
    expect(result.warnings).toEqual([
      "player.items_sold is not an object; ignored",
      "player.animal_variant_unlocks is not an object; ignored",
      `player.animal_cosmetic_unlocks.${animalId} is not a list; ignored`,
    ]);
  });

  it("never matches inherited object properties as tracker IDs", () => {
    const { completed, result } = buildImportState({
      player: { recipe_unlocks: ["constructor", "__proto__", "toString"] },
    });

    expect(completed.almanacRecipes).toEqual(getDefaultRecipeIds());
    expect(result.warnings).toEqual([]);
  });

  it("ignores an unrecognizable player section with a warning", () => {
    const { completed, result } = buildImportState({
      player: { perks: "cook_perk" },
    });

    expect(completed.unlockedPerks?.size).toBe(0);
    expect(result.warnings).toEqual(["player has no recognized progress fields; ignored"]);
  });
});

describe("quest import", () => {
  const [firstQuest, secondQuest] = recordValues(trackerData.quests).flatMap((category) =>
    recordKeys(category),
  );

  it("imports completed quests as completed", () => {
    const { completed, result } = buildImportState({
      quests: { completed_quests: [firstQuest] },
    });

    expect(completed.questStates).toEqual({ [firstQuest]: "completed" });
    expect(result.counts.quests).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it("imports active quests as obtained", () => {
    const { completed, result } = buildImportState({
      quests: { active_quests: [{ quest_name: secondQuest }] },
    });

    expect(completed.questStates).toEqual({ [secondQuest]: "obtained" });
    expect(result.counts.quests).toBe(1);
  });

  it("keeps a quest in both lists completed and counts it once", () => {
    const { completed, result } = buildImportState({
      quests: {
        active_quests: [{ quest_name: firstQuest }, { quest_name: secondQuest }],
        completed_quests: [firstQuest, firstQuest],
      },
    });

    expect(completed.questStates).toEqual({
      [firstQuest]: "completed",
      [secondQuest]: "obtained",
    });
    expect(result.counts.quests).toBe(2);
  });

  it("warns about unknown quest IDs and nameless active entries", () => {
    const { completed, result } = buildImportState({
      quests: {
        active_quests: [{ quest_name: "not_a_quest" }, { progress: 3 }, "loose"],
        completed_quests: ["constructor"],
      },
    });

    expect(completed.questStates).toEqual({});
    expect(result.counts.quests).toBe(0);
    expect(result.warnings).toEqual([
      "Unknown quest: constructor",
      "quests.active_quests has 2 entries without a quest name; ignored",
      "Unknown quest: not_a_quest",
    ]);
  });
});

describe("parseSaveFiles", () => {
  const json = (name: string, data: unknown) => new File([JSON.stringify(data)], name);
  const player = json("player.json", { perks: [] });

  it("ignores files with other names", async () => {
    const result = await parseSaveFiles([player, json("info.json", { perks: [] })]);

    expect(result).toEqual({ bundle: { player: { perks: [] } }, warnings: [] });
  });

  it("reports that no save files were recognized", async () => {
    const result = await parseSaveFiles([json("notes.json", {})]);

    expect(result.bundle).toBeUndefined();
    expect(result.error).toMatch(/No recognized save files found/);
  });

  it.each([
    ["an array", "[]", "gamedata.json: not a valid JSON object"],
    ["a number", "3", "gamedata.json: not a valid JSON object"],
    ["invalid JSON", "{", "gamedata.json: invalid JSON"],
  ])("rejects a file containing %s", async (_label, text, error) => {
    const result = await parseSaveFiles([new File([text], "gamedata.json")]);

    expect(result).toEqual({ error });
  });

  it("rejects an unrecognizable player.json", async () => {
    const result = await parseSaveFiles([json("player.json", { perks: "cook_perk" })]);

    expect(result).toEqual({ error: "player.json: missing expected fields" });
  });

  it("imports a partial bundle and reports the files it skipped", async () => {
    const quests = json("quests.json", { completed_quests: [] });
    const result = await parseSaveFiles([
      quests,
      new File(["{"], "gamedata.json"),
      json("player.json", {}),
    ]);

    expect(result).toEqual({
      bundle: { quests: { completed_quests: [] } },
      warnings: ["gamedata.json: invalid JSON", "player.json: missing expected fields"],
    });
  });
});
