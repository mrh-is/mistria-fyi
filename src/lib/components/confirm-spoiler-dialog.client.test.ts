import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, it, vi } from "vitest";

import ConfirmSpoilerDialog from "#lib/components/confirm-spoiler-dialog.svelte";

import type { GuardSubject } from "#lib/controllers/spoiler-guard.svelte.js";
import type { VillagerId } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

const invertible: VisibilityCondition = { type: "mineFloor", floor: 20 };
const nonInvertible: VisibilityCondition = {
  type: "villagerKnown",
  villagerId: "adeline" as VillagerId,
};

function renderDialog(condition: VisibilityCondition, subject?: GuardSubject) {
  const handlers = {
    onCancel: vi.fn(),
    onComplete: vi.fn(),
    onCompleteAndUpdate: vi.fn(),
  };
  render(ConfirmSpoilerDialog, { condition, open: true, subject, ...handlers });
  return handlers;
}

function buttonNames(dialog: HTMLElement): string[] {
  return within(dialog)
    .getAllByRole("button")
    .map((button) => button.textContent.trim());
}

describe("ConfirmSpoilerDialog", () => {
  it("teases a covered item & offers to update progress when the condition can be inverted", async () => {
    renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Check off this item?",
    });

    expect(dialog).toHaveTextContent("You haven’t even revealed its name!");
    expect(buttonNames(dialog)).toEqual([
      "Never mind",
      "YOLO (just this one thing)",
      "YOLO, and prerequisites",
    ]);
  });

  it("drops “just this” from a covered item's only confirmation", async () => {
    renderDialog(nonInvertible);
    const dialog = await screen.findByRole("alertdialog", {
      name: "Check off this item?",
    });

    expect(buttonNames(dialog)).toEqual(["Never mind", "YOLO"]);
  });

  it("names a revealed item & asks plainly", async () => {
    renderDialog(invertible, { name: "Copper Ore" });
    const dialog = await screen.findByRole("alertdialog", {
      name: "Check off Copper Ore?",
    });

    expect(dialog).toHaveTextContent(
      "Based on your tracked progress, it doesn’t seem like you should be able to get this yet.",
    );
    expect(buttonNames(dialog)).toEqual([
      "Never mind",
      "Yes, just this one",
      "Yes, and prerequisites too",
    ]);
  });

  it("drops “just this” from a revealed item's only confirmation", async () => {
    renderDialog(nonInvertible, { name: "Copper Ore" });
    const dialog = await screen.findByRole("alertdialog", {
      name: "Check off Copper Ore?",
    });

    expect(buttonNames(dialog)).toEqual(["Never mind", "Yes"]);
  });

  it("names the floor past an unbroken seal", async () => {
    renderDialog(invertible, { floor: 21 });
    const dialog = await screen.findByRole("alertdialog", {
      name: "Head down to floor 21?",
    });

    expect(dialog).toHaveTextContent(
      "Based on your tracked progress, you haven’t broken the seal on the way there yet. Are you sure?",
    );
    expect(buttonNames(dialog)).toEqual([
      "Never mind",
      "Yes, just this one",
      "Yes, and prerequisites too",
    ]);
  });

  it("routes each choice to its own handler", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(
      within(dialog).getByRole("button", { name: "YOLO (just this one thing)" }),
    );
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);
    expect(handlers.onCompleteAndUpdate).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("calls the progress-updating handler for the second confirmation", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "YOLO, and prerequisites" }));
    expect(handlers.onCompleteAndUpdate).toHaveBeenCalledTimes(1);
    expect(handlers.onComplete).not.toHaveBeenCalled();
  });

  it("cancels without completing", async () => {
    const handlers = renderDialog(invertible);
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Never mind" }));
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onCompleteAndUpdate).not.toHaveBeenCalled();
  });
});
