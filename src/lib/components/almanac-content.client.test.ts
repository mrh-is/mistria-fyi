import { fireEvent, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AlmanacContent from "#lib/components/almanac-content.svelte";
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

  it("renders section rows in animation-frame batches after opening a large section", async () => {
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (onFrame: FrameRequestCallback) => {
      queuedFrames.push(onFrame);
      return queuedFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const category = recordEntries(trackerData.almanac).find(([, { items }]) => items.length > 12);
    if (!category) throw new Error("Expected an Almanac category with enough entries for batching");
    const categoryName = getName("ui", category[0], "en");

    const view = renderWithFeedback(AlmanacContent, { locale: "en" });
    await tick();

    const trigger = view.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(categoryName)}`),
    });
    await fireEvent.click(trigger);

    expect(view.container.querySelectorAll("[data-tracker-row]")).toHaveLength(0);
    expect(view.getByText("Loading items…")).toBeInTheDocument();
    expect(queuedFrames.length).toBeGreaterThan(0);

    queuedFrames.shift()?.(0);
    await tick();

    const firstBatchCount = view.container.querySelectorAll("[data-tracker-row]").length;
    expect(firstBatchCount).toBeGreaterThan(0);
    expect(firstBatchCount).toBeLessThanOrEqual(12);

    while (queuedFrames.length > 0) {
      queuedFrames.shift()?.(0);
      // oxlint-disable-next-line no-await-in-loop -- each frame must flush before the next is dequeued
      await tick();
    }

    await waitFor(() => {
      expect(view.container.querySelectorAll("[data-tracker-row]").length).toBeGreaterThan(
        firstBatchCount,
      );
    });
  });

  it("renders an item name from the Japanese locale chunk", async () => {
    const turnip = "turnip" as ItemId;
    const japaneseName = getName("items", turnip, "ja");
    expect(japaneseName).not.toBe(getName("items", turnip, "en"));
    toolbarState.setSearchQuery(japaneseName);

    const view = renderWithFeedback(AlmanacContent, { locale: "ja" });

    expect(await view.findByText(japaneseName)).toBeInTheDocument();
  });
});

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}
