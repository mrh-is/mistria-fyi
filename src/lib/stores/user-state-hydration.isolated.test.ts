import { afterEach, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";

const STORED_STATE = JSON.stringify({
  availabilityMode: "available",
  progress: {
    almanac: [],
    almanacRecipes: [],
    animalCosmetics: {},
    animals: {},
    cosmetics: [],
    dates: [],
    heartLevels: {},
    mineFloor: 0,
    museum: [],
    petCosmetics: [],
    petSkins: [],
    questStates: {},
    renown: 25,
    skillLevels: {},
    spells: [],
    unlockedPerks: [],
  },
  version: 1,
  worldState: { season: "spring", weather: "calm" },
});

function storedUserState(): Storage {
  return memoryStorage({ "mistria-fyi:progress": STORED_STATE });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("normalizes historical nonrepresentative almanac IDs to canonical on hydration", async () => {
  const stateWithRawIds = JSON.stringify({
    availabilityMode: "available",
    progress: {
      almanac: ["animated_waterfall_v2"],
      almanacRecipes: [],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      dates: [],
      heartLevels: {},
      mineFloor: 0,
      museum: [],
      petCosmetics: [],
      petSkins: [],
      questStates: {},
      renown: 0,
      skillLevels: {},
      spells: [],
      unlockedPerks: [],
    },
    version: 1,
    worldState: { season: "spring", weather: "calm" },
  });
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", memoryStorage({ "mistria-fyi:progress": stateWithRawIds }));
  vi.resetModules();

  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();

  expect(userState.state.progress.almanac.has("animated_waterfall_v1" as never)).toBe(true);
  expect(userState.state.progress.almanac.has("animated_waterfall_v2" as never)).toBe(false);
});

it("restores persisted progress only after hydration initialization", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", storedUserState());
  vi.resetModules();

  const { userState } = await import("#lib/stores/user-state.svelte.js");

  expect(userState.state.progress.renown).toBe(0);

  userState.loadFromStorage();

  expect(userState.state.progress.renown).toBe(25);
});
