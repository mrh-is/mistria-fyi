import { describe, expect, it } from "vitest";

import { categoryForKey, sortCategoryKeysByName } from "./categories.js";

describe("categoryForKey", () => {
  it("labels the npcs category as Characters", () => {
    expect(categoryForKey("npcs").name).toBe("Characters");
  });
});

describe("sortCategoryKeysByName", () => {
  it("sorts categories by their displayed names", () => {
    expect(sortCategoryKeysByName(["skills", "npcs", "animals"])).toEqual([
      "animals",
      "npcs",
      "skills",
    ]);
  });
});
