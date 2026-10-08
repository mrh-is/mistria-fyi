import { afterEach, describe, expect, it, vi } from "vitest";

import { memoryStorage as makeStorage } from "#lib/test-utils/memory-storage.js";

interface TestWindow {
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  dispatch: (
    type: "pagehide" | "pageshow" | "storage",
    event?: Partial<PageTransitionEvent> | Partial<StorageEvent>,
  ) => void;
}

function buildMinimalState(renown = 0): string {
  return JSON.stringify({
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
      renown,
      skillLevels: {},
      spells: [],
      unlockedPerks: [],
    },
    version: 1,
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
    if (key === "mistria-fyi:progress-quarantine") {
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
    const storage = makeStorage({ "mistria-fyi:progress": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(stored);

    userState.loadFromStorage();
    expect(userState.state.progress.renown).toBe(25);
  });

  it("saves preferences under their own key once storage has been read", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const storage = makeStorage({
      "mistria-fyi:preferences": JSON.stringify({
        availabilityWindows: ["later"],
        showSpoilers: true,
      }),
    });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.toggleAvailabilityWindow("later");
    await Promise.resolve();
    expect(JSON.parse(storage.getItem("mistria-fyi:preferences") ?? "null")).toEqual({
      availabilityWindows: ["later"],
      showSpoilers: true,
    });

    userState.loadFromStorage();
    expect(userState.state.availabilityWindows).toEqual(["later"]);
    userState.toggleAvailabilityWindow("now");
    await vi.runAllTimersAsync();
    expect(JSON.parse(storage.getItem("mistria-fyi:preferences") ?? "null")).toEqual({
      availabilityWindows: ["now", "later"],
      showSpoilers: true,
    });
    expect(JSON.parse(userState.exportBackup())).not.toHaveProperty("availabilityWindows");
  });

  it("applies preference updates from another tab", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({});
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const incoming = JSON.stringify({ availabilityWindows: ["now"], showSpoilers: true });
    storage.setItem("mistria-fyi:preferences", incoming);
    testWindow.dispatch("storage", {
      key: "mistria-fyi:preferences",
      newValue: incoming,
      storageArea: storage,
    });

    expect(userState.state.availabilityWindows).toEqual(["now"]);
    expect(userState.state.showSpoilers).toBe(true);
    await Promise.resolve();
    expect(storage.getItem("mistria-fyi:preferences")).toBe(incoming);
  });

  it("ignores a stale preference event after this tab saved newer preferences", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({});
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    // Another tab wrote first, but its event arrives only after this tab's own write.
    const stale = JSON.stringify({ availabilityWindows: ["now"], showSpoilers: false });
    storage.setItem("mistria-fyi:preferences", stale);
    userState.toggleShowSpoilers();
    await vi.runAllTimersAsync();
    const newer = storage.getItem("mistria-fyi:preferences");
    expect(JSON.parse(newer ?? "null")).toMatchObject({ showSpoilers: true });

    testWindow.dispatch("storage", {
      key: "mistria-fyi:preferences",
      newValue: stale,
      storageArea: storage,
    });
    await vi.runAllTimersAsync();

    expect(userState.state.showSpoilers).toBe(true);
    expect(storage.getItem("mistria-fyi:preferences")).toBe(newer);
  });

  it("drops unrecognized fields when saving", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const parsed = JSON.parse(buildMinimalState(25)) as Record<string, unknown>;
    parsed.retiredSetting = { enabled: true };
    (parsed.progress as Record<string, unknown>).retiredProgress = ["dropped"];
    (parsed.worldState as Record<string, unknown>).retiredDetail = "dropped";
    const storage = makeStorage({ "mistria-fyi:progress": JSON.stringify(parsed) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    userState.setRenown(26);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi:progress") ?? "null") as Record<
      string,
      unknown
    >;
    expect(saved.version).toBe(1);
    expect(saved).not.toHaveProperty("retiredSetting");
    expect(saved.progress).not.toHaveProperty("retiredProgress");
    expect(saved.worldState).not.toHaveProperty("retiredDetail");
    expect((saved.progress as Record<string, unknown>).renown).toBe(26);
  });

  it("applies storage updates from another tab without echoing them", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const incomingState = JSON.parse(userState.exportBackup()) as {
      progress: { renown: number };
    };
    incomingState.progress.renown = 42;
    const incoming = JSON.stringify(incomingState);
    userState.setRenown(10);
    storage.setItem("mistria-fyi:progress", incoming);
    testWindow.dispatch("storage", {
      key: "mistria-fyi:progress",
      newValue: incoming,
      storageArea: storage,
    });
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.state.progress.renown).toBe(42);
    expect(storage.getItem("mistria-fyi:progress")).toBe(incoming);
  });

  it("adopts another tab's write when its storage event was missed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const incomingState = JSON.parse(userState.exportBackup()) as {
      progress: { renown: number };
    };
    incomingState.progress.renown = 42;
    const incoming = JSON.stringify(incomingState);
    storage.setItem("mistria-fyi:progress", incoming);
    userState.setRenown(10);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.state.progress.renown).toBe(42);
    expect(storage.getItem("mistria-fyi:progress")).toBe(incoming);

    userState.setRenown(11);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi:progress") ?? "null") as {
      progress: { renown: number };
    };
    expect(saved.progress.renown).toBe(11);
  });

  it("keeps saving after another tab clears storage", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    storage.clear();
    testWindow.dispatch("storage", { key: null, newValue: null, storageArea: storage });
    userState.setRenown(11);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    const saved = JSON.parse(storage.getItem("mistria-fyi:progress") ?? "null") as {
      progress: { renown: number };
    };
    expect(saved.progress.renown).toBe(11);
  });

  it("resyncs from storage when restored from the back/forward cache", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const incomingState = JSON.parse(userState.exportBackup()) as {
      progress: { renown: number };
    };
    incomingState.progress.renown = 42;
    storage.setItem("mistria-fyi:progress", JSON.stringify(incomingState));
    testWindow.dispatch("pageshow", { persisted: true });

    expect(userState.state.progress.renown).toBe(42);
  });

  it("blocks a stale tab from overwriting a newer serialization version", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const futureState = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    futureState.version = 2;
    const future = JSON.stringify(futureState);
    userState.setRenown(10);
    storage.setItem("mistria-fyi:progress", future);
    testWindow.dispatch("storage", {
      key: "mistria-fyi:progress",
      newValue: future,
      storageArea: storage,
    });
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(future);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("flushes a pending save when the page is hidden", async () => {
    vi.useFakeTimers();
    const testWindow = makeWindow();
    vi.stubGlobal("window", testWindow);
    const storage = makeStorage({ "mistria-fyi:progress": buildMinimalState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    userState.setRenown(12);
    await vi.waitFor(() => {
      expect(userState.state.progress.renown).toBe(12);
    });

    testWindow.dispatch("pagehide");

    const saved = JSON.parse(storage.getItem("mistria-fyi:progress") ?? "null") as {
      progress: { renown: number };
    };
    expect(saved.progress.renown).toBe(12);
  });

  it("quarantines invalid persisted data without overwriting it", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(invalid);
    expect(storage.getItem("mistria-fyi:progress-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureKind).toBe("unreadable");
    expect(userState.unreadableData).toBe(invalid);
  });

  it("keeps unreadable data downloadable after a reset & a later visit", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const first = await import("#lib/stores/user-state.svelte.js");
    first.userState.loadFromStorage();
    first.userState.resetAll();
    vi.advanceTimersByTime(first.PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();
    expect(first.userState.unreadableData).toBe(invalid);

    vi.resetModules();
    const second = await import("#lib/stores/user-state.svelte.js");
    second.userState.loadFromStorage();

    expect(second.userState.persistenceFailed).toBe(false);
    expect(second.userState.unreadableData).toBe(invalid);
  });

  it("keeps unreadable data in memory when quarantine fails", async () => {
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    vi.stubGlobal("localStorage", quarantineFailureStorage({ "mistria-fyi:progress": invalid }));
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    expect(userState.persistenceFailureKind).toBe("unreadable");
    expect(userState.unreadableData).toBe(invalid);
  });

  it("reports unavailable storage separately from unreadable data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    vi.stubGlobal("localStorage", failingStorage({}));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    userState.setRenown(3);
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureKind).toBe("unavailable");
    expect(userState.unreadableData).toBeNull();
  });

  it("persists an explicit backup restore after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    expect(userState.restoreBackup(buildMinimalState(25))).toEqual({ ok: true });
    const expected = userState.exportBackup();
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(expected);
    expect(storage.getItem("mistria-fyi:progress-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("persists a save re-import after quarantining invalid data across a fresh load", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const first = await import("#lib/stores/user-state.svelte.js");
    first.userState.loadFromStorage();
    first.userState.mergeFromSave({ mineFloor: 10, renown: 25 });
    vi.advanceTimersByTime(first.PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress-quarantine")).toBe(invalid);
    expect(first.userState.persistenceFailed).toBe(false);

    vi.resetModules();
    const second = await import("#lib/stores/user-state.svelte.js");
    second.userState.loadFromStorage();

    expect(second.userState.state.progress.renown).toBe(25);
    expect(second.userState.state.progress.mineFloor).toBe(10);
    expect(second.userState.persistenceFailed).toBe(false);
  });

  it("keeps a save re-import gated when quarantine fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = quarantineFailureStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    userState.mergeFromSave({ renown: 25 });
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("persists an explicit reset after quarantining invalid data", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = makeStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    userState.resetAll();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).not.toBe(invalid);
    expect(storage.getItem("mistria-fyi:progress-quarantine")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(false);
  });

  it("keeps explicit replacements gated when quarantine fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const invalid = "{not json";
    const storage = quarantineFailureStorage({ "mistria-fyi:progress": invalid });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    expect(userState.restoreBackup(buildMinimalState(25))).toEqual({ ok: true });

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(invalid);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("keeps warning state active when blocked persistence is dismissed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi:progress": "{not json" }));
    vi.resetModules();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();
    const generation = userState.persistenceFailureGeneration;

    userState.dismissPersistenceWarning();

    expect(userState.persistenceFailed).toBe(true);
    expect(userState.persistenceFailureGeneration).toBeGreaterThan(generation);
  });

  it("keeps persistence gated when reading storage fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState(25);
    const storage = transientReadFailureStorage({ "mistria-fyi:progress": stored });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    expect(storage.getItem("mistria-fyi:progress")).toBe(stored);
    expect(userState.state.progress.renown).toBe(0);
    expect(userState.persistenceFailed).toBe(true);
  });

  it("increments on each failed write so the effect reruns", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", makeWindow());
    const stored = buildMinimalState();
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi:progress": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    expect(userState.persistenceFailureGeneration).toBe(0);

    // Switch to failing storage
    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi:progress": stored }));

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
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi:progress": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi:progress": stored }));
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
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi:progress": stored }));
    vi.resetModules();

    const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
    userState.loadFromStorage();

    vi.stubGlobal("localStorage", failingStorage({ "mistria-fyi:progress": stored }));

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
