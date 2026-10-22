import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { searchAllCategories } from "#lib/engine/search.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import {
  CATEGORIES,
  CATEGORY_DEFINITIONS,
  CATEGORY_KEYS,
  getAllProgress,
  getCategoryProgress,
} from "./categories.js";

import type { ProgressState } from "#lib/types/user-progress.js";

import type { CategoryDefinition } from "./categories.js";
import type { ProgressContext } from "./progress.js";
import type { SearchContext } from "./search.js";

const worldState = { season: "spring", weather: "calm" } as const;

function progressContext(): ProgressContext {
  return {
    availabilityWindows: DEFAULT_AVAILABILITY_WINDOWS,
    progress: makeCompletedState(),
    worldState,
  };
}

function searchContext(progress: ProgressState, showSpoilers: boolean): SearchContext {
  return {
    locale: "en",
    progressionState: deriveProgressionState(progress, trackerData, showSpoilers),
    projectionContext: { ...progressContext(), progress },
  };
}

describe("category registry", () => {
  it("lists every category once, in key order", () => {
    expect(CATEGORY_KEYS).toEqual(recordKeys(CATEGORIES).toSorted());
    expect(CATEGORY_DEFINITIONS).toHaveLength(CATEGORY_KEYS.length);
  });

  it("gives every category a projection whose totals are its progress", () => {
    const ctx = progressContext();
    const all = getAllProgress(ctx);
    expect(recordKeys(all)).toEqual(CATEGORY_KEYS);
    for (const key of CATEGORY_KEYS) {
      const definition: CategoryDefinition = CATEGORIES[key];
      const { totals } = definition.project(ctx);
      expect(totals.total, key).toBeGreaterThan(0);
      expect(getCategoryProgress(key, ctx), key).toEqual(totals);
      expect(all[key], key).toEqual(totals);
    }
  });

  it("gives every route to one category", () => {
    const routes = recordEntries(CATEGORIES).map(([, { route }]) => route);
    expect(new Set(routes).size).toBe(CATEGORY_KEYS.length);
  });
});

describe("search capability", () => {
  it("offers candidates in each searchable category's own key", () => {
    const progress = makeCompletedState();
    const context = searchContext(progress, true);
    for (const [key, definition] of recordEntries<Record<string, CategoryDefinition>>(CATEGORIES)) {
      if (!definition.search) continue;
      const candidates = [...definition.search(context)];
      expect(candidates.length, key).toBeGreaterThan(0);
      for (const candidate of candidates) expect(candidate.result().category, key).toBe(key);
    }
  });

  it("returns results only for categories that declare search", () => {
    const progressionState = deriveProgressionState(makeCompletedState(), trackerData, true);
    const results = searchAllCategories(
      "a",
      makeCompletedState(),
      worldState,
      progressionState,
      "en",
    );
    expect(results.length).toBeGreaterThan(0);
    for (const { category } of results) expect(CATEGORIES[category]).toHaveProperty("search");
  });

  it("drops rows its projection flags as spoilered", () => {
    const context = searchContext(makeCompletedState(), false);
    const { rows } = CATEGORIES.recipes.project(context.projectionContext, {
      progressionState: context.progressionState,
    });
    const spoilered = rows.filter((row) => row.spoilered);
    expect(spoilered.length).toBeGreaterThan(0);
    const offered = new Set(
      [...CATEGORIES.recipes.search(context)].map((candidate) => candidate.result().id),
    );
    expect(offered.size).toBe(rows.length - spoilered.length);
    for (const row of spoilered) expect(offered.has(row.id)).toBe(false);
  });
});
