import { describe, expect, it, vi } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { getCategoryProgress } from "#lib/engine/categories.js";
import { searchAlmanac } from "#lib/engine/search-providers.js";
import { searchAllCategories } from "#lib/engine/search.js";
import { addProgress } from "#lib/engine/shelves.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import { projectAlmanac } from "./almanac.js";

import type * as DataModule from "#lib/data/index.js";
import type { AlmanacEntry, ItemId, VillagerId } from "#lib/types/tracker-data.js";

// The current game data gives marriage items alternate sources. Use an exclusive source
// fixture so applicability is exercised even when no shipped entry is currently unobtainable.
vi.mock("#lib/data/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof DataModule>();
  const { buildTrackerIndex } = await import("#lib/data/tracker-index.js");
  const fixtureData = structuredClone(original.trackerData);
  fixtureData.items["turnip" as ItemId].sources = [
    { type: "proposal", villagerId: "adeline" as VillagerId },
  ];
  return { trackerData: fixtureData, trackerIndex: buildTrackerIndex(fixtureData) };
});

const worldState = { season: "spring", weather: "calm" } as const;

function context() {
  const progress = makeCompletedState({
    villagerRelationships: Object.fromEntries(
      recordEntries(trackerData.villagers)
        .filter(([, villager]) => villager.dateable)
        .map(([id]) => [id, "platonic"]),
    ),
  });
  return {
    progress,
    progressionState: deriveProgressionState(progress, trackerData, false),
    worldState,
  };
}

describe("projectAlmanac", () => {
  it("hides unobtainable rows by default and reveals them without changing progress totals", () => {
    const ctx = context();
    const hidden = projectAlmanac(ctx);
    const shown = projectAlmanac(ctx, { showUnobtainable: true });
    const unobtainable = shown.sections
      .flatMap(({ rows }) => rows)
      .filter((row) => !row.obtainable);
    expect(unobtainable.length).toBeGreaterThan(0);
    expect(unobtainable.every((row) => row.visible)).toBe(true);
    expect(
      hidden.sections.flatMap(({ visibleRows }) => visibleRows).every((row) => row.obtainable),
    ).toBe(true);
    expect(shown.totals).toEqual(hidden.totals);
    // Revealed rows render but never count, so section totals match too.
    expect(shown.sections.map(({ progress }) => progress.total)).toEqual(
      hidden.sections.map(({ progress }) => progress.total),
    );
    expect(
      shown.sections.some(({ progress, visibleRows }) => visibleRows.length > progress.total),
    ).toBe(true);
    const id = unobtainable[0].canonicalId;
    ctx.progress.almanac.add(id);
    const completed = projectAlmanac(ctx)
      .sections.flatMap(({ rows }) => rows)
      .find((row) => row.canonicalId === id);
    expect(completed).toMatchObject({ completed: true, obtainable: true, visible: true });
  });

  it("keeps page filters and completed-row retention explicit", () => {
    const ctx = context();
    const id = "turnip" as ItemId;
    ctx.progress.almanac.add(id);
    const options = { matchesEntry: (entry: AlmanacEntry) => entry.itemIds.includes(id) };
    const shown = projectAlmanac(ctx, options);
    expect(
      shown.sections.flatMap(({ visibleRows }) => visibleRows).map((row) => row.canonicalId),
    ).toEqual([id]);
    const noSources = projectAlmanac(ctx, { ...options, showsSource: () => false });
    expect(noSources.sections.flatMap(({ visibleRows }) => visibleRows)).toHaveLength(0);
    expect(noSources.totals.completed).toBe(shown.totals.completed);
  });

  it("search hides unobtainable entries and ignores page availability and completion filters", () => {
    const ctx = context();
    const progressionState = deriveProgressionState(ctx.progress, trackerData, true);
    const search = () =>
      searchAllCategories("Turnip", ctx.progress, worldState, progressionState, "en").filter(
        (result) => result.category === "almanac" && result.id === "turnip",
      );
    expect(search()).toHaveLength(0);
    ctx.progress.almanac.add("turnip" as ItemId);
    expect(search()).toMatchObject([{ available: true, completed: true, id: "turnip" }]);
  });

  it("search offers rows that aren't doable today, marked as such", () => {
    const ctx = { ...context(), worldState: { season: "winter", weather: "calm" } as const };
    const progressionState = deriveProgressionState(ctx.progress, trackerData, true);
    const offered = [
      ...searchAlmanac({ locale: "en", progressionState, projectionContext: ctx }),
    ].map((candidate) => candidate.result());
    expect(offered.some((result) => !result.available)).toBe(true);
  });

  it("marks spoilers and excludes them only when the caller requests it", () => {
    const ctx = context();
    const progressionState = deriveProgressionState(ctx.progress, trackerData, false);
    const page = projectAlmanac(ctx, { progressionState });
    expect(
      page.sections.flatMap(({ visibleRows }) => visibleRows).some((row) => row.spoilered),
    ).toBe(true);
    const search = projectAlmanac(ctx, { hideSpoilered: true, progressionState });
    expect(
      search.sections.flatMap(({ visibleRows }) => visibleRows).every((row) => !row.spoilered),
    ).toBe(true);
    expect(search.totals).toEqual(page.totals);
  });

  it("property: canonical section progress sums to the header for generated contexts", () => {
    // A fixed seed makes failures reproducible, while varying completion, relationships, windows,
    // world state and display filters independently. No fixture total is assumed.
    let seed = 117;
    function random(): number {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      return seed / 2 ** 32;
    }
    for (let sample = 0; sample < 48; sample++) {
      const ctx = context();
      for (const id of trackerIndex.almanacCanonicalIds) {
        if (random() < 0.3) ctx.progress.almanac.add(id);
      }
      for (const id of recordKeys(ctx.progress.villagerRelationships)) {
        ctx.progress.villagerRelationships[id] = random() < 0.5 ? "platonic" : "undecided";
      }
      const projectionContext = {
        ...ctx,
        worldState: {
          season: (["spring", "summer", "fall", "winter"] as const)[sample % 4],
          weather: (["calm", "inclement", "heavy_inclement", "special"] as const)[sample % 4],
        },
      };
      const showsSource = (): boolean => sample % 2 === 0;
      const projection = projectAlmanac(projectionContext, {
        showsSource,
        showUnobtainable: random() < 0.5,
      });
      const sum = addProgress(projection.sections.map(({ progress }) => progress));
      expect(sum).toEqual(projection.totals);
      expect(sum).toEqual(getCategoryProgress("almanac", projectionContext, { showsSource }));
      const applicableRows = projection.sections
        .flatMap(({ rows }) => rows)
        .filter((row) => row.obtainable);
      expect(sum.total).toBe(applicableRows.length);
    }
  });
});
