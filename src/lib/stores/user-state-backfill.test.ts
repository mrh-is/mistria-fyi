import { afterEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getAllProgress } from "#lib/engine/progress.js";
import { searchItems } from "#lib/engine/search.js";
import { encodeTransferPayload } from "#lib/engine/transfer.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { recordKeys } from "#lib/utils/record.js";

import type { AnimalId, AnimalVariantId, CosmeticId } from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

const ALL_ANIMAL_IDS = recordKeys(trackerData.animals);

// A fixture that omits two animals from the persisted maps, simulating state
// serialized before those animals were added to tracker data.
const OMITTED_ANIMALS: AnimalId[] = ALL_ANIMAL_IDS.slice(-2);
const KEPT_ANIMALS: AnimalId[] = ALL_ANIMAL_IDS.slice(0, -2);

function buildPartialAnimalMaps(): {
  animalCosmetics: Record<string, string[]>;
  animals: Record<string, string[]>;
} {
  const animals: Record<string, string[]> = {};
  const animalCosmetics: Record<string, string[]> = {};
  for (const id of KEPT_ANIMALS) {
    animals[id] = [];
    animalCosmetics[id] = [];
  }
  // Deliberately omit OMITTED_ANIMALS
  return { animalCosmetics, animals };
}

function buildStoredState(overrides?: {
  animalCosmetics?: Record<string, string[]>;
  animals?: Record<string, string[]>;
}): string {
  const { animalCosmetics, animals } = buildPartialAnimalMaps();
  return JSON.stringify({
    availabilityMode: "available",
    completed: {
      almanac: [],
      almanacRecipes: [],
      animalCosmetics: overrides?.animalCosmetics ?? animalCosmetics,
      animals: overrides?.animals ?? animals,
      cosmetics: [],
      dates: [],
      mines: { floor: 0, spells: [] },
      museum: [],
      petCosmetics: [],
      petSkins: [],
      questStates: {},
      renown: 0,
      skillLevels: {},
      unlockedPerks: [],
      villagerLevels: {},
    },
    showSpoilers: false,
    version: "1",
    worldState: { season: "spring", weather: "calm" },
  });
}

function makeStorage(json: string): Storage {
  return memoryStorage({ "mistria-fyi-v1": json });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("animal map backfill on deserialization", () => {
  it("backfills missing animals with empty sets after restoring older state", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage(buildStoredState()));
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    for (const animalId of OMITTED_ANIMALS) {
      expect(
        userState.state.completed.animals[animalId],
        `animals["${animalId}"] should exist`,
      ).toBeDefined();
      expect(userState.state.completed.animals[animalId]?.size).toBe(0);

      expect(
        userState.state.completed.animalCosmetics[animalId],
        `animalCosmetics["${animalId}"] should exist`,
      ).toBeDefined();
      expect(userState.state.completed.animalCosmetics[animalId]?.size).toBe(0);
    }
  });

  it("preserves existing animal progress when backfilling", async () => {
    const { animalCosmetics, animals } = buildPartialAnimalMaps();
    const progressAnimal = KEPT_ANIMALS.find(
      (id) => recordKeys(trackerData.animals[id].cosmetics).length > 0,
    );
    if (!progressAnimal) throw new Error("tracker data must contain an animal cosmetic");
    const progressVariant = trackerData.animals[progressAnimal].variantTiers.flatMap(recordKeys)[0];
    const progressCosmetic = recordKeys(trackerData.animals[progressAnimal].cosmetics)[0];
    animals[progressAnimal] = [progressVariant];
    animalCosmetics[progressAnimal] = [progressCosmetic];

    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage(buildStoredState({ animalCosmetics, animals })));
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    expect(userState.state.completed.animals[progressAnimal]?.has(progressVariant)).toBe(true);
    expect(userState.state.completed.animalCosmetics[progressAnimal]?.has(progressCosmetic)).toBe(
      true,
    );
  });

  it("provides every tracker-data animal after restoring state with no animal maps", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "localStorage",
      makeStorage(buildStoredState({ animalCosmetics: {}, animals: {} })),
    );
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    for (const animalId of ALL_ANIMAL_IDS) {
      expect(userState.state.completed.animals[animalId]).toBeDefined();
      expect(userState.state.completed.animalCosmetics[animalId]).toBeDefined();
    }
  });
});

describe("animal map backfill on merge", () => {
  it("backfills missing animals after merging imported data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "localStorage",
      makeStorage(buildStoredState({ animalCosmetics: {}, animals: {} })),
    );
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    // Merge data that also lacks some animals
    const partialImport = {
      animalCosmetics: Object.fromEntries(
        KEPT_ANIMALS.map((id) => [id, new Set<CosmeticId>()]),
      ) as Record<AnimalId, Set<CosmeticId>>,
      animals: Object.fromEntries(
        KEPT_ANIMALS.map((id) => [id, new Set<AnimalVariantId>()]),
      ) as Record<AnimalId, Set<AnimalVariantId>>,
    };

    userState.mergeFromSave(partialImport);

    for (const animalId of OMITTED_ANIMALS) {
      expect(
        userState.state.completed.animals[animalId],
        `animals["${animalId}"] should exist after merge`,
      ).toBeDefined();
      expect(
        userState.state.completed.animalCosmetics[animalId],
        `animalCosmetics["${animalId}"] should exist after merge`,
      ).toBeDefined();
    }
  });
});

async function getBackfilledState(): Promise<DeepReadonly<CompletedState>> {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", makeStorage(buildStoredState()));
  vi.resetModules();

  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.restorePersistedState();
  return userState.state.completed;
}

describe("downstream consumers after backfill", () => {
  it("getAllProgress does not throw on backfilled state", async () => {
    const completed = await getBackfilledState();
    expect(() =>
      getAllProgress({
        availabilityWindows: DEFAULT_AVAILABILITY_WINDOWS,
        completed,
        worldState: { season: "spring", weather: "calm" },
      }),
    ).not.toThrow();
  });

  it("searchItems does not throw when searching animals on backfilled state", async () => {
    const completed = await getBackfilledState();
    const progression = deriveProgressionState(completed, trackerData, false);
    expect(() =>
      searchItems("a", completed, { season: "spring", weather: "calm" }, progression, "en"),
    ).not.toThrow();
  });

  it("encodeTransferPayload does not throw on backfilled state", async () => {
    const completed = await getBackfilledState();
    const payload = await encodeTransferPayload(completed);
    expect(payload).toMatch(/^[\w-]+$/);
    expect(payload.length).toBeGreaterThan(0);
  });
});
