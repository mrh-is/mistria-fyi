import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { animalNameId, getName } from "$lib/data/names.js";
import { deriveProgressionState } from "$lib/engine/visibility.js";
import { recordEntries, recordKeys } from "$lib/utils.js";

import { searchItems } from "../search";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  QuestId,
  RecipeId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";

import type { UserProgressionState } from "../visibility";

// ─── Helpers ───────────────────────────────────────────────────────

function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
  const animals: Record<string, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const animalId of recordKeys(trackerData.animals)) {
    animals[animalId] = new Set();
    animalCosmetics[animalId] = new Set();
  }

  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics,
    animals,
    childChoice: "undeclared",
    cosmetics: new Set(),
    dates: new Set(),
    hasUpperFloor: false,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    npcRelationships: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

const defaultWorld: { season: Season; weather: Weather } = {
  season: "spring",
  weather: "calm",
};

function makeProgressionState(overrides: Partial<UserProgressionState> = {}): UserProgressionState {
  return {
    hasUpperFloor: false,
    isDating: false,
    knownNpcs: new Set(),
    marriedNpc: null,
    minesFloor: 0,
    npcLevels: {},
    questVisibility: {},
    reachedSeason: "spring" as const,
    renown: 0,
    showSpoilers: false,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

function museumOnlyFixture() {
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      for (const itemId of set.items) {
        const name = getName("items", itemId, "en");
        const result = search(name).find(
          (candidate) => candidate.category === "museum" && candidate.id === itemId,
        );
        if (result) return { itemId, name, result };
      }
    }
  }
  throw new Error("Expected tracker data to contain a searchable museum-only item");
}

function search(query: string, completed?: Partial<CompletedState>) {
  return searchItems(
    query,
    makeCompleted(completed),
    defaultWorld,
    makeProgressionState({ showSpoilers: true }),
    "en",
  );
}

// ─── Empty & whitespace queries ────────────────────────────────────

describe("empty and whitespace queries", () => {
  it("returns empty for empty string", () => {
    expect(search("")).toEqual([]);
  });

  it("returns empty for whitespace-only", () => {
    expect(search("   ")).toEqual([]);
  });
});

// ─── Basic matching ────────────────────────────────────────────────

describe("basic matching", () => {
  it("finds items by name substring", () => {
    const [firstItemId] = recordEntries(trackerData.items)[0];
    const firstItemName = getName("items", firstItemId, "en");
    const results = search(firstItemName);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === firstItemName)).toBe(true);
  });

  it("is case-insensitive", () => {
    const [firstItemId] = recordEntries(trackerData.items)[0];
    const firstItemName = getName("items", firstItemId, "en");
    const lower = search(firstItemName.toLowerCase());
    const upper = search(firstItemName.toUpperCase());
    expect(lower.length).toBe(upper.length);
  });

  it("finds NPCs by name", () => {
    const [npcId] = recordEntries(trackerData.npcs)[0];
    const npcName = getName("npcs", npcId, "en");
    const results = search(npcName);
    expect(results.some((r) => r.category === "npcs" && r.name === npcName)).toBe(true);
  });

  it("finds quests by name", () => {
    // "The Manor" is a known quest; search for its full name.
    const results = search("The Manor");
    const questResult = results.find((r) => r.category === "quests" && r.name === "The Manor");
    expect(questResult, "quest 'The Manor' should appear in results").toBeDefined();
  });

  it("finds cosmetics by name", () => {
    const [cosmeticId] = recordEntries(trackerData.cosmetics)[0];
    const name = getName("cosmetics", cosmeticId, "en");
    const results = search(name);
    expect(results.some((r) => r.category === "cosmetics" && r.name === name)).toBe(true);
  });

  it("finds an animal cosmetic by its full English name in another locale", () => {
    const [animalId, animal] = recordEntries(trackerData.animals)[0];
    const [cosmeticId] = recordEntries(animal.cosmetics)[0];
    const englishFullName = `${getName("animals", animalNameId(animalId, "core"), "en")} ${getName("animals", animalNameId(animalId, "cosmetics", cosmeticId), "en")}`;
    const results = searchItems(
      englishFullName,
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "ja",
    );

    expect(
      results.some(
        (result) => result.category === "animals" && result.id === `${animalId}:${cosmeticId}`,
      ),
    ).toBe(true);
  });

  it("matches a translated query across categories with localized result names", () => {
    // "ベジタブルスープ" (vegetable soup) is both an almanac item and a recipe in Japanese, so a
    // single non-English query must surface localized names from two categories at once.
    const results = searchItems(
      "ベジタブルスープ",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "ja",
    );

    const categories = new Set(results.map((result) => result.category));
    expect(categories.has("almanac")).toBe(true);
    expect(categories.has("recipes")).toBe(true);
    expect(results.every((result) => result.name === "ベジタブルスープ")).toBe(true);
  });

  it("matches the English fallback term while reporting the localized name", () => {
    const results = searchItems(
      "Vegetable Soup",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "ja",
    );

    const recipe = results.find((result) => result.category === "recipes");
    expect(recipe?.name).toBe("ベジタブルスープ");
  });
});

