import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  type LevelIssue,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
} from "#lib/engine/progress.js";
import { recordKeys, recordValues } from "#lib/utils.js";

import { buildImportState, parseSaveFiles, validatePlayerSave } from "./import-save.js";

import type { RecipeId, SkillId, VillagerId } from "#lib/types/tracker-data.js";

import type { SaveBundle } from "./import-save.js";

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
    expect(result.warnings).toContainEqual({
      code: "unknown-id",
      id: "unknown_perk",
      path: "player.perks",
    });
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
  const level = (issue: LevelIssue, key: string, value: string, max: number) => ({
    code: "level",
    issue,
    key,
    max,
    value,
  });

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
      level("above-max", "maximum_mines_level", "9999", getMaxMineFloor()),
      level("above-max", "adeline_heart_level", "99", MAX_VILLAGER_LEVEL),
      level("above-max", "farming_level", "999", MAX_SKILL_LEVEL),
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
      level("negative", "adeline_heart_level", "-1", MAX_VILLAGER_LEVEL),
      level("negative", "farming_level", "-0.5", MAX_SKILL_LEVEL),
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
      level("not-a-number", "maximum_mines_level", "NaN", getMaxMineFloor()),
      level("not-a-number", "adeline_heart_level", '"12"', MAX_VILLAGER_LEVEL),
      level("not-a-number", "farming_level", "Infinity", MAX_SKILL_LEVEL),
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
    expect(result.warnings).toEqual([{ code: "not-a-list", path: "player.perks" }]);
  });

  it("drops non-text entries from a list and keeps the rest", () => {
    const { completed, result } = buildImportState({
      player: { perks: [perkId, 7, null, { id: perkId }] },
    });

    expect([...(completed.unlockedPerks ?? [])]).toEqual([perkId]);
    expect(result.warnings).toEqual([
      { code: "unreadable-entries", count: 3, path: "player.perks" },
    ]);
  });

  it("drops wrongly shaped gamedata fields without throwing", () => {
    const { completed, result } = buildImportState({
      gamedata: { museum_progress: { 0: "anything" }, t2_world_facts: [1, 2] },
    });

    expect(completed.museum?.size).toBe(0);
    expect(completed.renown).toBe(0);
    expect(result.warnings).toEqual([
      { code: "not-a-list", path: "gamedata.museum_progress" },
      { code: "not-an-object", path: "gamedata.t2_world_facts" },
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
      { code: "not-an-object", path: "player.items_sold" },
      { code: "not-an-object", path: "player.animal_variant_unlocks" },
      { code: "not-a-list", path: `player.animal_cosmetic_unlocks.${animalId}` },
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
    expect(result.warnings).toEqual([{ code: "unrecognized-player", file: "player" }]);
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
      { code: "unknown-id", id: "constructor", path: "quests.completed_quests" },
      { code: "unreadable-entries", count: 2, path: "quests.active_quests" },
      { code: "unknown-id", id: "not_a_quest", path: "quests.active_quests" },
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
    expect(result.error).toEqual({ code: "no-save-files" });
  });

  it.each([
    ["an array", "[]", "not-json-object"],
    ["a number", "3", "not-json-object"],
    ["invalid JSON", "{", "invalid-json"],
  ] as const)("rejects a file containing %s", async (_label, text, code) => {
    const result = await parseSaveFiles([new File([text], "gamedata.json")]);

    expect(result).toEqual({
      error: { code: "no-valid-files", problems: [{ code, file: "gamedata.json" }] },
    });
  });

  it("rejects an unrecognizable player.json", async () => {
    const result = await parseSaveFiles([json("player.json", { perks: "cook_perk" })]);

    expect(result).toEqual({
      error: {
        code: "no-valid-files",
        problems: [{ code: "unrecognized-player", file: "player.json" }],
      },
    });
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
      warnings: [
        { code: "invalid-json", file: "gamedata.json" },
        { code: "unrecognized-player", file: "player.json" },
      ],
    });
  });
});
