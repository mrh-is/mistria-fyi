import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers";
import { extractPetCosmetics, extractPetSkins } from "./pets";

vi.mock("../localize", () => ({
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
  it("extracts structural skins and derives locale names without stripping translated prefixes", () => {
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

    const itemLocaleNames = {
      en: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      es: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      fr: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      ja: { pet_skin_mushroom: "キノコのペットスキン", pet_skin_sapling: "若木のペットスキン" },
      ko: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      ru: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      "zh-Hans": { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
      "zh-Hant": { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "Pet Skin: Sapling" },
    } as never;

    const result = extractPetSkins(fiddle, itemLocaleNames);
    expect(result.skins).toEqual({
      mushroom: { sources: [] },
      sapling: { sources: [] },
    });
    expect(result.localeNames.en).toEqual({ mushroom: "Mushroom", sapling: "Sapling" });
    expect(result.localeNames.ja).toEqual({
      mushroom: "キノコのペットスキン",
      sapling: "若木のペットスキン",
    });
  });

  it("returns empty record when no pet skin items exist", () => {
    const fiddle = makeFiddle({ items: {} });
    expect(extractPetSkins(fiddle, {} as never).skins).toEqual({});
  });
});