// ─── Completion status ─────────────────────────────────────────────

describe("completion status", () => {
  it("marks completed items as completed", () => {
    const [itemId] = recordEntries(trackerData.items)[0];
    const itemName = getName("items", itemId, "en");
    const results = search(itemName, { almanac: new Set([itemId]) });
    const match = results.find((r) => r.name === itemName && r.category === "almanac");
    expect(match?.completed).toBe(true);
  });

  it("marks incomplete items as not completed", () => {
    const [itemId] = recordEntries(trackerData.items)[0];
    const itemName = getName("items", itemId, "en");
    const results = search(itemName);
    const match = results.find((r) => r.name === itemName && r.category === "almanac");
    expect(match?.completed).toBe(false);
  });
});

// ─── Result ranking ────────────────────────────────────────────────

describe("result ranking", () => {
  it("ranks prefix matches before substring matches", () => {
    // "rei" prefix-matches NPC "Reina" and substring-matches "Song Crystal - Reina's Theme"
    const results = search("rei");
    expect(results.length).toBeGreaterThanOrEqual(2);

    const reina = results.find((r) => r.category === "npcs" && r.id === "reina");
    expect(reina, "Reina should appear in results").toBeDefined();
    if (!reina) return;

    const reinaIdx = results.indexOf(reina);
    const substringBefore = results.slice(0, reinaIdx).filter((r) => {
      const name = (r.fullName ?? r.name).toLowerCase();
      return !name.startsWith("rei");
    });
    expect(
      substringBefore,
      "no substring-only match should rank above a prefix match",
    ).toHaveLength(0);

    const substringAfter = results.slice(reinaIdx + 1).filter((r) => {
      const name = (r.fullName ?? r.name).toLowerCase();
      return !name.startsWith("rei");
    });
    expect(
      substringAfter.length,
      "at least one substring-only match should follow the prefix match",
    ).toBeGreaterThan(0);
  });
});

// ─── Result cap ────────────────────────────────────────────────────

describe("result cap", () => {
  it("returns at most 50 results", () => {
    const results = search("a");
    expect(results.length).toBeLessThanOrEqual(50);
  });
});

// ─── Ranking before truncation ────────────────────────────────────

