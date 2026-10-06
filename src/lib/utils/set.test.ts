import { describe, expect, it } from "vitest";

import { unionInto } from "./set.js";

describe("unionInto", () => {
  it("adds every missing value and returns how many were new", () => {
    const target = new Set(["a", "b"]);

    expect(unionInto(target, ["b", "c", "d"])).toBe(2);
    expect([...target]).toEqual(["a", "b", "c", "d"]);
  });

  it("returns zero and leaves the target alone when nothing is new", () => {
    const target = new Set(["a"]);

    expect(unionInto(target, ["a", "a"])).toBe(0);
    expect([...target]).toEqual(["a"]);
  });

  it("counts a value repeated in the source once", () => {
    expect(unionInto(new Set<string>(), ["a", "a"])).toBe(1);
  });
});
