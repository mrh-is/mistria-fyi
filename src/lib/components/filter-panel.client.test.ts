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

function weatherStrip() {
  return screen.getByRole("radiogroup", { name: "Weather" });
}

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
    render(FilterPanel, { showWorldStateFilters: true });
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

  it("toggles availability windows as pressed chips", async () => {
    render(FilterPanel, { showWorldStateFilters: true });

    const now = screen.getByRole("button", { name: "Now" });
    const later = screen.getByRole("button", { name: "Later" });
    expect(now).toHaveAttribute("aria-pressed", "true");
    expect(later).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(later);
    expect(later).toHaveAttribute("aria-pressed", "true");
    expect(userState.state.availabilityWindows).toContain("later");

    await fireEvent.click(now);
    expect(now).toHaveAttribute("aria-pressed", "false");
    expect(userState.state.availabilityWindows).not.toContain("now");
  });

  it("selects a season and relabels the weather strip for it", async () => {
    render(FilterPanel, { showWorldStateFilters: true });

    const seasons = screen.getByRole("radiogroup", { name: "Season" });
    expect(within(seasons).getByRole("radio", { name: "Spring" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(weatherStrip()).getByRole("radio", { name: "Rain" })).toBeInTheDocument();

    await fireEvent.click(within(seasons).getByRole("radio", { name: "Winter" }));

    expect(within(seasons).getByRole("radio", { name: "Winter" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(userState.state.worldState.season).toBe("winter");
    await waitFor(() => {
      expect(within(weatherStrip()).getByRole("radio", { name: "Snow" })).toBeInTheDocument();
    });
    expect(within(weatherStrip()).getByRole("radio", { name: "Blizzard" })).toBeInTheDocument();
  });

  it("selects weather and falls back to calm when the season loses that weather", async () => {
    render(FilterPanel, { showWorldStateFilters: true });

    const breeze = within(weatherStrip()).getByRole("radio", { name: "Breeze" });
    expect(breeze).toBeEnabled();
    await fireEvent.click(breeze);
    expect(breeze).toHaveAttribute("aria-checked", "true");
    expect(userState.state.worldState.weather).toBe("special");

    await fireEvent.click(screen.getByRole("radio", { name: "Summer" }));

    await waitFor(() => {
      expect(userState.state.worldState.weather).toBe("calm");
    });
    expect(within(weatherStrip()).getByRole("radio", { name: "Sun" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // The special-weather slot stays in the DOM (for the collapse animation) but leaves the
    // accessibility tree and tab order.
    const special = within(weatherStrip()).getByLabelText("Breeze");
    expect(special).toBeDisabled();
    expect(special).toHaveAttribute("aria-hidden", "true");
    expect(special).toHaveAttribute("tabindex", "-1");
  });

  it("models season as a radiogroup with arrow-key selection", async () => {
    render(FilterPanel, { showWorldStateFilters: true });

    const seasons = screen.getByRole("radiogroup", { name: "Season" });
    const spring = within(seasons).getByRole("radio", { name: "Spring" });
    expect(spring).toHaveAttribute("tabindex", "0");
    expect(within(seasons).getByRole("radio", { name: "Summer" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    spring.focus();
    await fireEvent.keyDown(spring, { key: "ArrowRight" });
    const summer = within(seasons).getByRole("radio", { name: "Summer" });
    expect(summer).toHaveFocus();
    expect(summer).toHaveAttribute("aria-checked", "true");
    expect(userState.state.worldState.season).toBe("summer");
    expect(within(seasons).queryAllByRole("radio", { checked: true })).toHaveLength(1);
  });

  it("toggles source groups and reflects the pressed state", async () => {
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel, { showWorldStateFilters: false });

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
    render(FilterPanel, { showWorldStateFilters: false });

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
    render(FilterPanel, { showWorldStateFilters: false });

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

  it("toggles completed visibility from the switch", async () => {
    render(FilterPanel, { showWorldStateFilters: false });

    const showCompleted = screen.getByRole("switch", { name: "Completed" });
    expect(showCompleted).not.toBeChecked();

    await fireEvent.click(showCompleted);

    expect(showCompleted).toBeChecked();
    expect(userState.state.showCompleted).toBe(true);

    await fireEvent.click(showCompleted);
    expect(showCompleted).not.toBeChecked();
    expect(userState.state.showCompleted).toBe(false);
  });

  it("pairs the completed & unobtainable switches in one row under a Show heading", async () => {
    render(FilterPanel, { showWorldStateFilters: false });

    const show = screen.getByRole("region", { name: "Show" });
    expect(within(show).getAllByRole("switch")).toHaveLength(1);

    toolbarState.registerSourceFilters("almanac", []);
    await tick();

    // The visible tile text names each switch, so voice control can target what's on screen.
    const switches = within(show).getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(switches[0]).toHaveAccessibleName("Completed");
    expect(switches[1]).toHaveAccessibleName("Unobtainable");
  });

  it("keeps every section expanded without a disclosure control on wide screens", () => {
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel, { showWorldStateFilters: true });

    expect(screen.getByRole("heading", { name: "When to find" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Source types" })).toBeInTheDocument();
    expect(document.querySelector("[aria-expanded]")).toBeNull();
    expect(screen.getByRole("button", { name: "Now" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Gathering" })).toBeVisible();
  });

  it("collapses when-to-find & source types into summarized disclosures on phones", async () => {
    emulatePhone();
    toolbarState.registerSourceFilters("test", [gatheringFilter, storesFilter]);
    render(FilterPanel, { showWorldStateFilters: true });

    const whenToFind = screen.getByRole("button", { name: /^When to find/ });
    const sourceTypes = screen.getByRole("button", { name: /^Source types/ });
    expect(whenToFind).toHaveAttribute("aria-expanded", "false");
    // Season & weather show as icons, with their names for screen readers only.
    expect(whenToFind).toHaveTextContent("When to find Now + anytime · Spring, Sun");
    expect(sourceTypes).toHaveAttribute("aria-expanded", "false");
    expect(sourceTypes).toHaveTextContent("Source types All types");

    const whenToFindBody = document.getElementById(whenToFind.getAttribute("aria-controls") ?? "");
    const sourceTypesBody = document.getElementById(
      sourceTypes.getAttribute("aria-controls") ?? "",
    );
    // Collapsed bodies are inert at once & hidden by CSS once their closing transition ends.
    expect(whenToFindBody).toHaveAttribute("inert");
    expect(sourceTypesBody).toHaveAttribute("inert");
    expect(screen.queryByRole("button", { name: "About source types" })).toBeNull();

    await fireEvent.click(sourceTypes);
    expect(sourceTypes).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "About source types" })).toBeVisible();
    // The summary stays mounted to fade out; CSS hides it, & drops it from the name, once faded.
    const sourceSummary = sourceTypes.querySelector(".disclosure__summary");
    expect(sourceSummary).toHaveClass("disclosure__summary--hidden");
    expect(sourceTypesBody).not.toHaveAttribute("inert");
    await fireEvent.click(screen.getByRole("button", { name: "Gathering" }));
    expect(whenToFindBody).toHaveAttribute("inert");

    await fireEvent.click(sourceTypes);
    expect(sourceTypes).toHaveAttribute("aria-expanded", "false");
    expect(sourceTypes).toHaveTextContent("Source types Only stores");
    expect(sourceSummary).not.toHaveClass("disclosure__summary--hidden");
    expect(sourceTypesBody).toHaveAttribute("inert");
  });

  it("summarizes every time window as Everything, without season or weather", () => {
    emulatePhone();
    userState.toggleAvailabilityWindow("later");
    render(FilterPanel, { showWorldStateFilters: true });

    expect(screen.getByRole("button", { name: /^When to find/ })).toHaveTextContent(
      /^When to find Everything$/,
    );
  });

  it("lists up to three enabled source types, then counts them", () => {
    emulatePhone();
    const ids: SourceFilterId[] = ["chests", "fishing", "gathering", "museum", "stores"];
    toolbarState.registerSourceFilters(
      "test",
      ids.map((id) => sourceFilter(id)),
    );
    render(FilterPanel, { showWorldStateFilters: false });
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

  it("names what the show toggles leave in view", async () => {
    emulatePhone();
    render(FilterPanel, { showWorldStateFilters: false });

    const show = screen.getByRole("button", { name: /^Show/ });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(show).toHaveTextContent("Show To do");
    expect(document.getElementById("show-filter-body")).toHaveAttribute("inert");

    userState.toggleShowCompleted();
    await tick();
    expect(show).toHaveTextContent("Show Everything");

    toolbarState.registerSourceFilters("almanac", []);
    await tick();
    expect(show).toHaveTextContent("Show Obtainable");

    toolbarState.showUnobtainable = true;
    await tick();
    expect(show).toHaveTextContent("Show Everything");

    userState.toggleShowCompleted();
    await tick();
    expect(show).toHaveTextContent("Show Uncompleted");

    await fireEvent.click(show);
    expect(show).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("switch", { name: "Completed" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Unobtainable" })).toBeChecked();
  });

  it("remembers expanded sections for the session across panel openings", async () => {
    emulatePhone();
    const first = render(FilterPanel, { showWorldStateFilters: true });
    await fireEvent.click(screen.getByRole("button", { name: /^When to find/ }));
    first.unmount();

    render(FilterPanel, { showWorldStateFilters: true });
    expect(screen.getByRole("button", { name: /^When to find/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Now" })).toBeVisible();
  });
});
