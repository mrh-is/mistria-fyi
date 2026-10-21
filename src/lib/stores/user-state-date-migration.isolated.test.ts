import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { PROGRESS_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import type { SerializedState } from "#lib/stores/progress-storage.js";
import type { userState as UserStateStore } from "#lib/stores/user-state.svelte.js";
import type { ItemId } from "#lib/types/tracker-data.js";

let userState: typeof UserStateStore;

function exportedState(): SerializedState {
  return JSON.parse(userState.exportBackup()) as SerializedState;
}

function legacyBackup(version: number, dates: unknown = Object.keys(trackerData.dates)): string {
  const current = exportedState();
  return JSON.stringify({
    ...current,
    progress: {
      ...current.progress,
      almanac: ["inn_menu", "turnip"],
      dates,
      provenance: {
        "almanac/inn_menu": { playtime: 123, source: "save" },
        "dates/inn_meal": { source: "manual" },
        "dates/unknown_date": { source: "unknown" },
      },
      resolutions: {
        "almanac/turnip": { saveValue: false },
        "dates/inn_meal": { saveValue: true },
      },
    },
    version,
    worldState: { season: "summer", weather: "inclement" },
  });
}

beforeEach(async () => {
  vi.resetModules();
  ({ userState } = await import("#lib/stores/user-state.svelte.js"));
});

afterEach(() => {
  userState.resetAll();
  vi.unstubAllGlobals();
});

describe("retired Dates progress", () => {
  it.each([1, 2, 3])("drops version %i Dates without adding inspiration items", (version) => {
    expect(userState.restoreBackup(legacyBackup(version))).toEqual({ ok: true });
    const exported = exportedState();
    expect(exported.version).toBe(CURRENT_SERIALIZATION_VERSION);
    expect(exported.progress.almanac).toEqual(["inn_menu", "turnip"]);
    expect(exported.progress).not.toHaveProperty("dates");
    expect(exported.progress).not.toHaveProperty("legacyDates");
    expect(Object.keys(exported.progress.provenance ?? {})).not.toContain("dates/inn_meal");
    expect(Object.keys(exported.progress.resolutions ?? {})).not.toContain("dates/inn_meal");
    expect(exported.worldState).toEqual({ season: "summer", weather: "inclement" });
    const written = userState.exportBackup();
    expect(userState.restoreBackup(written)).toEqual({ ok: true });
    expect(userState.exportBackup()).toBe(written);
  });

  it("preserves canonical inspiration history while dropping retired history", () => {
    expect(userState.restoreBackup(legacyBackup(3))).toEqual({ ok: true });
    expect(exportedState().progress.provenance).toEqual({
      "almanac/inn_menu": { playtime: 123, source: "save" },
    });
    expect(exportedState().progress.resolutions).toEqual({
      "almanac/turnip": { saveValue: false },
    });
  });

  it.each(["unknown_date", null, [42], ["constructor", "unknown_date"]])(
    "silently drops obsolete values, including malformed or unknown ones: %j",
    (dates) => {
      expect(userState.restoreBackup(legacyBackup(1, dates))).toEqual({ ok: true });
      expect(exportedState().progress.almanac).toEqual(["inn_menu", "turnip"]);
      expect(exportedState().progress).not.toHaveProperty("dates");
      expect(exportedState().progress).not.toHaveProperty("legacyDates");
    },
  );

  it("still replaces local progress when restoring an old backup", () => {
    const backup = legacyBackup(3);
    userState.toggleAlmanacItem("stone" as ItemId);
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    expect(exportedState().progress.almanac).toEqual(["inn_menu", "turnip"]);
  });

  it("hydrates old progress, writes the new version, and reloads without quarantine", async () => {
    const storage = memoryStorage({ [PROGRESS_STORAGE_KEY]: legacyBackup(3) });
    let flush: (() => void) | undefined;
    vi.stubGlobal("window", {
      addEventListener(type: string, listener: () => void) {
        if (type === "pagehide") flush = listener;
      },
    });
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    ({ userState } = await import("#lib/stores/user-state.svelte.js"));
    userState.loadFromStorage();

    expect(exportedState()).toMatchObject({
      progress: { almanac: ["inn_menu", "turnip"] },
      version: CURRENT_SERIALIZATION_VERSION,
    });
    userState.setRenown(10);
    expect(flush).toBeDefined();
    flush?.();
    const written = storage.getItem(PROGRESS_STORAGE_KEY);
    if (written === null) throw new Error("Expected hydrated progress to be written");
    const stored = JSON.parse(written) as SerializedState;
    expect(stored.version).toBe(CURRENT_SERIALIZATION_VERSION);
    expect(stored.progress.almanac).toEqual(["inn_menu", "turnip"]);
    expect(stored.progress).not.toHaveProperty("dates");
    userState.loadFromStorage();
    expect(exportedState().progress.almanac).toEqual(["inn_menu", "turnip"]);
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();
  });
});
