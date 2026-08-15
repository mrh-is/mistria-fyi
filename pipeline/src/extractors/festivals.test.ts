import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractFestivals } from "./festivals.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return overrides as ParsedGameData;
}

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

    const festivals = extractFestivals(fiddle);

    expect(festivals).toEqual({
      spring_festival: { date: { day: 1, season: "spring" }, name: "Spring Festival" },
      winter_festival: { date: { day: 5, season: "winter" }, name: "Winter Festival" },
    });
    expect(Object.keys(festivals)).toEqual(["spring_festival", "winter_festival"]);
  });

  it("skips the default key", () => {
    const fiddle = makeFiddle({
      festivals: {
        default: { date: { day: 1, season: "spring" }, name: "Default Festival" },
        spring_festival: { date: { day: 1, season: "spring" }, name: "Spring Festival" },
      },
    });

    expect(extractFestivals(fiddle)).toEqual({
      spring_festival: { date: { day: 1, season: "spring" }, name: "Spring Festival" },
    });
  });

  it("returns an empty object when there is no festivals data", () => {
    expect(extractFestivals(makeFiddle())).toEqual({});
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
    const result = extractFestivals(fiddle);
    expect(result.harvest_festival).toEqual({
      date: { day: 10, season: "fall" },
      name: "Harvest Festival",
    });
  });

  it("rejects a festival without a valid date", () => {
    const fiddle = makeFiddle({ festivals: { harvest: { name: "Harvest Festival" } } });
    expect(() => extractFestivals(fiddle)).toThrow('Festival "harvest" has no valid date');
  });

  it.each([
    { date: { day: 10, season: "autumn" }, label: "unknown season" },
    { date: { day: 0, season: "fall" }, label: "day below range" },
    { date: { day: 29, season: "fall" }, label: "day above range" },
    { date: { day: 10.5, season: "fall" }, label: "fractional day" },
  ])("rejects $label", ({ date }) => {
    const fiddle = makeFiddle({ festivals: { harvest: { date, name: "Harvest Festival" } } });
    expect(() => extractFestivals(fiddle)).toThrow('Festival "harvest" has no valid date');
  });
});
