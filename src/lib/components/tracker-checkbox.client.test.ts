import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";

afterEach(() => {
  cleanup();
});

describe("TrackerCheckbox", () => {
  it("is a labelled button that forwards clicks", async () => {
    const onclick = vi.fn();
    render(TrackerCheckbox, { label: "Mark Tomato as complete", onclick, state: "unchecked" });

    const button = screen.getByRole("button", { name: "Mark Tomato as complete" });
    await fireEvent.click(button);

    expect(onclick).toHaveBeenCalledOnce();
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    ["unchecked", 0],
    ["obtained", 1],
    ["checked", 2],
  ] as const)("draws %s with %i strokes", (state, strokes) => {
    render(TrackerCheckbox, { label: "Tomato", onclick: vi.fn(), state });

    const button = screen.getByRole("button", { name: "Tomato" });
    expect(button.querySelectorAll("path")).toHaveLength(strokes);
    expect(button.classList.contains("tracker-checkbox--checked")).toBe(state === "checked");
    expect(button.classList.contains("tracker-checkbox--obtained")).toBe(state === "obtained");
  });
});
