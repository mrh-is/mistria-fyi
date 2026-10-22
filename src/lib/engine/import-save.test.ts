import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "#lib/engine/progress.js";
import { recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

import {
  extractSave,
  extractSaveProgress,
  isPlayerSaveSection,
  isSaveImportWarning,
  parseExtractedSaveFiles,
} from "./import-save.js";

import type { LevelIssue } from "#lib/engine/progress.js";
import type {
  AnimalId,
  AnimalVariantId,
  RecipeId,
  SkillId,
  VillagerId,
} from "#lib/types/tracker-data.js";

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

function getDefaultAnimalVariants(animalId: AnimalId): Set<AnimalVariantId> {
  return new Set(
    trackerData.animals[animalId].variantTiers.flatMap((tier) =>
      recordEntries(tier)
        .filter(([, variant]) => variant.source.type === "default")
        .map(([id]) => id),
    ),
  );
}

describe("starting unlocks", () => {
  it("credits every default cosmetic even when the save omits its unlock list", () => {
    const defaults = new Set(
      recordEntries(trackerData.cosmetics)
        .filter(([, cosmetic]) => cosmetic.sources.some((source) => source.type === "default"))
        .map(([id]) => id),
    );
    expect(defaults.size).toBeGreaterThan(0);
    const { completed, warnings } = extractSaveProgress({ player: { items_acquired: [] } });
    expect(completed.cosmetics).toEqual(defaults);
    expect(warnings).toEqual([]);
  });

  it("unions saved cosmetics with starting unlocks without crediting other cosmetics", () => {
    const locked = recordEntries(trackerData.cosmetics)
      .filter(([, cosmetic]) => !cosmetic.sources.some((source) => source.type === "default"))
      .map(([id]) => id);
    const [unlocked, notUnlocked] = locked;
    const { completed } = extractSaveProgress({ player: { cosmetic_unlocks: [unlocked] } });
    expect(completed.cosmetics).toContain(unlocked);
    expect(completed.cosmetics).not.toContain(notUnlocked);
    expect(completed.cosmetics?.size).toBe(
      Object.values(trackerData.cosmetics).filter((cosmetic) =>
        cosmetic.sources.some((source) => source.type === "default"),
      ).length + 1,
    );
  });

  it("credits default animal variants, while other breeds still need save evidence", () => {
    const { completed } = extractSaveProgress({ player: { animal_variant_unlocks: {} } });
    for (const animalId of recordKeys(trackerData.animals)) {
      expect(completed.animals?.[animalId]).toEqual(getDefaultAnimalVariants(animalId));
    }
    expect(
      Object.values(completed.animals ?? {}).some(
        (variants) => variants !== undefined && variants.size > 0,
      ),
    ).toBe(true);
  });

  it("keeps acquisition-only progress unset and preserves existing default recipe credit", () => {
    const { completed } = extractSaveProgress({ player: { items_acquired: [] } });
    // Item default sources also describe world/story objects, not evidence of almanac acquisition.
    expect(completed.almanac).toEqual(new Set());
    expect(completed.almanacRecipes).toEqual(getDefaultRecipeIds());
    // Fields with no default source & no save field stay unknown (#125): nothing is credited.
    expect(completed.mountAppearances).toBeUndefined();
    expect(completed.petCosmetics).toBeUndefined();
    expect(completed.petSkins).toBeUndefined();
    expect(completed.spells).toBeUndefined();
  });

  it("credits defaults without ever making a field complete on their own", () => {
    const { fields } = extractSave({ player: { items_acquired: [] } });

    for (const field of [fields.animals, fields.cosmetics, fields.almanacRecipes]) {
      expect(field.value).toBeDefined();
      expect(field.completeness).toBe("unknown");
    }
    expect(fields.cosmetics.diagnostics).toEqual([
      { code: "absent", path: "player.cosmetic_unlocks" },
    ]);
    expect(fields.animals.diagnostics).toEqual([
      { code: "absent", path: "player.animal_variant_unlocks" },
    ]);
  });
});

describe("town rank quest inference", () => {
  const rankQuests = recordEntries(trackerData.quests.story).filter(
    (entry): entry is [(typeof entry)[0], (typeof entry)[1] & { townRankLevel: number }] =>
      entry[1].townRankLevel !== undefined,
  );

  it.each(rankQuests)("credits %s exactly at its native threshold", (questId, quest) => {
    for (const offset of [-1, 0, 1]) {
      const { completed } = extractSaveProgress({
        gamedata: { t2_world_facts: { renown: quest.townRankLevel + offset } },
      });
      expect(completed.questStates?.[questId], `threshold offset ${offset}`).toBe(
        offset < 0 ? undefined : "completed",
      );
    }
  });

  it("credits every rank for above-maximum renown, preserving its existing clamp", () => {
    const { completed } = extractSaveProgress({
      gamedata: { t2_world_facts: { renown: getMaxRenownLevel() + 1 } },
    });
    expect(completed.renown).toBe(getMaxRenownLevel());
    expect(Object.keys(completed.questStates ?? {})).toHaveLength(rankQuests.length);
    expect(rankQuests).toHaveLength(9);
  });

  it("credits all reached ranks when only the latest completion fact is recorded", () => {
    const { completed } = extractSaveProgress({
      gamedata: {
        t2_world_facts: {
          quest_reach_copper_star_town_rank_complete: 0,
          quest_reach_iron_star_town_rank_complete: 1,
          quest_reach_ruby_star_town_rank_complete: 0,
          renown: 40,
        },
      },
    });
    expect(completed.questStates).toMatchObject({
      reach_copper_star_town_rank: "completed",
      reach_iron_star_town_rank: "completed",
      reach_ruby_star_town_rank: "completed",
    });
    expect(completed.questStates).not.toHaveProperty("reach_sapphire_star_town_rank");
  });

  it("honors explicit rank completion facts & journal completions above the imported rank", () => {
    const { completed } = extractSaveProgress({
      gamedata: { t2_world_facts: { quest_reach_mistril_star_town_rank_complete: 1, renown: 20 } },
      quests: {
        active_quests: [{ quest_name: "reach_copper_star_town_rank" }],
        completed_quests: ["reach_diamond_star_town_rank"],
      },
    });
    expect(completed.questStates).toMatchObject({
      reach_copper_star_town_rank: "completed",
      reach_diamond_star_town_rank: "completed",
      reach_mistril_star_town_rank: "completed",
    });
  });

  it.each([undefined, "100", null, false, {}, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not infer rank quests from invalid renown %s",
    (renown) => {
      const { completed } = extractSaveProgress({ gamedata: { t2_world_facts: { renown } } });
      expect(completed.questStates).toBeUndefined();
    },
  );

  it.each([true, 1])("honors explicit completion %s without readable renown", (value) => {
    const { fields } = extractSave({
      gamedata: { t2_world_facts: { quest_reach_mistril_star_town_rank_complete: value } },
      quests: { active_quests: [], completed_quests: [] },
    });
    expect(fields.questStates).toMatchObject({
      completeness: "unknown",
      value: { reach_mistril_star_town_rank: "completed" },
    });
    expect(fields.questStates.diagnostics).toContainEqual({
      code: "absent",
      path: "gamedata.t2_world_facts.renown",
    });
  });

  it.each([false, 0, "1", 2, null])("does not credit an unreached rank from fact %s", (value) => {
    const { fields } = extractSave({
      gamedata: {
        t2_world_facts: { quest_reach_mistril_star_town_rank_complete: value, renown: 0 },
      },
      quests: { active_quests: [], completed_quests: [] },
    });
    expect(fields.questStates.value).toEqual({});
    expect(fields.questStates.completeness).toBe(
      value === false || value === 0 ? "complete" : "unknown",
    );
  });

  it("keeps inferred ranks additive when journal evidence is incomplete", () => {
    const { fields } = extractSave({ gamedata: { t2_world_facts: { renown: 20 } } });
    expect(fields.questStates.completeness).toBe("unknown");
    expect(fields.questStates.value).toEqual({ reach_copper_star_town_rank: "completed" });
  });

  it("keeps journal progress when renown is malformed", () => {
    const { fields } = extractSave({
      gamedata: { t2_world_facts: { renown: "100" } },
      quests: { active_quests: [], completed_quests: ["reach_copper_star_town_rank"] },
    });
    expect(fields.questStates).toMatchObject({
      completeness: "unknown",
      value: { reach_copper_star_town_rank: "completed" },
    });
    expect(fields.questStates.diagnostics).toContainEqual({
      code: "invalid-value",
      path: "gamedata.t2_world_facts.renown",
    });
  });
});

describe("extractSaveProgress", () => {
  it("credits the Engagement Ring recipe from its acquired scroll without a recipe unlock", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { items_acquired: ["engagement_ring_recipe_scroll"], recipe_unlocks: [] },
    });
    expect(completed.almanacRecipes).toContain("engagement_ring");
    expect(warnings).toEqual([]);
  });

  it("credits every fixed scroll's native grants, including whole recipe bundles", () => {
    const scrolls = Object.entries(trackerData.items).filter(([, item]) => item.recipeUnlocks);
    expect(scrolls.length).toBeGreaterThan(0);
    for (const [scrollId, item] of scrolls) {
      const { completed } = extractSaveProgress({ player: { items_acquired: [scrollId] } });
      expect(completed.almanacRecipes).toEqual(
        new Set([...getDefaultRecipeIds(), ...(item.recipeUnlocks ?? [])]),
      );
    }
  });

  it("does not infer learning from an output item or generic runtime-target scroll", () => {
    const { completed } = extractSaveProgress({
      player: { items_acquired: ["engagement_ring", "recipe_scroll"] },
    });
    expect(completed.almanacRecipes).toEqual(getDefaultRecipeIds());
  });

  it("keeps partial scroll grants while marking malformed acquisition evidence unknown", () => {
    const extraction = extractSave({
      player: { items_acquired: ["engagement_ring_recipe_scroll", 7], recipe_unlocks: [] },
    });
    const field = extraction.fields.almanacRecipes;
    expect(field.value).toContain("engagement_ring");
    expect(field.completeness).toBe("unknown");
    expect(field.diagnostics).toEqual([
      { code: "unreadable-entries", count: 1, path: "player.items_acquired" },
    ]);
    expect(
      extraction.diagnostics.filter((entry) => entry.code === "unreadable-entries"),
    ).toHaveLength(1);
  });

  it("requires both acquisition & unlock lists for complete learned-recipe evidence", () => {
    const missing = extractSave({ player: { recipe_unlocks: [] } });
    expect(missing.fields.almanacRecipes.completeness).toBe("unknown");
    expect(missing.fields.almanacRecipes.diagnostics).toContainEqual({
      code: "absent",
      path: "player.items_acquired",
    });
    const complete = extractSave({ player: { items_acquired: [], recipe_unlocks: [] } });
    expect(complete.fields.almanacRecipes.completeness).toBe("complete");
  });

  it("does not claim complete recipe evidence when an acquired item ID is unknown", () => {
    const extraction = extractSave({
      player: { items_acquired: ["unknown_scroll_id"], recipe_unlocks: [] },
    });
    expect(extraction.fields.almanacRecipes.completeness).toBe("unknown");
    expect(extraction.fields.almanacRecipes.diagnostics).toEqual([
      { code: "unknown-id", id: "unknown_scroll_id", path: "player.items_acquired" },
    ]);
  });

  it("imports tracked progress from a preceding 1.0.2 save shape", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { items_acquired: ["animated_waterfall_v2"] },
    });

    expect(completed.almanac).toContain("animated_waterfall_v1");
    expect(warnings).toEqual([]);
  });

  it("imports new 1.0.5 item, cosmetic, and recipe progress", () => {
    const { completed, warnings } = extractSaveProgress({
      player: {
        cosmetic_unlocks: ["facial_hair_friendly_mutton_chops"],
        items_acquired: ["cottage_sofa_oak"],
        recipe_unlocks: ["cottage_sofa"],
      },
    });

    expect(completed.almanac).toContain("cottage_sofa_ash");
    expect(completed.cosmetics).toContain("facial_hair_friendly_mutton_chops");
    expect(completed.almanacRecipes).toContain("cottage_sofa");
    expect(warnings).toEqual([]);
  });

  it("imports the Big Egg's chicken appearances as mount appearances, not horse breeds", () => {
    const { completed, warnings } = extractSaveProgress({
      player: {
        animal_variant_unlocks: { horse: ["giant_chicken_gold", "giant_chicken_white"] },
        cosmetic_unlocks: [],
      },
    });

    expect(completed.mountAppearances).toEqual(
      new Set(["giant_chicken_gold", "giant_chicken_white"]),
    );
    expect(completed.animals?.["horse" as AnimalId]).toEqual(
      getDefaultAnimalVariants("horse" as AnimalId),
    );
    expect(warnings).toEqual([]);
  });

  it("imports the Mistmare once its reveal cutscene has played", () => {
    const before = extractSaveProgress({
      gamedata: { scene_history: ["find_the_weathervane_setup"] },
      player: { cosmetic_unlocks: [] },
    });
    const after = extractSaveProgress({
      gamedata: { scene_history: ["find_the_weathervane_setup", "reveal_mistmare"] },
      player: { cosmetic_unlocks: [] },
    });

    expect(before.completed.mountAppearances).toEqual(new Set());
    expect(after.completed.mountAppearances).toEqual(new Set(["mistmare"]));
    expect(after.warnings).toEqual([]);
  });

  it("imports direct and item-derived recipe unlocks alongside default recipes", () => {
    const defaultRecipeIds = getDefaultRecipeIds();

    const { completed, warnings } = extractSaveProgress({
      player: {
        recipe_unlocks: ["ocarina_sprite_statue", "animated_waterfall_v1", "unknown_recipe_unlock"],
      },
    });

    expect(completed.almanacRecipes).toEqual(
      new Set([...defaultRecipeIds, "animated_waterfall", "ocarina_sprite_statue"]),
    );
    expect(warnings).toEqual([
      { code: "unknown-id", id: "unknown_recipe_unlock", path: "player.recipe_unlocks" },
    ]);
  });

  it("imports perks from player.perks", () => {
    const bundle = {
      player: {
        perks: ["magic_design", "green_thumb", "unknown_perk"],
      },
    };
    const { completed, warnings } = extractSaveProgress(bundle);
    const unlockedPerks = completed.unlockedPerks;
    if (unlockedPerks === undefined) {
      throw new Error("unlockedPerks should be defined");
    }
    expect(unlockedPerks.has("magic_design" as never)).toBe(true);
    expect(unlockedPerks.has("green_thumb" as never)).toBe(true);
    expect(unlockedPerks.has("unknown_perk" as never)).toBe(false);
    expect(warnings).toContainEqual({
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
      const { completed } = extractSaveProgress(bundle);
      expect(completed.hasUpperFloor).toBe(true);
    });

    it("leaves hasUpperFloor unknown when missing, never false", () => {
      const bundle: SaveBundle = {
        player: { items_acquired: [] },
      };
      const { completed } = extractSaveProgress(bundle);
      expect(completed.hasUpperFloor).toBeUndefined();
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
      const { completed } = extractSaveProgress(bundle);
      expect(completed.villagerRelationships).toEqual({
        juniper: "romantic",
        march: "romantic",
      });
    });

    it("reads best friends as platonic and a fiancé as proposed", () => {
      const bundle: SaveBundle = {
        gamedata: {
          t2_world_facts: {
            celine_is_best_friend: 1,
            juniper_is_dating: 1,
            march_is_dating: 0,
            march_is_fiance: 1,
          },
        },
      };
      const { completed } = extractSaveProgress(bundle);
      expect(completed.villagerRelationships).toEqual({
        celine: "platonic",
        juniper: "romantic",
        march: "proposed",
      });
    });

    it("marries the spouse over any dating flag and makes every other dateable villager platonic", () => {
      const bundle: SaveBundle = {
        gamedata: {
          t2_world_facts: {
            adeline_is_dating: 1,
            has_spouse: 1,
            ryis_is_dating: 1,
            ryis_is_spouse: 1,
          },
        },
      };
      const { completed } = extractSaveProgress(bundle);
      const dateable = recordKeys(trackerData.villagers).filter(
        (id) => trackerData.villagers[id].dateable,
      );
      expect(completed.villagerRelationships).toEqual(
        Object.fromEntries(dateable.map((id) => [id, id === "ryis" ? "married" : "platonic"])),
      );
    });

    it("names the spouse from a listed pregnancy quest when no spouse fact does", () => {
      const [villagerId, questId] = recordEntries(trackerData.pregnancyQuestByVillager)[0];
      const { completed } = extractSaveProgress({
        gamedata: { t2_world_facts: { [`${villagerId}_is_dating`]: 1 } },
        quests: { active_quests: [], completed_quests: [questId] },
      });
      expect(completed.villagerRelationships?.[villagerId]).toBe("married");
      expect(completed.childChoice).toBe("yes");
    });

    it.each([
      ["a pending child", { pending_child: { due_date: 1, utero: 0 } }],
      ["a child", { children: [{ name: "Wren" }] }],
    ])("reads %s as wanting children", (_label, fields) => {
      const { completed } = extractSaveProgress({
        player: { children: [], items_acquired: [], pending_child: null, ...fields },
      });
      expect(completed.childChoice).toBe("yes");
    });

    it("leaves the child choice undeclared without a child, and unknown without a player", () => {
      const childless = extractSave({
        player: { children: [], items_acquired: [], pending_child: null },
      });
      expect(childless.fields.childChoice).toMatchObject({
        completeness: "unknown",
        value: "undeclared",
      });
      expect(extractSave({}).fields.childChoice.value).toBeUndefined();
    });

    it("derives reachedSeason from gamedata.date timestamp", () => {
      const GAME_SEASON = 28 * 259_200;
      const bundle: SaveBundle = {
        gamedata: { date: 2 * GAME_SEASON + 100 },
      };
      const { completed } = extractSaveProgress(bundle);
      expect(completed.reachedSeason).toBe("fall");
    });

    it("returns winter for saves past year 1", () => {
      const GAME_SEASON = 28 * 259_200;
      const bundle: SaveBundle = {
        gamedata: { date: 5 * GAME_SEASON },
      };
      const { completed } = extractSaveProgress(bundle);
      expect(completed.reachedSeason).toBe("winter");
    });

    it("leaves reachedSeason unknown when date is missing, never spring", () => {
      const bundle: SaveBundle = { gamedata: {} };
      const { completed } = extractSaveProgress(bundle);
      expect(completed.reachedSeason).toBeUndefined();
    });
  });
});

