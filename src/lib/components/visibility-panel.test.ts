import { describe, expect, it } from "vitest";

import { SOURCE_FILTERS, SOURCE_ICON } from "#lib/components/icon/index.js";
import VisibilityPanel from "#lib/components/visibility-panel.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

// Interaction coverage (toggling chips, seasons, weather, source groups, the explainer dialog, and
// the completed switch) lives in visibility-panel.client.test.ts.

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

  it("omits seasonality and source controls when they are inapplicable", () => {
    const { queries } = renderToFragment(VisibilityPanel, { props: { showSeasonality: false } });

    expect(queries.queryByText("When to find")).toBeNull();
    expect(queries.queryByText("Source types")).toBeNull();
    expect(queries.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(queries.getByRole("switch", { name: "Show completed?" })).toBeTruthy();
  });
});
