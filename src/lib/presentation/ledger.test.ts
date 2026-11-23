import { expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import {
  ledgerCellText,
  ledgerColumn,
  ledgerFirstPlace,
  ledgerPlacement,
  ledgerShelf,
} from "./ledger.js";

import type { DayContext } from "#lib/engine/availability.js";
import type { SourceSegment } from "#lib/sources/source-segments.js";
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

it("writes a cell's text only when every part of the source is visible", () => {
  const condition = { type: "mineFloor", floor: 20 } as const;
  const segments: SourceSegment[] = ["Buy at ", { condition, unspoilered: ["Balor’s Wagon"] }];
  expect(ledgerCellText(["Dig up at an artifact dig site"], () => true)).toBe(
    "Dig up at an artifact dig site",
  );
  expect(ledgerCellText(segments, () => true)).toBe("Buy at Balor’s Wagon");
  expect(ledgerCellText(segments, () => false)).toBeUndefined();
  expect(ledgerCellText(["Buy at ", { spoilered: true }], () => true)).toBeUndefined();
});

it("uses the first named place available today and falls back in source order", () => {
  const unnamed: Source = { type: "default" };
  const pond: Source = { type: "fish" };
  const river: Source = { type: "dive" };
  const sources = [unnamed, pond, river];
  const names = new Map<Source, string>([
    [pond, "Pond"],
    [river, "River"],
  ]);
  const nameOf = (source: Source) => names.get(source);

  expect(ledgerFirstPlace(sources, (source) => source !== pond, nameOf)).toEqual({
    name: "River",
    source: river,
  });
  expect(ledgerFirstPlace(sources, (source) => source === unnamed, nameOf)).toEqual({
    name: "Pond",
    source: pond,
  });
});

it("gives category prices their own column and keeps Everything’s source families", () => {
  const well: Source = { type: "wishing_well", cost: 100 };
  expect(ledgerColumn(well, true)).toBe("price");
  expect(ledgerColumn(well, false)).toBe("offerings");
});
