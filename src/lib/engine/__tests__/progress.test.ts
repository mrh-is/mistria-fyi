import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils.js";

import {
  clampRenownLevel,
  getAllProgress,
  getCategoryProgress,
  MAX_NPC_LEVEL,
  MAX_SKILL_LEVEL,
} from "../progress.js";

import type { CategoryKey } from "$lib/data/categories.js";
import type {
  AvailabilityMode,
  CompletedState,
  QuestState,
} from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  QuestId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";

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

const defaultWorld = { season: "spring" as Season, weather: "calm" as Weather };

function ctx(
  overrides: Partial<{
    availabilityMode: AvailabilityMode;
    completed: Partial<CompletedState>;
    worldState: { season: Season; weather: Weather };
  }> = {},
) {
  return {
    availabilityMode: overrides.availabilityMode ?? "everything",
    completed: makeCompleted(overrides.completed ?? {}),
    worldState: overrides.worldState ?? defaultWorld,
  };
}

// ─── clampRenownLevel ──────────────────────────────────────────────

describe("clampRenownLevel", () => {
  const maxLevel = trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;

  it("clamps negative values to zero", () => {
    expect(clampRenownLevel(-5)).toBe(0);
  });

  it("returns valid level unchanged", () => {
    expect(clampRenownLevel(3)).toBe(3);
  });

  it("clamps values above max to max", () => {
    expect(clampRenownLevel(maxLevel + 10)).toBe(maxLevel);
  });

  it("returns zero for zero", () => {
    expect(clampRenownLevel(0)).toBe(0);
  });

  it("returns max for max", () => {
    expect(clampRenownLevel(maxLevel)).toBe(maxLevel);
  });
});

// ─── getAllProgress ────────────────────────────────────────────────

describe("getAllProgress", () => {
  it("returns progress for every category", () => {
    const progress = getAllProgress(ctx());
    const expectedCategories: CategoryKey[] = [
      "almanac",
      "animals",
      "cosmetics",
      "mines",
      "museum",
      "npcs",
      "quests",
      "recipes",
      "renown",
      "skills",
    ];
    expect(Object.keys(progress).sort()).toEqual(expectedCategories.sort());
  });

  it("reports zero completed when nothing is marked", () => {
    const progress = getAllProgress(ctx());
    for (const [, cat] of recordEntries(progress)) {
      expect(cat.completed).toBe(0);
    }
  });

  it("reports non-zero totals for every category", () => {
    const progress = getAllProgress(ctx());
    for (const [, cat] of recordEntries(progress)) {
      expect(cat.total).toBeGreaterThan(0);
    }
  });

  it("has filtered + completed equal total for every category (in everything mode)", () => {
    const progress = getAllProgress(ctx({ availabilityMode: "everything" }));
    for (const [key, cat] of recordEntries(progress)) {
      expect(cat.filtered + cat.completed, `${key}: filtered + completed !== total`).toBe(
        cat.total,
      );
    }
  });
});

// ─── getCategoryProgress ───────────────────────────────────────────

describe("getCategoryProgress", () => {
  it("matches getAllProgress for each category", () => {
    const c = ctx();
    const all = getAllProgress(c);
    for (const key of recordKeys(all)) {
      expect(getCategoryProgress(key, c)).toEqual(all[key]);
    }
  });
});

// ─── Category-specific progress ────────────────────────────────────

describe("almanac progress", () => {
  it("counts items across all almanac sub-categories", () => {
    const progress = getCategoryProgress("almanac", ctx());
    const expectedTotal = recordValues(trackerData.almanac).reduce(
      (sum, cat) => sum + cat.items.length,
      0,
    );
    expect(progress.total).toBe(expectedTotal);
  });

  it("reflects completed almanac items", () => {
    const allIds = recordValues(trackerData.almanac).flatMap(({ items }) => items);
    const subset = new Set(allIds.slice(0, 3));
    const progress = getCategoryProgress("almanac", ctx({ completed: { almanac: subset } }));
    expect(progress.completed).toBe(3);
  });
});

describe("cosmetics progress", () => {
  it("total equals count of cosmetics in tracker data", () => {
    const progress = getCategoryProgress("cosmetics", ctx());
    expect(progress.total).toBe(recordKeys(trackerData.cosmetics).length);
  });

  it("reflects completed cosmetics", () => {
    const ids = recordKeys(trackerData.cosmetics).slice(0, 5);
    const progress = getCategoryProgress(
      "cosmetics",
      ctx({ completed: { cosmetics: new Set(ids) } }),
    );
    expect(progress.completed).toBe(5);
  });
});

describe("npcs progress", () => {
  it("total is npc count times MAX_NPC_LEVEL plus date count", () => {
    const progress = getCategoryProgress("npcs", ctx());
    const expectedNpcTotal = recordKeys(trackerData.npcs).length * MAX_NPC_LEVEL;
    const expectedDateTotal = recordKeys(trackerData.dates).length;
    expect(progress.total).toBe(expectedNpcTotal + expectedDateTotal);
  });

  it("caps individual NPC levels at MAX_NPC_LEVEL", () => {
    const npcId = recordKeys(trackerData.npcs)[0];
    const progress = getCategoryProgress(
      "npcs",
      ctx({ completed: { npcLevels: { [npcId]: 999 } } }),
    );
    expect(progress.completed).toBe(MAX_NPC_LEVEL);
  });
});

