import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { allTrackerSources } from "$lib/utils/tracker-sources.js";

describe("allTrackerSources", () => {
  it("collects representative source types from every source-bearing route family", () => {
    const sourceTypes = new Set(allTrackerSources(trackerData).map(({ type }) => type));

    expect([...sourceTypes]).toEqual(
      expect.arrayContaining(["breed", "default", "forage", "quest", "recipe", "store"]),
    );
  });
});
