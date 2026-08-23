import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractDates } from "./dates.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    items: {
      other: {
        dating: {
          inn_menu: { date_unlock: "inn_meal", name: "Inn Menu" },
          picnic_set: { date_unlock: "deep_woods_picnic", name: "Picnic Set" },
        },
      },
    },
    ...overrides,
  } as ParsedGameData;
}

describe("extractDates", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    const dates = extractDates(fiddle);

    expect(dates).toEqual({
      inn_meal: {
        name: "Inn Meal Date",
        sources: [{ type: "date_inspiration", itemId: "inn_menu" }],
      },
    });
  });

  it("skips the default key", () => {
    const fiddle = makeFiddle({
      dates: {
        default: { name: "MISSING" },
        inn_meal: { name: "Inn Meal Date" },
      },
    });

    const dates = extractDates(fiddle);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("skips unlisted dates", () => {
    const fiddle = makeFiddle({
      dates: {
        inn_meal: { name: "Inn Meal Date" },
        shooting_star: { name: "Shooting Star", unlisted: true },
      },
    });

    const dates = extractDates(fiddle);
    expect(Object.keys(dates)).toEqual(["inn_meal"]);
  });

  it("returns an empty object when there is no dates data", () => {
    expect(extractDates(makeFiddle({ dates: undefined }))).toEqual({});
  });

  it("throws when a date has no name", () => {
    const fiddle = makeFiddle({
      dates: { bad_date: {} },
    });
    expect(() => extractDates(fiddle)).toThrow('Date "bad_date" is missing a name');
  });

  it("throws when a date has no matching unlock item", () => {
    const fiddle = makeFiddle({
      dates: { orphan_date: { name: "Orphan" } },
      items: { other: { dating: {} } },
    });
    expect(() => extractDates(fiddle)).toThrow(
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

    const dates = extractDates(fiddle);
    expect(Object.keys(dates)).toEqual(["deep_woods_picnic", "inn_meal"]);
    expect(dates["deep_woods_picnic" as keyof typeof dates]).toEqual({
      name: "Deep Woods Picnic",
      sources: [{ type: "date_inspiration", itemId: "picnic_set" }],
    });
  });
});
