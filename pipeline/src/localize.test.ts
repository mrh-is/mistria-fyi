import { describe, expect, it } from "vitest";

import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";
import { localizeField } from "./localize.js";
import { createAssetsFixture } from "./test-helpers.js";

describe("ordinal English localization guard", () => {
  it.each(["Medium Hair", undefined])(
    "rejects a reordered or missing English ordinal (%s)",
    (english) => {
      const assetsDir = createAssetsFixture({
        "../localization/source_caches/fra.meta.toml":
          english === undefined
            ? "[asset_properties]"
            : `[asset_properties]\n"ui/character_customization/hair/0/name" = "${english}"`,
        "../localization/translations/fra.meta.toml":
          '[asset_properties]\n"ui/character_customization/hair/0/name" = "Cheveux courts"',
      });
      expect(() =>
        localizeField(assetsDir, {
          category: "ui/character_customization/hair",
          classification: "localizable",
          englishValue: "Short Hair",
          expectedEnglishValue: "Short Hair",
          field: "name",
          id: "0",
        }),
      ).toThrow(/English localization mismatch/);
    },
  );

  it.each([true, false])(
    "preserves beta fallback with matching or absent English baseline (%s)",
    (hasBaseline) => {
      const files = Object.fromEntries(
        Object.keys(GAME_LANGUAGE_TO_LOCALE).flatMap((language) =>
          language === "eng"
            ? []
            : [
                [`../localization/translations/${language}.meta.toml`, "[asset_properties]"],
                [
                  `../localization/source_caches/${language}.meta.toml`,
                  hasBaseline
                    ? '[asset_properties]\n"ui/character_customization/hair/0/name" = "Short Hair"'
                    : "[asset_properties]",
                ],
              ],
        ),
      );
      const result = localizeField(createAssetsFixture(files), {
        category: "ui/character_customization/hair",
        classification: "localizable",
        englishValue: "Short Hair",
        expectedEnglishValue: "Short Hair",
        field: "name",
        id: "0",
        logMissing: false,
      });
      expect(result.values.ja).toBe("Short Hair");
      expect(result.fallbackLocales).toHaveLength(7);
    },
  );
});
