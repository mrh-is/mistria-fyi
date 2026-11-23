import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractEntitySpriteCandidates, renownRewardItemSprites } from "./entity-sprites.js";

import type { TrackerData } from "#lib/types/tracker-data.js";

const fiddle = makeFiddle({
  items: {
    other: {
      monster_drops: {
        pet_unlock_sapling: {
          icon_sprite: "spr_ui_item_pet_unlock_sapling",
          pet_skin_unlock: "sapling",
        },
      },
      treasure: { treasure_box_gold: { icon_sprite: "spr_ui_item_gold_chest" } },
    },
  },
  pets: { cosmetic_sets: { halo: { ui_icon: "spr_ui_item_pet_cosmetic_halo" } } },
  ranching: {
    animals: {
      cow: {
        variants: {
          // A female look that only swaps palettes is still a recolor.
          brown: { female: { lut_index: 2 }, lut_index: 1 },
          gold: { female: { key: "gold_female" }, male: { key: "gold_male" } },
        },
      },
      horse: {
        variants: {
          mistmare: { female: { key: "mistmare_base", ui_key: "mistmare" } },
        },
      },
    },
  },
  spells: { growth: { icon_key: "spr_ui_journal_magic_growth_spell_icon" } },
  ui: {
    skill_menu: {
      mount: { tier_1: [{ icon: "spr_ui_skills_mount_icon_horsepower", perk: "horsepower" }] },
    },
  },
});

const trackerData = {
  animals: {
    cow: {
      cosmetics: { halo: { sources: [] } },
      variantTiers: [{ brown: {} }, { gold: {} }],
    },
  },
  cosmetics: { hair_afro: {}, shoes_boots_dragonsworn_armor: {} },
  mines: { spells: { growth: {} } },
  mount: { appearances: { mistmare: {} }, perks: { horsepower: {} } },
  pets: { cosmetics: { halo: {} }, skins: { sapling: {} } },
  renown: {
    rewards: [
      { type: "money", amount: 100 },
      { type: "item", itemId: "treasure_box_gold" },
      { type: "cosmetic", cosmeticId: "hair_afro" },
    ],
  },
} as unknown as TrackerData;

describe("extractEntitySpriteCandidates", () => {
  const candidates = extractEntitySpriteCandidates(fiddle, trackerData);

  it("tries a wardrobe look's own icon, then its icon drawn on a head", () => {
    expect(candidates.cosmetics.hair_afro).toEqual([
      "spr_ui_item_wearable_hair_afro",
      "spr_ui_item_wearable_hair_afro_merged",
    ]);
    expect(candidates.cosmetics.shoes_boots_dragonsworn_armor).toContain(
      "spr_ui_item_dragonsworn_greaves",
    );
  });

  it("names each animal look's ranching icon, & none for a recolor", () => {
    expect(candidates["animal-variants"]).toEqual({
      "cow/brown": [],
      "cow/gold": ["spr_ui_icon_animal_cow_gold_female"],
    });
    expect(candidates["animal-cosmetics"]).toEqual({
      "cow/halo": ["spr_ui_item_cow_cosmetic_halo"],
    });
    expect(candidates["mount-appearances"]).toEqual({
      mistmare: ["spr_ui_icon_animal_horse_mistmare"],
    });
  });

  it("reads the icons the game data names", () => {
    expect(candidates["mount-perks"]).toEqual({
      horsepower: ["spr_ui_skills_mount_icon_horsepower"],
    });
    expect(candidates["pet-cosmetics"]).toEqual({ halo: ["spr_ui_item_pet_cosmetic_halo"] });
    expect(candidates["pet-skins"]).toEqual({ sapling: ["spr_ui_item_pet_unlock_sapling"] });
    expect(candidates.spells).toEqual({ growth: ["spr_ui_journal_magic_growth_spell_icon_main"] });
  });

  it("throws when a mount perk has no menu icon", () => {
    const data = {
      ...trackerData,
      mount: { ...trackerData.mount, perks: { harvest_horse: {} } },
    } as unknown as TrackerData;
    expect(() => extractEntitySpriteCandidates(fiddle, data)).toThrow(
      'Mount perk "harvest_horse" has no icon',
    );
  });
});

describe("extractEntitySpriteCandidates on unexpected data", () => {
  it("throws when two items unlock the same pet skin", () => {
    const duplicate = makeFiddle({
      ...fiddle,
      items: {
        other: {
          monster_drops: {
            a: { icon_sprite: "spr_a", pet_skin_unlock: "sapling" },
            b: { icon_sprite: "spr_b", pet_skin_unlock: "sapling" },
          },
        },
      },
    });
    expect(() => extractEntitySpriteCandidates(duplicate, trackerData)).toThrow(
      'Pet skin "sapling" has more than one unlock item',
    );
  });

  it("throws when a mount perk appears twice in the menu", () => {
    const duplicate = makeFiddle({
      ...fiddle,
      ui: {
        skill_menu: {
          mount: {
            tier_1: [{ icon: "spr_a", perk: "horsepower" }],
            tier_2: [{ icon: "spr_b", perk: "horsepower" }],
          },
        },
      },
    });
    expect(() => extractEntitySpriteCandidates(duplicate, trackerData)).toThrow(
      'Duplicate mount perk "horsepower"',
    );
  });
});

describe("renownRewardItemSprites", () => {
  it("indexes the icon of each item reward", () => {
    expect(renownRewardItemSprites(fiddle, trackerData)).toEqual({
      treasure_box_gold: "spr_ui_item_gold_chest",
    });
  });

  it("throws for a reward item the game data lacks", () => {
    const data = {
      ...trackerData,
      renown: { rewards: [{ type: "item", itemId: "missing_item" }] },
    } as unknown as TrackerData;
    expect(() => renownRewardItemSprites(fiddle, data)).toThrow(
      'Renown reward item "missing_item" is not an item',
    );
  });
});