describe("ranking before truncation", () => {
  it("includes later-category prefix matches even when earlier categories fill the cap", () => {
    const results = searchItems(
      "a",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "en",
    );

    const categories = new Set(results.map((r) => r.category));
    expect(
      categories.size,
      "broad query should return results from more than one category",
    ).toBeGreaterThan(1);
  });

  it("ranks a later-category prefix match above an earlier-category substring match", () => {
    // "nor" prefix-matches NPC "Nora" (later category) and substring-matches
    // quest "The Manor" (earlier category). The prefix must outrank the substring.
    const results = search("nor");

    const nora = results.find((r) => r.category === "npcs" && r.id === "nora");
    expect(nora, "Nora should appear in results").toBeDefined();

    const manor = results.find((r) => r.name === "The Manor");
    expect(manor, "The Manor should appear as a substring match").toBeDefined();
    if (!nora || !manor) return;

    const noraIdx = results.indexOf(nora);
    const manorIdx = results.indexOf(manor);
    expect(noraIdx, "prefix match Nora should rank before substring match The Manor").toBeLessThan(
      manorIdx,
    );
  });

  it("breaks ties alphabetically within the same rank tier", () => {
    // "ade" prefix-matches NPC "Adeline" and several other items. Among the
    // substring-only matches, results should be sorted alphabetically by name.
    const results = search("ade");
    const substringOnly = results.filter((r) => {
      const name = (r.fullName ?? r.name).toLowerCase();
      return !name.startsWith("ade");
    });
    expect(substringOnly.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < substringOnly.length; i++) {
      const prev = (substringOnly[i - 1].fullName ?? substringOnly[i - 1].name).toLowerCase();
      const curr = (substringOnly[i].fullName ?? substringOnly[i].name).toLowerCase();
      expect(
        prev.localeCompare(curr),
        `"${prev}" should sort before or equal "${curr}"`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it("collects candidates from all categories before truncating to cap", () => {
    const results = searchItems(
      "e",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "en",
    );

    expect(results.length).toBeLessThanOrEqual(50);

    const categories = new Set(results.map((r) => r.category));
    expect(
      categories.size,
      "results for a very broad query should span multiple categories after ranking",
    ).toBeGreaterThan(1);
  });
});

// ─── Cross-category coverage ───────────────────────────────────────

describe("cross-category coverage", () => {
  it("searches across multiple categories", () => {
    const results = searchItems(
      "e",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
      "en",
    );
    const categories = new Set(results.map((r) => r.category));
    expect(
      categories.size,
      "broad query should return results from multiple categories",
    ).toBeGreaterThan(1);
  });
});

// ─── SearchResult shape ────────────────────────────────────────────

describe("result shape", () => {
  it("every result has required fields", () => {
    const results = search("a");
    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("category");
      expect(r).toHaveProperty("completed");
      expect(r).toHaveProperty("available");
      expect(typeof r.id).toBe("string");
      expect(typeof r.name).toBe("string");
      expect(typeof r.completed).toBe("boolean");
      expect(typeof r.available).toBe("boolean");
    }
  });
});

// ─── Recipe visibility ─────────────────────────────────────────────

describe("recipe visibility", () => {
  it("hides recipes gated by unmet visibility conditions", () => {
    const completed = makeCompleted();
    const progression = deriveProgressionState(completed, trackerData, false);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression, "en");
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults).toHaveLength(0);
  });

  it("shows recipes when visibility conditions are met", () => {
    const completed = makeCompleted({
      questStates: { request_for_strawberries: "completed" },
    } as Partial<CompletedState>);
    const progression = deriveProgressionState(completed, trackerData, false);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression, "en");
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults).toHaveLength(1);
    expect(recipeResults[0].name).toBe("Strawberry Shortcake");
  });

  it("shows recipes when showSpoilers is enabled", () => {
    const completed = makeCompleted();
    const progression = deriveProgressionState(completed, trackerData, true);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression, "en");
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults).toHaveLength(1);
    expect(recipeResults[0].name).toBe("Strawberry Shortcake");
  });

  it("marks recipe results as completed when in almanacRecipes", () => {
    const completed = makeCompleted({
      almanacRecipes: new Set(["strawberry_shortcake" as RecipeId]),
      questStates: { request_for_strawberries: "completed" },
    } as Partial<CompletedState>);
    const progression = deriveProgressionState(completed, trackerData, false);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression, "en");
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults[0].completed).toBe(true);
  });
});

// ─── Colorway deduplication ──────────────────────────────────────

