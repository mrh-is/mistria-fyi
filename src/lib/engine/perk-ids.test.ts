import { describe, expect, it } from "vitest";

import { trackedPerkIds } from "./perk-ids.js";

import type { TrackerData } from "#lib/types/tracker-data.js";

describe("trackedPerkIds", () => {
  it("lists every skill tier's perks, then the Mistmare's", () => {
    const data = {
      mount: {
        appearances: {},
        perks: { horsepower: { sources: [{ type: "horse_statue", cost: 200, questId: "q" }] } },
      },
      skills: {
        fishing: { perkTiers: [{ fishing_1: {} }, {}, {}, {}, { fishing_5: {} }] },
        mining: { perkTiers: [{ mining_1: {}, mining_2: {} }, {}, {}, {}, {}] },
      },
    } as unknown as Pick<TrackerData, "mount" | "skills">;
    expect(trackedPerkIds(data)).toEqual([
      "fishing_1",
      "fishing_5",
      "mining_1",
      "mining_2",
      "horsepower",
    ]);
  });
});
