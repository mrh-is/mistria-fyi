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
const storeFilter = sourceFilter("Store");

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
    expect(SOURCE_FILTERS.map(({ label, types }) => [label, types])).toEqual([
      ["Chest", ["beach_cave_chest", "treasure_chest", "lost_and_found"]],
      ["Craft", ["recipe"]],
      ["Dating", ["engagement", "date", "date_inspiration", "proposal", "spouseGift", "wedding"]],
      ["Farming", ["crop", "tree", "animal_product", "breed", "station", "ship_item"]],
      ["Festival", ["festival", "festival_activity"]],
      ["Fishing", ["fish", "fish_trap", "dive", "bait_fish"]],
      ["Gathering", ["forage", "bug_catch", "artifact_dig", "equipment"]],
      ["Mines", ["mines_chest", "mines_dig_site", "mine", "mine_fish", "monster", "monster_feed"]],
      ["Museum", ["museum_donation", "artifact_replicator", "donate_item"]],
      ["Offering", ["chicken_statue", "wishing_well"]],
      ["Perk", ["perk", "perk_drop", "ritual_chamber"]],
      ["Store", ["store", "scroll_bundle", "upgrade"]],
      ["Story progress", ["default", "quest", "renown", "reach_day"]],
    ]);
  });

  it("renders collapsed seasonality and source sections by default", () => {
    toolbarState.setSourceFilters("test", [gatheringFilter, storeFilter]);

    const { body } = render(VisibilityPanel, { props: { showSeasonality: true } });

    expect(body).toContain("Seasonality");
    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Source types");
    expect(body).not.toContain("Only show");
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
    expect(body).toContain("Summer");
    expect(body).toContain("Sun");
    expect(userState.state.worldState).toEqual({ season: "summer", weather: "calm" });
  });
});
