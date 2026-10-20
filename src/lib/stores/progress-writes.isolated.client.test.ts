import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import type { userState } from "#lib/stores/user-state.svelte.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const WRITE_LOCK = "mistria-fyi:progress-write";
/** A version only a later build than this one writes. */
const NEWER_VERSION = CURRENT_SERIALIZATION_VERSION + 1;

interface TestWindow {
  addEventListener: (type: string, listener: EventListener) => void;
  dispatch: (type: "pagehide" | "storage", event?: Partial<StorageEvent>) => void;
}

interface StoreModule {
  PERSIST_DEBOUNCE_MS: number;
  userState: typeof userState;
}

function buildState(renown: number, extra: Record<string, unknown> = {}, version = 1): string {
  return JSON.stringify({
    ...extra,
    progress: {
      almanac: [],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      mineFloor: 0,
      museum: [],
      renown,
      spells: [],
    },
    version,
    worldState: { season: "spring", weather: "calm" },
  });
}

function storedRenown(storage: Storage): number | undefined {
  const parsed = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null") as null | {
    progress: { renown: number };
  };
  return parsed?.progress.renown;
}

function makeWindow(): TestWindow {
  const listeners = new Map<string, EventListener[]>();
  return {
    addEventListener: (type, listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    dispatch: (type, event = {}) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ type, ...event } as Event);
      }
    },
  };
}

/**
 * A `LockManager` shared by every tab in a test: requests for one name run one at a time, in
 * order, each in a later task than the request. `held` says whether a callback is running.
 */
function sharedLocks() {
  const state = { held: false, requests: [] as string[] };
  let tail: Promise<undefined> = Promise.resolve(undefined);
  const locks = {
    request: async (name: string, task: () => unknown): Promise<unknown> => {
      state.requests.push(name);
      const previous = tail;
      const { promise, resolve: release } = Promise.withResolvers<undefined>();
      tail = promise;
      try {
        await previous;
        await nextTask();
        state.held = true;
        return task();
      } finally {
        state.held = false;
        release(undefined);
      }
    },
  };
  return { locks, state };
}

async function nextTask(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Records every progress write & whether the shared lock was held when it happened. */
function recordingStorage(entries: Record<string, string>, lockState?: { held: boolean }) {
  const storage = memoryStorage(entries);
  const writes: { held: boolean; value: string }[] = [];
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key === PROGRESS_KEY) writes.push({ held: lockState?.held ?? false, value });
    setItem(key, value);
  };
  return { storage, writes };
}

/** Loads a fresh store module as one tab, against the shared storage & locks already stubbed. */
async function openTab(): Promise<StoreModule & { tabWindow: TestWindow }> {
  const tabWindow = makeWindow();
  vi.stubGlobal("window", tabWindow);
  vi.resetModules();
  const module = await import("#lib/stores/user-state.svelte.js");
  module.userState.loadFromStorage();
  return { ...module, tabWindow };
}