function worldFacts(extra: Record<string, unknown>): {
  gamedata: { t2_world_facts: Record<string, unknown> };
} {
  return { gamedata: { t2_world_facts: extra } };
}

function levelWarning(
  issue: LevelIssue,
  key: string,
  value: string,
  max: number,
): { code: "level"; issue: LevelIssue; key: string; max: number; value: string } {
  return { code: "level", issue, key, max, value };
}

function jsonFile(name: string, data: unknown): File {
  return new File([JSON.stringify(data)], name);
}

describe("numeric level domains", () => {
  const ADELINE = "adeline" as VillagerId;
  const FARMING = "farming" as SkillId;

  it("accepts in-domain levels without warnings", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: {
        maximum_mines_level: getMaxMineFloor() - 1,
        t2_world_facts: {
          adeline_heart_level: MAX_HEART_LEVEL,
          farming_level: MAX_SKILL_LEVEL,
          renown: getMaxRenownLevel(),
        },
      },
    });
    expect(completed.mineFloor).toBe(getMaxMineFloor());
    expect(completed.heartLevels?.[ADELINE]).toBe(MAX_HEART_LEVEL);
    expect(completed.skillLevels?.[FARMING]).toBe(MAX_SKILL_LEVEL);
    expect(completed.renown).toBe(getMaxRenownLevel());
    expect(warnings).toEqual([]);
  });

  it("clamps above-maximum levels and warns, except renown which clamps silently", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: {
        maximum_mines_level: 9999,
        t2_world_facts: { adeline_heart_level: 99, farming_level: 999, renown: 9999 },
      },
    });
    expect(completed.mineFloor).toBe(getMaxMineFloor());
    expect(completed.heartLevels?.[ADELINE]).toBe(MAX_HEART_LEVEL);
    expect(completed.skillLevels?.[FARMING]).toBe(MAX_SKILL_LEVEL);
    expect(completed.renown).toBe(getMaxRenownLevel());
    expect(warnings).toEqual([
      levelWarning("above-max", "maximum_mines_level", "9999", getMaxMineFloor() - 1),
      levelWarning("above-max", "adeline_heart_level", "99", MAX_HEART_LEVEL),
      levelWarning("above-max", "farming_level", "999", MAX_SKILL_LEVEL),
    ]);
  });

  it("floors fractional levels silently", () => {
    const { completed, warnings } = extractSaveProgress(
      worldFacts({ adeline_heart_level: 3.9, farming_level: 7.2, renown: 2.5 }),
    );
    expect(completed.heartLevels?.[ADELINE]).toBe(3);
    expect(completed.skillLevels?.[FARMING]).toBe(7);
    expect(completed.renown).toBe(2);
    expect(warnings).toEqual([]);
  });

  it("ignores negative levels with a warning", () => {
    const { completed, warnings } = extractSaveProgress(
      worldFacts({ adeline_heart_level: -1, farming_level: -0.5, renown: -3 }),
    );
    expect(completed.heartLevels?.[ADELINE]).toBeUndefined();
    expect(completed.skillLevels?.[FARMING]).toBeUndefined();
    expect(completed.renown).toBeUndefined();
    expect(warnings).toEqual([
      levelWarning("negative", "adeline_heart_level", "-1", MAX_HEART_LEVEL),
      levelWarning("negative", "farming_level", "-0.5", MAX_SKILL_LEVEL),
    ]);
  });

  it("ignores nonfinite and wrong-type levels with a warning", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: {
        maximum_mines_level: Number.NaN,
        t2_world_facts: {
          adeline_heart_level: "12",
          farming_level: Number.POSITIVE_INFINITY,
          renown: null,
        },
      },
    });
    expect(completed.mineFloor).toBeUndefined();
    expect(completed.heartLevels?.[ADELINE]).toBeUndefined();
    expect(completed.skillLevels?.[FARMING]).toBeUndefined();
    expect(completed.renown).toBeUndefined();
    expect(warnings).toEqual([
      levelWarning("not-a-number", "maximum_mines_level", "NaN", getMaxMineFloor() - 1),
      levelWarning("not-a-number", "adeline_heart_level", '"12"', MAX_HEART_LEVEL),
      levelWarning("not-a-number", "farming_level", "Infinity", MAX_SKILL_LEVEL),
    ]);
  });

  it("leaves missing levels unknown & zero levels unset, without warnings", () => {
    const { completed, warnings } = extractSaveProgress(worldFacts({ adeline_heart_level: 0 }));
    expect(completed.mineFloor).toBeUndefined();
    expect(completed.heartLevels).toEqual({});
    expect(completed.renown).toBeUndefined();
    expect(warnings).toEqual([]);
  });
});

