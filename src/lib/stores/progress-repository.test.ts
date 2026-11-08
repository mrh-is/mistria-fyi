import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import {
  createDefaultPreferences,
  createProgressRepository,
  PERSIST_DEBOUNCE_MS,
} from "./progress-repository.js";
import {
  createDefaultWorldState,
  emptyProgressHistory,
  emptyRetainedProgress,
  readProgressBlob,
} from "./progress-storage.js";
import {
  PREFERENCES_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  PROGRESS_WRITE_LOCK,
  QUARANTINE_STORAGE_KEY,
} from "./storage-keys.js";

import type { DeviceLocalState } from "#lib/sync/lane-state.js";
import type { ItemId } from "#lib/types/tracker-data.js";

import type { ProgressRepositoryEnvironment } from "./progress-repository.js";
import type { LoadedProgress } from "./progress-storage.js";

function fresh(): Omit<LoadedProgress, "local"> {
  return {
    history: emptyProgressHistory(),
    lastImport: null,
    progress: createDefaultProgress(Set, []),
    retained: emptyRetainedProgress(),
    worldState: createDefaultWorldState(),
  };
}

function blob(renown: number, version = CURRENT_SERIALIZATION_VERSION): string {
  return JSON.stringify({
    local: { trackingLane: "manual" },
    progress: {
      almanac: [],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      museum: [],
      renown,
      spells: [],
    },
    version,
    worldState: { season: "spring", weather: "calm" },
  });
}

function heldLocks() {
  const tasks: (() => void)[] = [];
  const state = { held: false, names: [] as string[] };
  const locks = {
    request(name: string, task: () => void): Promise<void> {
      state.names.push(name);
      return new Promise((resolve) => {
        tasks.push(() => {
          state.held = true;
          try {
            task();
          } finally {
            state.held = false;
            resolve();
          }
        });
      });
    },
  };
  return {
    locks,
    async release(): Promise<void> {
      while (tasks.length > 0) tasks.shift()?.();
      await Promise.resolve();
    },
    async releaseOne(): Promise<void> {
      tasks.shift()?.();
      await Promise.resolve();
    },
    state,
  };
}

