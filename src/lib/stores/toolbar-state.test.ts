import { IconCircle } from "@tabler/icons-svelte-runes";
import { describe, expect, it } from "vitest";

import { type SourceFilter, ToolbarState } from "$lib/stores/toolbar-state.svelte.js";

import type { Source } from "$lib/types/acquisition.js";
import type { StoreId } from "$lib/types/tracker-data.js";

const gatheringFilter: SourceFilter = {
  icon: IconCircle,
  label: "Gathering",
  members: ["Foraging"],
  types: ["forage"],
};

const storeFilter: SourceFilter = {
  icon: IconCircle,
  label: "Store",
  members: ["Shops"],
  types: ["store"],
};

describe("ToolbarState source filters", () => {
  it("unions contextual filters from every mounted owner", () => {
    const state = new ToolbarState();
    state.setSourceFilters("museum", [storeFilter]);
    state.setSourceFilters("recipes", [gatheringFilter]);

    expect(state.sourceFilters.map(({ label }) => label)).toEqual(["Gathering", "Store"]);
  });

  it("preserves the filter array when the registered labels do not change", () => {
    const state = new ToolbarState();
    state.setSourceFilters("page", [gatheringFilter, storeFilter]);
    const filters = state.sourceFilters;

    state.setSourceFilters("page", [gatheringFilter, storeFilter]);

    expect(state.sourceFilters).toBe(filters);
  });

  it("removes only the departing owner's contextual filters", () => {
    const state = new ToolbarState();
    state.setSourceFilters("museum", [gatheringFilter]);
    state.setSourceFilters("recipes", [storeFilter]);

    state.removeSourceFilters("museum");

    expect(state.sourceFilters.map(({ label }) => label)).toEqual(["Store"]);
  });

  it("matches any active covered source and always admits uncovered or absent sources", () => {
    const state = new ToolbarState();
    const storeId = "general_store" as StoreId;
    const mixedSources: Source[] = [{ type: "forage" }, { type: "store", storeId }];

    state.setSourceFilters("page", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();
    state.toggleSourceFilter(storeFilter);

    expect(state.matchesSourceFilters(mixedSources)).toBe(true);
    expect(state.matchesSourceFilters([{ type: "forage" }])).toBe(false);
    expect(state.matchesSourceFilters([{ type: "lost_and_found" }])).toBe(true);
    expect(state.matchesSourceFilters([])).toBe(true);
  });

  it("resets active labels without removing the page context", () => {
    const state = new ToolbarState();
    state.setSourceFilters("page", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();

    state.resetSourceFilters();

    expect([...state.activeSourceLabels]).toEqual(["Gathering", "Store"]);
    expect(state.sourceFilters.map(({ label }) => label)).toEqual(["Gathering", "Store"]);
  });

  it("reports sourceFilterActive when some groups are hidden", () => {
    const state = new ToolbarState();
    expect(state.sourceFilterActive).toBe(false);

    state.setSourceFilters("page", [gatheringFilter, storeFilter]);
    expect(state.sourceFilterActive).toBe(false);

    state.toggleSourceFilter(gatheringFilter);
    expect(state.sourceFilterActive).toBe(true);

    state.hideAllSourceFilters();
    expect(state.sourceFilterActive).toBe(true);

    state.resetSourceFilters();
    expect(state.sourceFilterActive).toBe(false);
  });

  it("resets active labels to the new union when owners change", () => {
    const state = new ToolbarState();
    state.setSourceFilters("museum", [gatheringFilter, storeFilter]);
    state.hideAllSourceFilters();
    expect(state.sourceFilterActive).toBe(true);

    state.removeSourceFilters("museum");
    state.setSourceFilters("mines", [gatheringFilter]);
    expect(state.sourceFilterActive).toBe(false);
    expect([...state.activeSourceLabels]).toEqual(["Gathering"]);
  });
});
