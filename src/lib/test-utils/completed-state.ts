import { trackerData } from "#lib/data/index.js";
import { recordKeys } from "#lib/utils/record.js";

import type { AnimalId, AnimalVariantId, CosmeticId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

/**
 * An empty `ProgressState`, shaped like a fresh store's: every animal has its (empty) variant &
 * cosmetic sets. Pass overrides for the fields a test cares about.
 */
export function makeCompletedState(overrides: Partial<ProgressState> = {}): ProgressState {
  const animals: Record<AnimalId, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<AnimalId, Set<CosmeticId>> = {};
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
    heartLevels: {},
    mineFloor: 0,
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    spells: new Set(),
    unlockedPerks: new Set(),
    villagerRelationships: {},
    ...overrides,
  };
}
