import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import type { SyncedSave } from "#lib/sync/lane-state.js";
import type { ItemId } from "#lib/types/tracker-data.js";

const key = "mistria-fyi:progress";
const item = "turnip" as ItemId;
let storage: Storage;

async function openStore() {
  vi.resetModules();
  const { userState } = await import("./user-state.svelte.js");
  userState.loadFromStorage();
  return userState;
}

beforeEach(() => {
  storage = memoryStorage({});
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { addEventListener: () => undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("holds the first edit until a manual lane is durable, then survives a fresh load", async () => {
  const store = await openStore();
  store.toggleAlmanacItem(item);
  expect(store.trackingLaneNeeded).toBe(true);
  expect(store.state.progress.almanac.has(item)).toBe(false);
  expect(storage.getItem(key)).toBeNull();
  expect(await store.startTrackingByHand()).toBe(true);
  expect(store.trackingLane).toBe("manual");
  expect(store.state.progress.almanac.has(item)).toBe(true);
  // An explicit backup restore flushes the held edit without depending on a timer.
  store.restoreBackup(store.exportBackup());
  const fresh = await openStore();
  expect(fresh.trackingLane).toBe("manual");
  expect(fresh.state.progress.almanac.has(item)).toBe(true);
});

it("discards a cancelled edit", async () => {
  const store = await openStore();
  store.toggleAlmanacItem(item);
  expect(store.trackingLaneNeeded).toBe(true);
  store.cancelLaneChoice();
  expect(store.trackingLaneNeeded).toBe(false);
  await store.startTrackingByHand();
  expect(store.state.progress.almanac.has(item)).toBe(false);
});

it("does not apply an edit if storing the lane fails", async () => {
  const store = await openStore();
  store.toggleAlmanacItem(item);
  storage.setItem = () => {
    throw new DOMException("Full", "QuotaExceededError");
  };
  expect(await store.startTrackingByHand()).toBe(false);
  expect(store.state.progress.almanac.has(item)).toBe(false);
  expect(storage.getItem(key)).toBeNull();
});

it("allows in-memory edits when persistence is unavailable", async () => {
  storage.getItem = () => {
    throw new DOMException("Denied", "SecurityError");
  };
  const store = await openStore();
  store.toggleAlmanacItem(item);
  expect(store.trackingLaneNeeded).toBe(false);
  expect(store.state.progress.almanac.has(item)).toBe(true);
});

it("replays a held edit against another tab’s latest progress", async () => {
  const store = await openStore();
  store.toggleAlmanacItem(item);
  const concurrent = JSON.parse(store.exportBackup()) as { progress: { renown: number } };
  concurrent.progress.renown = 7;
  storage.setItem(key, JSON.stringify(concurrent));
  await store.startTrackingByHand();
  expect(store.state.progress.renown).toBe(7);
  expect(store.state.progress.almanac.has(item)).toBe(true);
});

it("records a manual import and its lane together", async () => {
  const store = await openStore();
  const result = await store.mergeFromSave({ renown: 3 });
  expect(result.kind).toBe("applied");
  expect(JSON.parse(storage.getItem(key) ?? "null")).toMatchObject({
    local: { trackingLane: "manual" },
    progress: { renown: 3 },
  });
  const fresh = await openStore();
  expect(fresh.trackingLane).toBe("manual");
});

it.each([false, true])(
  "preserves the first check-off through sync even when already saved: %s",
  async (alreadySaved) => {
    const store = await openStore();
    store.toggleAlmanacItem(item);
    expect(store.trackingLaneNeeded).toBe(true);
    store.chooseSyncTracking();
    expect(store.trackingLaneNeeded).toBe(false);
    expect(store.state.progress.almanac.has(item)).toBe(false);
    const save: SyncedSave = {
      completed: { almanac: new Set(alreadySaved ? [item] : []) },
      day: { season: "spring", weather: "calm" },
      metadata: {
        farmName: null,
        identity: { creationVersion: null, saveNumber: "123" },
        importedAt: 1,
        playerName: null,
      },
      playtime: 100,
    };
    expect(await store.startSyncLane({ kind: "computer" }, save)).toBe(true);
    expect(store.trackingLane).toBe("sync");
    expect(store.state.progress.almanac.has(item)).toBe(true);
  },
);

it("drops the held check-off when sync setup is cancelled", async () => {
  const store = await openStore();
  store.toggleAlmanacItem(item);
  store.chooseSyncTracking();
  store.cancelLaneChoice();
  await store.startTrackingByHand();
  expect(store.state.progress.almanac.has(item)).toBe(false);
});
