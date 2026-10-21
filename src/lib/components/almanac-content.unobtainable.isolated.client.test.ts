import { fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, expect, it, vi } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import FilterPanel from "#lib/components/filter-panel.svelte";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type * as DataModule from "#lib/data/index.js";
import type { ItemId, VillagerId } from "#lib/types/tracker-data.js";

// The current game data gives marriage items alternate sources. Use an exclusive source
// fixture so applicability is exercised even when no shipped entry is currently unobtainable.
vi.mock("#lib/data/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof DataModule>();
  const { buildTrackerIndex } = await import("#lib/data/tracker-index.js");
  const fixtureData = structuredClone(original.trackerData);
  fixtureData.items["turnip" as ItemId].sources = [
    { type: "proposal", villagerId: "adeline" as VillagerId },
  ];
  return { trackerData: fixtureData, trackerIndex: buildTrackerIndex(fixtureData) };
});

afterEach(() => {
  toolbarState.showUnobtainable = false;
  toolbarState.closeSearch();
  userState.resetAll();
});

it("reveals an unobtainable row with the filter and hides it again", async () => {
  userState.resetAll();
  userState.setVillagerRelationship("adeline" as VillagerId, "platonic");
  toolbarState.setSearchQuery("Turnip");
  const view = renderWithFeedback(AlmanacContent, { locale: "en" });
  await tick();
  const filters = renderWithFeedback(FilterPanel, { showWorldStateFilters: true });
  const toggle = filters.getByRole("switch", { name: "Show unobtainable?" });
  expect(toggle).not.toBeChecked();
  expect(view.queryByText("Turnip", { exact: true })).toBeNull();
  await fireEvent.click(toggle);
  expect(toggle).toBeChecked();
  expect(await view.findByText("Turnip", { exact: true })).toBeInTheDocument();
  await fireEvent.click(toggle);
  await waitFor(() => {
    expect(view.queryByText("Turnip", { exact: true })).toBeNull();
  });
});
