import { afterEach, expect, it, vi } from "vitest";

const STORED_STATE = JSON.stringify({
  availabilityMode: "available",
  completed: {
    almanac: [],
    almanacRecipes: [],
    animalCosmetics: {},
    animals: {},
    cosmetics: [],
    dates: [],
    mines: { floor: 0, spells: [] },
    museum: [],
    npcLevels: {},
    petCosmetics: [],
    petSkins: [],
    questStates: {},
    renown: 25,
    skillLevels: {},
    unlockedPerks: [],
  },
  showSpoilers: false,
  version: "1",
  worldState: { season: "spring", weather: "calm" },
});

function storedUserState(): Storage {
  const values = new Map([["harvest-helper-v1", STORED_STATE]]);

  return {
    clear: () => {
      values.clear();
    },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => values.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("restores persisted progress only after hydration initialization", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", storedUserState());
  vi.resetModules();

  const { userState } = await import("$lib/stores/user-state.svelte.js");

  expect(userState.state.completed.renown).toBe(0);

  userState.restorePersistedState();

  expect(userState.state.completed.renown).toBe(25);
});
