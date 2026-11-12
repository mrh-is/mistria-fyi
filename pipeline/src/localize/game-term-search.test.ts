import { describe, expect, it } from "vitest";

import { searchGameTerms } from "./game-term-search.js";

describe("searchGameTerms", () => {
  it("finds English text across source caches and joins translations by game key", () => {
    const hits = searchGameTerms("  COSMETIC  ", (language, directory) => {
      if (directory === "source_caches") {
        if (language === "spa") {
          return new Map([
            ["misc_local/select", "Select Cosmetic"],
            ["misc_local/notice", "New cosmetics available!"],
            ["misc_local/cosmetic_key_only", "Unrelated English text"],
          ]);
        }
        if (language === "fra") return new Map([["misc_local/notice", "New cosmetics available!"]]);
        if (language === "jpn") return new Map([["misc_local/select", "Select an accessory"]]);
        return new Map();
      }
      return language === "jpn"
        ? new Map([
            ["misc_local/select", "外見を選択"],
            ["misc_local/notice", " "],
          ])
        : new Map();
    });

    expect(hits).toEqual([
      {
        key: "misc_local/notice",
        sourceDifferences: {},
        text: {
          en: "New cosmetics available!",
          es: null,
          fr: null,
          ja: null,
          ko: null,
          ru: null,
          "zh-Hans": null,
          "zh-Hant": null,
        },
      },
      {
        key: "misc_local/select",
        sourceDifferences: { ja: "Select an accessory" },
        text: {
          en: "Select Cosmetic",
          es: null,
          fr: null,
          ja: "外見を選択",
          ko: null,
          ru: null,
          "zh-Hans": null,
          "zh-Hant": null,
        },
      },
    ]);
  });

  it("returns no rows for an unmatched search", () => {
    expect(
      searchGameTerms("seal", () => new Map([["misc_local/select", "Select Cosmetic"]])),
    ).toEqual([]);
  });

  it("rejects a blank search before loading game tables", () => {
    expect(() =>
      searchGameTerms(" ", () => {
        throw new Error("Unexpected table read");
      }),
    ).toThrow(/English word or phrase/);
  });
});