describe("zero-indexed mine floors", () => {
  it.each([0, 1, 98, 99, 2.9])("imports stored floor %s using the elevator offset", (stored) => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: { maximum_mines_level: stored },
    });
    expect(completed.mineFloor).toBe(Math.floor(stored) + 1);
    expect(warnings).toEqual([]);
  });

  it("completes floor progress when the save records index 99", () => {
    const { completed } = extractSaveProgress({ gamedata: { maximum_mines_level: 99 } });
    expect(completed.mineFloor).toBe(getMaxMineFloor());
  });

  it("clamps the ALL_UNLOCKS debug value at the tracker floor cap", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: { maximum_mines_level: 100 },
    });
    expect(completed.mineFloor).toBe(getMaxMineFloor());
    expect(warnings).toEqual([
      levelWarning("above-max", "maximum_mines_level", "100", getMaxMineFloor() - 1),
    ]);
  });

  it.each([-1, -0.5, "0", null, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not credit floor one from invalid stored value %s",
    (stored) => {
      const { completed, warnings } = extractSaveProgress({
        gamedata: { maximum_mines_level: stored },
      });
      // Left unknown rather than zero (#125), so the merge credits nothing.
      expect(completed.mineFloor).toBeUndefined();
      expect(warnings).toHaveLength(1);
    },
  );
});

