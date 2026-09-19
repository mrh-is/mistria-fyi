import { describe, expect, it } from "vitest";

import {
  CATEGORY_CAPABILITIES,
  CATEGORY_KEYS,
  categoryForKey,
  categoryKeyForPathname,
  OVERALL_PROGRESS_CATEGORY_KEYS,
  SEARCH_RESULT_CATEGORY_KEYS,
  sortCategoryKeysByName,
} from "./categories";

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

describe("CATEGORY_CAPABILITIES", () => {
  it("has an entry for every category key", () => {
    expect(Object.keys(CATEGORY_CAPABILITIES).sort()).toEqual([...CATEGORY_KEYS].sort());
  });
});

describe("OVERALL_PROGRESS_CATEGORY_KEYS", () => {
  it("only includes categories flagged for overall progress", () => {
    for (const key of OVERALL_PROGRESS_CATEGORY_KEYS) {
      expect(CATEGORY_CAPABILITIES[key].includeInOverallProgress).toBe(true);
    }
  });
});

describe("SEARCH_RESULT_CATEGORY_KEYS", () => {
  it("only contains valid category keys", () => {
    for (const key of SEARCH_RESULT_CATEGORY_KEYS) {
      expect(CATEGORY_KEYS).toContain(key);
    }
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
