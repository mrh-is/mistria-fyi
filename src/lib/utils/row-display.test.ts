import { describe, expect, it } from "vitest";

import { trackerRowDisplay } from "#lib/utils/row-display.js";

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

  it("keeps a spoilered name spoilered even when completed", () => {
    expect(trackerRowDisplay({ completed: true, spoilered: true })).toEqual({
      mode: "spoilered",
    });
    expect(trackerRowDisplay({ completed: false, spoilered: true })).toEqual({
      mode: "spoilered",
    });
  });
});
