import { describe, expect, it } from "vitest";

import FilterPanel from "#lib/components/filter-panel.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

// Interaction coverage (toggling chips, seasons, weather, source groups, the explainer dialog, and
// the completed switch) lives in filter-panel.client.test.ts.

describe("FilterPanel", () => {
  it("omits seasonality and source controls when they are inapplicable", () => {
    const { queries } = renderToFragment(FilterPanel, { props: { showWorldStateFilters: false } });

    expect(queries.queryByText("When to find")).toBeNull();
    expect(queries.queryByText("Source types")).toBeNull();
    expect(queries.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(queries.getByRole("switch", { name: "Completed" })).toBeTruthy();
  });
});
