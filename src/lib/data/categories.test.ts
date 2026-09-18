import { describe, expect, it } from "vitest";

import { categoryForKey, categoryKeyForPathname, sortCategoryKeysByName } from "./categories";

describe("categoryForKey", () => {
  it("labels the villagers category with the game's Villagers term", () => {
    expect(categoryForKey("villagers", "en")).toMatchObject({
      href: "/villagers",
      name: "Villagers",
    });
  });

  it("maps the villagers route to the villagers category key", () => {
    expect(categoryKeyForPathname("/villagers")).toBe("villagers");
    expect(categoryKeyForPathname("/characters")).toBeUndefined();
  });
});

describe("sortCategoryKeysByName", () => {
  it("sorts categories by their displayed names", () => {
    // Animals, Skills, Villagers: villagers sorts by its displayed name, not its key.
    expect(sortCategoryKeysByName(["skills", "villagers", "animals"], "en")).toEqual([
      "animals",
      "skills",
      "villagers",
    ]);
  });
});