describe("colorway normalization", () => {
  it("importing only a nonrepresentative colorway completes the canonical entry", () => {
    const bundle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v2"] },
    };
    const { completed } = extractSaveProgress(bundle);
    const almanac = completed.almanac ?? new Set();
    expect(almanac.has("animated_waterfall_v1" as never)).toBe(true);
    expect(almanac.has("animated_waterfall_v2" as never)).toBe(false);
  });

  it("importing several members of one group counts as one completion", () => {
    const bundle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v1", "animated_waterfall_v2"] },
    };
    const { completed } = extractSaveProgress(bundle);
    const almanac = completed.almanac ?? new Set();
    expect(almanac.has("animated_waterfall_v1" as never)).toBe(true);
    expect(almanac.size).toBe(1);

    const bundleSingle: SaveBundle = {
      player: { items_acquired: ["animated_waterfall_v1"] },
    };
    const { completed: completedSingle } = extractSaveProgress(bundleSingle);
    expect(completedSingle.almanac).toEqual(almanac);
  });
});

describe("almanac discovery", () => {
  // The game's almanac counts only items_acquired. It allocates items_sold with a zero for every
  // item, and crafting can record recipes_created without marking the item acquired.
  it("ignores items_sold, including the zero-filled entries every save carries", () => {
    const { completed } = extractSaveProgress({
      player: { items_acquired: [], items_sold: { adeline_chair: 0, apple: 3, worn_pendant: 0 } },
    });
    expect(completed.almanac).toEqual(new Set());
  });

  it("ignores recipes_created without a matching acquisition", () => {
    const { completed } = extractSaveProgress({
      player: { items_acquired: [], recipes_created: ["haunted_attic_bed_dark"] },
    });
    expect(completed.almanac).toEqual(new Set());
  });
});

