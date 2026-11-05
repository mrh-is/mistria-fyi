import { fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import MuseumContent from "#lib/components/museum-content.svelte";
import PageSearchStatus from "#lib/components/page-search-status.svelte";
import { visibleWindows } from "#lib/controllers/page-search.svelte.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

const KEY = Symbol("test");

function report(matches: number, visible: number): void {
  toolbarState.registerPageSearch(KEY, () => ({ matches, visible }));
}

async function search(query: string) {
  toolbarState.openSearch();
  toolbarState.setSearchQuery(query);
  const view = renderWithFeedback(PageSearchStatus, { locale: "en" });
  await tick();
  return view;
}

describe("PageSearchStatus", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  // Client test files share this store, so a search left open would filter their pages.
  afterEach(() => {
    toolbarState.closeSearch();
    toolbarState.unregisterPageSearch(KEY);
  });

  it("stays quiet without a search", () => {
    const view = renderWithFeedback(PageSearchStatus, { locale: "en" });

    expect(view.getByRole("status")).toHaveTextContent("");
    expect(view.container.querySelector("[data-page-search-status]")).toBeNull();
  });

  it("says when nothing matches at all, & offers to search everything", async () => {
    report(0, 0);
    const view = await search("zzz");

    expect(view.getAllByText("No items found")).not.toHaveLength(0);
    expect(view.getByRole("status")).toHaveTextContent("No items found");
    expect(view.getByRole("link", { name: "Search everything for “zzz”" })).toBeInTheDocument();
  });

  it("counts matches the filters hide when none are visible", async () => {
    report(3, 0);
    const view = await search("bass");

    expect(view.getByRole("status")).toHaveTextContent("3 match outside your filters");
    expect(view.getByRole("button", { name: "Show anyway" })).toBeInTheDocument();
  });

  it("counts hidden matches beside visible ones", async () => {
    report(3, 1);
    const view = await search("bass");

    expect(view.getByRole("status")).toHaveTextContent(
      "1 result. 2 more match outside your filters",
    );
  });

  it("announces a changed query", async () => {
    report(2, 2);
    const view = await search("bass");
    expect(view.getByRole("status")).toHaveTextContent("2 results");

    report(1, 1);
    toolbarState.setSearchQuery("sea bass");
    await tick();

    expect(view.getByRole("status")).toHaveTextContent("1 result");
  });

  it("pauses filters for the search without changing them, & can undo that", async () => {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    report(3, 0);
    const view = await search("bass");

    await fireEvent.click(view.getByRole("button", { name: "Show anyway" }));

    expect(toolbarState.searchShowsAll).toBe(true);
    expect(userState.state.availabilityWindows).toEqual(DEFAULT_AVAILABILITY_WINDOWS);
    expect(view.getByText(/Your filters are paused/u)).toBeInTheDocument();

    await fireEvent.click(view.getByRole("button", { name: "Turn them back on" }));

    expect(toolbarState.searchShowsAll).toBe(false);
  });

  it("opens every availability window while filters are paused", () => {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    expect(visibleWindows()).toEqual(DEFAULT_AVAILABILITY_WINDOWS);

    toolbarState.setSearchQuery("bass");
    toolbarState.searchShowsAll = true;

    expect(visibleWindows()).toEqual(AVAILABILITY_WINDOWS);
    expect(userState.state.availabilityWindows).toEqual(DEFAULT_AVAILABILITY_WINDOWS);
  });

  it("ends the pause with the search", () => {
    toolbarState.setSearchQuery("bass");
    toolbarState.searchShowsAll = true;

    toolbarState.setSearchQuery("");

    expect(toolbarState.searchShowsAll).toBe(false);
  });

  it("ends the pause when only spaces are left", () => {
    toolbarState.setSearchQuery("bass");
    toolbarState.searchShowsAll = true;

    toolbarState.setSearchQuery("   ");

    expect(toolbarState.searchQuery).toBe("");
    expect(toolbarState.searchShowsAll).toBe(false);
  });

  it("carries the search through one navigation only", () => {
    toolbarState.openSearch();
    toolbarState.setSearchQuery("bass");

    toolbarState.carrySearchToNextPage();
    toolbarState.finishSearchAfterNavigation();
    expect(toolbarState.searchQuery).toBe("bass");

    toolbarState.finishSearchAfterNavigation();
    expect(toolbarState.searchQuery).toBe("");
  });

  it("finds a winter fish from the Museum in spring through its hidden count", async () => {
    userState.setAvailabilityWindows(DEFAULT_AVAILABILITY_WINDOWS);
    toolbarState.openSearch();
    toolbarState.setSearchQuery("catfish");
    const museum = renderWithFeedback(MuseumContent, { locale: "en" });
    const status = renderWithFeedback(PageSearchStatus, { locale: "en" });
    await tick();
    await tick();

    expect(museum.queryByText("Flathead Catfish")).toBeNull();
    expect(status.getByRole("status")).toHaveTextContent("1 match outside your filters");

    await fireEvent.click(status.getByRole("button", { name: "Show anyway" }));
    await tick();

    expect(await museum.findByText("Flathead Catfish")).toBeInTheDocument();
  });
});
