import { describe, expect, it } from "vitest";

import { recordEntries } from "./record.js";

describe("recordEntries", () => {
  it("returns every defined entry", () => {
    expect(recordEntries({ a: 1, b: 2 })).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("skips entries whose value is undefined", () => {
    const record: Partial<Record<"a" | "b", number>> = { a: 1, b: undefined };
    expect(recordEntries(record)).toEqual([["a", 1]]);
  });

  it("keeps falsy values that are defined", () => {
    expect(recordEntries({ a: 0, b: "", c: false, d: null })).toEqual([
      ["a", 0],
      ["b", ""],
      ["c", false],
      ["d", null],
    ]);
  });
});
