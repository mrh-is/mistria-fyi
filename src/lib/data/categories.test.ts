import { describe, expect, it } from "vitest";

import { categoryForKey, categoryKeyForPathname, sortCategoryKeysByName } from "./categories.js";

describe("categoryForKey", () => {
  it("labels the npcs category as Characters", () => {
    expect(categoryForKey("npcs")).toMatchObject({ href: "/characters", name: "Characters" });
  });

  it("maps the characters route to the npcs category key", () => {
    expect(categoryKeyForPathname("/characters")).toBe("npcs");
    expect(categoryKeyForPathname("/npcs")).toBeUndefined();
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