function openRepository(storage = memoryStorage(), locked = true) {
  let loaded = fresh();
  const gate = heldLocks();
  const events = new EventTarget();
  const writes: { held: boolean; key: string; value: string }[] = [];
  const environment: ProgressRepositoryEnvironment = {
    events,
    locks: () => (locked ? gate.locks : undefined),
    ownsStorage: (area) => area === storage,
    read(key) {
      try {
        return { ok: true, value: storage.getItem(key) };
      } catch {
        return { ok: false };
      }
    },
    write(key, value) {
      try {
        storage.setItem(key, value);
        writes.push({ held: gate.state.held, key, value });
        return true;
      } catch {
        return false;
      }
    },
  };
  const live = {
    emptyProgress: fresh,
    historySnapshot: () => structuredClone(loaded.history),
    local: {} as DeviceLocalState,
    preferences: createDefaultPreferences(),
    snapshot: () => loaded,
  };
  const statusChanged = vi.fn();
  const repository = createProgressRepository(live, environment, statusChanged);
  repository.onExternalChange((next) => {
    loaded = next;
  });
  return {
    environment,
    events,
    gate,
    live,
    get loaded() {
      return loaded;
    },
    repository,
    async save(): Promise<void> {
      repository.schedule(repository.serialize());
      await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
      await gate.release();
    },
    statusChanged,
    storage,
    stored() {
      const read = readProgressBlob(storage.getItem(PROGRESS_STORAGE_KEY) ?? "", "repair");
      if (read.kind !== "ok") throw new Error(`Unexpected stored progress: ${read.kind}`);
      return read.loaded;
    },
    writes,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("progress repository", () => {
  it("keeps counter-bearing write intents private", () => {
    type PublicIntent = Parameters<ReturnType<typeof createProgressRepository>["write"]>[0];
    expectTypeOf<PublicIntent["kind"]>().toEqualTypeOf<"staged" | "sync">();
  });

  it("reads & writes without window or a reactive shell", async () => {
    expect("window" in globalThis).toBe(false);
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }));
    tab.repository.read();
    expect(tab.loaded.progress.renown).toBe(4);
    tab.loaded.progress.renown = 10;
    tab.repository.replace();
    expect(tab.stored().progress.renown).toBe(4);
    await tab.gate.release();
    expect(tab.stored().progress.renown).toBe(10);
    expect(tab.gate.state.names).toEqual([PROGRESS_WRITE_LOCK]);
    expect(tab.writes).toEqual([
      { held: true, key: PROGRESS_STORAGE_KEY, value: expect.any(String) as unknown },
    ]);
  });

  const rows = ["unchanged", "cleared", "readable", "unreadable", "newer"] as const;
  const modes = ["auto-save", "replace", "merge"] as const;
  describe.each(modes)("write table: %s", (mode) => {
    it.each(rows)("handles %s storage under the lock", async (row) => {
      vi.useFakeTimers();
      const initial = blob(4);
      const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: initial }));
      tab.repository.read();
      tab.loaded.progress.renown = 10;
      const newer = blob(20, CURRENT_SERIALIZATION_VERSION + 1);
      let pending: Promise<unknown> | undefined;
      if (mode === "replace") {
        tab.repository.replace();
        tab.loaded.progress.renown = 2;
      } else if (mode === "merge") {
        pending = tab.repository.merge({ mineFloor: 10 });
      } else {
        tab.repository.schedule(tab.repository.serialize());
        await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
      }
      const values = { newer, readable: blob(20), unreadable: "broken" };
      if (row === "cleared") tab.storage.removeItem(PROGRESS_STORAGE_KEY);
      else if (row !== "unchanged") tab.storage.setItem(PROGRESS_STORAGE_KEY, values[row]);
      await tab.gate.release();
      await pending;

      // Each tuple independently pins writes, live renown, stored renown/kind, & stored floor.
      const outcomes = {
        "auto-save": {
          cleared: [1, 10, 10, 0],
          newer: [0, 10, "newer", undefined],
          readable: [0, 20, 20, 0],
          unchanged: [1, 10, 10, 0],
          unreadable: [0, 10, "unreadable", undefined],
        },
        merge: {
          cleared: [1, 10, 10, 10],
          newer: [0, 10, "newer", undefined],
          readable: [1, 20, 20, 10],
          unchanged: [1, 10, 10, 10],
          unreadable: [1, 10, 10, 10],
        },
        replace: {
          cleared: [1, 2, 10, 0],
          newer: [0, 2, "newer", undefined],
          readable: [1, 2, 10, 0],
          unchanged: [1, 2, 10, 0],
          unreadable: [1, 2, 10, 0],
        },
      } as const;
      const [writeCount, liveRenown, storedRenown, storedFloor] = outcomes[mode][row];
      const progressWrites = tab.writes.filter((write) => write.key === PROGRESS_STORAGE_KEY);
      expect(progressWrites).toHaveLength(writeCount);
      expect(progressWrites.map((write) => write.held)).toEqual(
        Array.from({ length: writeCount }, () => true),
      );
      const stored = readProgressBlob(tab.storage.getItem(PROGRESS_STORAGE_KEY) ?? "", "repair");
      expect(stored.kind === "ok" ? stored.loaded.progress.renown : stored.kind).toBe(storedRenown);
      expect(stored.kind === "ok" ? stored.loaded.progress.mineFloor : undefined).toBe(storedFloor);
      expect(tab.loaded.progress.renown).toBe(liveRenown);
      expect(tab.storage.getItem(QUARANTINE_STORAGE_KEY)).toBe(
        row === "unreadable" ? "broken" : null,
      );
      expect(tab.storage.getItem(PROGRESS_STORAGE_KEY) === newer).toBe(row === "newer");
      const blocked = row === "newer" || (row === "unreadable" && mode === "auto-save");
      const failureKind = row === "newer" ? "newer-data" : "unreadable";
      expect(tab.repository.status()).toMatchObject({
        failureKind: blocked ? failureKind : "unavailable",
        ready: !blocked,
      });
    });
  });

  it("distinguishes a failed read from a missing key, preserving data after edits & reload", async () => {
    vi.useFakeTimers();
    const initial = blob(18);
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: initial }));
    const read = tab.environment.read;
    tab.environment.read = (key) => (key === PROGRESS_STORAGE_KEY ? { ok: false } : read(key));
    tab.repository.read();
    tab.loaded.progress.renown = 2;
    await tab.save();
    tab.repository.replace();
    await tab.gate.release();
    expect(tab.repository.status()).toMatchObject({ failureKind: "unavailable", ready: false });
    expect(tab.storage.getItem(PROGRESS_STORAGE_KEY)).toBe(initial);
    const reloaded = openRepository(tab.storage);
    reloaded.repository.read();
    expect(reloaded.loaded.progress.renown).toBe(18);
    const missing = openRepository();
    missing.repository.read();
    expect(missing.repository.status().ready).toBe(true);
  });

  it("invalidates an auto-save queued before an explicit replacement", async () => {
    vi.useFakeTimers();
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }));
    tab.repository.read();
    tab.loaded.progress.renown = 10;
    tab.repository.schedule(tab.repository.serialize());
    await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
    tab.loaded.progress.renown = 2;
    tab.repository.replace();
    await tab.gate.releaseOne();
    expect(tab.writes).toEqual([]);
    expect(tab.stored().progress.renown).toBe(4);
    await tab.gate.release();
    expect(tab.writes.filter((write) => write.key === PROGRESS_STORAGE_KEY)).toHaveLength(1);
    const reloaded = openRepository(tab.storage);
    reloaded.repository.read();
    expect(reloaded.loaded.progress.renown).toBe(2);
  });

  it("keeps a failed quarantine recovery available after reload", async () => {
    const storage = memoryStorage({ [PROGRESS_STORAGE_KEY]: "broken" });
    const tab = openRepository(storage);
    tab.repository.read();
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBe("broken");
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === PROGRESS_STORAGE_KEY) throw new Error("Storage full");
      setItem(key, value);
    };
    tab.repository.enableAfterReplace();
    tab.repository.replace();
    await tab.gate.release();
    expect(storage.getItem(PROGRESS_STORAGE_KEY)).toBe("broken");
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBe("broken");
    const reloaded = openRepository(storage);
    reloaded.repository.read();
    expect(reloaded.repository.status()).toMatchObject({ ready: false, unreadableData: "broken" });
  });

  it("refuses an explicit replacement when quarantine cannot preserve a concurrent corrupt value", async () => {
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }));
    tab.repository.read();
    tab.repository.replace();
    tab.storage.setItem(PROGRESS_STORAGE_KEY, "broken");
    tab.environment.write = () => false;
    await tab.gate.release();
    expect(tab.storage.getItem(PROGRESS_STORAGE_KEY)).toBe("broken");
    expect(tab.repository.status()).toMatchObject({ failureKind: "unreadable", ready: false });
  });

  it("rebases removals & decreases made while an import waits", async () => {
    vi.useFakeTimers();
    const turnip = "turnip" as ItemId;
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }));
    tab.repository.read();
    tab.loaded.progress.renown = 10;
    tab.loaded.progress.museum.add(turnip);
    const pending = tab.repository.merge({ mineFloor: 10 });
    tab.loaded.progress.renown = 2;
    tab.loaded.progress.museum.delete(turnip);
    tab.loaded.history.provenance.renown = { source: "manual" };
    await tab.gate.release();
    expect(await pending).toMatchObject({ kind: "applied" });
    expect(tab.stored().progress.renown).toBe(10);
    expect(tab.loaded.progress.renown).toBe(2);
    expect(tab.loaded.progress.museum.has(turnip)).toBe(false);
    await tab.save();
    const reloaded = openRepository(tab.storage);
    reloaded.repository.read();
    expect(reloaded.loaded.progress).toMatchObject({ mineFloor: 10, renown: 2 });
    expect(reloaded.loaded.progress.museum.has(turnip)).toBe(false);
    expect(reloaded.loaded.history.provenance.renown).toEqual({ source: "manual" });
  });

  it("flushes pagehide synchronously & resyncs on pageshow without browser globals", () => {
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }));
    tab.repository.read();
    tab.loaded.progress.renown = 10;
    tab.events.dispatchEvent(new Event("pagehide"));
    expect(tab.stored().progress.renown).toBe(10);
    expect(tab.writes[0]?.held).toBe(false);
    tab.storage.setItem(PROGRESS_STORAGE_KEY, blob(20));
    tab.events.dispatchEvent(new Event("pagehide"));
    expect(tab.stored().progress.renown).toBe(20);
    expect(tab.loaded.progress.renown).toBe(20);
    expect(tab.writes).toHaveLength(1);
    tab.storage.setItem(PROGRESS_STORAGE_KEY, blob(24));
    tab.events.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(tab.loaded.progress.renown).toBe(24);
  });

  it("adopts progress events, re-reads stale preference events, & releases listeners", () => {
    const tab = openRepository();
    tab.repository.read();
    const incoming = blob(20);
    tab.storage.setItem(PROGRESS_STORAGE_KEY, incoming);
    tab.events.dispatchEvent(
      Object.assign(new Event("storage"), { key: PROGRESS_STORAGE_KEY, newValue: incoming }),
    );
    expect(tab.loaded.progress.renown).toBe(20);
    tab.storage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ everythingGrouping: "source", showSpoilers: true }),
    );
    tab.events.dispatchEvent(
      Object.assign(new Event("storage"), { key: PREFERENCES_STORAGE_KEY, newValue: "{}" }),
    );
    expect(tab.live.preferences).toEqual({ everythingGrouping: "source", showSpoilers: true });
    tab.repository.dispose();
    tab.events.dispatchEvent(
      Object.assign(new Event("storage"), { key: PROGRESS_STORAGE_KEY, newValue: blob(24) }),
    );
    expect(tab.loaded.progress.renown).toBe(20);
  });

  it("writes synchronously when Web Locks are absent or refuse the request", async () => {
    const tab = openRepository(memoryStorage({ [PROGRESS_STORAGE_KEY]: blob(4) }), false);
    tab.repository.read();
    tab.loaded.progress.renown = 10;
    tab.repository.replace();
    expect(tab.stored().progress.renown).toBe(10);
    tab.environment.locks = () => ({
      request: () => Promise.reject(new Error("Locks unavailable")),
    });
    tab.loaded.progress.renown = 12;
    tab.repository.replace();
    await Promise.resolve();
    expect(tab.stored().progress.renown).toBe(12);
  });
});
