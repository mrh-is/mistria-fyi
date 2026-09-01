import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
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
const storeFilter = sourceFilter("Store");

afterEach(() => {
  toolbarState.removeSourceFilters("test");
  userState.resetAll();
});

describe("VisibilityPanel", () => {
  it("renders expanded seasonality and source sections with accessible controls", () => {
    toolbarState.setSourceFilters("test", [gatheringFilter, storeFilter]);

    const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

    expect(body).toContain("Seasonality");
    expect(body).toContain('aria-expanded="true"');
    expect(body).toContain("Source types");
    expect(body).toContain('aria-pressed="true"');
    expect(body).toContain("Show completed items");
    // Both section triggers, both bulk actions, and source chips use the minimum target size.
    expect(body.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(4);
    expect(body).toContain("min-h-11 items-center gap-1");
  });

  it("omits seasonality, source types, and reset controls when they are inapplicable", () => {
    const { body } = render(VisibilityPanel, { props: { showSeasonality: false } });

    expect(body).not.toContain("Seasonality");
    expect(body).not.toContain("Source types");
    expect(body).not.toContain("Reset filters");
  });

  it("shows reset for hidden source groups while retaining current world state", () => {
    toolbarState.setSourceFilters("test", [gatheringFilter]);
    toolbarState.hideAllSourceFilters();
    userState.setSeason("summer");

    const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

    expect(body).toContain("Reset filters");
    expect(body).toContain("Summer / Sun");
    expect(userState.state.worldState).toEqual({ season: "summer", weather: "calm" });
  });
});
