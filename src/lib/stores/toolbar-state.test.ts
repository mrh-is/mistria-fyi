import { describe, expect, it } from "vitest";

import { ToolbarState } from "#lib/stores/toolbar-state.svelte.js";

import type { SourceFilter } from "#lib/data/source-filters.js";
import type { Source } from "#lib/types/acquisition.js";
import type { StoreId } from "#lib/types/tracker-data.js";

const gatheringFilter: SourceFilter = {
  id: "gathering",
  members: ["foraging"],
  types: ["forage"],
};

const storeFilter: SourceFilter = {
  id: "stores",
  members: ["shops"],
  types: ["store"],
};

describe("ToolbarState source filters", () => {
  it("unions contextual filters from every mounted owner", () => {
    const state = new ToolbarState();
    state.registerSourceFilters("museum", [storeFilter]);
    state.registerSourceFilters("recipes", [gatheringFilter]);

    expect(state.sourceFilters.map(({ id }) => id)).toEqual(["gathering", "stores"]);
  });

  it("preserves the filter array when the registered IDs do not change", () => {
    const state = new ToolbarState();
    state.registerSourceFilters("page", [gatheringFilter, storeFilter]);
    const filters = state.sourceFilters;

    state.registerSourceFilters("page", [gatheringFilter, storeFilter]);

    expect(state.sourceFilters).toBe(filters);
  });

  it("removes only the departing owner's contextual filters", () => {
    const state = new ToolbarState();
    state.registerSourceFilters("museum", [gatheringFilter]);
    state.registerSourceFilters("recipes", [storeFilter]);

    state.unregisterSourceFilters("museum");

    expect(state.sourceFilters.map(({ id }) => id)).toEqual(["stores"]);
  });

  it("matches any active covered source and always admits uncovered or absent sources", () => {
    const state = new ToolbarState();
    const storeId = "general_store" as StoreId;
    const mixedSources: Source[] = [{ type: "forage" }, { type: "store", storeId }];

    state.registerSourceFilters("page", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();
    state.toggleSourceFilter(storeFilter);

    expect(state.matchesSourceFilters(mixedSources)).toBe(true);
    expect(state.matchesSourceFilters([{ type: "forage" }])).toBe(false);
    expect(state.matchesSourceFilters([{ type: "lost_and_found" }])).toBe(true);
    expect(state.matchesSourceFilters([])).toBe(true);
  });

  it("resets active IDs without removing the page context", () => {
    const state = new ToolbarState();
    state.registerSourceFilters("page", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();

    state.resetSourceFilters();

    expect([...state.enabledSourceFilterIds]).toEqual(["gathering", "stores"]);
    expect(state.sourceFilters.map(({ id }) => id)).toEqual(["gathering", "stores"]);
  });

  it("reports isSourceFilterNarrowing when some groups are hidden", () => {
    const state = new ToolbarState();
    expect(state.isSourceFilterNarrowing).toBe(false);

    state.registerSourceFilters("page", [gatheringFilter, storeFilter]);
    expect(state.isSourceFilterNarrowing).toBe(false);

    state.toggleSourceFilter(gatheringFilter);
    expect(state.isSourceFilterNarrowing).toBe(true);

    state.hideAllSourceFilters();
    expect(state.isSourceFilterNarrowing).toBe(true);

    state.resetSourceFilters();
    expect(state.isSourceFilterNarrowing).toBe(false);
  });

  it("resets active IDs to the new union when owners change", () => {
    const state = new ToolbarState();
    state.registerSourceFilters("museum", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();
    expect(state.isSourceFilterNarrowing).toBe(true);

    state.unregisterSourceFilters("museum");
    state.registerSourceFilters("mines", [gatheringFilter]);
    expect(state.isSourceFilterNarrowing).toBe(false);
    expect([...state.enabledSourceFilterIds]).toEqual(["gathering"]);
  });
});
