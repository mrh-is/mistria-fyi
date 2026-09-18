import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_FILTERS, SOURCE_ICON } from "$lib/components/icon/index.js";
import VisibilityPanel from "$lib/components/visibility-panel.svelte";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { SourceFilter } from "$lib/stores/toolbar-state.svelte.js";

function sourceFilter(label: string): SourceFilter {
  const filter = SOURCE_FILTERS.find((candidate) => candidate.label === label);
  if (!filter) throw new Error(`Missing source filter: ${label}`);
  return filter;
}

const gatheringFilter = sourceFilter("Gathering");
const storesFilter = sourceFilter("Stores");

afterEach(() => {
  toolbarState.removeSourceFilters("test");
  userState.resetAll();
});

describe("VisibilityPanel", () => {
  it("SOURCE_FILTERS covers every source type exactly once", () => {
    const allSourceTypes = new Set(Object.keys(SOURCE_ICON));
    const filteredTypes = SOURCE_FILTERS.flatMap((filter) => filter.types);

    expect(filteredTypes).toHaveLength(allSourceTypes.size);
    expect(new Set(filteredTypes)).toEqual(allSourceTypes);
  });

  it("preserves the established source groups and order", () => {
    expect(SOURCE_FILTERS.map(({ label }) => label)).toEqual([
      "Chests",
      "Crafting",
      "Dating",
      "Farming",
      "Festivals",
      "Fishing",
      "Gathering",
      "Mines",
      "Museum",
      "Offerings",
      "Perks",
      "Stores",
      "Progress",
    ]);
  });

  it("renders availability, world-state, and source controls in one view", () => {
    toolbarState.setSourceFilters("test", [gatheringFilter, storesFilter]);

    const { body } = render(VisibilityPanel, { props: { locale: "en", showSeasonality: true } });

    expect(body).toContain("When to find");
    expect(body).toContain('aria-label="Season"');
    expect(body).toContain('aria-label="Weather"');
    expect(body).toContain("Source types");
    expect(body).toContain("Gathering");
    expect(body).toContain("Stores");
    expect(body).toContain('aria-label="About source types"');
    expect(body).toContain("Show completed?");
  });

  it("omits seasonality and source controls when they are inapplicable", () => {
    const { body } = render(VisibilityPanel, { props: { locale: "en", showSeasonality: false } });

    expect(body).not.toContain("When to find");
    expect(body).not.toContain("Source types");
    expect(body).not.toContain("Reset");
    expect(body).toContain("Show completed?");
  });

  it("retains current world state when source groups are hidden", () => {
    toolbarState.setSourceFilters("test", [gatheringFilter]);
    toolbarState.hideAllSourceFilters();
    userState.setSeason("summer");

    const { body } = render(VisibilityPanel, { props: { locale: "en", showSeasonality: true } });

    expect(body).toContain("Summer");
    expect(body).toContain("Sun");
    expect(userState.state.worldState).toEqual({ season: "summer", weather: "calm" });
  });
});
