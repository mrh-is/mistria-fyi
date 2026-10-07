import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractDates } from "./dates.js";

import type { DateId } from "#lib/types/tracker-data.js";

const localizer = stubLocalizer();

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

    const { dates, localeNames } = extractDates(fiddle, localizer);

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

    const { dates } = extractDates(fiddle, localizer);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("skips unlisted dates", () => {
    const fiddle = makeFiddle({
      dates: {
        inn_meal: { name: "Inn Meal Date" },
        shooting_star: { name: "Shooting Star", unlisted: true },
      },
    });

    const { dates } = extractDates(fiddle, localizer);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("returns an empty object when there is no dates data", () => {
    expect(extractDates(makeFiddle({ dates: undefined }), localizer).dates).toEqual({});
  });

  it("throws when a date has no name", () => {
    const fiddle = makeFiddle({
      dates: { bad_date: {} },
    });
    expect(() => extractDates(fiddle, localizer)).toThrow('Date "bad_date" is missing a name');
  });

  it("throws when a date has no matching unlock item", () => {
    const fiddle = makeFiddle({
      dates: { orphan_date: { name: "Orphan" } },
      items: { other: { dating: {} } },
    });
    expect(() => extractDates(fiddle, localizer)).toThrow(
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

    const { dates } = extractDates(fiddle, localizer);
    expect(Object.keys(dates)).toEqual(["deep_woods_picnic", "inn_meal"]);
    expect(dates["deep_woods_picnic" as DateId]).toEqual({
      sources: [{ type: "date_inspiration", itemId: "picnic_set" }],
    });
  });
});
