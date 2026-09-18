import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import VillagerAlphabetIndexHarness from "$lib/components/villager-alphabet-index.test-harness.svelte";

const entries = [
  { id: "villager-balor", initial: "B" },
  { id: "villager-adeline", initial: "A" },
  { id: "villager-aria", initial: "A" },
  { id: "villager-zara", initial: "Z" },
];

describe("VillagerAlphabetIndex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders represented initials in order and activates the first matching record", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(VillagerAlphabetIndexHarness, { entries });

    expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "A",
      "B",
      "Z",
    ]);
    const letterA = view.getByRole("button", { name: "Jump to A, first Townsfolk record" });
    await fireEvent.click(letterA);

    expect(document.activeElement).toBe(view.container.querySelector("#villager-adeline"));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("uses immediate scrolling under reduced motion", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(VillagerAlphabetIndexHarness, { entries, reducedMotion: true });

    await fireEvent.click(view.getByRole("button", { name: "Jump to B, first Townsfolk record" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("scrubs only after a pointer starts on the index", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(VillagerAlphabetIndexHarness, { entries });
    const index = view.getByRole("navigation", { name: "Townsfolk alphabet" });
    const letterA = view.getByRole("button", { name: "Jump to A, first Townsfolk record" });
    const letterZ = view.getByRole("button", { name: "Jump to Z, first Townsfolk record" });
    const elementFromPoint = vi.fn(() => letterZ);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    await fireEvent.pointerMove(index, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(scrollIntoView).not.toHaveBeenCalled();

    await fireEvent.pointerDown(letterA, { pointerId: 1 });
    expect(document.activeElement).toBe(view.container.querySelector("#villager-adeline"));
    expect(letterA).toHaveAttribute("data-active", "true");
    await fireEvent.pointerMove(index, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(document.activeElement).toBe(view.container.querySelector("#villager-zara"));
    expect(letterA).toHaveAttribute("data-active", "false");
    expect(letterZ).toHaveAttribute("data-active", "true");

    await fireEvent.pointerUp(index, { pointerId: 1 });
    await fireEvent.click(letterA, { detail: 1 });
    expect(document.activeElement).toBe(view.container.querySelector("#villager-zara"));
    expect(letterZ).toHaveAttribute("data-active", "false");

    elementFromPoint.mockReturnValue(letterA);
    await fireEvent.pointerMove(index, { clientX: 10, clientY: 10, pointerId: 1 });
    expect(document.activeElement).toBe(view.container.querySelector("#villager-zara"));
  });
});
