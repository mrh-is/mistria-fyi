import { describe, expect, it } from "vitest";

import { LOCALE_CODES } from "#lib/types/locale.js";

import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { extractPetCosmetics, extractPetSkins } from "./pets.js";

const localizer = stubLocalizer();

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

    const { cosmetics, localeNames } = extractPetCosmetics(fiddle, localizer);
    expect(cosmetics).toEqual({
      flower_crown: { sources: [] },
      halo: { sources: [] },
    });
    expect(localeNames.ja["flower_crown" as never]).toBe("Flower Crown");
  });

  it("returns empty record when no cosmetic_sets exist", () => {
    const fiddle = makeFiddle({ pets: {} });
    expect(extractPetCosmetics(fiddle, localizer).cosmetics).toEqual({});
  });

  it("returns empty record when no pets key exists", () => {
    const fiddle = makeFiddle({});
    expect(extractPetCosmetics(fiddle, localizer).cosmetics).toEqual({});
  });
});

describe("extractPetSkins", () => {
  it("extracts structural skins and strips each locale's pet skin prefix", () => {
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
      fr: {
        pet_skin_mushroom: "Pet Skin: Mushroom",
        pet_skin_sapling: "Apparence d'animal : jeune pousse",
      },
      ja: { pet_skin_mushroom: "Pet Skin: Mushroom", pet_skin_sapling: "ペットスキン：ナエネミー" },
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
    expect(result.localeNames.fr).toEqual({ mushroom: "Mushroom", sapling: "Jeune pousse" });
    expect(result.localeNames.ja).toEqual({ mushroom: "Mushroom", sapling: "ナエネミー" });
  });

  it("throws when a locale's pet skin item name has no prefix", () => {
    const fiddle = makeFiddle({
      items: { other: { monster_drops: { pet_skin_mimic: { pet_skin_unlock: "mimic" } } } },
    });
    const itemLocaleNames = Object.fromEntries(
      LOCALE_CODES.map((locale) => [
        locale,
        { pet_skin_mimic: locale === "ko" ? "미믹" : "Pet Skin: Mimic" },
      ]),
    ) as never;

    expect(() => extractPetSkins(fiddle, itemLocaleNames)).toThrow(/"pet_skin_mimic".*"ko"/);
  });

  it("returns empty record when no pet skin items exist", () => {
    const fiddle = makeFiddle({ items: {} });
    expect(extractPetSkins(fiddle, {} as never).skins).toEqual({});
  });
});
