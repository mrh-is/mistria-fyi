import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import ConfirmSpoilerDialog from "$lib/components/confirm-spoiler-dialog.svelte";

import type { VillagerId } from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

const invertible: VisibilityCondition = { type: "minesLevel", floor: 20 };
const nonInvertible: VisibilityCondition = {
  type: "villagerKnown",
  villagerId: "adeline" as VillagerId,
};

function renderDialog(condition: VisibilityCondition) {
  const handlers = {
    onCancel: vi.fn(),
    onComplete: vi.fn(),
    onCompleteAndUpdate: vi.fn(),
  };
  render(ConfirmSpoilerDialog, { condition, open: true, ...handlers });
  return handlers;
}

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe("ConfirmSpoilerDialog", () => {
  it("offers to update progress only when the condition can be inverted", async () => {
    renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog", { name: "Complete spoilered item?" });

    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Yes, just this item" })).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Yes, and update my progress" }),
    ).toBeInTheDocument();
  });

  it("hides the progress-updating choice for a non-invertible condition", async () => {
    renderDialog(nonInvertible);
    const dialog = await screen.findByRole("alertdialog");

    expect(within(dialog).getByRole("button", { name: "Yes, just this item" })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: "Yes, and update my progress" }),
    ).toBeNull();
  });

  it("routes each choice to its own handler", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Yes, just this item" }));
    expect(handlers.onComplete).toHaveBeenCalledOnce();
    expect(handlers.onCompleteAndUpdate).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("calls the progress-updating handler for the second confirmation", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "Yes, and update my progress" }),
    );
    expect(handlers.onCompleteAndUpdate).toHaveBeenCalledOnce();
    expect(handlers.onComplete).not.toHaveBeenCalled();
  });

  it("cancels without completing", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(handlers.onCancel).toHaveBeenCalledOnce();
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onCompleteAndUpdate).not.toHaveBeenCalled();
  });
});
