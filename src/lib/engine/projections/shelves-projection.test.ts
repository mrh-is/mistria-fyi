import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getAllProgress, getCategoryProgress } from "#lib/engine/categories.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { cravingFacts, projectQuests } from "#lib/engine/projections/quests.js";
import { filteredCounts, progressShelf, rowShelf } from "#lib/engine/shelves.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordValues } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { Season } from "#lib/types/tracker-data.js";

function context(season: Season = "spring"): ProgressContext {
  const progress = makeCompletedState();
  return {
    progress,
    progressionState: deriveProgressionState(progress, trackerData, false),
    worldState: { season, weather: "calm" },
  };
}

describe("shelves across the real tracker data", () => {
  it("adds every category up to the home header's total", () => {
    const all = getAllProgress(context());
    const sum = recordValues(all).reduce((total, { total: part }) => total + part, 0);
    expect(sum).toBeGreaterThan(0);
    for (const progress of recordValues(all)) expect(progressShelf(progress)).toBeDefined();
  });

  it("counts a Ladybug only through the sources the filters show (#501)", () => {
    const summer = context("summer");
    const ladybug = (showsSource?: (type: string) => boolean) =>
      projectMuseum(
        summer,
        showsSource && { showsSource: ({ type }) => showsSource(type) },
      ).rows.find(({ id }) => id === "ladybug");
    expect(ladybug()?.doable).toBe(true);
    const gathering = ladybug((type) => type !== "store");
    expect(gathering?.shown).toBe(true);
    expect(gathering?.doable).toBe(false);
    expect(gathering?.doableAnywhere).toBe(true);
  });

  it("never lifts a category up a shelf by narrowing its filters", () => {
    const ctx = context("summer");
    const order = ["todo", "notNow", "completed", undefined];
    for (const key of ["museum", "almanac", "recipes", "cosmetics"] as const) {
      const before = progressShelf(getCategoryProgress(key, ctx));
      const after = progressShelf(
        getCategoryProgress(key, ctx, { showsSource: ({ type }) => type === "fish" }),
      );
      expect(order.indexOf(after)).toBeGreaterThanOrEqual(order.indexOf(before));
    }
  });

  it("keeps a locked quest off To do, & some quests on it, in a new game", () => {
    const { rows } = projectQuests(context());
    expect(rows.some(({ doable }) => doable)).toBe(true);
    expect(rows.some(({ doable }) => !doable)).toBe(true);
  });

  it("never changes a fraction when a filter narrows", () => {
    const ctx = context();
    const full = getCategoryProgress("museum", ctx);
    const narrow = getCategoryProgress("museum", ctx, { showsSource: () => false });
    expect(narrow.total).toBe(full.total);
    expect(narrow.completed).toBe(full.completed);
  });
});

describe("the craving quest before marriage", () => {
  it("waits on Not now in the projection & adds nothing to the filter note", () => {
    const ctx = context();
    const facts = cravingFacts({ completed: false }, ctx);
    expect(rowShelf(facts)).toBe("notNow");
    expect(filteredCounts([facts])).toEqual({ completed: 0, notNow: 0, todo: 0 });
  });
});
