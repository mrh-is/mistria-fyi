import { describe, expect, it } from "vitest";

import { categoryForKey, categoryKeyForPathname, sortCategoryKeysByName } from "./categories.js";

describe("categoryForKey", () => {
  it("labels the npcs category with the game's Villagers term", () => {
    expect(categoryForKey("npcs")).toMatchObject({ href: "/characters", name: "Villagers" });
  });

  it("maps the characters route to the npcs category key", () => {
    expect(categoryKeyForPathname("/characters")).toBe("npcs");
    expect(categoryKeyForPathname("/npcs")).toBeUndefined();
  });
});

describe("sortCategoryKeysByName", () => {
  it("sorts categories by their displayed names", () => {
    // Animals, Skills, Villagers: npcs sorts by its displayed name, not its key.
    expect(sortCategoryKeysByName(["skills", "npcs", "animals"])).toEqual([
      "animals",
      "skills",
      "npcs",
    ]);
  });
});
