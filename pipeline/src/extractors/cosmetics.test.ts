import { describe, expect, it, vi } from "vitest";

import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { extractCosmetics } from "./cosmetics.js";

const localizer = stubLocalizer((input, locale) =>
  locale === "ja" ? `JA ${input.englishValue}` : undefined,
);
const { localizeField } = localizer;

// Built from entries so the game's (non-alphabetical) section order is what the extractor sees.
const customization = Object.fromEntries([
  [
    "hair",
    [
      { icon: "spr_short", key: "short_hair", name: "Short Hair" },
      { icon: "spr_medium", key: "medium_hair", name: "Medium Hair" },
    ],
  ],
  ["eyes", [{ icon: "spr_eyes", key: "eyes", name: "Eyes" }]],
]);

describe("extractCosmetics sub-categories", () => {
  it("localizes sub-category labels by ordinal and stores the key on the cosmetic", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({
      player_assets: {
        bob_cut: { name: "Bob Cut", ui_slot: "hair", ui_sub_category: "medium_hair" },
      },
      ui: { character_customization: customization },
    });

    const { cosmetics, cosmeticSlots, subCategoryLocaleNames } = extractCosmetics(
      fiddle,
      localizer,
    );

    expect(cosmetics).toEqual({
      bob_cut: { slot: "hair", sources: [], subCategory: "medium_hair" },
    });
    expect(Object.keys(cosmeticSlots)).toEqual(["hair", "eyes"]);
    expect(cosmeticSlots.hair).toEqual({ subCategories: ["short_hair", "medium_hair"] });
    expect(subCategoryLocaleNames.en).toEqual({
      eyes: "Eyes",
      medium_hair: "Medium Hair",
      short_hair: "Short Hair",
    });
    expect(subCategoryLocaleNames.ja.medium_hair).toBe("JA Medium Hair");
    expect(localizeField).toHaveBeenCalledWith({
      category: "ui/character_customization/hair",
      classification: "localizable",
      englishValue: "Medium Hair",
      expectedEnglishValue: "Medium Hair",
      field: "name",
      id: "1",
    });
  });

  it("throws on a ui_sub_category the customization menu does not define", () => {
    const fiddle = makeFiddle({
      player_assets: {
        bob_cut: { name: "Bob Cut", ui_slot: "hair", ui_sub_category: "mystery_hair" },
      },
      ui: { character_customization: customization },
    });

    expect(() => extractCosmetics(fiddle, localizer)).toThrow(/"mystery_hair" with no entry/);
  });

  it("throws on a ui_sub_category that belongs to a different slot", () => {
    const fiddle = makeFiddle({
      player_assets: {
        bob_cut: { name: "Bob Cut", ui_slot: "eyes", ui_sub_category: "medium_hair" },
      },
      ui: { character_customization: customization },
    });

    expect(() => extractCosmetics(fiddle, localizer)).toThrow(
      /"medium_hair" with no entry under "eyes"/,
    );
  });

  it("throws on a ui_slot the customization menu does not define", () => {
    const fiddle = makeFiddle({
      player_assets: {
        bob_cut: { name: "Bob Cut", ui_slot: "bottom", ui_sub_category: "medium_hair" },
      },
      ui: { character_customization: customization },
    });

    expect(() => extractCosmetics(fiddle, localizer)).toThrow(/ui_slot "bottom" with no section/);
  });

  it("throws on a cosmetic with no ui_sub_category", () => {
    const fiddle = makeFiddle({
      player_assets: { bob_cut: { name: "Bob Cut", ui_slot: "hair" } },
      ui: { character_customization: customization },
    });

    expect(() => extractCosmetics(fiddle, localizer)).toThrow(/ui_sub_category undefined/);
  });
});
