import { fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import VillagerAlphabetIndexHarness from "#lib/components/villager-alphabet-index.test-harness.svelte";

const entries = [
  { id: "villager-balor", name: "Balor" },
  { id: "villager-adeline", name: "Adeline" },
  { id: "villager-aria", name: "Aria" },
  { id: "villager-zara", name: "Zara" },
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
    const letterA = view.getByRole("button", { name: "Jump to A, first villager record" });
    await fireEvent.click(letterA);

    expect(document.activeElement).toBe(view.container.querySelector("#villager-adeline"));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("merges initials the locale collates as one letter and orders them by collation", () => {
    const view = render(VillagerAlphabetIndexHarness, {
      entries: [
        { id: "villager-elsie", name: "Elsie" },
        { id: "villager-eloise", name: "éloïse" },
        { id: "villager-zoe", name: "Zoé" },
        { id: "villager-dell", name: "Dell" },
      ],
      locale: "fr",
    });

    expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "D",
      "E",
      "Z",
    ]);
  });

  it("uses immediate scrolling under reduced motion", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(VillagerAlphabetIndexHarness, { entries, reducedMotion: true });

    await fireEvent.click(view.getByRole("button", { name: "Jump to B, first villager record" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" });
  });

  it("scrubs only after a pointer starts on the index", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const view = render(VillagerAlphabetIndexHarness, { entries });
    const index = view.getByRole("navigation", { name: "Villager alphabet" });
    const letterA = view.getByRole("button", { name: "Jump to A, first villager record" });
    const letterZ = view.getByRole("button", { name: "Jump to Z, first villager record" });
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
