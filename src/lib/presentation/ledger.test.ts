import { expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import { ledgerPlacement, ledgerShelf } from "./ledger.js";

import type { DayContext } from "#lib/engine/availability.js";
import type { Source } from "#lib/types/acquisition.js";

function springDay(): DayContext {
  return {
    progressionState: userState.progressionState,
    worldState: { season: "spring", weather: "special" },
  };
}

it("holds completed covered entries on Completed and uses the shown source for To do", () => {
  const day = springDay();
  const source: Source = { type: "fish" };
  const covered = ledgerPlacement([source], day, day.progressionState, {
    completed: true,
    doable: true,
    spoilered: true,
  });
  const outstanding = ledgerPlacement([source], day, day.progressionState, {
    completed: false,
    doable: true,
    spoilered: false,
  });
  expect(ledgerShelf(covered, () => false)).toBe("completed");
  expect(ledgerShelf(outstanding, () => true)).toBe("todo");
  expect(ledgerShelf(outstanding, () => false)).toBe("notNow");
});

it("checks for calm weather in a future season that cannot have today’s weather", () => {
  const day = springDay();
  const source: Source = {
    type: "fish",
    availability: {
      type: "all",
      conditions: [
        { type: "season", seasons: ["fall", "winter"] },
        { type: "weather", weathers: ["calm"] },
      ],
    },
  };
  const row = ledgerPlacement([source], day, day.progressionState, {
    completed: false,
    doable: false,
    spoilered: false,
  });
  expect(row.seasonalSources).toEqual([{ seasons: ["winter"], source }]);
});
