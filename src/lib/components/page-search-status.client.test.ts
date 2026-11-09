import { fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";

import MuseumContent from "#lib/components/museum-content.svelte";
import PageSearchStatus from "#lib/components/page-search-status.svelte";
import SearchGuideLink from "#lib/components/search-guide-link.svelte";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import * as m from "#lib/paraglide/messages.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type { FilteredCounts } from "#lib/engine/shelves.js";

const KEY = Symbol("test");

function report(visible: number, filtered: Partial<FilteredCounts> = {}): void {
  toolbarState.registerPageSearch(KEY, () => ({
    filtered: { completed: 0, notNow: 0, todo: 0, ...filtered },
    visible,
  }));
}

async function search(query: string) {
  toolbarState.openSearch();
  toolbarState.setSearchQuery(query);
  const view = renderWithFeedback(PageSearchStatus, { locale: "en" });
  await tick();
  return view;
}

describe("PageSearchStatus", () => {
  beforeEach(async () => {
    await userState.startTrackingByHand();
  });

  // Client test files share this store, so a search left open would filter their pages.

  it("stays quiet without a search", () => {
    const view = renderWithFeedback(PageSearchStatus, { locale: "en" });

    expect(view.getByRole("status")).toHaveTextContent("");
    expect(view.container.querySelector("[data-page-search-status]")).toBeNull();
  });

  it("says when nothing matches at all", async () => {
    report(0);
    const view = await search("zzz");

    expect(view.getAllByText(m.search_no_results())).not.toHaveLength(0);
    expect(view.getByRole("status")).toHaveTextContent(m.search_no_results());
  });

  it("names the shelf that lost rows, in its heading's typeface", async () => {
    report(0, { todo: 1 });
    const view = await search("bass");

    expect(view.getByRole("status")).toHaveTextContent("1 To do item is being filtered out.");
    expect(view.container.querySelector(".page-search-status__shelf")).toHaveTextContent(
      m.shelf_to_do(),
    );
    expect(view.getByRole("button", { name: m.filter_note_show() })).toBeInTheDocument();
  });

  it("gives one note, for the most actionable shelf", async () => {
    report(1, { completed: 4, notNow: 2 });
    const view = await search("bass");

    expect(view.getByRole("status")).toHaveTextContent(
      "1 result. 2 Not now items are being filtered out.",
    );
  });

  it("notes what filters take away without a search", async () => {
    report(3, { todo: 2 });
    toolbarState.registerSourceFilters("test", [SOURCE_FILTERS[0], SOURCE_FILTERS[1]]);
    toolbarState.toggleSourceFilter(SOURCE_FILTERS[0]);
    const view = renderWithFeedback(PageSearchStatus, { locale: "en" });
    await tick();

    expect(view.getByRole("status")).toHaveTextContent("2 To do items are being filtered out.");

    await fireEvent.click(view.getByRole("button", { name: m.filter_note_show() }));
    expect(toolbarState.isSourceFilterNarrowing).toBe(false);
    toolbarState.unregisterSourceFilters("test");
  });

  it("says so when filters leave nothing on the page", async () => {
    report(0);
    toolbarState.registerSourceFilters("test", [SOURCE_FILTERS[0], SOURCE_FILTERS[1]]);
    toolbarState.toggleSourceFilter(SOURCE_FILTERS[0]);
    const view = renderWithFeedback(PageSearchStatus, { locale: "en" });
    await tick();

    expect(view.getByRole("status")).toHaveTextContent(m.filter_note_nothing_left());
    toolbarState.unregisterSourceFilters("test");
  });

  it("announces a changed query", async () => {
    report(2);
    const view = await search("bass");
    expect(view.getByRole("status")).toHaveTextContent("2 results");

    report(1);
    toolbarState.setSearchQuery("sea bass");
    await tick();

    expect(view.getByRole("status")).toHaveTextContent("1 result");
  });

  it("pauses filters for the search without changing them, & can undo that", async () => {
    report(0, { todo: 3 });
    const view = await search("bass");

    await fireEvent.click(view.getByRole("button", { name: m.filter_note_show() }));

    expect(toolbarState.searchShowsAll).toBe(true);
    expect(view.getByText(/Your filters are off for this search/u)).toBeInTheDocument();

    await fireEvent.click(view.getByRole("button", { name: m.search_filters_resume() }));

    expect(toolbarState.searchShowsAll).toBe(false);
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

  it("offers the whole guide below the page, as a link that keeps the query", async () => {
    toolbarState.setSearchQuery("zzz");
    const view = renderWithFeedback(SearchGuideLink, { locale: "en" });
    await tick();

    const link = view.getByRole("link", { name: "Search the entire Field Guide for “zzz”" });
    expect(view.getByText(m.search_guide_prompt())).toBeInTheDocument();

    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await fireEvent.click(link);
    toolbarState.finishSearchAfterNavigation();
    expect(toolbarState.searchQuery).toBe("zzz");
  });

  it("offers nothing without a search", () => {
    const view = renderWithFeedback(SearchGuideLink, { locale: "en" });

    expect(view.queryByRole("link")).toBeNull();
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

  it("finds a winter fish in spring, because availability never hides a row", async () => {
    toolbarState.openSearch();
    toolbarState.setSearchQuery("catfish");
    const museum = renderWithFeedback(MuseumContent, { locale: "en" });
    await tick();
    await tick();

    expect(await museum.findByText("Flathead Catfish")).toBeInTheDocument();
  });
});
