import { describe, expect, it } from "vitest";

import { generateLocaleManifest, localizeField } from "./localize.js";
import { requireGameAssetsDir } from "./test-helpers.js";

describe("localizeField — real assets", () => {
  it("derives the key and looks up npcs/balor/name across locales", () => {
    const result = localizeField(requireGameAssetsDir(), {
      category: "npcs",
      classification: "localizable",
      englishValue: "Balor",
      field: "name",
      id: "balor",
    });

    expect(result.values.en).toBe("Balor");
    expect(result.values.ja).toBe("バロル");
    expect(result.fallbackLocales).not.toContain("ja");
  });

  it("derives the key and looks up a nested category path", () => {
    const result = localizeField(requireGameAssetsDir(), {
      category: "items/fish/bait_fish",
      classification: "localizable",
      englishValue: "Copper Rockfish",
      field: "name",
      id: "copper_rockfish",
    });

    expect(result.values.en).toBe("Copper Rockfish");
    expect(result.values.ja).toBe("コッパーメバル");
  });

  it("falls back to English and records the locale when a key is missing", () => {
    const result = localizeField(requireGameAssetsDir(), {
      category: "npcs",
      classification: "localizable",
      englishValue: "Nonexistent villager",
      field: "name",
      id: "definitely_not_a_real_villager_id",
    });

    expect(result.values.ja).toBe("Nonexistent villager");
    expect(result.fallbackLocales).toContain("ja");
    expect(result.fallbackLocales).toHaveLength(7);
  });

  it("rejects an ordinal translation when the English source order changes", () => {
    expect(() =>
      localizeField(requireGameAssetsDir(), {
        category: "renown/ranks",
        classification: "localizable",
        englishValue: "Stone",
        expectedEnglishValue: "Wood",
        field: "name",
        id: "0",
      }),
    ).toThrow(
      'English localization mismatch for ordinal key "renown/ranks/0/name": expected "Wood", got "Stone"',
    );
  });

  it("passes structural fields through unchanged for every locale", () => {
    const result = localizeField(requireGameAssetsDir(), {
      category: "npcs",
      classification: "structural",
      englishValue: "they_them",
      field: "default_pronoun",
      id: "balor",
    });

    expect(result.values.ja).toBe("they_them");
    expect(result.fallbackLocales).toHaveLength(0);
  });

  it("throws when a field is classified 'override' but has no override entry", () => {
    expect(() =>
      localizeField(requireGameAssetsDir(), {
        category: "cosmetics",
        classification: "override",
        englishValue: "Some Cosmetic",
        field: "name",
        id: "unmapped_cosmetic",
      }),
    ).toThrow(/no entry in localize-overrides\.json/);
  });
});

describe("generateLocaleManifest — real assets", () => {
  it("marks English stable and the rest beta", () => {
    const manifest = generateLocaleManifest(requireGameAssetsDir());

    expect(manifest).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: "English", status: "stable", tag: "en" }),
        expect.objectContaining({ displayName: "日本語", status: "beta", tag: "ja" }),
      ]),
    );
    expect(manifest).toHaveLength(8);
    expect(manifest.filter((entry) => entry.status === "stable")).toHaveLength(1);
  });
});
