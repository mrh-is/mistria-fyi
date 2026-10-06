import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractDates } from "./dates.js";

import type { DateId } from "#lib/types/tracker-data.js";

vi.mock("../localize.js", () => ({
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

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({
    items: {
      other: {
        dating: {
          inn_menu: { date_unlock: "inn_meal", name: "Inn Menu" },
          picnic_set: { date_unlock: "deep_woods_picnic", name: "Picnic Set" },
        },
      },
    },
    ...overrides,
  });
}

describe("extractDates", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts listed dates with their unlock item sources", () => {
    const fiddle = makeFiddle({
      dates: {
        default: { name: "MISSING" },
        inn_meal: { name: "Inn Meal Date", npc_visuals: { adeline: {} } },
      },
    });

    const { dates, localeNames } = extractDates(fiddle, assetsDir);

    expect(dates).toEqual({
      inn_meal: {
        sources: [{ type: "date_inspiration", itemId: "inn_menu" }],
      },
    });
    expect(localeNames.ja["inn_meal" as DateId]).toBe("Inn Meal Date");
  });

  it("skips the default key", () => {
    const fiddle = makeFiddle({
      dates: {
        default: { name: "MISSING" },
        inn_meal: { name: "Inn Meal Date" },
      },
    });

    const { dates } = extractDates(fiddle, assetsDir);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("skips unlisted dates", () => {
    const fiddle = makeFiddle({
      dates: {
        inn_meal: { name: "Inn Meal Date" },
        shooting_star: { name: "Shooting Star", unlisted: true },
      },
    });

    const { dates } = extractDates(fiddle, assetsDir);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("returns an empty object when there is no dates data", () => {
    expect(extractDates(makeFiddle({ dates: undefined }), assetsDir).dates).toEqual({});
  });

  it("throws when a date has no name", () => {
    const fiddle = makeFiddle({
      dates: { bad_date: {} },
    });
    expect(() => extractDates(fiddle, assetsDir)).toThrow('Date "bad_date" is missing a name');
  });

  it("throws when a date has no matching unlock item", () => {
    const fiddle = makeFiddle({
      dates: { orphan_date: { name: "Orphan" } },
      items: { other: { dating: {} } },
    });
    expect(() => extractDates(fiddle, assetsDir)).toThrow(
      'Date "orphan_date" has no matching date_unlock item',
    );
  });

  it("extracts multiple dates in source order", () => {
    const fiddle = makeFiddle({
      dates: {
        deep_woods_picnic: { name: "Deep Woods Picnic" },
        inn_meal: { name: "Inn Meal Date" },
      },
    });

    const { dates } = extractDates(fiddle, assetsDir);
    expect(Object.keys(dates)).toEqual(["deep_woods_picnic", "inn_meal"]);
    expect(dates["deep_woods_picnic" as DateId]).toEqual({
      sources: [{ type: "date_inspiration", itemId: "picnic_set" }],
    });
  });
});