describe("isPlayerSaveSection", () => {
  it("accepts a save containing recipe unlocks", () => {
    expect(isPlayerSaveSection({ recipe_unlocks: ["ocarina_sprite_statue"] })).toBe(true);
  });
});

describe("isPlayerSaveSection rejections", () => {
  it.each([
    ["null", null],
    ["an array", [{ perks: [] }]],
    ["an empty object", {}],
    ["null-valued record fields", { animal_variant_unlocks: null, items_sold: null }],
    ["wrongly typed list fields", { perks: "cook_perk", recipe_unlocks: { id: true } }],
  ])("rejects %s", (_label, data) => {
    expect(isPlayerSaveSection(data)).toBe(false);
  });
});

describe("malformed save fields", () => {
  const perkId = recordKeys(recordValues(trackerData.skills)[0].perkTiers[0])[0];

  it("drops a string list field with a warning instead of iterating its characters", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { cosmetic_unlocks: [], perks: perkId },
    });

    expect(completed.unlockedPerks).toBeUndefined();
    expect(warnings).toEqual([{ code: "not-a-list", path: "player.perks" }]);
  });

  it("drops non-text entries from a list and keeps the rest", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { perks: [perkId, 7, null, { id: perkId }] },
    });

    expect([...(completed.unlockedPerks ?? [])]).toEqual([perkId]);
    expect(warnings).toEqual([{ code: "unreadable-entries", count: 3, path: "player.perks" }]);
  });

  it("drops wrongly shaped gamedata fields without throwing", () => {
    const { completed, warnings } = extractSaveProgress({
      gamedata: { museum_progress: { 0: "anything" }, t2_world_facts: [1, 2] },
    });

    expect(completed.museum).toBeUndefined();
    expect(completed.renown).toBeUndefined();
    expect(warnings).toEqual([
      { code: "not-a-list", path: "gamedata.museum_progress" },
      { code: "not-an-object", path: "gamedata.t2_world_facts" },
    ]);
  });

  it("drops null and array records with a warning", () => {
    const animalId = recordKeys(trackerData.animals)[0];
    const { completed, warnings } = extractSaveProgress({
      gamedata: { t2_world_facts: null },
      player: {
        animal_cosmetic_unlocks: { [animalId]: "not-a-list" },
        animal_variant_unlocks: ["not", "a", "record"],
        cosmetic_unlocks: [],
      },
    });

    expect(completed.animals?.[animalId]).toEqual(getDefaultAnimalVariants(animalId));
    expect(warnings).toEqual([
      { code: "not-an-object", path: "player.animal_variant_unlocks" },
      { code: "not-a-list", path: `player.animal_cosmetic_unlocks.${animalId}` },
      { code: "not-an-object", path: "gamedata.t2_world_facts" },
    ]);
  });

  it("never matches inherited object properties as tracker IDs", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { recipe_unlocks: ["constructor", "__proto__", "toString"] },
    });

    expect(completed.almanacRecipes).toEqual(getDefaultRecipeIds());
    expect(warnings).toEqual(
      ["constructor", "__proto__", "toString"].map((id) => ({
        code: "unknown-id",
        id,
        path: "player.recipe_unlocks",
      })),
    );
  });

  it("ignores an unrecognizable player section with a warning", () => {
    const { completed, warnings } = extractSaveProgress({
      player: { perks: "cook_perk" },
    });

    expect(completed.unlockedPerks).toBeUndefined();
    expect(warnings).toEqual([{ code: "unrecognized-player", file: "player" }]);
  });
});

