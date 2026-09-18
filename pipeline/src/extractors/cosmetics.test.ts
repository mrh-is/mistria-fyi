import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractCosmetics } from "./cosmetics.js";

vi.mock("../parse-fiddle.js", () => ({
  sourceFileFor: () => "mock-source.toml",
}));

const localizeField = vi.hoisted(() =>
  vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: `JA ${input.englishValue}`,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
);

vi.mock("../localize.js", () => ({ localizeField }));

const customization = {
  hair: [
    { icon: "spr_short", key: "short_hair", name: "Short Hair" },
    { icon: "spr_medium", key: "medium_hair", name: "Medium Hair" },
  ],
};

describe("extractCosmetics sub-categories", () => {
  it("localizes sub-category labels by ordinal and stores the key on the cosmetic", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = makeFiddle({
      player_assets: {
        bob_cut: { name: "Bob Cut", ui_slot: "hair", ui_sub_category: "medium_hair" },
      },
      ui: { character_customization: customization },
    });

    const { cosmetics, subCategoryLocaleNames } = extractCosmetics(fiddle, "assets");

    expect(cosmetics).toEqual({
      bob_cut: { slot: "hair", sources: [], subCategory: "medium_hair" },
    });
    expect(subCategoryLocaleNames.en).toEqual({
      medium_hair: "Medium Hair",
      short_hair: "Short Hair",
    });
    expect(subCategoryLocaleNames.ja.medium_hair).toBe("JA Medium Hair");
    expect(localizeField).toHaveBeenCalledWith("assets", {
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

    expect(() => extractCosmetics(fiddle, "assets")).toThrow(/"mystery_hair" with no entry/);
  });
});
