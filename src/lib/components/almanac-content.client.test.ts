import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AlmanacContent from "$lib/components/almanac-content.svelte";
import { trackerData } from "$lib/data/index.js";
import { userState } from "$lib/stores/user-state.svelte.js";

describe("AlmanacContent", () => {
  beforeEach(() => {
    userState.resetAll();
    userState.setAvailabilityMode("everything");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders section rows in animation-frame batches after opening a large section", async () => {
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const category = Object.values(trackerData.almanac).find(({ items }) => items.length > 12);
    if (!category) throw new Error("Expected an Almanac category with enough entries for batching");

    const view = render(AlmanacContent);
    await tick();

    const trigger = view.getByRole("button", {
      name: new RegExp(`^${escapeRegExp(category.name)}`),
    });
    await fireEvent.click(trigger);

    expect(view.container.querySelectorAll("[data-tracker-row]").length).toBe(0);
    expect(view.getByText("Loading items…")).toBeInTheDocument();
    expect(queuedFrames.length).toBeGreaterThan(0);

    queuedFrames.shift()?.(0);
    await tick();

    const firstBatchCount = view.container.querySelectorAll("[data-tracker-row]").length;
    expect(firstBatchCount).toBeGreaterThan(0);
    expect(firstBatchCount).toBeLessThanOrEqual(12);

    while (queuedFrames.length > 0) {
      queuedFrames.shift()?.(0);
      await tick();
    }

    await waitFor(() => {
      expect(view.container.querySelectorAll("[data-tracker-row]").length).toBeGreaterThan(
        firstBatchCount,
      );
    });
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
