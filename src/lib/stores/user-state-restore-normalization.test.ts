import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getMaxMineFloor, MAX_SKILL_LEVEL, MAX_VILLAGER_LEVEL } from "#lib/engine/progress.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

const STORAGE_KEY = "mistria-fyi-v1";
const UNKNOWN_ID = "removed_from_tracker_data";

function firstAnimalEntry(): {
  animalId: string;
  cosmeticId: string;
  variantId: string;
} {
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const cosmeticId = recordKeys(animal.cosmetics)[0];
    const variantId = animal.variantTiers.flatMap(recordKeys)[0];
    if (cosmeticId && variantId) return { animalId, cosmeticId, variantId };
  }
  throw new Error("tracker data must contain an animal with cosmetics and variants");
}

function firstMuseumItemId(): string {
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      const id = set.items[0];
      if (id) return id;
    }
  }
  throw new Error("tracker data must contain a museum item");
}

function firstPerkId(): string {
  for (const skill of Object.values(trackerData.skills)) {
    for (const tier of skill.perkTiers) {
      const id = Object.keys(tier)[0];
      if (id) return id;
    }
  }
  throw new Error("tracker data must contain a perk");
}

function firstQuestId(): string {
  for (const quests of Object.values(trackerData.quests)) {
    const id = Object.keys(quests)[0];
    if (id) return id;
  }
  throw new Error("tracker data must contain a quest");
}

function secondQuestId(): string {
  const id = Object.values(trackerData.quests).flatMap((quests) => Object.keys(quests))[1];
  if (id) return id;
  throw new Error("tracker data must contain at least two quests");
}

const known = {
  almanac: Object.values(trackerData.almanac)[0].items[0].itemIds[0],
  almanacRecipe: recordKeys(trackerData.recipes)[0],
  cosmetic: recordKeys(trackerData.cosmetics)[0],
  date: recordKeys(trackerData.dates)[0],
  museum: firstMuseumItemId(),
  perk: firstPerkId(),
  petCosmetic: recordKeys(trackerData.pets.cosmetics)[0],
  petSkin: recordKeys(trackerData.pets.skins)[0],
  quest: firstQuestId(),
  questWithInvalidState: secondQuestId(),
  skill: recordKeys(trackerData.skills)[0],
  skillWithInvalidLevel: recordKeys(trackerData.skills)[1],
  spell: recordKeys(trackerData.mines.spells)[0],
  villager: recordKeys(trackerData.villagers)[0],
  villagerWithInvalidData: recordKeys(trackerData.villagers)[1],
};
const knownAnimal = firstAnimalEntry();

beforeEach(() => {
  vi.resetModules();
});

function buildStoredState(
  options: { invalidDomains?: boolean; malformedNumericScalars?: boolean } = {},
): string {
  const invalidDomains = options.invalidDomains ?? false;
  const malformedNumericScalars = options.malformedNumericScalars ?? false;
  let mineFloor: null | number = 0;
  if (malformedNumericScalars) mineFloor = null;
  else if (invalidDomains) mineFloor = getMaxMineFloor() + 50;
  return JSON.stringify({
    availabilityWindows: invalidDomains ? ["now", "removed_window"] : ["now"],
    completed: {
      almanac: [known.almanac, UNKNOWN_ID],
      almanacRecipes: [known.almanacRecipe, UNKNOWN_ID],
      animalCosmetics: {
        [knownAnimal.animalId]: [knownAnimal.cosmeticId, UNKNOWN_ID],
        [UNKNOWN_ID]: [knownAnimal.cosmeticId],
      },
      animals: {
        [knownAnimal.animalId]: [knownAnimal.variantId, UNKNOWN_ID],
        [UNKNOWN_ID]: [knownAnimal.variantId],
      },
      childChoice: invalidDomains ? "maybe" : "undeclared",
      cosmetics: [known.cosmetic, UNKNOWN_ID],
      dates: [known.date, UNKNOWN_ID],
      mines: {
        floor: mineFloor,
        spells: [known.spell, UNKNOWN_ID],
      },
      museum: [known.museum, UNKNOWN_ID],
      petCosmetics: [known.petCosmetic, UNKNOWN_ID],
      petSkins: [known.petSkin, UNKNOWN_ID],
      questStates: {
        [known.quest]: "completed",
        ...(invalidDomains ? { [known.questWithInvalidState]: "finished" } : {}),
        [UNKNOWN_ID]: "completed",
      },
      reachedSeason: invalidDomains ? "monsoon" : "spring",
      renown: malformedNumericScalars ? "max" : 0,
      skillLevels: {
        [known.skill]: invalidDomains ? MAX_SKILL_LEVEL + 50 : 1,
        ...(invalidDomains ? { [known.skillWithInvalidLevel]: "sixty" } : {}),
        [UNKNOWN_ID]: 10,
      },
      unlockedPerks: [known.perk, UNKNOWN_ID],
      villagerLevels: {
        [known.villager]: invalidDomains ? MAX_VILLAGER_LEVEL + 50 : 1,
        ...(invalidDomains ? { [known.villagerWithInvalidData]: "twelve" } : {}),
        [UNKNOWN_ID]: 10,
      },
      villagerRelationships: {
        [known.villager]: "romantic",
        ...(invalidDomains ? { [known.villagerWithInvalidData]: "enemy" } : {}),
        [UNKNOWN_ID]: "romantic",
      },
    },
    showSpoilers: false,
    version: "1",
    worldState: {
      season: invalidDomains ? "monsoon" : "spring",
      weather: invalidDomains ? "removed_weather" : "calm",
    },
  });
}

