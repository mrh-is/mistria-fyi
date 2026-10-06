import { afterEach, describe, expect, it, vi } from "vitest";

import { memoryStorage as makeStorage } from "#lib/test-utils/memory-storage.js";

interface TestWindow {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  dispatch: (
    type: "pagehide" | "pageshow" | "storage",
    event?: Partial<PageTransitionEvent> | Partial<StorageEvent>,
  ) => void;
}

function buildMinimalState(renown = 0, version = "1"): string {
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
    version,
    worldState: { season: "spring", weather: "calm" },
  });
}

function failingStorage(data: Record<string, string>): Storage {
  const base = makeStorage(data);
  base.setItem = () => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  };
  return base;
}

function makeWindow(): TestWindow {
  const listeners = new Map<string, EventListener[]>();
  return {
    addEventListener: (type, listener) => {
      const registered = listeners.get(type) ?? [];
      registered.push(
        typeof listener === "function"
          ? listener
          : (event) => {
              listener.handleEvent(event);
            },
      );
      listeners.set(type, registered);
    },
    dispatch: (type, event = {}) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ type, ...event } as Event);
      }
    },
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
  const base = makeStorage(data);
  const getItem = base.getItem.bind(base);
  let shouldFail = true;
  base.getItem = (key) => {
    if (shouldFail) {
      shouldFail = false;
      throw new DOMException("Access denied", "SecurityError");
    }
    return getItem(key);
  };
  return base;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("persistence lifecycle", () => {
  it("does not overwrite persisted progress before hydration restores it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState(25);
    const storage = makeStorage({ "mistria-fyi-v1": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(stored);

    userState.restorePersistedState();
    expect(userState.state.completed.renown).toBe(25);
  });

  it("preserves fields from newer builds when saving known state", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const parsed = JSON.parse(buildMinimalState(25)) as Record<string, unknown>;
    parsed.futureSetting = { enabled: true };
    const completed = parsed.completed as Record<string, unknown>;
    completed.futureProgress = ["kept"];
    (completed.mines as Record<string, unknown>).futureMineState = 7;
    (parsed.worldState as Record<string, unknown>).futureWeatherDetail = "kept";
    const storage = makeStorage({ "mistria-fyi-v1": JSON.stringify(parsed) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    userState.setRenown(26);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi-v1") ?? "null") as Record<
      string,
      unknown
    >;
    expect(saved.version).toBe("2");
    expect(saved.futureSetting).toEqual({ enabled: true });
    expect((saved.completed as Record<string, unknown>).futureProgress).toEqual(["kept"]);
    expect(
      ((saved.completed as Record<string, unknown>).mines as Record<string, unknown>)
        .futureMineState,
    ).toBe(7);
    expect((saved.worldState as Record<string, unknown>).futureWeatherDetail).toBe("kept");
  });

  it("applies storage updates from another tab without echoing them", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const incomingState = JSON.parse(userState.exportState()) as {
      completed: { renown: number };
    };
    incomingState.completed.renown = 42;
    const incoming = JSON.stringify(incomingState);
    userState.setRenown(10);
    storage.setItem("mistria-fyi-v1", incoming);
    testWindow.dispatch("storage", {
      key: "mistria-fyi-v1",
      newValue: incoming,
      storageArea: storage,
    });
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.state.completed.renown).toBe(42);
    expect(storage.getItem("mistria-fyi-v1")).toBe(incoming);
  });

  it("adopts another tab's write when its storage event was missed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const incomingState = JSON.parse(userState.exportState()) as {
      completed: { renown: number };
    };
    incomingState.completed.renown = 42;
    const incoming = JSON.stringify(incomingState);
    storage.setItem("mistria-fyi-v1", incoming);
    userState.setRenown(10);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.state.completed.renown).toBe(42);
    expect(storage.getItem("mistria-fyi-v1")).toBe(incoming);

    userState.setRenown(11);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi-v1") ?? "null") as {
      completed: { renown: number };
    };
    expect(saved.completed.renown).toBe(11);
  });

  it("keeps saving after another tab clears storage", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    storage.clear();
    testWindow.dispatch("storage", { key: null, newValue: null, storageArea: storage });
    userState.setRenown(11);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi-v1") ?? "null") as {
      completed: { renown: number };
    };
    expect(saved.completed.renown).toBe(11);
  });

  it("resyncs from storage when restored from the back/forward cache", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const incomingState = JSON.parse(userState.exportState()) as {
      completed: { renown: number };
    };
    incomingState.completed.renown = 42;
    storage.setItem("mistria-fyi-v1", JSON.stringify(incomingState));
    testWindow.dispatch("pageshow", { persisted: true });

    expect(userState.state.completed.renown).toBe(42);
  });

  it("blocks a stale tab from overwriting a newer serialization version", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const futureState = JSON.parse(userState.exportState()) as Record<string, unknown>;
    futureState.version = "3";
    const future = JSON.stringify(futureState);
    userState.setRenown(10);
    storage.setItem("mistria-fyi-v1", future);
    testWindow.dispatch("storage", {
      key: "mistria-fyi-v1",
      newValue: future,
      storageArea: storage,
    });
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(future);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("flushes a pending save when the page is hidden", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi-v1": buildMinimalState(1, "2") });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    userState.setRenown(12);
    await vi.waitFor(() => {
      expect(userState.state.completed.renown).toBe(12);
    });

    testWindow.dispatch("pagehide");

    const saved = JSON.parse(storage.getItem("mistria-fyi-v1") ?? "null") as {
      completed: { renown: number };
    };
    expect(saved.completed.renown).toBe(12);
  });

  it("quarantines invalid persisted data without overwriting it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(invalid);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("persists an explicit backup restore after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    expect(userState.importState(buildMinimalState(25))).toEqual({ ok: true });
    const expected = userState.exportState();
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(expected);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("persists an explicit reset after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    userState.resetAll();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).not.toBe(invalid);
    expect(storage.getItem("mistria-fyi-v1-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("keeps explicit replacements gated when quarantine fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = quarantineFailureStorage({ "mistria-fyi-v1": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    expect(userState.importState(buildMinimalState(25))).toEqual({ ok: true });

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("keeps warning state active when blocked persistence is dismissed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": "{not json" }));
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();
    const generation = userState.persistenceFailureGeneration;

    userState.dismissPersistenceWarning();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureGeneration).toBeGreaterThan(generation);
  });

  it("keeps persistence gated when reading storage fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState(25);
    const storage = transientReadFailureStorage({ "mistria-fyi-v1": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi-v1")).toBe(stored);
    expect(userState.state.completed.renown).toBe(0);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("increments on each failed write so the effect reruns", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState();
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    expect(userState.persistenceFailureGeneration).toBe(0);

    // Switch to failing storage
    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi-v1": stored }));

    // Trigger a state change that fires the auto-save effect
    userState.setRenown(1);
    // Flush the 300ms debounce
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);
    const gen1 = userState.persistenceFailureGeneration;
    expect(gen1).toBeGreaterThan(0);

    // Second failure should produce a new generation
    userState.setRenown(2);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailureGeneration).toBeGreaterThan(gen1);
  });

  it("resets generation to zero after dismiss", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState();
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi-v1": stored }));
    userState.setRenown(1);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);

    userState.dismissPersistenceWarning();
    expect(userState.persistenceFailed).toBe(false);
    expect(userState.persistenceFailureGeneration).toBe(0);
  });

  it("increments again after dismiss when writes keep failing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState();
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-v1": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.restorePersistedState();

    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi-v1": stored }));

    // First failure
    userState.setRenown(1);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    expect(userState.persistenceFailed).toBe(true);

    // Dismiss
    userState.dismissPersistenceWarning();
    expect(userState.persistenceFailed).toBe(false);

    // Another failure after dismiss
    userState.setRenown(2);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureGeneration).toBeGreaterThan(0);
  });
});
