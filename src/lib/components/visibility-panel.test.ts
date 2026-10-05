import { describe, expect, it } from "vitest";

import VisibilityPanel from "#lib/components/visibility-panel.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

// Interaction coverage (toggling chips, seasons, weather, source groups, the explainer dialog, and
// the completed switch) lives in visibility-panel.client.test.ts.

describe("VisibilityPanel", () => {
  it("omits seasonality and source controls when they are inapplicable", () => {
    const { queries } = renderToFragment(VisibilityPanel, { props: { showSeasonality: false } });

    expect(queries.queryByText("When to find")).toBeNull();
    expect(queries.queryByText("Source types")).toBeNull();
    expect(queries.queryByRole("button", { name: "Reset" })).toBeNull();
    expect(queries.getByRole("switch", { name: "Show completed?" })).toBeTruthy();
  });
});
