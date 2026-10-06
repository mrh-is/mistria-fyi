import { describe, expect, it } from "vitest";

import { SECTION_LIMIT, sectionRenderTarget, trackerRowDisplay } from "#lib/utils/row-display.js";

describe("trackerRowDisplay", () => {
  it("defaults to a visible, undimmed row", () => {
    expect(trackerRowDisplay({ completed: false })).toEqual({ dimmed: false, mode: "visible" });
  });

  it("carries the dimmed flag on visible rows", () => {
    expect(trackerRowDisplay({ completed: false, dimmed: true })).toEqual({
      dimmed: true,
      mode: "visible",
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

describe("sectionRenderTarget", () => {
  it("caps a collapsed section at the limit", () => {
    expect(sectionRenderTarget(SECTION_LIMIT + 10, false)).toBe(SECTION_LIMIT);
    expect(sectionRenderTarget(3, false)).toBe(3);
  });

  it("renders every row once expanded", () => {
    expect(sectionRenderTarget(SECTION_LIMIT + 10, true)).toBe(SECTION_LIMIT + 10);
  });
});
