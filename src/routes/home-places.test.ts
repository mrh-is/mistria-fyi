import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { createProgressContext } from "#lib/engine/progress.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { readProgressBlob } from "#lib/stores/progress-storage.js";

import fixtures from "../../scripts/fixtures/field-guide-progress.json";
import { HOME_PLACES_WARNING_LIMIT, projectHomePlaces } from "./home-places.js";

function fixtureContext(name: keyof typeof fixtures) {
  const result = readProgressBlob(JSON.stringify(fixtures[name]), "repair");
  if (result.kind !== "ok") throw new Error(`Could not load ${name} progress`);
  const { progress, worldState } = result.loaded;
  return createProgressContext(
    progress,
    deriveProgressionState(progress, trackerData, false),
    worldState,
  );
}

describe("Home places", () => {
  it.each([
    ["day-one", HOME_PLACES_WARNING_LIMIT],
    ["mid-game", 312],
    ["late-game", 15],
  ] as const)("keeps the %s total under its gate regression ceiling", (name, ceiling) => {
    const { places, total } = projectHomePlaces(fixtureContext(name));
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(ceiling);
    expect(places.map(({ rank }) => rank)).toEqual(
      places.map(({ rank }) => rank).toSorted((a, b) => a - b),
    );
  });

  it("puts visiting stalls first on market day and leaves them out on other or unknown days", () => {
    const context = fixtureContext("mid-game");
    function placesOn(day: number | undefined) {
      return projectHomePlaces({ ...context, worldState: { ...context.worldState, day } }).places;
    }
    const saturday = placesOn(13);
    expect(saturday[0].rank).toBe(0);
    expect(saturday.some(({ id }) => id === "store-merri")).toBe(true);
    for (const day of [14, undefined]) {
      expect(placesOn(day).some(({ id }) => id === "store-merri")).toBe(false);
    }
  });
});