function expectUnknownIdsRemoved(completed: DeepReadonly<ProgressState>): void {
  expect(completed.almanac).not.toContain(UNKNOWN_ID);
  expect(completed.almanacRecipes).not.toContain(UNKNOWN_ID);
  expect(completed.cosmetics).not.toContain(UNKNOWN_ID);
  expect(completed.dates).not.toContain(UNKNOWN_ID);
  expect(completed.mines.spells).not.toContain(UNKNOWN_ID);
  expect(completed.museum).not.toContain(UNKNOWN_ID);
  expect(completed.petCosmetics).not.toContain(UNKNOWN_ID);
  expect(completed.petSkins).not.toContain(UNKNOWN_ID);
  expect(completed.unlockedPerks).not.toContain(UNKNOWN_ID);
  expect(completed.animals).not.toHaveProperty(UNKNOWN_ID);
  expect(completed.animalCosmetics).not.toHaveProperty(UNKNOWN_ID);
  expect((completed.animals as Record<string, Set<unknown>>)[knownAnimal.animalId]).not.toContain(
    UNKNOWN_ID,
  );
  expect(
    (completed.animalCosmetics as Record<string, Set<unknown>>)[knownAnimal.animalId],
  ).not.toContain(UNKNOWN_ID);
  expect(completed.questStates).not.toHaveProperty(UNKNOWN_ID);
  expect(completed.skillLevels).not.toHaveProperty(UNKNOWN_ID);
  expect(completed.villagerLevels).not.toHaveProperty(UNKNOWN_ID);
  expect(completed.villagerRelationships).not.toHaveProperty(UNKNOWN_ID);
}

function makeStorage(json: string): Storage {
  return memoryStorage({ [STORAGE_KEY]: json });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("persisted-state normalization", () => {
  it("salvages local state when current domain limits reject individual values", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage(buildStoredState({ invalidDomains: true })));

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    expect(userState.persistenceFailed).toBe(false);
    expect(userState.state.availabilityWindows).toEqual(["now"]);
    expect(userState.state.worldState).toEqual({ season: "spring", weather: "calm" });
    expect(userState.state.completed.childChoice).toBe("undeclared");
    expect(userState.state.completed.reachedSeason).toBe("spring");
    expect(userState.state.completed.mines.floor).toBe(getMaxMineFloor());
    expect(userState.state.completed.skillLevels[known.skill]).toBe(MAX_SKILL_LEVEL);
    expect(userState.state.completed.villagerLevels[known.villager]).toBe(MAX_VILLAGER_LEVEL);
    expect(userState.state.completed.questStates).not.toHaveProperty(known.questWithInvalidState);
    expect(userState.state.completed.skillLevels).not.toHaveProperty(known.skillWithInvalidLevel);
    expect(userState.state.completed.villagerLevels).not.toHaveProperty(
      known.villagerWithInvalidData,
    );
    expect(userState.state.completed.villagerRelationships).not.toHaveProperty(
      known.villagerWithInvalidData,
    );
    expectUnknownIdsRemoved(userState.state.completed);
  });

  it("filters IDs removed from tracker data when importing a manual backup", async () => {
    const { userState } = await import("#lib/stores/user-state.svelte.js");

    expect(userState.restoreBackup(buildStoredState())).toEqual({ ok: true });
    expectUnknownIdsRemoved(userState.state.completed);
    expect(userState.state.completed.almanac).toContain(known.almanac);
    expect((userState.state.completed.questStates as Record<string, string>)[known.quest]).toBe(
      "completed",
    );
  });

  it("defaults malformed local numeric scalars without discarding unrelated progress", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage(buildStoredState({ malformedNumericScalars: true })));

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    expect(userState.persistenceFailed).toBe(false);
    expect(userState.state.completed.mines.floor).toBe(0);
    expect(userState.state.completed.renown).toBe(0);
    expect(userState.state.completed.almanac).toContain(known.almanac);
    expect((userState.state.completed.questStates as Record<string, string>)[known.quest]).toBe(
      "completed",
    );
  });
});