describe("colorway deduplication", () => {
  it("produces one deduplicated result for a collapsed colorway group", () => {
    const results = search("Animated Waterfall");
    const almanacResults = results.filter(
      (r) => r.category === "almanac" && r.name === "Animated Waterfall",
    );
    expect(almanacResults).toHaveLength(1);
  });

  it("uses the canonical (alphabetically-first) ID", () => {
    const results = search("Animated Waterfall");
    const match = results.find((r) => r.category === "almanac" && r.name === "Animated Waterfall");
    expect(match?.id).toBe("animated_waterfall_v1");
  });

  it("marks the canonical entry complete when its canonical ID is in completed set", () => {
    const results = search("Animated Waterfall", {
      almanac: new Set(["animated_waterfall_v1" as never]),
    });
    const match = results.find((r) => r.category === "almanac" && r.name === "Animated Waterfall");
    expect(match?.completed).toBe(true);
  });
});

describe("multi-category almanac items", () => {
  it("produces one result when an item appears in multiple almanac categories", () => {
    const almanacResults = search("Spirula Shell").filter(
      (result) => result.category === "almanac" && result.name === "Spirula Shell",
    );

    expect(almanacResults).toHaveLength(1);
  });
});

// ─── Pregnancy quest filtering ────────────────────────────────────

describe("pregnancy quest filtering", () => {
  const pregnancyQuestIds = Object.values(trackerData.pregnancyQuestByNpc).filter(
    (id): id is QuestId => id !== undefined,
  );

  it("excludes individual pregnancy quests from search results", () => {
    for (const questId of pregnancyQuestIds) {
      const results = search(getName("quests", questId, "en"));
      const match = results.find((r) => r.category === "quests" && r.id === questId);
      expect(match, `pregnancy quest ${questId} should not appear in search`).toBeUndefined();
    }
  });
});

// ─── Museum results ─────────────────────────────────────────────

describe("museum results", () => {
  it("returns museum category for museum-only items", () => {
    const { result } = museumOnlyFixture();
    expect(result.category).toBe("museum");
  });

  it("uses raw item ID (not prefixed) for museum results", () => {
    const { itemId, result } = museumOnlyFixture();
    expect(result.id).toBe(itemId);
    expect(result.id).not.toContain(":");
  });

  it("marks museum items as completed when in completed.museum", () => {
    const { itemId, name } = museumOnlyFixture();
    const museumMatch = search(name, { museum: new Set([itemId]) }).find(
      (result) => result.category === "museum" && result.id === itemId,
    );
    expect(museumMatch).toBeDefined();
    expect(museumMatch?.completed).toBe(true);
  });
});

// ─── Pet cosmetic & skin results ──────────────────────────────

describe("pet cosmetic and skin result IDs", () => {
  it("prefixes pet cosmetic IDs with 'pet-cosmetic:'", () => {
    const [firstId] = recordEntries(trackerData.pets.cosmetics)[0];
    const results = search(getName("pets/cosmetic_sets", firstId, "en"));
    const match = results.find(
      (r) => r.category === "animals" && r.id === `pet-cosmetic:${firstId}`,
    );
    expect(match).toBeDefined();
    expect(match?.id).toBe(`pet-cosmetic:${firstId}`);
  });

  it("marks pet cosmetics as completed when in completed.petCosmetics", () => {
    const [firstId] = recordEntries(trackerData.pets.cosmetics)[0];
    const results = search(getName("pets/cosmetic_sets", firstId, "en"), {
      petCosmetics: new Set([firstId]),
    });
    const match = results.find(
      (r) => r.category === "animals" && r.id === `pet-cosmetic:${firstId}`,
    );
    expect(match?.completed).toBe(true);
  });

  it("prefixes pet skin IDs with 'pet-skin:'", () => {
    const [firstId] = recordEntries(trackerData.pets.skins)[0];
    const results = search(getName("pets/skins", firstId, "en"));
    const match = results.find((r) => r.category === "animals" && r.id === `pet-skin:${firstId}`);
    expect(match).toBeDefined();
    expect(match?.id).toBe(`pet-skin:${firstId}`);
  });

  it("marks pet skins as completed when in completed.petSkins", () => {
    const [firstId] = recordEntries(trackerData.pets.skins)[0];
    const results = search(getName("pets/skins", firstId, "en"), {
      petSkins: new Set([firstId]),
    });
    const match = results.find((r) => r.category === "animals" && r.id === `pet-skin:${firstId}`);
    expect(match?.completed).toBe(true);
  });
});
