import { afterEach, describe, expect, it, vi } from "vitest";

function buildMinimalState(renown = 0): string {
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
      renown,
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

function quarantineFailureStorage(data: Record<string, string>): Storage {
  const base = makeStorage(data);
  const setItem = base.setItem.bind(base);
  base.setItem = (key, value) => {
    if (key === "mistria-fyi-v1-quarantine") {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    }
    setItem(key, value);
  };
  return base;
}

function transientReadFailureStorage(data: Record<string, string>): Storage {
  const store = new Map(Object.entries(data));
  let shouldFail = true;
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => {
      if (shouldFail) {
        shouldFail = false;
        throw new DOMException("Access denied", "SecurityError");
      }
      return store.get(key) ?? null;
    },
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

describe("persistence lifecycle", () => {
  it("does not overwrite persisted progress before hydration restores it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const stored = buildMinimalState(25);
    const storage = makeStorage({ "mistria-fyi-v1": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");

    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(stored);

    userState.restorePersistedState();
    expect(userState.state.completed.renown).toBe(25);
  });

  it("quarantines invalid persisted data without overwriting it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(invalid);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("persists an explicit backup restore after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    expect(userState.importState(buildMinimalState(25))).toEqual({ ok: true });
    const expected = userState.exportState();
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(expected);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("persists an explicit reset after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    userState.resetAll();

    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).not.toBe(invalid);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("keeps explicit replacements gated when quarantine fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const invalid = "{not json";
    const storage = quarantineFailureStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    expect(userState.importState(buildMinimalState(25))).toEqual({ ok: true });

    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("keeps warning state active when blocked persistence is dismissed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": "{not json" }));
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const generation = userState.persistenceFailureGeneration;

    userState.dismissPersistenceWarning();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureGeneration).toBeGreaterThan(generation);
  });

  it("keeps persistence gated when reading storage fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {});
    const stored = buildMinimalState(25);
    const storage = transientReadFailureStorage({ "mistria-fyi-v1": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("$lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(stored);
    expect(userState.state.completed.renown).toBe(0);
    expect(userState.persistenceFailed).toBe(true);
  });

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
