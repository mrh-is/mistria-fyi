import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import FilterPanel from "#lib/components/filter-panel.svelte";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type { SourceFilter, SourceFilterId } from "#lib/data/source-filters.js";

function sourceFilter(id: SourceFilterId): SourceFilter {
  const filter = SOURCE_FILTERS.find((candidate) => candidate.id === id);
  if (!filter) throw new Error(`Missing source filter: ${id}`);
  return filter;
}

const gatheringFilter = sourceFilter("gathering");
const storesFilter = sourceFilter("stores");

function emulatePhone(): void {
  vi.spyOn(globalThis, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        addEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: true,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(async () => {
  cleanup();
  toolbarState.unregisterSourceFilters("test");
  toolbarState.unregisterSourceFilters("almanac");
  toolbarState.showUnobtainable = false;
  toolbarState.expandedFilterSections.clear();
  vi.restoreAllMocks();
  userState.resetAll();
  pageStub.reset();
  await tick();
});

describe("FilterPanel interactions", () => {
  it("offers the unobtainable filter only while the almanac is mounted", async () => {
    render(FilterPanel);
    expect(screen.queryByRole("switch", { name: "Unobtainable" })).toBeNull();
    toolbarState.registerSourceFilters("almanac", []);
    await tick();
    const toggle = screen.getByRole("switch", { name: "Unobtainable" });
    await fireEvent.click(toggle);
    expect(toolbarState.showUnobtainable).toBe(true);
    await fireEvent.click(toggle);
    expect(toolbarState.showUnobtainable).toBe(false);
    toolbarState.unregisterSourceFilters("almanac");
    await tick();
    expect(screen.queryByRole("switch", { name: "Unobtainable" })).toBeNull();
  });

  it("toggles source groups and reflects the pressed state", async () => {
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel);

    const gathering = screen.getByRole("button", { name: "Gathering" });
    const stores = screen.getByRole("button", { name: "Stores" });
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(stores).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.isSourceFilterNarrowing).toBe(false);

    await fireEvent.click(gathering);

    expect(gathering).toHaveAttribute("aria-pressed", "false");
    expect(stores).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.isSourceFilterNarrowing).toBe(true);

    await fireEvent.click(gathering);
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.isSourceFilterNarrowing).toBe(false);
  });

  it("labels source groups in the page locale and keys their state on IDs", async () => {
    pageStub.data = { locale: "ja" };
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel);

    const gathering = screen.getByRole("button", { name: "採集" });
    const stores = screen.getByRole("button", { name: "ショップ" });
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(stores).toHaveAttribute("aria-pressed", "true");

    await fireEvent.click(gathering);
    expect(gathering).toHaveAttribute("aria-pressed", "false");
    expect([...toolbarState.enabledSourceFilterIds]).toEqual(["stores"]);

    await fireEvent.click(gathering);
    expect(toolbarState.enabledSourceFilterIds.has("gathering")).toBe(true);
  });

  it("opens and dismisses the source-types explainer", async () => {
    toolbarState.registerSourceFilters("test", [gatheringFilter]);
    render(FilterPanel);

    await fireEvent.click(screen.getByRole("button", { name: "About source types" }));

    const dialog = await screen.findByRole("dialog", { name: "Source types" });
    expect(within(dialog).getByText("Gathering")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Foraging, Bug catching, Artifact digs, and Equipment"),
    ).toBeInTheDocument();

    await fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("keeps every section expanded without a disclosure control on wide screens", () => {
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel);

    expect(screen.getByRole("heading", { name: "Source types" })).toBeInTheDocument();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.getByRole("button", { name: "Gathering" })).toBeVisible();
  });

  it("collapses source types into a summarized disclosure on phones", async () => {
    emulatePhone();
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel);

    const sourceTypes = screen.getByRole("button", { name: /^Source types/ });
    expect(sourceTypes).toHaveAttribute("aria-expanded", "false");
    expect(sourceTypes).toHaveTextContent("Source types All types");

    const body = document.getElementById(sourceTypes.getAttribute("aria-controls") ?? "");
    // A collapsed body is inert at once & hidden by CSS once its closing transition ends.
    expect(body).toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "About source types" })).toBeNull();

    await fireEvent.click(sourceTypes);
    expect(sourceTypes).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "About source types" })).toBeVisible();
    // The summary stays mounted to fade out; CSS hides it, & drops it from the name, once faded.
    const summary = sourceTypes.querySelector(".disclosure__summary");
    expect(summary).toHaveClass("disclosure__summary--hidden");
    expect(body).not.toHaveAttribute("inert");
    await fireEvent.click(screen.getByRole("button", { name: "Gathering" }));

    await fireEvent.click(sourceTypes);
    expect(sourceTypes).toHaveAttribute("aria-expanded", "false");
    expect(sourceTypes).toHaveTextContent("Source types Only stores");
    expect(summary).not.toHaveClass("disclosure__summary--hidden");
    expect(body).toHaveAttribute("inert");
  });

  it("lists up to three enabled source types, then counts them", () => {
    emulatePhone();
    const ids: SourceFilterId[] = ["chests", "fishing", "gathering", "museum", "stores"];
    toolbarState.registerSourceFilters(
      "test",
      ids.map((id) => sourceFilter(id)),
    );
    render(FilterPanel);
    const sourceTypes = screen.getByRole("button", { name: /^Source types/ });
    expect(sourceTypes).toHaveTextContent("Source types All types");

    const summaries: string[] = [];
    for (const id of ids) {
      toolbarState.toggleSourceFilter(sourceFilter(id));
      flushSync();
      summaries.push(sourceTypes.textContent.replaceAll(/\s+/g, " ").trim());
    }
    expect(summaries).toEqual([
      "Source types 4 of 5",
      "Source types Gathering, museum, & stores",
      "Source types Museum & stores",
      "Source types Only stores",
      "Source types No types",
    ]);
  });

  it("offers no Completed switch or availability windows", () => {
    toolbarState.registerSourceFilters("almanac", []);
    render(FilterPanel);

    expect(screen.queryByRole("switch", { name: "Completed" })).toBeNull();
    expect(screen.queryByText("When to find")).toBeNull();
  });

  it("names what the show toggle leaves in view", async () => {
    emulatePhone();
    toolbarState.registerSourceFilters("almanac", []);
    render(FilterPanel);
    await tick();

    const show = screen.getByRole("button", { name: /^Show/ });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(show).toHaveTextContent("Show Obtainable");
    expect(document.getElementById("show-filter-body")).toHaveAttribute("inert");

    toolbarState.showUnobtainable = true;
    await tick();
    expect(show).toHaveTextContent("Show Everything");

    await fireEvent.click(show);
    expect(show).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("switch", { name: "Unobtainable" })).toBeChecked();
  });

  it("remembers expanded sections for the session across panel openings", async () => {
    emulatePhone();
    toolbarState.registerSourceFilters("test", [gatheringFilter]);
    const first = render(FilterPanel);
    await fireEvent.click(screen.getByRole("button", { name: /^Source types/ }));
    first.unmount();

    render(FilterPanel);
    expect(screen.getByRole("button", { name: /^Source types/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Gathering" })).toBeVisible();
  });
});
