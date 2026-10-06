import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";
import { createAssetsLocalizer, createLocalizer } from "./localize.js";
import { createAssetsFixture, createMemoryLocalizer } from "./test-helpers.js";

import type { GameLanguageCode } from "./locale-codes.js";
import type { LocalizeFieldInput } from "./localize.js";

const NON_ENGLISH_LANGUAGES = (Object.keys(GAME_LANGUAGE_TO_LOCALE) as GameLanguageCode[]).filter(
  (language) => language !== "eng",
);

const villagerName: LocalizeFieldInput = {
  category: "npcs",
  classification: "localizable",
  englishValue: "Balor",
  field: "name",
  id: "balor",
};

beforeEach(() => {
  vi.spyOn(console, "log").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Localizer key derivation & fallback", () => {
  it("derives category/id/field keys and records locales that fall back to English", () => {
    const localizer = createMemoryLocalizer({
      translations: { jpn: { "npcs/balor/name": "バロル" }, spa: { "npcs/balor/name": "Balor" } },
    });

    const result = localizer.localizeField(villagerName);

    expect(result.values.en).toBe("Balor");
    expect(result.values.ja).toBe("バロル");
    expect(result.values.fr).toBe("Balor");
    expect(result.fallbackLocales).toEqual(["fr", "ko", "ru", "zh-Hans", "zh-Hant"]);
  });

  it("derives a key without a field segment", () => {
    const localizer = createMemoryLocalizer({
      translations: { jpn: { "misc_local/crops": "作物" } },
    });

    const result = localizer.localizeField({
      category: "misc_local",
      classification: "localizable",
      englishValue: "Crops",
      id: "crops",
      logMissing: false,
    });

    expect(result.values.ja).toBe("作物");
  });

  it("logs each missing key unless the caller reports fallbacks itself", () => {
    const log = vi.spyOn(console, "log").mockReturnValue(undefined);
    const localizer = createMemoryLocalizer({});

    localizer.localizeField(villagerName);
    expect(log).toHaveBeenCalledTimes(NON_ENGLISH_LANGUAGES.length);

    log.mockClear();
    localizer.localizeField({ ...villagerName, logMissing: false });
    expect(log).not.toHaveBeenCalled();
  });

  it("uses the English value for every locale when the field is structural", () => {
    const source = vi.fn(() => new Map<string, string>());
    const result = createLocalizer(source).localizeField({
      ...villagerName,
      classification: "structural",
    });

    expect(new Set(Object.values(result.values))).toEqual(new Set(["Balor"]));
    expect(result.fallbackLocales).toEqual([]);
    expect(source).not.toHaveBeenCalled();
  });

  it("loads each table from its source once", () => {
    const source = vi.fn(() => new Map<string, string>());
    const localizer = createLocalizer(source);

    localizer.localizeField({ ...villagerName, logMissing: false });
    localizer.localizeField({ ...villagerName, id: "adeline", logMissing: false });

    expect(source).toHaveBeenCalledTimes(NON_ENGLISH_LANGUAGES.length);
    for (const language of NON_ENGLISH_LANGUAGES) {
      expect(source).toHaveBeenCalledWith(language, "translations");
    }
  });
});

describe("ordinal English localization guard", () => {
  const hairInput: LocalizeFieldInput = {
    category: "ui/character_customization/hair",
    classification: "localizable",
    englishValue: "Short Hair",
    expectedEnglishValue: "Short Hair",
    field: "name",
    id: "0",
    logMissing: false,
  };
  const hairKey = "ui/character_customization/hair/0/name";

  it("rejects a source value that differs from the expected English ordinal", () => {
    expect(() =>
      createMemoryLocalizer({}).localizeField({ ...hairInput, englishValue: "Medium Hair" }),
    ).toThrow(/English localization mismatch for ordinal key/);
  });

  it.each(["Medium Hair", undefined])(
    "rejects a reordered or missing English baseline (%s)",
    (english) => {
      const localizer = createMemoryLocalizer({
        source_caches: { fra: english === undefined ? {} : { [hairKey]: english } },
        translations: { fra: { [hairKey]: "Cheveux courts" } },
      });

      expect(() => localizer.localizeField(hairInput)).toThrow(/English localization mismatch/);
    },
  );

  it.each([true, false])(
    "preserves beta fallback with matching or absent English baseline (%s)",
    (hasBaseline) => {
      const localizer = createMemoryLocalizer({
        source_caches: Object.fromEntries(
          NON_ENGLISH_LANGUAGES.map((language) => [
            language,
            hasBaseline ? { [hairKey]: "Short Hair" } : {},
          ]),
        ),
      });

      const result = localizer.localizeField(hairInput);

      expect(result.values.ja).toBe("Short Hair");
      expect(result.fallbackLocales).toHaveLength(NON_ENGLISH_LANGUAGES.length);
    },
  );
});

describe("createAssetsLocalizer", () => {
  it("reads string entries from localization/<directory>/<language>.meta.toml", () => {
    const files = Object.fromEntries(
      NON_ENGLISH_LANGUAGES.map((language) => [
        `../localization/translations/${language}.meta.toml`,
        language === "jpn"
          ? '[asset_properties]\n"npcs/balor/name" = "バロル"\n"npcs/balor/count" = 3'
          : "[asset_properties]",
      ]),
    );
    const localizer = createAssetsLocalizer(createAssetsFixture(files));

    const result = localizer.localizeField({ ...villagerName, logMissing: false });

    expect(result.values.ja).toBe("バロル");
    expect(result.fallbackLocales).not.toContain("ja");
  });
});
