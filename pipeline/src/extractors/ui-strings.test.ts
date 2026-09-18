import { describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { extractUiStrings, tierKeys } from "./ui-strings.js";

const localizeField = vi.hoisted(() =>
  vi.fn((_assetsDir: string, input: { englishValue: string; id: string }) => ({
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

describe("extractUiStrings", () => {
  it("localizes each requested misc_local key without a field segment", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = makeFiddle({ misc_local: { crops: "Crops", tier_1: "Tier 1" } });

    const { localeNames } = extractUiStrings(fiddle, "assets", ["tier_1", "crops", "crops"]);

    expect(localeNames.en).toEqual({ crops: "Crops", tier_1: "Tier 1" });
    expect(localeNames.ja).toEqual({ crops: "JA Crops", tier_1: "JA Tier 1" });
    expect(localizeField).toHaveBeenCalledTimes(2);
    expect(localizeField).toHaveBeenCalledWith("assets", {
      category: "misc_local",
      classification: "localizable",
      englishValue: "Crops",
      id: "crops",
    });
  });

  it("stores an aliased request under its id, localized from its misc_local key", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = makeFiddle({
      misc_local: { fish: "Fish", fishing_and_diving: "Fishing and Diving" },
    });

    const { localeNames } = extractUiStrings(fiddle, "assets", [
      { id: "fish", miscLocalKey: "fishing_and_diving" },
    ]);

    expect(localeNames.en).toEqual({ fish: "Fishing and Diving" });
    expect(localeNames.ja).toEqual({ fish: "JA Fishing and Diving" });
    expect(localizeField).toHaveBeenCalledWith("assets", {
      category: "misc_local",
      classification: "localizable",
      englishValue: "Fishing and Diving",
      id: "fishing_and_diving",
    });
  });

  it("throws when one id is requested with two misc_local keys", () => {
    const fiddle = makeFiddle({ misc_local: { fish: "Fish", other: "Other" } });
    expect(() =>
      extractUiStrings(fiddle, "assets", ["fish", { id: "fish", miscLocalKey: "other" }]),
    ).toThrow(/conflicting misc_local keys/);
  });

  it("throws when misc_local lacks the English string", () => {
    const fiddle = makeFiddle({ misc_local: { crops: "Crops" } });
    expect(() => extractUiStrings(fiddle, "assets", ["song_crystal"])).toThrow(
      /no English string for UI key "song_crystal"/,
    );
  });

  it("names tiers one-based", () => {
    expect(tierKeys(3)).toEqual(["tier_1", "tier_2", "tier_3"]);
    expect(tierKeys(0)).toEqual([]);
  });
});
