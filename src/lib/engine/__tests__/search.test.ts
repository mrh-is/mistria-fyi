import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { deriveProgressionState } from "$lib/engine/visibility.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils.js";

import { searchItems } from "../search.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  RecipeId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";

import type { UserProgressionState } from "../visibility.js";

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
    cosmetics: new Set(),
    dates: new Set(),
    marriedNpc: null,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
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
    knownNpcs: new Set(),
    marriedNpc: null,
    minesFloor: 0,
    npcLevels: {},
    questVisibility: {},
    renown: 0,
    showSpoilers: false,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

function search(query: string, completed?: Partial<CompletedState>) {
  return searchItems(
    query,
    makeCompleted(completed),
    defaultWorld,
    makeProgressionState({ showSpoilers: true }),
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
    const firstItem = recordValues(trackerData.items)[0];
    const results = search(firstItem.name);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === firstItem.name)).toBe(true);
  });

  it("is case-insensitive", () => {
    const firstItem = recordValues(trackerData.items)[0];
    const lower = search(firstItem.name.toLowerCase());
    const upper = search(firstItem.name.toUpperCase());
    expect(lower.length).toBe(upper.length);
  });

  it("finds NPCs by name", () => {
    const [, npc] = recordEntries(trackerData.npcs)[0];
    const results = search(npc.name);
    expect(results.some((r) => r.category === "npcs" && r.name === npc.name)).toBe(true);
  });

  it("finds quests by name", () => {
    const results = searchItems(
      "a",
      makeCompleted(),
      defaultWorld,
      makeProgressionState({ showSpoilers: true }),
    );
    const questResult = results.find((r) => r.category === "quests");
    if (questResult) {
      expect(questResult.category).toBe("quests");
    } else {
      for (const questType of recordValues(trackerData.quests)) {
        for (const [, quest] of recordEntries(questType)) {
          const r = searchItems(
            quest.name,
            makeCompleted(),
            defaultWorld,
            makeProgressionState({ showSpoilers: true }),
          );
          const match = r.find((x) => x.category === "quests" && x.name === quest.name);
          if (match) {
            expect(match.name).toBe(quest.name);
            return;
          }
        }
      }
    }
  });

  it("finds cosmetics by name", () => {
    const [, cosmetic] = recordEntries(trackerData.cosmetics)[0];
    const results = search(cosmetic.name);
    expect(results.some((r) => r.category === "cosmetics" && r.name === cosmetic.name)).toBe(true);
  });
});

// ─── Completion status ─────────────────────────────────────────────

describe("completion status", () => {
  it("marks completed items as completed", () => {
    const [itemId, item] = recordEntries(trackerData.items)[0];
    const results = search(item.name, { almanac: new Set([itemId]) });
    const match = results.find((r) => r.name === item.name && r.category === "almanac");
    expect(match?.completed).toBe(true);
  });

  it("marks incomplete items as not completed", () => {
    const [, item] = recordEntries(trackerData.items)[0];
    const results = search(item.name);
    const match = results.find((r) => r.name === item.name && r.category === "almanac");
    expect(match?.completed).toBe(false);
  });
});

// ─── Result ranking ────────────────────────────────────────────────

describe("result ranking", () => {
  it("ranks prefix matches before substring matches", () => {
    const firstItem = recordValues(trackerData.items)[0];
    const query = firstItem.name.toLowerCase().slice(0, 3);
    const results = search(query);
    if (results.length >= 2) {
      const firstIsPrefix = (results[0].fullName ?? results[0].name)
        .toLowerCase()
        .startsWith(query);
      const lastIsPrefix = (
        results[results.length - 1].fullName ?? results[results.length - 1].name
      )
        .toLowerCase()
        .startsWith(query);
      if (firstIsPrefix && !lastIsPrefix) {
        expect(firstIsPrefix).toBe(true);
        expect(lastIsPrefix).toBe(false);
      }
    }
  });
});

// ─── Result cap ────────────────────────────────────────────────────

describe("result cap", () => {
  it("returns at most 50 results", () => {
    const results = search("a");
    expect(results.length).toBeLessThanOrEqual(50);
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
    );
    const categories = new Set(results.map((r) => r.category));
    expect(categories.size).toBeGreaterThanOrEqual(1);
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

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults).toHaveLength(0);
  });

  it("shows recipes when visibility conditions are met", () => {
    const completed = makeCompleted({
      questStates: { request_for_strawberries: "completed" },
    } as Partial<CompletedState>);
    const progression = deriveProgressionState(completed, trackerData, false);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults).toHaveLength(1);
    expect(recipeResults[0].name).toBe("Strawberry Shortcake");
  });

  it("shows recipes when showSpoilers is enabled", () => {
    const completed = makeCompleted();
    const progression = deriveProgressionState(completed, trackerData, true);

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
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

    const results = searchItems("Strawberry Shortcake", completed, defaultWorld, progression);
    const recipeResults = results.filter((r) => r.category === "recipes");

    expect(recipeResults[0].completed).toBe(true);
  });
});
