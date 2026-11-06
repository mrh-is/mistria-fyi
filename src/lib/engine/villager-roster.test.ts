import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { recordKeys } from "#lib/utils/record.js";

import { buildVillagerRoster } from "./villager-roster.js";

describe("buildVillagerRoster", () => {
  it.each(["en", "ja"] as const)("orders %s names with the locale's collation", (locale) => {
    const expected = recordKeys(trackerData.villagers)
      .map((id) => getName("villagers", id, locale))
      .toSorted((a, b) => nameCollator(locale).compare(a, b));

    expect(buildVillagerRoster(locale).map(({ name }) => name)).toStrictEqual(expected);
  });
});
