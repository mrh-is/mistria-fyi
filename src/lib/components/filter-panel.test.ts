import { describe, expect, it } from "vitest";

import FilterPanel from "#lib/components/filter-panel.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

// Interaction coverage (source groups, the explainer dialog, & the unobtainable switch) lives in
// filter-panel.client.test.ts.

describe("FilterPanel", () => {
  it("omits source & show controls when they are inapplicable", () => {
    const { queries } = renderToFragment(FilterPanel, { props: {} });

    expect(queries.queryByText("Source types")).toBeNull();
    expect(queries.queryByRole("switch")).toBeNull();
  });
});
