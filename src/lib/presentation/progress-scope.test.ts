import { describe, expect, it } from "vitest";

import {
  addProgress,
  countProgress,
  progressScope,
  progressScopeLabel,
  withProgressScope,
} from "./progress-scope.js";

describe("progressScope", () => {
  it("counts the unfinished rows in scope", () => {
    expect(progressScope({ completed: 192, remainingInScope: 25, total: 409 })).toEqual({
      count: 25,
      kind: "count",
    });
  });

  it("says nothing when filters exclude nothing", () => {
    expect(progressScope({ completed: 48, remainingInScope: 12, total: 60 })).toBeUndefined();
  });

  it("says nothing once everything is finished", () => {
    expect(progressScope({ completed: 60, remainingInScope: 0, total: 60 })).toBeUndefined();
  });

  it("reads as done for now when unfinished rows exist but none are in scope", () => {
    expect(progressScope({ completed: 88, remainingInScope: 0, total: 140 })).toEqual({
      kind: "done",
    });
  });
});

describe("progressScopeLabel", () => {
  it("formats the count for the locale", () => {
    expect(progressScopeLabel({ count: 1200, kind: "count" }, "en")).toBe("1,200 for now");
  });

  it("joins the line onto an accessible name", () => {
    expect(withProgressScope("Museum, 1 of 3 completed", { kind: "done" }, "en")).toBe(
      "Museum, 1 of 3 completed, done for now",
    );
    expect(withProgressScope("Museum", undefined, "en")).toBe("Museum");
  });
});

describe("countProgress", () => {
  it("never counts a completed row as remaining", () => {
    const rows = [
      { done: true, scoped: true },
      { done: false, scoped: true },
      { done: false, scoped: false },
    ];

    expect(
      countProgress(
        rows,
        (row) => row.done,
        (row) => row.scoped,
      ),
    ).toEqual({ completed: 1, remainingInScope: 1, total: 3 });
  });

  it("sums parts", () => {
    const part = { completed: 1, remainingInScope: 2, total: 4 };

    expect(addProgress([part, part])).toEqual({ completed: 2, remainingInScope: 4, total: 8 });
  });
});
