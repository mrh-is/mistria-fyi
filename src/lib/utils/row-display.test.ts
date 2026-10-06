import { describe, expect, it } from "vitest";

import { SECTION_ROW_LIMIT, sectionRowLimit, trackerRowDisplay } from "#lib/utils/row-display.js";

describe("trackerRowDisplay", () => {
  it("defaults to a visible, undimmed row", () => {
    expect(trackerRowDisplay({ completed: false })).toEqual({ dimmed: false, mode: "incomplete" });
  });

  it("carries the dimmed flag on visible rows", () => {
    expect(trackerRowDisplay({ completed: false, dimmed: true })).toEqual({
      dimmed: true,
      mode: "incomplete",
    });
  });

  it("marks completed rows and carries the leaving flag", () => {
    expect(trackerRowDisplay({ completed: true })).toEqual({ leaving: false, mode: "completed" });
    expect(trackerRowDisplay({ completed: true, leaving: true })).toEqual({
      leaving: true,
      mode: "completed",
    });
  });

  it("keeps an unrevealed name spoilered even when completed", () => {
    expect(trackerRowDisplay({ completed: true, nameVisible: false })).toEqual({
      mode: "spoilered",
    });
    expect(trackerRowDisplay({ completed: false, nameVisible: false })).toEqual({
      mode: "spoilered",
    });
  });
});

describe("sectionRowLimit", () => {
  it("caps a collapsed section at the limit", () => {
    expect(sectionRowLimit(SECTION_ROW_LIMIT + 10, false)).toBe(SECTION_ROW_LIMIT);
    expect(sectionRowLimit(3, false)).toBe(3);
  });

  it("renders every row once expanded", () => {
    expect(sectionRowLimit(SECTION_ROW_LIMIT + 10, true)).toBe(SECTION_ROW_LIMIT + 10);
  });
});
