import { describe, expect, it } from "vitest";

import {
  CATEGORY_KEYS,
  categoryForKey,
  categoryKeyForPathname,
  SEARCH_RESULT_CATEGORY_KEYS,
  sortCategoryKeysByName,
} from "./categories.js";

describe("categoryForKey", () => {
  it("labels the villagers category with the game's Villagers term", () => {
    expect(categoryForKey("villagers", "en")).toMatchObject({
      href: "villagers",
      name: "Villagers",
    });
  });

  it("maps the villagers route to the villagers category key", () => {
    expect(categoryKeyForPathname("/villagers")).toBe("villagers");
    expect(categoryKeyForPathname("/characters")).toBeUndefined();
  });
});

describe("locale-explicit messages", () => {
  it("renders message-backed names & descriptions in the requested locale, not the ambient one", () => {
    const en = categoryForKey("cosmetics", "en");
    const fr = categoryForKey("cosmetics", "fr");

    expect(fr.name).not.toBe(en.name);
    expect(fr.description).not.toBe(en.description);
    expect(categoryForKey("quests", "fr").name).not.toBe(categoryForKey("quests", "en").name);
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
