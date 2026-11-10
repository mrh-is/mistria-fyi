import { describe, expect, it } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isSourceDoable } from "#lib/engine/availability.js";
import { getAllProgress, getCategoryProgress } from "#lib/engine/categories.js";
import { createProgressContext } from "#lib/engine/progress.js";
import { projectMuseum } from "#lib/engine/projections/museum.js";
import { cravingFacts, projectQuests } from "#lib/engine/projections/quests.js";
import { filteredCounts, progressShelf, rowShelf } from "#lib/engine/shelves.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordValues } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { ItemId, MuseumWingId, Season } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

function context(season: Season = "spring", overrides?: Partial<ProgressState>): ProgressContext {
  const progress = makeCompletedState(overrides);
  return createProgressContext(progress, deriveProgressionState(progress, trackerData, false), {
    season,
    weather: "calm",
  });
}

describe("shelves across the real tracker data", () => {
  it.each(["mine", "mine_fish", "monster"] as const)(
    "waits for mine access for %s sources",
    (type) => {
      const early = context();
      const late = context("fall", { mineFloor: 100 });
      const sources = recordValues(trackerData.items)
        .flatMap((item) => item.sources)
        .filter((source) => source.type === type);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.every((source) => !isSourceDoable(source, early))).toBe(true);
      expect(sources.every((source) => isSourceDoable(source, late))).toBe(true);
    },
  );

  it("uses the shallowest spawn for a monster found in multiple biomes", () => {
    const mimic = recordValues(trackerData.items)
      .flatMap((item) => item.sources)
      .find((source) => source.type === "monster" && source.monsterId === "mimic");
    if (!mimic) throw new Error("Expected a Mimic drop");
    const firstFloor = context("spring", { mineFloor: 1 });
    expect(isSourceDoable(mimic, context())).toBe(false);
    expect(isSourceDoable(mimic, firstFloor)).toBe(true);
  });

  it("uses the Ancient Ruins floor range for the Cat Void drop", () => {
    const source = trackerData.items["void_powder" as ItemId].sources.find(
      (candidate) => candidate.type === "monster" && candidate.monsterId === "cat_void",
    );
    if (!source) throw new Error("Expected a Cat Void drop");
    expect(source).toEqual({ type: "monster", monsterId: "cat_void" });
    expect(isSourceDoable(source, context("fall", { mineFloor: 79 }))).toBe(false);
    expect(isSourceDoable(source, context("fall", { mineFloor: 80 }))).toBe(true);
  });

  it("requires both an Archaeology set and the original artifact for a replica", () => {
    const early = context();
    const replica = recordValues(trackerData.items)
      .flatMap(({ sources }) => sources)
      .find((source) => source.type === "artifact_replicator");
    if (!replica) throw new Error("Expected an artifact replica source");
    const canonical = trackerIndex.memberToCanonicalAlmanacId.get(replica.originalItemId);
    if (!canonical) throw new Error("Expected a tracked original artifact");
    expect(isSourceDoable(replica, early)).toBe(false);
    const almanac = new Set([canonical]);
    const originalOnly = context("spring", { almanac });
    expect(isSourceDoable(replica, originalOnly)).toBe(false);
    const set = recordValues(trackerData.museum["archaeology" as MuseumWingId].sets)[0];
    const museum = new Set(set.items);
    const unlocked = context("fall", { museum });
    expect(isSourceDoable(replica, unlocked)).toBe(false);
    const acquired = context("fall", { almanac, museum });
    expect(isSourceDoable(replica, acquired)).toBe(true);
  });

  it.each(["festival", "festival_activity"] as const)(
    "checks the exact date for %s sources",
    (type) => {
      const sources = recordValues(trackerData.items)
        .flatMap((item) => item.sources)
        .filter((source) => source.type === "festival" || source.type === "festival_activity")
        .filter((source) => source.type === type);
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        const { day, season } = trackerData.festivals[source.festivalId].date;
        const ctx = context(season);
        expect(isSourceDoable(source, { ...ctx, worldState: { ...ctx.worldState, day: 1 } })).toBe(
          false,
        );
        expect(isSourceDoable(source, { ...ctx, worldState: { ...ctx.worldState, day } })).toBe(
          true,
        );
      }
    },
  );

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
