import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle } from "../test-helpers";
import { extractFestivals } from "./festivals";

import type { FestivalId } from "$lib/types/tracker-data.js";

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

describe("extractFestivals", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts festival names in sorted key order and skips entries without valid data", () => {
    const fiddle = makeFiddle({
      festivals: {
        missing_name: { date: { day: 1, season: "spring" }, description: "No name" },
        null_entry: null,
        numeric_name: { date: { day: 1, season: "spring" }, name: 42 },
        spring_festival: { date: { day: 1, season: "spring" }, name: "Spring Festival" },
        string_entry: "Not an object",
        winter_festival: { date: { day: 5, season: "winter" }, name: "Winter Festival" },
      },
    });

    const { festivals, localeNames } = extractFestivals(fiddle, assetsDir);

    expect(festivals).toEqual({
      spring_festival: { date: { day: 1, season: "spring" } },
      winter_festival: { date: { day: 5, season: "winter" } },
    });
    expect(Object.keys(festivals)).toEqual(["spring_festival", "winter_festival"]);
    expect(localeNames.ja["spring_festival" as FestivalId]).toBe("Spring Festival");
  });

  it("skips the default key", () => {
    const fiddle = makeFiddle({
      festivals: {
        default: { date: { day: 1, season: "spring" }, name: "Default Festival" },
        spring_festival: { date: { day: 1, season: "spring" }, name: "Spring Festival" },
      },
    });

    expect(extractFestivals(fiddle, assetsDir).festivals).toEqual({
      spring_festival: { date: { day: 1, season: "spring" } },
    });
  });

  it("returns an empty object when there is no festivals data", () => {
    expect(extractFestivals(makeFiddle(), assetsDir).festivals).toEqual({});
  });

  it("extracts festival date when present", () => {
    const fiddle = makeFiddle({
      festivals: {
        harvest_festival: {
          date: { day: 10, season: "fall" },
          name: "Harvest Festival",
        },
      },
    });
    const { festivals: result } = extractFestivals(fiddle, assetsDir);
    expect(result["harvest_festival" as FestivalId]).toEqual({
      date: { day: 10, season: "fall" },
    });
  });

  it("rejects a festival without a valid date", () => {
    const fiddle = makeFiddle({ festivals: { harvest: { name: "Harvest Festival" } } });
    expect(() => extractFestivals(fiddle, assetsDir)).toThrow(
      'Festival "harvest" has no valid date',
    );
  });

  it.each([
    { date: { day: 10, season: "autumn" }, label: "unknown season" },
    { date: { day: 0, season: "fall" }, label: "day below range" },
    { date: { day: 29, season: "fall" }, label: "day above range" },
    { date: { day: 10.5, season: "fall" }, label: "fractional day" },
  ])("rejects $label", ({ date }) => {
    const fiddle = makeFiddle({ festivals: { harvest: { date, name: "Harvest Festival" } } });
    expect(() => extractFestivals(fiddle, assetsDir)).toThrow(
      'Festival "harvest" has no valid date',
    );
  });
});
