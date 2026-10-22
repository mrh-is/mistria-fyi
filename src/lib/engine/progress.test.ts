import { describe, expect, it } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isVariantInScope } from "#lib/engine/animal-availability.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

import {
  getAllProgress,
  getCategoryProgress,
  getOverallProgress,
  isCategoryComplete,
} from "./categories.js";
import {
  clampRenownLevel,
  getMaxMineFloor,
  getMaxRenownLevel,
  isVillagerComplete,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "./progress.js";

import type { CategoryKey } from "#lib/engine/categories.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type {
  AnimalVariantId,
  QuestId,
  Season,
  VillagerId,
  VillagerRelationship,
  Weather,
} from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";

/** Window selections named for the retired availability modes, kept as test presets. */
const WINDOW_PRESETS = {
  available: DEFAULT_AVAILABILITY_WINDOWS,
  everything: AVAILABILITY_WINDOWS,
  timely: ["now"],
} satisfies Record<string, readonly AvailabilityWindow[]>;
type WindowPreset = keyof typeof WINDOW_PRESETS;

// ─── Helpers ───────────────────────────────────────────────────────

const defaultWorld = { season: "spring" as Season, weather: "calm" as Weather };

function ctx(
  overrides: Partial<{
    completed: Partial<ProgressState>;
    windowPreset: WindowPreset;
    worldState: { season: Season; weather: Weather };
  }> = {},
) {
  return {
    availabilityWindows: [...WINDOW_PRESETS[overrides.windowPreset ?? "everything"]],
    progress: makeCompletedState(overrides.completed ?? {}),
    worldState: overrides.worldState ?? defaultWorld,
  };
}

function firstKey<K extends string>(record: Record<K, unknown>): K {
  return recordKeys(record)[0];
}

function rel(
  villager: string,
  relationship: VillagerRelationship,
): Partial<Record<VillagerId, VillagerRelationship>> {
  return { [villager as VillagerId]: relationship };
}

/** Every category at 100%: married to Adeline with a child, every other dateable Villager platonic. */
function fullyCompletedState(): ProgressState {
  const animals: ProgressState["animals"] = {};
  const animalCosmetics: ProgressState["animalCosmetics"] = {};
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    animals[animalId] = new Set(animal.variantTiers.flatMap((tier) => recordKeys(tier)));
    animalCosmetics[animalId] = new Set(recordKeys(animal.cosmetics));
  }
  const questStates: ProgressState["questStates"] = {};
  for (const byType of recordValues(trackerData.quests)) {
    for (const id of recordKeys(byType)) questStates[id] = "completed";
  }
  const heartLevels: ProgressState["heartLevels"] = {};
  const villagerRelationships: ProgressState["villagerRelationships"] = {};
  for (const [id, villager] of recordEntries(trackerData.villagers)) {
    heartLevels[id] = MAX_HEART_LEVEL;
    if (villager.dateable) villagerRelationships[id] = "platonic";
  }
  villagerRelationships["adeline" as VillagerId] = "married";
  const skillLevels: ProgressState["skillLevels"] = {};
  for (const id of recordKeys(trackerData.skills)) skillLevels[id] = MAX_SKILL_LEVEL;

  return makeCompletedState({
    almanac: new Set(trackerIndex.almanacCanonicalIds),
    almanacRecipes: new Set(recordKeys(trackerData.recipes)),
    animalCosmetics,
    animals,
    childChoice: "yes",
    cosmetics: new Set(recordKeys(trackerData.cosmetics)),
    heartLevels,
    mineFloor: getMaxMineFloor(),
    mountAppearances: new Set(recordKeys(trackerData.mount.appearances)),
    museum: new Set(
      recordValues(trackerData.museum).flatMap(({ sets }) =>
        recordValues(sets).flatMap(({ items }) => items),
      ),
    ),
    petCosmetics: new Set(recordKeys(trackerData.pets.cosmetics)),
    petSkins: new Set(recordKeys(trackerData.pets.skins)),
    questStates,
    renown: getMaxRenownLevel(),
    skillLevels,
    spells: new Set(recordKeys(trackerData.mines.spells)),
    villagerRelationships,
  });
}

// ─── clampRenownLevel ──────────────────────────────────────────────

describe("clampRenownLevel", () => {
  const maxLevel = getMaxRenownLevel();

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
      "villagers",
      "quests",
      "recipes",
      "renown",
      "skills",
    ];
    expect(Object.keys(progress).toSorted()).toEqual(expectedCategories.toSorted());
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
    const progress = getAllProgress(ctx({ windowPreset: "everything" }));
    for (const [key, cat] of recordEntries(progress)) {
      expect(cat.remainingInScope + cat.completed, `${key}: filtered + completed !== total`).toBe(
        cat.total,
      );
    }
  });
});