describe("quest import", () => {
  const [firstQuest, secondQuest] = recordValues(trackerData.quests).flatMap((category) =>
    recordKeys(category),
  );

  it("imports completed quests as completed", () => {
    const { completed, warnings } = extractSaveProgress({
      quests: { completed_quests: [firstQuest] },
    });

    expect(completed.questStates).toEqual({ [firstQuest]: "completed" });
    expect(warnings).toEqual([]);
  });

  it("imports active quests as obtained", () => {
    const { completed } = extractSaveProgress({
      quests: { active_quests: [{ quest_name: secondQuest }] },
    });

    expect(completed.questStates).toEqual({ [secondQuest]: "obtained" });
  });

  it("keeps a quest listed in both places completed", () => {
    const { completed } = extractSaveProgress({
      quests: {
        active_quests: [{ quest_name: firstQuest }, { quest_name: secondQuest }],
        completed_quests: [firstQuest, firstQuest],
      },
    });

    expect(completed.questStates).toEqual({
      [firstQuest]: "completed",
      [secondQuest]: "obtained",
    });
  });

  it("warns about unknown quest IDs and nameless active entries", () => {
    const { completed, warnings } = extractSaveProgress({
      quests: {
        active_quests: [{ quest_name: "not_a_quest" }, { progress: 3 }, "loose"],
        completed_quests: ["constructor"],
      },
    });

    expect(completed.questStates).toEqual({});
    expect(warnings).toEqual([
      { code: "unknown-id", id: "constructor", path: "quests.completed_quests" },
      { code: "unreadable-entries", count: 2, path: "quests.active_quests" },
      { code: "unknown-id", id: "not_a_quest", path: "quests.active_quests" },
    ]);
  });
});

