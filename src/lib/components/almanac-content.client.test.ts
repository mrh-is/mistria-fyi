import { fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
import { INITIAL_ROW_BUDGET } from "#lib/controllers/row-reveal.svelte.js";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ItemId } from "#lib/types/tracker-data.js";

describe("AlmanacContent", () => {
  beforeEach(() => {
    userState.resetAll();
    userState.setAvailabilityWindows(AVAILABILITY_WINDOWS);
    toolbarState.closeSearch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Date Inspiration without a duplicate Dates checklist", async () => {
    userState.toggleShowSpoilers();
    const view = renderWithFeedback(AlmanacContent, { locale: "en" });
    await tick();

    expect(view.getByRole("button", { name: /^Date Inspiration,/ })).toBeInTheDocument();
    expect(view.queryByRole("button", { name: /^Dates,/ })).toBeNull();
  });

  it("renders every row of a long section without a show-more button", async () => {
    // The smallest section that still needs several frames, to keep the test quick.
    const category = recordEntries(trackerData.almanac)
      .filter(([, { items }]) => items.length > INITIAL_ROW_BUDGET * 3)
      .toSorted(([, a], [, b]) => a.items.length - b.items.length)
      .at(0);
    if (!category) throw new Error("Expected an Almanac category that needs several frames");
    const [categoryId, { items }] = category;
    const categoryName = getName("ui", categoryId, "en");
    userState.toggleShowSpoilers();

    const view = renderWithFeedback(AlmanacContent, { locale: "en" });
    await tick();

    const trigger = view.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(categoryName)}, 0 of [\\d,]+ completed$`),
    });
    const totalLabel = /of ([\d,]+) completed/.exec(trigger.getAttribute("aria-label") ?? "")?.[1];
    const total = Number(totalLabel?.replaceAll(",", ""));
    expect(total).toBeGreaterThan(INITIAL_ROW_BUDGET);
    expect(items.length).toBeGreaterThanOrEqual(total);
    await fireEvent.click(trigger);

    const section = trigger.closest("[data-tracker-section]");
    if (!section) throw new Error("Expected the trigger inside its section");
    expect(section.querySelectorAll("[data-tracker-row]").length).toBeGreaterThan(0);
    await waitFor(
      () => {
        expect(section.querySelectorAll("[data-tracker-row]")).toHaveLength(total);
      },
      { timeout: 5000 },
    );
    expect(view.queryByRole("button", { name: /^Show \d+ more/ })).toBeNull();
  });

  it("renders an item name from the Japanese locale chunk", async () => {
    const turnip = "turnip" as ItemId;
    const japaneseName = getName("items", turnip, "ja");
    expect(japaneseName).not.toBe(getName("items", turnip, "en"));
    toolbarState.setSearchQuery(japaneseName);

    const view = renderWithFeedback(AlmanacContent, { locale: "ja" });

    expect(await view.findByText(japaneseName)).toBeInTheDocument();
  });

  it("filters a merged row by a noncanonical member's name", async () => {
    // Single & double beds share one recipe, so the row is named for the single bed.
    toolbarState.setSearchQuery("Emerald Double Bed");

    const view = renderWithFeedback(AlmanacContent, { locale: "en" });

    expect(await view.findByText("Emerald Single Bed")).toBeInTheDocument();
  });

  it("shows a same-named row’s variant under its name, & finds the row by it", async () => {
    userState.toggleShowSpoilers();
    toolbarState.setSearchQuery("oak window");

    const view = renderWithFeedback(AlmanacContent, { locale: "en" });

    // Six rows share each name; the word & the name each match half of the query.
    const subtitles = await view.findAllByText("Oak");
    expect(subtitles.map((subtitle) => subtitle.parentElement?.textContent.trim())).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Animated Clouds Window\s*Oak$/),
        expect.stringMatching(/^Animated Clouds Window Seat\s*Oak$/),
      ]),
    );
    for (const subtitle of subtitles) expect(subtitle).toHaveClass("tracker-row__subtitle");
    expect(
      view.getByRole("button", { name: "Check Animated Clouds Window, Oak" }),
    ).toBeInTheDocument();
    expect(view.queryByText("Walnut")).toBeNull();
  });

  it("shows no subtitle on a row without a variant", async () => {
    toolbarState.setSearchQuery("Turnip");

    const view = renderWithFeedback(AlmanacContent, { locale: "en" });

    const name = await view.findByText("Turnip");
    expect(name.querySelector(".tracker-row__subtitle")).toBeNull();
    expect(view.getByRole("button", { name: "Check Turnip" })).toBeInTheDocument();
  });
});

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
