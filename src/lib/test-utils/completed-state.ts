import { trackerData } from "#lib/data/index.js";
import { recordKeys } from "#lib/utils/record.js";

import type { AnimalId, AnimalVariantId, CosmeticId } from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";

/**
 * An empty `CompletedState`, shaped like a fresh store's: every animal has its (empty) variant &
 * cosmetic sets. Pass overrides for the fields a test cares about.
 */
export function makeCompletedState(overrides: Partial<CompletedState> = {}): CompletedState {
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
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    villagerLevels: {},
    villagerRelationships: {},
    ...overrides,
  };
}
