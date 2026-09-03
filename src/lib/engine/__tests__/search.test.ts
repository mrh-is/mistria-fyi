import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { deriveProgressionState } from "$lib/engine/visibility.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils.js";

import { searchItems } from "../search.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  QuestId,
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
    // "The Manor" is a known quest; search for its full name.
    const results = search("The Manor");
    const questResult = results.find((r) => r.category === "quests" && r.name === "The Manor");
    expect(questResult, "quest 'The Manor' should appear in results").toBeDefined();
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
      const quest = trackerData.quests.heart[questId];
      const results = search(quest.name);
      const match = results.find((r) => r.category === "quests" && r.id === questId);
      expect(match, `pregnancy quest ${questId} should not appear in search`).toBeUndefined();
    }
  });
});
