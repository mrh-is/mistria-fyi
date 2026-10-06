import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { MAX_VILLAGER_LEVEL } from "#lib/engine/progress.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordKeys } from "#lib/utils/record.js";

import { buildVillagerRoster, filterVillagerRoster } from "./villager-roster.js";

import type { VillagerId } from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";

function completedWithVillagerLevels(
  villagerLevels: Partial<Record<VillagerId, number>>,
): CompletedState {
  return makeCompletedState({ villagerLevels });
}

describe("buildVillagerRoster", () => {
  it.each(["en", "ja"] as const)("orders %s names with the locale's collation", (locale) => {
    const expected = recordKeys(trackerData.villagers)
      .map((id) => getName("villagers", id, locale))
      .toSorted((a, b) => nameCollator(locale).compare(a, b));

    expect(buildVillagerRoster(locale).map(({ name }) => name)).toStrictEqual(expected);
  });
});

describe("filterVillagerRoster", () => {
  it("hides completed villagers unless they are targeted or completed rows are shown", () => {
    const roster = buildVillagerRoster("en");
    const completedId = recordKeys(trackerData.villagers).find(
      (id) => !trackerData.villagers[id].dateable,
    );
    if (!completedId) throw new Error("Expected a non-dateable villager fixture");
    const completed = completedWithVillagerLevels({ [completedId]: MAX_VILLAGER_LEVEL });

    expect(filterVillagerRoster(roster, completed, false, "").map(({ id }) => id)).not.toContain(
      completedId,
    );
    expect(
      filterVillagerRoster(roster, completed, false, completedId).map(({ id }) => id),
    ).toContain(completedId);
    expect(filterVillagerRoster(roster, completed, true, "").map(({ id }) => id)).toContain(
      completedId,
    );
  });
});
