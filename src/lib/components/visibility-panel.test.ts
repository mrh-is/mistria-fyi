import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import VisibilityPanel from "#lib/components/visibility-panel.svelte";

// Interaction coverage (toggling chips, seasons, weather, source groups, the explainer dialog, and
// the completed switch) lives in visibility-panel.client.test.ts.

describe("VisibilityPanel", () => {
  it("omits seasonality and source controls when they are inapplicable", () => {
    const { body } = render(VisibilityPanel, { props: { showSeasonality: false } });

    expect(body).not.toContain("When to find");
    expect(body).not.toContain("Source types");
    expect(body).not.toContain("Reset");
    expect(body).toContain("Show completed?");
  });
});
