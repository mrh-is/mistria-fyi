import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import TrackerCheckbox from "#lib/components/tracker-checkbox.svelte";

import type { FactProvenance } from "#lib/engine/provenance.js";

afterEach(() => {
  cleanup();
});

function renderBox(
  state: "checked" | "obtained" | "unchecked",
  provenance: FactProvenance | undefined,
  fact = "almanac/tomato",
): HTMLElement {
  render(TrackerCheckbox, { fact, label: "Tomato", onclick: vi.fn(), provenance, state });
  return screen.getByRole("button", { name: "Tomato" });
}

describe("TrackerCheckbox", () => {
  it("is a labelled button that forwards clicks", async () => {
    const onclick = vi.fn();
    render(TrackerCheckbox, {
      fact: "almanac/tomato",
      label: "Mark Tomato as complete",
      onclick,
      provenance: undefined,
      state: "unchecked",
    });

    const button = screen.getByRole("button", { name: "Mark Tomato as complete" });
    await fireEvent.click(button);

    expect(onclick).toHaveBeenCalledTimes(1);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it.each([
    ["unchecked", 0],
    ["obtained", 1],
    ["checked", 2],
  ] as const)("draws %s with %i pen strokes", (state, strokes) => {
    const button = renderBox(state, { source: "manual" });

    expect(button.querySelectorAll("path")).toHaveLength(strokes);
    expect(button.classList.contains("tracker-checkbox--checked")).toBe(state === "checked");
    expect(button.classList.contains("tracker-checkbox--obtained")).toBe(state === "obtained");
  });

  it.each([
    ["manual", "mark-pen-"],
    ["save", "mark-stamp-"],
    ["inferred", "mark-pencil-"],
    ["unknown", "mark-ribbon-"],
  ] as const)("draws a %s mark with its tool's filter", (source, filter) => {
    const button = renderBox("checked", { source });

    expect(button.querySelector("[filter]")?.getAttribute("filter")).toContain(filter);
  });

  it("treats a fact with no record as unknown", () => {
    const button = renderBox("checked", undefined);

    expect(button.querySelector("[filter]")?.getAttribute("filter")).toContain("mark-ribbon-");
  });

  it("gives a stamp its own pressure mask in each checkbox", () => {
    render(TrackerCheckbox, {
      fact: "almanac/a",
      label: "A",
      onclick: vi.fn(),
      provenance: { source: "save" },
      state: "checked",
    });
    render(TrackerCheckbox, {
      fact: "almanac/b",
      label: "B",
      onclick: vi.fn(),
      provenance: { source: "save" },
      state: "checked",
    });

    const ids = [...document.querySelectorAll("mask")].map(({ id }) => id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("keeps each moment's tool on a quest from two sources", () => {
    const button = renderBox(
      "checked",
      { obtainedSource: "save", source: "manual" },
      "questStates/tomato",
    );

    const filters = [...button.querySelectorAll("[filter]")].map((g) => g.getAttribute("filter"));
    expect(filters[0]).toContain("mark-stamp-");
    expect(filters[1]).toContain("mark-pen-");
  });

  it.each([
    ["manual", 1],
    ["save", 0],
    ["inferred", 0],
    ["unknown", 0],
  ] as const)("animates a %s mark's %i crossing strokes", (source, strokes) => {
    const button = renderBox("checked", { source });

    expect(button.querySelectorAll(".tracker-checkbox__crossing-stroke")).toHaveLength(strokes);
  });

  it("leaves a gap longer than the stroke, so no round cap shows before it draws", () => {
    const stroke = renderBox("checked", { source: "manual" }).querySelector(
      ".tracker-checkbox__crossing-stroke",
    );

    expect(stroke).toHaveAttribute("stroke-dasharray", "1 2");
    expect(stroke).toHaveAttribute("stroke-dashoffset", "1");
  });
});
