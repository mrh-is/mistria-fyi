import { describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { recipePlacements } from "#lib/engine/projections/recipes.js";
import { searchRecipes } from "#lib/engine/search-providers.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import type * as DataModule from "#lib/data/index.js";
import type * as NamesModule from "#lib/data/names.js";
import type { TrackerData } from "#lib/types/tracker-data.js";

// A semantic fixture: two products share a recipe, a colorway has a different recipe, one
// recipe spans categories, & a valid product is absent from the almanac. Expectations below
// are literal outcomes, independent of recipeForItem & recipePlacements.
vi.mock("#lib/data/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof DataModule>();
  const fixture = {
    almanac: {
      fish: { items: [{ itemIds: ["first", "colorway"] }, { itemIds: ["second"] }] },
      forageables: { items: [{ itemIds: ["uncraftable"] }] },
      materials: { items: [{ itemIds: ["second"] }, { itemIds: ["other"] }] },
    },
    items: {
      absent: { sources: [{ type: "recipe", recipeId: "unlisted" }] },
      colorway: { sources: [{ type: "recipe", recipeId: "unlisted" }] },
      first: { sources: [{ type: "forage" }, { type: "recipe", recipeId: "shared" }] },
      other: { sources: [{ type: "recipe", recipeId: "other" }] },
      second: { sources: [{ type: "recipe", recipeId: "shared" }] },
      uncraftable: { sources: [] },
    },
    recipes: { other: {}, shared: {}, unlisted: {} },
  };
  return {
    ...original,
    trackerData: { ...original.trackerData, ...fixture } as unknown as TrackerData,
  };
});

vi.mock("#lib/data/names.js", async (importOriginal) => ({
  ...(await importOriginal<typeof NamesModule>()),
  getName: (_chunk: string, id: string) => id,
}));

describe("recipe placement semantic fixture", () => {
  it("selects canonical products, deduplicates within categories, & omits empty categories", () => {
    expect(recipePlacements()).toEqual([
      { categoryId: "fish", recipes: [{ itemId: "first", recipeId: "shared" }] },
      {
        categoryId: "materials",
        recipes: [
          { itemId: "second", recipeId: "shared" },
          { itemId: "other", recipeId: "other" },
        ],
      },
    ]);
  });

  it("search pictures the first placement across categories & leaves unlisted recipes unpictured", () => {
    const progress = makeCompletedState();
    const progressionState = deriveProgressionState(progress, trackerData, true);
    const candidates = [
      ...searchRecipes({
        locale: "en",
        progressionState,
        projectionContext: {
          availabilityWindows: DEFAULT_AVAILABILITY_WINDOWS,
          progress,
          progressionState,
          worldState: { season: "spring", weather: "calm" },
        },
      }),
    ];
    expect(
      candidates.map((candidate) => {
        const { id, sprite } = candidate.result();
        return { id, sprite };
      }),
    ).toEqual([
      { id: "other", sprite: "other" },
      { id: "shared", sprite: "first" },
      { id: "unlisted", sprite: undefined },
    ]);
  });
});
