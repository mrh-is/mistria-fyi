import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import VisibilityPanel from "#lib/components/visibility-panel.svelte";
import { SOURCE_FILTERS } from "#lib/data/source-filters.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import type { SourceFilter, SourceFilterId } from "#lib/data/source-filters.js";

vi.mock("$app/state", async () => {
  const stubModule = await import("#lib/test-utils/page-stub.svelte.js");
  return { page: stubModule.pageStub };
});

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

afterEach(async () => {
  cleanup();
  toolbarState.removeSourceFilters("test");
  userState.resetAll();
  pageStub.reset();
  await tick();
});

describe("VisibilityPanel interactions", () => {
  it("toggles availability windows as pressed chips", async () => {
    render(VisibilityPanel, { showSeasonality: true });

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
    render(VisibilityPanel, { showSeasonality: true });

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
    render(VisibilityPanel, { showSeasonality: true });

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
    render(VisibilityPanel, { showSeasonality: true });

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
    toolbarState.setSourceFilters("test", [gatheringFilter, storesFilter]);
    render(VisibilityPanel, { showSeasonality: false });

    const gathering = screen.getByRole("button", { name: "Gathering" });
    const stores = screen.getByRole("button", { name: "Stores" });
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(stores).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.sourceFilterActive).toBe(false);

    await fireEvent.click(gathering);

    expect(gathering).toHaveAttribute("aria-pressed", "false");
    expect(stores).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.sourceFilterActive).toBe(true);

    await fireEvent.click(gathering);
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(toolbarState.sourceFilterActive).toBe(false);
  });

  it("labels source groups in the page locale and keys their state on IDs", async () => {
    pageStub.data = { locale: "ja" };
    toolbarState.setSourceFilters("test", [gatheringFilter, storesFilter]);
    render(VisibilityPanel, { showSeasonality: false });

    const gathering = screen.getByRole("button", { name: "採集" });
    const stores = screen.getByRole("button", { name: "ショップ" });
    expect(gathering).toHaveAttribute("aria-pressed", "true");
    expect(stores).toHaveAttribute("aria-pressed", "true");

    await fireEvent.click(gathering);
    expect(gathering).toHaveAttribute("aria-pressed", "false");
    expect([...toolbarState.activeSourceIds]).toEqual(["stores"]);

    await fireEvent.click(gathering);
    expect(toolbarState.activeSourceIds.has("gathering")).toBe(true);
  });

  it("opens and dismisses the source-types explainer", async () => {
    toolbarState.setSourceFilters("test", [gatheringFilter]);
    render(VisibilityPanel, { showSeasonality: false });

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
    render(VisibilityPanel, { showSeasonality: false });

    const showCompleted = screen.getByRole("switch", { name: "Show completed?" });
    expect(showCompleted).not.toBeChecked();

    await fireEvent.click(showCompleted);

    expect(showCompleted).toBeChecked();
    expect(userState.state.showCompleted).toBe(true);

    await fireEvent.click(showCompleted);
    expect(showCompleted).not.toBeChecked();
    expect(userState.state.showCompleted).toBe(false);
  });
});
