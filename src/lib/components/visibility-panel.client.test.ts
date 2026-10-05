import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { SOURCE_FILTERS } from "#lib/components/icon/index.js";
import VisibilityPanel from "#lib/components/visibility-panel.svelte";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { SourceFilter } from "#lib/stores/toolbar-state.svelte.js";

function sourceFilter(label: string): SourceFilter {
  const filter = SOURCE_FILTERS.find((candidate) => candidate.label === label);
  if (!filter) throw new Error(`Missing source filter: ${label}`);
  return filter;
}

const gatheringFilter = sourceFilter("Gathering");
const storesFilter = sourceFilter("Stores");

function weatherStrip() {
  return screen.getByLabelText("Weather");
}

afterEach(async () => {
  cleanup();
  toolbarState.removeSourceFilters("test");
  userState.resetAll();
  await new Promise((resolve) => setTimeout(resolve, 250));
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

    const seasons = screen.getByLabelText("Season");
    expect(within(seasons).getByRole("button", { name: "Spring" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(weatherStrip()).getByRole("button", { name: "Rain" })).toBeInTheDocument();

    await fireEvent.click(within(seasons).getByRole("button", { name: "Winter" }));

    expect(within(seasons).getByRole("button", { name: "Winter" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(userState.state.worldState.season).toBe("winter");
    await waitFor(() => {
      expect(within(weatherStrip()).getByRole("button", { name: "Snow" })).toBeInTheDocument();
    });
    expect(within(weatherStrip()).getByRole("button", { name: "Blizzard" })).toBeInTheDocument();
  });

  it("selects weather and falls back to calm when the season loses that weather", async () => {
    render(VisibilityPanel, { showSeasonality: true });

    const breeze = within(weatherStrip()).getByRole("button", { name: "Breeze" });
    expect(breeze).toBeEnabled();
    await fireEvent.click(breeze);
    expect(breeze).toHaveAttribute("aria-pressed", "true");
    expect(userState.state.worldState.weather).toBe("special");

    await fireEvent.click(screen.getByRole("button", { name: "Summer" }));

    await waitFor(() => {
      expect(userState.state.worldState.weather).toBe("calm");
    });
    expect(within(weatherStrip()).getByRole("button", { name: "Sun" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The special-weather slot stays in the DOM (for the collapse animation) but leaves the
    // accessibility tree and tab order.
    const special = within(weatherStrip()).getByLabelText("Breeze");
    expect(special).toBeDisabled();
    expect(special).toHaveAttribute("aria-hidden", "true");
    expect(special).toHaveAttribute("tabindex", "-1");
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

  it("opens and dismisses the source-types explainer", async () => {
    toolbarState.setSourceFilters("test", [gatheringFilter]);
    render(VisibilityPanel, { showSeasonality: false });

    await fireEvent.click(screen.getByRole("button", { name: "About source types" }));

    const dialog = await screen.findByRole("dialog", { name: "Source types" });
    expect(within(dialog).getByText("Gathering")).toBeInTheDocument();

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
