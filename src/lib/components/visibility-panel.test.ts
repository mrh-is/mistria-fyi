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

const foragingFilter = sourceFilter("Foraging");
const shopsFilter = sourceFilter("Shops");

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

  it("groups source types by player activity", () => {
    expect(SOURCE_FILTERS.map(({ label }) => label)).toEqual([
      "Foraging",
      "Fishing",
      "Shops",
      "NPCs",
      "Events",
      "Crafting",
    ]);
  });

  it("renders availability, world-state, and source controls in one view", () => {
    toolbarState.setSourceFilters("test", [foragingFilter, shopsFilter]);

    const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

    expect(body).toContain("When to find");
    expect(body).toContain('aria-label="Season"');
    expect(body).toContain('aria-label="Weather"');
    expect(body).toContain("Sources");
    expect(body).toContain("Foraging");
    expect(body).toContain("Shops");
    expect(body).toContain('aria-label="About source groups"');
    expect(body).toContain("Show completed items");
  });

  it("omits seasonality and source controls when they are inapplicable", () => {
    const { body } = render(VisibilityPanel, { props: { showSeasonality: false } });

    expect(body).not.toContain("When to find");
    expect(body).not.toContain("Sources");
    expect(body).not.toContain("Clear all filters");
    expect(body).toContain("Show completed items");
  });

  it("shows reset for hidden source groups while retaining current world state", () => {
    toolbarState.setSourceFilters("test", [foragingFilter]);
    toolbarState.hideAllSourceFilters();
    userState.setSeason("summer");

    const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

    expect(body).toContain("Clear all filters");
    expect(body).toContain("Summer");
    expect(body).toContain("Sun");
    expect(userState.state.worldState).toEqual({ season: "summer", weather: "calm" });
  });
});