// ─── getOverallProgress ────────────────────────────────────────────

describe("getOverallProgress", () => {
  it("sums to the same totals as reducing every category directly", () => {
    const all = getAllProgress(ctx());
    const expected = { completed: 0, remainingInScope: 0, total: 0 };
    for (const p of Object.values(all)) {
      expected.completed += p.completed;
      expected.remainingInScope += p.remainingInScope;
      expected.total += p.total;
    }
    expect(getOverallProgress(all)).toEqual(expected);
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

describe("isCategoryComplete", () => {
  it("is false for every category on a fresh save", () => {
    const c = ctx();
    for (const key of recordKeys(getAllProgress(c))) {
      expect(isCategoryComplete(key, c), key).toBe(false);
    }
  });

  it("is true for every category on a fully completed save", () => {
    const c = { ...ctx(), progress: fullyCompletedState() };
    for (const [key, progress] of recordEntries(getAllProgress(c))) {
      expect(progress.completed, key).toBe(progress.total);
      expect(isCategoryComplete(key, c), key).toBe(true);
    }
  });

  it("agrees with progress when one item is missing from each category", () => {
    const full = fullyCompletedState();
    const missingOne: Record<CategoryKey, ProgressState> = {
      almanac: { ...full, almanac: new Set([...full.almanac].slice(1)) },
      animals: { ...full, petSkins: new Set([...full.petSkins].slice(1)) },
      cosmetics: { ...full, cosmetics: new Set([...full.cosmetics].slice(1)) },
      mines: { ...full, mineFloor: full.mineFloor - 1 },
      museum: { ...full, museum: new Set([...full.museum].slice(1)) },
      quests: {
        ...full,
        questStates: { ...full.questStates, [firstKey(trackerData.quests.story)]: "obtained" },
      },
      recipes: { ...full, almanacRecipes: new Set([...full.almanacRecipes].slice(1)) },
      renown: { ...full, renown: full.renown - 1 },
      skills: {
        ...full,
        skillLevels: { ...full.skillLevels, [firstKey(trackerData.skills)]: MAX_SKILL_LEVEL - 1 },
      },
      villagers: {
        ...full,
        villagerRelationships: { ...full.villagerRelationships, adeline: "romantic" } as Partial<
          Record<VillagerId, VillagerRelationship>
        >,
      },
    };
    for (const [key, completed] of recordEntries(missingOne)) {
      const c = { ...ctx(), completed };
      const progress = getCategoryProgress(key, c);
      expect(progress.completed, key).toBeLessThan(progress.total);
      expect(isCategoryComplete(key, c), key).toBe(false);
    }
  });

  it("agrees with isVillagerComplete across the whole roster", () => {
    const full = fullyCompletedState();
    const roster = recordKeys(trackerData.villagers);
    expect(roster.every((id) => isVillagerComplete(id, full))).toBe(true);
    expect(isCategoryComplete("villagers", { ...ctx(), progress: full })).toBe(true);

    const undecided = {
      ...full,
      villagerRelationships: { ...full.villagerRelationships, adeline: "undecided" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    };
    expect(isVillagerComplete("adeline" as VillagerId, undecided)).toBe(false);
    expect(isCategoryComplete("villagers", { ...ctx(), progress: undecided })).toBe(false);
  });
});

// ─── Category-specific progress ────────────────────────────────────

describe("almanac progress", () => {
  it("counts entries across all almanac sub-categories", () => {
    const progress = getCategoryProgress("almanac", ctx());
    const expectedTotal = recordValues(trackerData.almanac).reduce(
      (sum, cat) => sum + cat.items.length,
      0,
    );
    expect(progress.total).toBe(expectedTotal);
  });

  it("reflects completed almanac entries", () => {
    const allCanonicalIds = recordValues(trackerData.almanac).flatMap(({ items }) =>
      items.map((entry) => entry.itemIds[0]),
    );
    const subset = new Set(allCanonicalIds.slice(0, 3));
    const progress = getCategoryProgress("almanac", ctx({ completed: { almanac: subset } }));
    expect(progress.completed).toBe(3);
  });

  it("counts date inspiration items once through their Almanac entries", () => {
    const category = recordEntries(trackerData.almanac).find(
      ([id]) => id === "date_inspiration",
    )?.[1];
    if (!category) throw new Error("Expected the Date Inspiration category");
    const itemIds = category.items.map((entry) => entry.itemIds[0]);
    const progress = getCategoryProgress(
      "almanac",
      ctx({ completed: { almanac: new Set(itemIds.slice(0, 2)) } }),
    );
    expect(progress.completed).toBe(2);
  });

  it("aggregates source availability across all member IDs in a colorway group", () => {
    const colorwayEntry = recordValues(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find((entry) => entry.itemIds.length > 1);
    expect(colorwayEntry).toBeDefined();
    const canonicalId = colorwayEntry?.itemIds[0];

    const progressAll = getCategoryProgress("almanac", ctx({ windowPreset: "everything" }));
    const progressAvailable = getCategoryProgress("almanac", ctx({ windowPreset: "available" }));

    expect(progressAll.total).toBe(progressAvailable.total);
    expect(progressAll.total).toBeGreaterThan(0);
    expect(canonicalId).toBeTypeOf("string");
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

describe("villagers progress", () => {
  it("total is a level track per Villager plus a relationship step per dateable Villager", () => {
    const progress = getCategoryProgress("villagers", ctx());
    const villagers = recordValues(trackerData.villagers);
    const dateableCount = villagers.filter(({ dateable }) => dateable).length;
    expect(dateableCount).toBeGreaterThan(0);
    expect(progress.total).toBe(villagers.length * MAX_HEART_LEVEL + dateableCount);
  });

  it("counts a dateable Villager's relationship step only once it is settled", () => {
    const levels = { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>;
    const undecided = getCategoryProgress("villagers", ctx({ completed: { heartLevels: levels } }));
    expect(undecided.completed).toBe(MAX_HEART_LEVEL);

    const romantic = getCategoryProgress(
      "villagers",
      ctx({
        completed: { heartLevels: levels, villagerRelationships: rel("adeline", "romantic") },
      }),
    );
    expect(romantic.completed).toBe(MAX_HEART_LEVEL);

    const platonic = getCategoryProgress(
      "villagers",
      ctx({
        completed: { heartLevels: levels, villagerRelationships: rel("adeline", "platonic") },
      }),
    );
    expect(platonic.completed).toBe(MAX_HEART_LEVEL + 1);

    const marriedUndeclared = getCategoryProgress(
      "villagers",
      ctx({
        completed: { heartLevels: levels, villagerRelationships: rel("adeline", "married") },
      }),
    );
    expect(marriedUndeclared.completed).toBe(MAX_HEART_LEVEL);

    const marriedDeclared = getCategoryProgress(
      "villagers",
      ctx({
        completed: {
          childChoice: "no",
          heartLevels: levels,
          villagerRelationships: rel("adeline", "married"),
        },
      }),
    );
    expect(marriedDeclared.completed).toBe(MAX_HEART_LEVEL + 1);
  });

  it("caps individual Villager levels at MAX_HEART_LEVEL", () => {
    const villagerId = recordKeys(trackerData.villagers)[0];
    const progress = getCategoryProgress(
      "villagers",
      ctx({ completed: { heartLevels: { [villagerId]: 999 } } }),
    );
    expect(progress.completed).toBe(MAX_HEART_LEVEL);
  });
});

describe("quests progress", () => {
  it("total matches total quest count minus pregnancy quests plus synthetic craving row", () => {
    const progress = getCategoryProgress("quests", ctx());
    let expected = 0;
    const pregnancyQuestIds = new Set(Object.values(trackerData.pregnancyQuestByVillager));
    for (const questType of recordValues(trackerData.quests)) {
      for (const id of recordKeys(questType)) {
        if (!pregnancyQuestIds.has(id)) expected++;
      }
    }
    expected += 1;
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
    const maxLevel = trackerData.townRanks.at(-1)?.levels.end;
    const progress = getCategoryProgress("renown", ctx());
    expect(progress.total).toBe(maxLevel);
  });

  it("clamps renown at max", () => {
    const maxLevel = getMaxRenownLevel();
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
    const maxFloor = getMaxMineFloor();
    const spellCount = recordKeys(trackerData.mines.spells).length;
    expect(progress.total).toBe(maxFloor + spellCount);
  });

  it("reflects floor and spell completion", () => {
    const spellId = recordKeys(trackerData.mines.spells)[0];
    const progress = getCategoryProgress(
      "mines",
      ctx({ completed: { mineFloor: 10, spells: new Set([spellId]) } }),
    );
    expect(progress.completed).toBe(11);
  });
});

describe("animals progress", () => {
  it("includes variants, animal cosmetics, mount appearances, pet cosmetics, and pet skins", () => {
    const progress = getCategoryProgress("animals", ctx());
    let expectedTotal = 0;
    for (const animal of recordValues(trackerData.animals)) {
      expectedTotal += recordKeys(animal.cosmetics).length;
      for (const tier of animal.variantTiers) {
        expectedTotal += recordKeys(tier).length;
      }
    }
    expectedTotal += recordKeys(trackerData.mount.appearances).length;
    expectedTotal += recordKeys(trackerData.pets.cosmetics).length;
    expectedTotal += recordKeys(trackerData.pets.skins).length;
    expect(progress.total).toBe(expectedTotal);
  });
});

// ─── Animal variant availability ──────────────────────────────────

describe("animal progress variant filtering matches UI predicate", () => {
  const seasons: Season[] = ["spring", "summer", "fall", "winter"];
  const modes: WindowPreset[] = ["available", "everything", "timely"];

  it.each(modes.flatMap((mode) => seasons.map((season) => [mode, season] as const)))(
    "%s/%s: variant filtered count matches isVariantInScope",
    (mode, season) => {
      const c = ctx({
        windowPreset: mode,
        worldState: { season, weather: "calm" as Weather },
      });
      const progress = getCategoryProgress("animals", c);

      let expectedVariantFiltered = 0;
      for (const [, animal] of recordEntries(trackerData.animals)) {
        for (const tier of animal.variantTiers) {
          for (const [, variant] of recordEntries(tier)) {
            if (isVariantInScope(variant, season, [...WINDOW_PRESETS[mode]])) {
              expectedVariantFiltered++;
            }
          }
        }
      }

      const cosmeticCount = recordValues(trackerData.animals).reduce(
        (sum, a) => sum + recordKeys(a.cosmetics).length,
        0,
      );
      const petCosmeticCount = recordKeys(trackerData.pets.cosmetics).length;
      const petSkinCount = recordKeys(trackerData.pets.skins).length;
      const mountAppearanceCount = recordKeys(trackerData.mount.appearances).length;
      const nonVariantFiltered =
        cosmeticCount + mountAppearanceCount + petCosmeticCount + petSkinCount;

      expect(progress.remainingInScope).toBe(expectedVariantFiltered + nonVariantFiltered);
    },
  );

  it("everything mode: filtered + completed = total for animals", () => {
    const c = ctx({ windowPreset: "everything" });
    const progress = getCategoryProgress("animals", c);
    expect(progress.remainingInScope + progress.completed).toBe(progress.total);
  });

  it("available mode: completed count is independent of season", () => {
    const variantId = recordEntries(recordValues(trackerData.animals)[0].variantTiers[0])[0][0];
    const animalId = recordKeys(trackerData.animals)[0];
    const animals: Record<string, Set<AnimalVariantId>> = {};
    for (const id of recordKeys(trackerData.animals)) {
      animals[id] = new Set();
    }
    animals[animalId] = new Set([variantId]);

    const springProgress = getCategoryProgress(
      "animals",
      ctx({
        completed: { animals },
        windowPreset: "available",
        worldState: { season: "spring" as Season, weather: "calm" as Weather },
      }),
    );
    const winterProgress = getCategoryProgress(
      "animals",
      ctx({
        completed: { animals },
        windowPreset: "available",
        worldState: { season: "winter" as Season, weather: "calm" as Weather },
      }),
    );

    expect(springProgress.completed).toBe(winterProgress.completed);
  });
});

// ─── Availability filtering ────────────────────────────────────────

describe("availability filtering on item-based categories", () => {
  it("available mode may reduce filtered count compared to everything mode", () => {
    const c1 = ctx({ windowPreset: "everything" });
    const c2 = ctx({ windowPreset: "available" });
    const everything = getCategoryProgress("almanac", c1);
    const available = getCategoryProgress("almanac", c2);
    expect(available.remainingInScope).toBeLessThanOrEqual(everything.remainingInScope);
  });

  it("completed count is the same regardless of availability mode", () => {
    const allCanonicalIds = recordValues(trackerData.almanac).flatMap(({ items }) =>
      items.map((entry) => entry.itemIds[0]),
    );
    const subset = new Set(allCanonicalIds.slice(0, 3));
    const c1 = ctx({ completed: { almanac: subset }, windowPreset: "everything" });
    const c2 = ctx({ completed: { almanac: subset }, windowPreset: "available" });
    expect(getCategoryProgress("almanac", c1).completed).toBe(
      getCategoryProgress("almanac", c2).completed,
    );
  });
});

// ─── isVillagerComplete ────────────────────────────────────────────────

describe("isVillagerComplete", () => {
  it("non-dateable Villager is complete at max hearts", () => {
    const completed = makeCompletedState({
      heartLevels: { darcy: MAX_HEART_LEVEL } as Record<VillagerId, number>,
    });
    expect(isVillagerComplete("darcy" as VillagerId, completed)).toBe(true);
  });

  it("non-dateable Villager is incomplete below max hearts", () => {
    const completed = makeCompletedState({
      heartLevels: { darcy: 5 } as Record<VillagerId, number>,
    });
    expect(isVillagerComplete("darcy" as VillagerId, completed)).toBe(false);
  });

  it("dateable Villager with undecided relationship is never complete", () => {
    const completed = makeCompletedState({
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("dateable Villager is complete when platonic at max hearts", () => {
    const completed = makeCompletedState({
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "platonic" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(true);
  });

  it("dateable Villager is incomplete when platonic below max hearts", () => {
    const completed = makeCompletedState({
      heartLevels: { adeline: 8 } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "platonic" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("dateable Villager is incomplete when romantic (not married)", () => {
    const completed = makeCompletedState({
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "romantic" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("dateable Villager is incomplete when proposed (not married)", () => {
    const completed = makeCompletedState({
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "proposed" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("married Villager is incomplete below max hearts even with child choice", () => {
    const completed = makeCompletedState({
      childChoice: "yes",
      heartLevels: { adeline: 8 } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "married" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("married Villager at max hearts is incomplete with undeclared child choice", () => {
    const completed = makeCompletedState({
      childChoice: "undeclared",
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "married" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(false);
  });

  it("married Villager at max hearts is complete when child choice is yes", () => {
    const completed = makeCompletedState({
      childChoice: "yes",
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "married" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(true);
  });

  it("married Villager at max hearts is complete when child choice is no", () => {
    const completed = makeCompletedState({
      childChoice: "no",
      heartLevels: { adeline: MAX_HEART_LEVEL } as Record<VillagerId, number>,
      villagerRelationships: { adeline: "married" } as Partial<
        Record<VillagerId, VillagerRelationship>
      >,
    });
    expect(isVillagerComplete("adeline" as VillagerId, completed)).toBe(true);
  });
});

// ─── Quests progress with marriage state ──────────────────────────

describe("quests progress with marriage state", () => {
  it("excludes craving row when married to a husband Villager (no pregnancy quest)", () => {
    const progress = getCategoryProgress(
      "quests",
      ctx({
        completed: {
          childChoice: "yes",
          villagerRelationships: { balor: "married" } as Partial<
            Record<VillagerId, VillagerRelationship>
          >,
        },
      }),
    );
    const baseProgress = getCategoryProgress("quests", ctx());
    expect(progress.total).toBe(baseProgress.total - 1);
  });

  it("excludes craving row when married to wife with DINK choice", () => {
    const progress = getCategoryProgress(
      "quests",
      ctx({
        completed: {
          childChoice: "no",
          villagerRelationships: { adeline: "married" } as Partial<
            Record<VillagerId, VillagerRelationship>
          >,
        },
      }),
    );
    const baseProgress = getCategoryProgress("quests", ctx());
    expect(progress.total).toBe(baseProgress.total - 1);
  });

  it("includes craving row when married to wife with kids choice", () => {
    const progress = getCategoryProgress(
      "quests",
      ctx({
        completed: {
          childChoice: "yes",
          villagerRelationships: { adeline: "married" } as Partial<
            Record<VillagerId, VillagerRelationship>
          >,
        },
      }),
    );
    const baseProgress = getCategoryProgress("quests", ctx());
    expect(progress.total).toBe(baseProgress.total);
  });

  it("counts craving quest as completed when the wife's pregnancy quest is completed", () => {
    const progress = getCategoryProgress(
      "quests",
      ctx({
        completed: {
          childChoice: "yes",
          questStates: { adeline_pregnancy_request: "completed" } as Record<QuestId, QuestState>,
          villagerRelationships: { adeline: "married" } as Partial<
            Record<VillagerId, VillagerRelationship>
          >,
        },
      }),
    );
    const baseProgress = getCategoryProgress("quests", ctx());
    expect(progress.completed).toBe(1);
    expect(progress.total).toBe(baseProgress.total);
  });
});
