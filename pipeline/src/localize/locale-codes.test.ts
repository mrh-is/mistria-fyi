import { describe, expect, it } from "vitest";

import { createAssetsFixture } from "../test-helpers.js";
import { assertGameLanguageMapExhaustive, GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";

function languageAssets(codes: string[]): string {
  return createAssetsFixture({
    "../localization/l10n.meta.toml": codes
      .map(
        (code) =>
          `[asset_properties.languages."${code}"]\ndisplay_name = "${code}"\nship = false\ninfusion_order = "noun_first"\ninfusion_space = " "`,
      )
      .join("\n"),
  });
}

describe("game language map guard", () => {
  it("rejects a newly added game language before manifest serialization", () => {
    expect(() => {
      assertGameLanguageMapExhaustive(
        languageAssets([...Object.keys(GAME_LANGUAGE_TO_LOCALE), "deu"]),
      );
    }).toThrow(/not in GAME_LANGUAGE_TO_LOCALE: deu/);
  });

  it("rejects stale mappings when a language is removed", () => {
    expect(() => {
      assertGameLanguageMapExhaustive(
        languageAssets(Object.keys(GAME_LANGUAGE_TO_LOCALE).filter((code) => code !== "jpn")),
      );
    }).toThrow(/stale entries.*jpn/);
  });

  it("accepts the complete supported language set", () => {
    expect(() => {
      assertGameLanguageMapExhaustive(languageAssets(Object.keys(GAME_LANGUAGE_TO_LOCALE)));
    }).not.toThrow();
  });
});