async function settle(debounceMs: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(debounceMs);
  await vi.runAllTimersAsync();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("serialized progress writes", () => {
  it("writes every progress change while holding the progress Web Lock", async () => {
    const { locks, state } = sharedLocks();
    const { storage, writes } = recordingStorage({ [PROGRESS_KEY]: buildState(1) }, state);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { locks });

    const tab = await openTab();
    tab.userState.setRenown(4);
    await settle(tab.PERSIST_DEBOUNCE_MS);
    tab.userState.resetProgress();
    await settle(0);
    expect(tab.userState.restoreBackup(buildState(9))).toEqual({ ok: true });
    await settle(0);

    expect(writes.map(({ value }) => storedRenownOf(value))).toEqual([4, 0, 9]);
    expect(writes.every(({ held }) => held)).toBe(true);
    expect(new Set(state.requests)).toEqual(new Set([WRITE_LOCK]));
  });

  it("doesn't let a stale tab's auto-save overwrite another tab's confirmed write", async () => {
    const { locks, state } = sharedLocks();
    const { storage, writes } = recordingStorage({ [PROGRESS_KEY]: buildState(1) }, state);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { locks });

    const stale = await openTab();
    const confirming = await openTab();

    // The stale tab's edit is pending when the other tab confirms a restore; its storage event
    // never arrives (as for a page in the back/forward cache), so only the locked re-read protects
    // the confirmed value.
    stale.userState.setRenown(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(confirming.userState.restoreBackup(buildState(20))).toEqual({ ok: true });
    await settle(stale.PERSIST_DEBOUNCE_MS);

    expect(storedRenown(storage)).toBe(20);
    expect(writes.map(({ value }) => storedRenownOf(value))).toEqual([20]);
    expect(stale.userState.state.progress.renown).toBe(20);
  });

  it("lets a restore win over the same tab's pending auto-save", async () => {
    const { locks, state } = sharedLocks();
    const { storage, writes } = recordingStorage({ [PROGRESS_KEY]: buildState(1) }, state);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { locks });

    const tab = await openTab();
    tab.userState.setRenown(5);
    await vi.advanceTimersByTimeAsync(0);
    expect(tab.userState.restoreBackup(buildState(20))).toEqual({ ok: true });
    await settle(tab.PERSIST_DEBOUNCE_MS);

    expect(writes.map(({ value }) => storedRenownOf(value))).toEqual([20]);
    expect(tab.userState.state.progress.renown).toBe(20);
  });

  it("refuses to replace a newer build's data that another tab wrote meanwhile", async () => {
    const { locks, state } = sharedLocks();
    const { storage } = recordingStorage({ [PROGRESS_KEY]: buildState(1) }, state);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { locks });

    const tab = await openTab();
    const newer = buildState(30, {}, NEWER_VERSION);
    storage.setItem(PROGRESS_KEY, newer);
    expect(tab.userState.restoreBackup(buildState(20))).toEqual({ ok: true });
    await settle(0);

    expect(storage.getItem(PROGRESS_KEY)).toBe(newer);
    expect(tab.userState.persistenceFailureKind).toBe("newer-data");
  });

  it("keeps the pagehide flush synchronous & compare-before-write", async () => {
    const { locks, state } = sharedLocks();
    const { storage, writes } = recordingStorage({ [PROGRESS_KEY]: buildState(1) }, state);
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", { locks });

    const tab = await openTab();
    tab.userState.setRenown(6);
    await vi.advanceTimersByTimeAsync(0);
    tab.tabWindow.dispatch("pagehide");
    expect(storedRenown(storage)).toBe(6);
    expect(writes).toEqual([{ held: false, value: storage.getItem(PROGRESS_KEY) }]);

    // Another tab writes; a later flush adopts its value rather than writing over it.
    const other = buildState(40);
    storage.setItem(PROGRESS_KEY, other);
    tab.userState.setRenown(7);
    await vi.advanceTimersByTimeAsync(0);
    tab.tabWindow.dispatch("pagehide");
    expect(storage.getItem(PROGRESS_KEY)).toBe(other);
    expect(tab.userState.state.progress.renown).toBe(40);
  });

  it("still writes when the lock can't be taken", async () => {
    const { storage } = recordingStorage({ [PROGRESS_KEY]: buildState(1) });
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("navigator", {
      locks: { request: () => Promise.reject(new DOMException("Denied", "SecurityError")) },
    });

    const tab = await openTab();
    tab.userState.setRenown(3);
    await settle(tab.PERSIST_DEBOUNCE_MS);

    expect(storedRenown(storage)).toBe(3);
  });
});

describe("this device's local section", () => {
  const local = {
    farmSwitchBackup: { note: "progress before switching farms" },
    syncReceipt: { appliedPlaytime: 3600 },
  };

  it("is written back with progress but never exported", async () => {
    const { storage } = recordingStorage({ [PROGRESS_KEY]: buildState(1, { local }) });
    vi.stubGlobal("localStorage", storage);

    const tab = await openTab();
    tab.userState.setRenown(2);
    await settle(tab.PERSIST_DEBOUNCE_MS);

    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null")).toMatchObject({ local });
    expect(JSON.parse(tab.userState.exportBackup())).not.toHaveProperty("local");
  });

  it("is left out of a newer build's verbatim export", async () => {
    const newer = buildState(8, { local }, NEWER_VERSION);
    const { storage } = recordingStorage({ [PROGRESS_KEY]: newer });
    vi.stubGlobal("localStorage", storage);

    const tab = await openTab();
    const exported = JSON.parse(tab.userState.exportBackup()) as Record<string, unknown>;

    expect(exported).not.toHaveProperty("local");
    const { local: _local, ...withoutLocal } = JSON.parse(newer) as Record<string, unknown>;
    expect(exported).toEqual(withoutLocal);
  });

  it("survives a restore, which never brings a backup's own section in", async () => {
    const { storage } = recordingStorage({ [PROGRESS_KEY]: buildState(1, { local }) });
    vi.stubGlobal("localStorage", storage);

    const tab = await openTab();
    const foreign = buildState(12, { local: { syncReceipt: { appliedPlaytime: 1 } } });
    expect(tab.userState.restoreBackup(foreign)).toEqual({ ok: true });
    await settle(0);

    const stored = JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null") as Record<string, unknown>;
    expect(stored).toMatchObject({ local, progress: { renown: 12 } });
    expect(JSON.parse(tab.userState.exportBackup())).not.toHaveProperty("local");
  });

  it("is kept by a progress reset & cleared by a full reset", async () => {
    const { storage } = recordingStorage({ [PROGRESS_KEY]: buildState(1, { local }) });
    vi.stubGlobal("localStorage", storage);

    const tab = await openTab();
    tab.userState.resetProgress();
    await settle(0);
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null")).toMatchObject({ local });

    tab.userState.resetAll();
    await settle(0);
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null")).not.toHaveProperty("local");
  });
});

function storedRenownOf(json: string): number {
  return (JSON.parse(json) as { progress: { renown: number } }).progress.renown;
}
