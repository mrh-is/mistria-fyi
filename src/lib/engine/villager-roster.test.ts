import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { recordKeys } from "#lib/utils/record.js";

import { birthdayOffset, buildVillagerRoster } from "./villager-roster.js";

describe("birthdayOffset", () => {
  it("sorts from spring when the day is unknown", () => {
    expect(birthdayOffset({ day: 1, season: "spring" }, { season: "fall" })).toBe(0);
    expect(birthdayOffset({ day: 1, season: "summer" }, { season: "fall" })).toBe(28);
  });

  it("includes today and wraps past the last day of winter", () => {
    const today = { day: 28, season: "winter" } as const;
    expect(birthdayOffset(today, today)).toBe(0);
    expect(birthdayOffset({ day: 7, season: "spring" }, today)).toBe(7);
    expect(birthdayOffset({ day: 27, season: "winter" }, today)).toBe(111);
  });
});

describe("buildVillagerRoster", () => {
  it.each(["en", "ja"] as const)("orders %s names with the locale's collation", (locale) => {
    const expected = recordKeys(trackerData.villagers)
      .map((id) => getName("villagers", id, locale))
      .toSorted((a, b) => nameCollator(locale).compare(a, b));

    expect(buildVillagerRoster(locale).map(({ name }) => name)).toStrictEqual(expected);
  });
});
