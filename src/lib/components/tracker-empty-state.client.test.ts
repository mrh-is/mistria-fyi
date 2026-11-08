import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import TrackerEmptyState from "#lib/components/tracker-empty-state.svelte";
import * as m from "#lib/paraglide/messages.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";

afterEach(() => {
  toolbarState.filterPanelAvailable = false;
  toolbarState.reset();
});

describe("TrackerEmptyState", () => {
  it("links the filters to the filter panel when the toolbar offers one", async () => {
    toolbarState.filterPanelAvailable = true;
    render(TrackerEmptyState);

    await fireEvent.click(screen.getByRole("button", { name: m.no_items_match_filters_link() }));

    expect(toolbarState.filterPanelRequest).toBe(1);
  });

  it("names the filters as plain text when the page has no filter panel", () => {
    render(TrackerEmptyState);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.getByText(m.no_items_match_filters({ filters: m.no_items_match_filters_link() })),
    ).toBeInTheDocument();
  });

  it("shows the parent's message instead", () => {
    render(TrackerEmptyState, { message: "No results." });

    expect(screen.getByText("No results.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