describe("parseExtractedSaveFiles", () => {
  const player = jsonFile("player.json", { perks: [] });

  it("ignores files with other names", async () => {
    const result = await parseExtractedSaveFiles([
      player,
      jsonFile("villagers.json", { perks: [] }),
    ]);

    expect(result).toEqual({ bundle: { player: { perks: [] } }, warnings: [] });
  });

  it("keeps header.json & info.json, which identify the save", async () => {
    const header = { playtime: 12.5 };
    const info = { creation_version: { major: 1, minor: 0, patch: 8, pre: null } };
    const result = await parseExtractedSaveFiles([
      player,
      jsonFile("header.json", header),
      jsonFile("info.json", info),
    ]);

    expect(result).toEqual({ bundle: { header, info, player: { perks: [] } }, warnings: [] });
  });

  it("needs a progress file beside header.json & info.json", async () => {
    const result = await parseExtractedSaveFiles([jsonFile("info.json", {})]);

    expect(result).toEqual({ error: { code: "no-save-files" } });
  });

  it("reports that no save files were recognized", async () => {
    const result = await parseExtractedSaveFiles([jsonFile("notes.json", {})]);

    expect(result.bundle).toBeUndefined();
    expect(result.error).toEqual({ code: "no-save-files" });
  });

  it.each([
    ["an array", "[]", "not-json-object"],
    ["a number", "3", "not-json-object"],
    ["invalid JSON", "{", "invalid-json"],
  ] as const)("rejects a file containing %s", async (_label, text, code) => {
    const result = await parseExtractedSaveFiles([new File([text], "gamedata.json")]);

    expect(result).toEqual({
      error: { code: "no-valid-files", problems: [{ code, file: "gamedata.json" }] },
    });
  });

  it("rejects an unrecognizable player.json", async () => {
    const result = await parseExtractedSaveFiles([jsonFile("player.json", { perks: "cook_perk" })]);

    expect(result).toEqual({
      error: {
        code: "no-valid-files",
        problems: [{ code: "unrecognized-player", file: "player.json" }],
      },
    });
  });

  it("imports a partial bundle and reports the files it skipped", async () => {
    const quests = jsonFile("quests.json", { completed_quests: [] });
    const result = await parseExtractedSaveFiles([
      quests,
      new File(["{"], "gamedata.json"),
      jsonFile("player.json", {}),
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

describe("extractSave", () => {
  const cosmeticId = recordKeys(trackerData.cosmetics)[0];
  const spellId = recordKeys(trackerData.mines.spells)[0];
  const villagerIds = recordKeys(trackerData.villagers);
  const skillIds = recordKeys(trackerData.skills);
  const factKeys = [
    ...villagerIds.map((id) => `${id}_heart_level`),
    ...skillIds.map((id) => `${id}_level`),
    "renown",
  ];
  const allFacts: Record<string, unknown> = Object.fromEntries(
    factKeys.map((key): [string, number] => [key, 0]),
  );

  it("marks a fully read field complete", () => {
    const { fields } = extractSave({ player: { spells_learned: [spellId] } });

    expect(fields.spells).toEqual({
      completeness: "complete",
      diagnostics: [],
      untracked: [],
      value: new Set([spellId]),
    });
  });

  it("leaves an absent field unknown with no value, never empty", () => {
    const { fields } = extractSave({ player: { cosmetic_unlocks: [] } });

    expect(fields.unlockedPerks).toEqual({
      completeness: "unknown",
      diagnostics: [{ code: "absent", path: "player.perks" }],
      untracked: [],
      value: undefined,
    });
    expect(fields.mineFloor).toMatchObject({ completeness: "unknown", value: undefined });
  });

  it("leaves a malformed field unknown with no value", () => {
    const { fields } = extractSave({ player: { perks: [], spells_learned: spellId } });

    expect(fields.spells).toMatchObject({
      completeness: "unknown",
      diagnostics: [{ code: "not-a-list", path: "player.spells_learned" }],
      value: undefined,
    });
  });

  it("keeps a malformed field's defaults but never marks it complete", () => {
    const { fields } = extractSave({ player: { cosmetic_unlocks: cosmeticId, perks: [] } });

    expect(fields.cosmetics.completeness).toBe("unknown");
    expect(fields.cosmetics.diagnostics).toEqual([
      { code: "not-a-list", path: "player.cosmetic_unlocks" },
    ]);
  });

  it("keeps readable entries but marks the field unknown when some aren't", () => {
    const { fields } = extractSave({ player: { spells_learned: [spellId, 4] } });

    expect(fields.spells).toMatchObject({
      completeness: "unknown",
      value: new Set([spellId]),
    });
  });

  it("tells known-but-untracked IDs from unrecognized ones", () => {
    const tier = recordKeys(trackerData.treasureChestTiers).find((id) => id !== "abyss");
    const { fields } = extractSave({
      player: {
        items_acquired: ["cosmetic", `treasure_box_${tier}`],
        perks: ["horsepower"],
      },
    });

    expect(fields.almanac).toMatchObject({
      completeness: "complete",
      untracked: ["cosmetic", `treasure_box_${tier}`],
    });
    expect(fields.unlockedPerks).toMatchObject({
      completeness: "complete",
      untracked: ["horsepower"],
    });

    const renamed = extractSave({ player: { items_acquired: ["renamed_in_a_game_update"] } });
    expect(renamed.fields.almanac).toEqual({
      completeness: "unknown",
      diagnostics: [
        { code: "unknown-id", id: "renamed_in_a_game_update", path: "player.items_acquired" },
      ],
      untracked: [],
      value: new Set(),
    });
  });

  it("marks animals unknown when an animal's list is missing or unrecognized", () => {
    const [first, ...rest] = recordKeys(trackerData.animals);
    const lists = Object.fromEntries(rest.map((id) => [id, []]));
    const missing = extractSave({ player: { animal_variant_unlocks: lists } });
    expect(missing.fields.animals.completeness).toBe("unknown");
    expect(missing.fields.animals.diagnostics).toEqual([
      { code: "absent", path: `player.animal_variant_unlocks.${first}` },
    ]);

    const extra = extractSave({
      player: { animal_variant_unlocks: { ...lists, dragon: [], [first]: [] } },
    });
    expect(extra.fields.animals.diagnostics).toEqual([
      { code: "unknown-id", id: "dragon", path: "player.animal_variant_unlocks" },
    ]);
  });

  describe("mount appearances, which share the animals' variant lists", () => {
    const animalIds = recordKeys(trackerData.animals);
    const allLists = Object.fromEntries(animalIds.map((id) => [id, []]));
    const { horse: _horse, ...withoutHorse } = allLists as Record<string, never[]>;

    it("are never complete, since a renamed reveal scene looks like an unrevealed Mistmare", () => {
      const read = extractSave({
        gamedata: { scene_history: [] },
        player: { animal_variant_unlocks: allLists },
      });
      expect(read.fields.mountAppearances).toMatchObject({
        completeness: "unknown",
        diagnostics: [],
        value: new Set(),
      });

      const renamed = extractSave({
        gamedata: { scene_history: ["reveal_mistmare_v2"] },
        player: { animal_variant_unlocks: allLists },
      });
      expect(renamed.fields.mountAppearances).toMatchObject({
        completeness: "unknown",
        value: new Set(),
      });
    });

    it("are unknown when every animal's list is missing, despite a readable scene history", () => {
      const { fields } = extractSave({
        gamedata: { scene_history: [] },
        player: { animal_variant_unlocks: {} },
      });

      expect(fields.mountAppearances.completeness).toBe("unknown");
      expect(fields.mountAppearances.diagnostics).toContainEqual({
        code: "absent",
        path: "player.animal_variant_unlocks.horse",
      });
    });

    it("are unknown when the horse's list is missing", () => {
      const { fields } = extractSave({
        gamedata: { scene_history: ["reveal_mistmare"] },
        player: { animal_variant_unlocks: withoutHorse },
      });

      expect(fields.mountAppearances).toMatchObject({
        completeness: "unknown",
        diagnostics: [{ code: "absent", path: "player.animal_variant_unlocks.horse" }],
        value: new Set(["mistmare"]),
      });
    });

    it("are unknown when the horse's list sits under a renamed key", () => {
      const { fields } = extractSave({
        gamedata: { scene_history: [] },
        player: {
          animal_variant_unlocks: { ...withoutHorse, mount_horse: ["giant_chicken_gold"] },
        },
      });

      expect(fields.mountAppearances.completeness).toBe("unknown");
      expect(fields.mountAppearances.diagnostics).toContainEqual({
        code: "unknown-id",
        id: "mount_horse",
        path: "player.animal_variant_unlocks",
      });
    });
  });

  it("keeps a level clamped from above complete, but not a negative one", () => {
    const clamped = extractSave({ gamedata: { maximum_mines_level: 9999 } });
    expect(clamped.fields.mineFloor).toMatchObject({
      completeness: "complete",
      value: getMaxMineFloor(),
    });

    const negative = extractSave({ gamedata: { maximum_mines_level: -1 } });
    expect(negative.fields.mineFloor).toMatchObject({ completeness: "unknown", value: undefined });
  });

  it("reads levels as complete only when every tracked key is present", () => {
    const full = extractSave({ gamedata: { t2_world_facts: allFacts } });
    expect(full.fields.heartLevels).toMatchObject({ completeness: "complete", value: {} });
    expect(full.fields.renown).toMatchObject({ completeness: "complete", value: 0 });

    const partial = { ...allFacts };
    delete partial[`${villagerIds[0]}_heart_level`];
    const missing = extractSave({ gamedata: { t2_world_facts: partial } });
    expect(missing.fields.heartLevels.completeness).toBe("unknown");
    expect(missing.fields.skillLevels.completeness).toBe("complete");
  });

  it("never treats relationships as complete, since breakups & divorce aren't verified", () => {
    const { fields } = extractSave({ gamedata: { t2_world_facts: allFacts } });
    expect(fields.villagerRelationships).toMatchObject({ completeness: "unknown", value: {} });
  });

  it("records malformed scalars as diagnostics without warning the player", () => {
    const extraction = extractSave({
      gamedata: { date: "spring", t2_world_facts: { ...allFacts, renown: "max" } },
      player: { cosmetic_unlocks: [], upper_floor: "yes" },
    });

    expect(extraction.fields.reachedSeason.diagnostics).toEqual([
      { code: "invalid-value", path: "gamedata.date" },
    ]);
    expect(extraction.fields.hasUpperFloor.value).toBeUndefined();
    expect(extraction.fields.renown.value).toBeUndefined();
    expect(extraction.diagnostics.filter((d) => isSaveImportWarning(d))).toEqual([]);
  });

  it("retains the creation version & playtime that identify a save", () => {
    const creationVersion = { major: 0, minor: 11, patch: 7, pre: null };
    const { identity } = extractSave({
      header: { name: "Not retained", playtime: 3600.25 },
      info: { creation_version: creationVersion, version: { major: 1, minor: 0, patch: 8 } },
      player: { cosmetic_unlocks: [] },
    });

    expect(identity.creationVersion).toMatchObject({
      completeness: "complete",
      value: creationVersion,
    });
    expect(identity.playtime).toMatchObject({ completeness: "complete", value: 3600.25 });
  });

  it.each([
    ["absent", {}, "absent"],
    [
      "malformed",
      { header: { playtime: -1 }, info: { creation_version: "1.0.8" } },
      "invalid-value",
    ],
  ] as const)("leaves %s identity facts unknown", (_label, sections, code) => {
    const { identity } = extractSave({ ...sections, player: { cosmetic_unlocks: [] } });

    expect(identity.creationVersion).toMatchObject({ completeness: "unknown", value: undefined });
    expect(identity.playtime).toMatchObject({
      completeness: "unknown",
      diagnostics: [{ code, path: "header.playtime" }],
      value: undefined,
    });
  });

  it("feeds the additive import only the values it could read", () => {
    const { completed } = extractSaveProgress({ player: { spells_learned: [spellId] } });

    expect(completed).toHaveProperty("spells", new Set([spellId]));
    expect(completed).not.toHaveProperty("unlockedPerks");
    expect(completed).not.toHaveProperty("mineFloor");
  });

  it("hands the additive import the save's playtime, when it could be read", () => {
    const player = { cosmetic_unlocks: [] };

    expect(extractSaveProgress({ header: { playtime: 3600.25 }, player }).playtime).toBe(3600.25);
    expect(extractSaveProgress({ header: { playtime: -1 }, player }).playtime).toBeUndefined();
    expect(extractSaveProgress({ player }).playtime).toBeUndefined();
  });
});