describe("quests progress", () => {
  it("total matches total quest count across all types", () => {
    const progress = getCategoryProgress("quests", ctx());
    let expected = 0;
    for (const questType of recordValues(trackerData.quests)) {
      expected += recordKeys(questType).length;
    }
    expect(progress.total).toBe(expected);
  });

  it("counts only completed quest states", () => {
    const allQuestIds: QuestId[] = [];
    for (const questType of recordValues(trackerData.quests)) {
      allQuestIds.push(...recordKeys(questType));
    }
    const questStates = {
      [allQuestIds[0]]: "completed",
      [allQuestIds[1]]: "obtained",
      [allQuestIds[2]]: "none",
    } as Record<QuestId, QuestState>;
    const progress = getCategoryProgress("quests", ctx({ completed: { questStates } }));
    expect(progress.completed).toBe(1);
  });
});

describe("recipes progress", () => {
  it("total equals recipe count", () => {
    const progress = getCategoryProgress("recipes", ctx());
    expect(progress.total).toBe(recordKeys(trackerData.recipes).length);
  });

  it("reflects completed recipes via almanacRecipes set", () => {
    const ids = recordKeys(trackerData.recipes).slice(0, 2);
    const progress = getCategoryProgress(
      "recipes",
      ctx({ completed: { almanacRecipes: new Set(ids) } }),
    );
    expect(progress.completed).toBe(2);
  });
});

describe("renown progress", () => {
  it("total equals max rank level", () => {
    const maxLevel = trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;
    const progress = getCategoryProgress("renown", ctx());
    expect(progress.total).toBe(maxLevel);
  });

  it("clamps renown at max", () => {
    const maxLevel = trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;
    const progress = getCategoryProgress("renown", ctx({ completed: { renown: maxLevel + 100 } }));
    expect(progress.completed).toBe(maxLevel);
  });

  it("clamps negative renown to zero", () => {
    const progress = getCategoryProgress("renown", ctx({ completed: { renown: -5 } }));
    expect(progress.completed).toBe(0);
  });
});

describe("skills progress", () => {
  it("total is skill count times MAX_SKILL_LEVEL", () => {
    const progress = getCategoryProgress("skills", ctx());
    expect(progress.total).toBe(recordKeys(trackerData.skills).length * MAX_SKILL_LEVEL);
  });

  it("caps individual skill levels at MAX_SKILL_LEVEL", () => {
    const skillId = recordKeys(trackerData.skills)[0];
    const progress = getCategoryProgress(
      "skills",
      ctx({ completed: { skillLevels: { [skillId]: 999 } } }),
    );
    expect(progress.completed).toBe(MAX_SKILL_LEVEL);
  });
});

describe("mines progress", () => {
  it("total includes both floors and spells", () => {
    const progress = getCategoryProgress("mines", ctx());
    const biomes = trackerData.mines.biomes;
    const maxFloor = biomes[biomes.length - 1].floors.end;
    const spellCount = recordKeys(trackerData.mines.spells).length;
    expect(progress.total).toBe(maxFloor + spellCount);
  });

  it("reflects floor and spell completion", () => {
    const spellId = recordKeys(trackerData.mines.spells)[0];
    const progress = getCategoryProgress(
      "mines",
      ctx({ completed: { mines: { floor: 10, spells: new Set([spellId]) } } }),
    );
    expect(progress.completed).toBe(11);
  });
});

describe("animals progress", () => {
  it("includes variants, animal cosmetics, pet cosmetics, and pet skins", () => {
    const progress = getCategoryProgress("animals", ctx());
    let expectedTotal = 0;
    for (const animal of recordValues(trackerData.animals)) {
      expectedTotal += recordKeys(animal.cosmetics).length;
      for (const tier of animal.variantTiers) {
        expectedTotal += recordKeys(tier).length;
      }
    }
    expectedTotal += recordKeys(trackerData.pets.cosmetics).length;
    expectedTotal += recordKeys(trackerData.pets.skins).length;
    expect(progress.total).toBe(expectedTotal);
  });
});

// ─── Availability filtering ────────────────────────────────────────

describe("availability filtering on item-based categories", () => {
  it("available mode may reduce filtered count compared to everything mode", () => {
    const c1 = ctx({ availabilityMode: "everything" });
    const c2 = ctx({ availabilityMode: "available" });
    const everything = getCategoryProgress("almanac", c1);
    const available = getCategoryProgress("almanac", c2);
    expect(available.filtered).toBeLessThanOrEqual(everything.filtered);
  });

  it("completed count is the same regardless of availability mode", () => {
    const allIds = recordValues(trackerData.almanac).flatMap(({ items }) => items);
    const subset = new Set(allIds.slice(0, 3));
    const c1 = ctx({ availabilityMode: "everything", completed: { almanac: subset } });
    const c2 = ctx({ availabilityMode: "available", completed: { almanac: subset } });
    expect(getCategoryProgress("almanac", c1).completed).toBe(
      getCategoryProgress("almanac", c2).completed,
    );
  });
});
