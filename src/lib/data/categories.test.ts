import { describe, expect, it } from "vitest";

import { CATEGORY_KEYS } from "#lib/engine/categories.js";

import { categoryForKey, categoryKeyForPathname, sortCategoryKeysByName } from "./categories.js";

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

describe("categoryKeyForPathname", () => {
  it("maps every category's registry route back to its key", () => {
    for (const key of CATEGORY_KEYS) {
      expect(categoryKeyForPathname(`/${categoryForKey(key, "en").href}`)).toBe(key);
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
