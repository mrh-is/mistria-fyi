import { afterEach, describe, expect, it, vi } from "vitest";

function buildMinimalState(): string {
  return JSON.stringify({
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

function failingStorage(): Storage {
  const base = makeStorage();
  base.setItem = () => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  };
  return base;
}

function makeStorage(data: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(data));
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => store.delete(key),
    setItem: (key, value) => store.set(key, value),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("persistence failure generation counter", () => {
  it("increments on each failed write so the effect reruns", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": buildMinimalState() }));
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    expect(userState.persistenceFailureGeneration).toBe(0);

    // Switch to failing storage
    vi.stubGlobal("localStorage", failingStorage());

    // Trigger a state change that fires the auto-save effect
    userState.state.completed.renown = 1;
    // Flush the 300ms debounce
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);
    const gen1 = userState.persistenceFailureGeneration;
    expect(gen1).toBeGreaterThan(0);

    // Second failure should produce a new generation
    userState.state.completed.renown = 2;
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailureGeneration).toBeGreaterThan(gen1);
  });

  it("resets generation to zero after dismiss", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": buildMinimalState() }));
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.stubGlobal("localStorage", failingStorage());
    userState.state.completed.renown = 1;
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);

    userState.dismissPersistenceWarning();
    expect(userState.persistenceFailed).toBe(false);
    expect(userState.persistenceFailureGeneration).toBe(0);
  });

  it("increments again after dismiss when writes keep failing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": buildMinimalState() }));
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.stubGlobal("localStorage", failingStorage());

    // First failure
    userState.state.completed.renown = 1;
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();
    expect(userState.persistenceFailed).toBe(true);

    // Dismiss
    userState.dismissPersistenceWarning();
    expect(userState.persistenceFailed).toBe(false);

    // Another failure after dismiss
    userState.state.completed.renown = 2;
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureGeneration).toBeGreaterThan(0);
  });
});
