import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractPetCosmetics, extractPetSkins } from "./pets.js";

vi.mock("../localize.js", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: input.englishValue,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
}));
const assetsDir = "test-assets";

describe("extractPetCosmetics", () => {
  it("extracts cosmetic sets with names and empty sources", () => {
    const fiddle = makeFiddle({
      pets: {
        cosmetic_sets: {
          flower_crown: { ui_icon: "spr_ui_item_pet_cosmetic_flower_crown" },
          halo: { name: "Halo", ui_icon: "spr_ui_item_pet_cosmetic_halo" },
        },
      },
    });

    const { cosmetics, localeNames } = extractPetCosmetics(fiddle, assetsDir);
    expect(cosmetics).toEqual({
      flower_crown: { sources: [] },
      halo: { sources: [] },
    });
    expect(localeNames.ja["flower_crown" as never]).toBe("Flower Crown");
  });

  it("returns empty record when no cosmetic_sets exist", () => {
    const fiddle = makeFiddle({ pets: {} });
    expect(extractPetCosmetics(fiddle, assetsDir).cosmetics).toEqual({});
  });

  it("returns empty record when no pets key exists", () => {
    const fiddle = makeFiddle({});
    expect(extractPetCosmetics(fiddle, assetsDir).cosmetics).toEqual({});
  });
});

describe("extractPetSkins", () => {
  it("extracts skins from items with pet_skin_unlock field", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          monster_drops: {
            pet_skin_mushroom: {
              name: "Pet Skin: Mushroom",
              pet_skin_unlock: "mushroom",
              soulbind: "forever",
            },
            pet_skin_sapling: {
              name: "Pet Skin: Sapling",
              pet_skin_unlock: "sapling",
              soulbind: "forever",
            },
            regular_item: {
              name: "Egg",
            },
          },
        },
      },
    });

    const result = extractPetSkins(fiddle);
    expect(result).toEqual({
      mushroom: { name: "Mushroom", sources: [] },
      sapling: { name: "Sapling", sources: [] },
    });
  });

  it("returns empty record when no pet skin items exist", () => {
    const fiddle = makeFiddle({ items: {} });
    expect(extractPetSkins(fiddle)).toEqual({});
  });
});
