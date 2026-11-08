import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import type { ItemId } from "#lib/types/tracker-data.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const TURNIP = "turnip" as ItemId;

function blob(renown: number, local?: Record<string, unknown>): string {
  return JSON.stringify({
    lastImport: null,
    local: local ?? { trackingLane: "manual" },
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
    version: CURRENT_SERIALIZATION_VERSION,
    worldState: { season: "spring", weather: "calm" },
  });
}

async function open(initial?: string) {
  const storage = memoryStorage(initial === undefined ? {} : { [PROGRESS_KEY]: initial });
  const events = new EventTarget();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", events);
  vi.resetModules();
  // Load the public entry point first, as a feature consumer does.
  const features = await import("./index.js");
  const { PERSIST_DEBOUNCE_MS, userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  await vi.advanceTimersByTimeAsync(PERSIST_DEBOUNCE_MS);
  return { ...features, events, storage, userState };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("progress feature facades", () => {
  it("shares imports & strict backup restores with the compatibility API", async () => {
    const { progressBackup, progressImport, userState } = await open(blob(4));
    const metadata = {
      farmName: "Fern",
      identity: { creationVersion: null, saveNumber: "123" },
      importedAt: 1000,
      playerName: "Ada",
    };
    expect(await progressImport.mergeFromSave({ mineFloor: 10 }, { metadata })).toMatchObject({
      kind: "applied",
    });
    expect(userState.state.progress).toMatchObject({ mineFloor: 10, renown: 4 });
    expect(progressImport.lastImport).toEqual(metadata);
    expect(progressBackup.exportBackup()).toBe(userState.exportBackup());
    expect(JSON.parse(progressBackup.exportBackup())).not.toHaveProperty("local");

    expect(userState.restoreBackup(blob(2))).toEqual({ ok: true });
    expect(progressImport.lastImport).toBeNull();
    const restored = JSON.parse(progressBackup.exportBackup()) as { progress: { renown: number } };
    expect(restored.progress.renown).toBe(2);
    const before = progressBackup.exportBackup();
    expect(progressBackup.restoreBackup("broken")).toEqual({ error: "malformed-json", ok: false });
    expect(userState.exportBackup()).toBe(before);
  });

  it("keeps feature & compatibility getters live across external writes & quarantine", async () => {
    const { events, progressBackup, progressSync, storage, userState } = await open(blob(4));
    expect(userState.syncLane).toBeUndefined();
    expect(progressSync.syncLane).toBeUndefined();
    const synced = blob(9, { syncLane: { kind: "computer" }, trackingLane: "sync" });
    storage.setItem(PROGRESS_KEY, synced);
    events.dispatchEvent(
      Object.assign(new Event("storage"), { key: PROGRESS_KEY, newValue: synced }),
    );
    expect(progressSync.syncLane).toEqual({ kind: "computer" });
    expect(userState.syncLane).toEqual({ kind: "computer" });
    expect(userState.trackingLane).toBe("sync");
    expect(progressSync.syncBlocked).toBe(false);

    storage.setItem(PROGRESS_KEY, "broken");
    events.dispatchEvent(
      Object.assign(new Event("storage"), { key: PROGRESS_KEY, newValue: "broken" }),
    );
    expect(progressBackup.unreadableData).toBe("broken");
    expect(userState.unreadableData).toBe("broken");
    expect(progressSync.syncBlocked).toBe(true);
    expect(userState.syncBlocked).toBe(true);
  });

  it("replays or cancels pending edits through the sync facade & preserves the lane on reset", async () => {
    const { progressBackup, progressSync, userState } = await open();
    userState.toggleMuseumItem(TURNIP);
    expect(progressSync.trackingLaneNeeded).toBe(true);
    expect(userState.trackingLaneNeeded).toBe(true);
    progressSync.chooseSyncTracking();
    expect(userState.trackingLaneNeeded).toBe(false);
    progressSync.cancelLaneChoice();
    expect(userState.state.progress.museum.has(TURNIP)).toBe(false);

    userState.toggleMuseumItem(TURNIP);
    expect(await progressSync.startTrackingByHand()).toBe(true);
    expect(userState.state.progress.museum.has(TURNIP)).toBe(true);
    expect(progressSync.trackingLane).toBe("manual");
    progressBackup.resetProgress();
    expect(userState.state.progress.museum.size).toBe(0);
    expect(userState.trackingLane).toBe("manual");
  });
});
