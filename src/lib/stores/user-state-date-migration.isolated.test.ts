import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { PROGRESS_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import type { SerializedState } from "#lib/stores/progress-storage.js";
import type { userState as UserStateStore } from "#lib/stores/user-state.svelte.js";
import type { ItemId } from "#lib/types/tracker-data.js";

let userState: typeof UserStateStore;

function inspirationItem(dateId: string): string {
  const source = Object.entries(trackerData.dates)
    .find(([id]) => id === dateId)?.[1]
    .sources.find((entry) => entry.type === "date_inspiration");
  if (!source) throw new Error("Expected a date unlock item");
  const canonical = trackerIndex.memberToCanonicalAlmanacId.get(source.itemId);
  if (!canonical) throw new Error("Expected the inspiration item in the Almanac");
  return canonical;
}

function exportedState(): SerializedState {
  return JSON.parse(userState.exportBackup()) as SerializedState;
}

function legacyBackup(dates: unknown = ["inn_meal"], almanac = ["turnip"]): string {
  const current = exportedState();
  return JSON.stringify({
    ...current,
    progress: { ...current.progress, almanac, dates },
    version: 1,
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

describe("version-one date progress migration", () => {
  it("preserves dates as inspiration items alongside existing Almanac progress", () => {
    expect(userState.restoreBackup(legacyBackup(["inn_meal", "deep_woods_picnic"]))).toEqual({
      ok: true,
    });
    const exported = exportedState();
    expect(exported.version).toBe(2);
    expect(exported.progress.almanac).toEqual(
      ["turnip", inspirationItem("inn_meal"), inspirationItem("deep_woods_picnic")].toSorted(),
    );
    expect(exported.progress).not.toHaveProperty("dates");
    expect(exported.worldState).toEqual({ season: "summer", weather: "inclement" });
  });

  it("deduplicates migrated progress & writes an idempotent current backup", () => {
    const item = inspirationItem("inn_meal");
    expect(userState.restoreBackup(legacyBackup(["inn_meal", "inn_meal"], [item]))).toEqual({
      ok: true,
    });
    const migrated = userState.exportBackup();
    expect(exportedState().progress.almanac).toEqual([item]);
    expect(userState.restoreBackup(migrated)).toEqual({ ok: true });
    expect(userState.exportBackup()).toBe(migrated);
  });

  it("retains unknown date IDs outside counted Almanac progress", () => {
    expect(userState.restoreBackup(legacyBackup(["unknown_date", "constructor"], []))).toEqual({
      ok: true,
    });
    expect(exportedState().progress.almanac).toEqual([]);
    expect(exportedState().progress.legacyDates).toEqual(["constructor", "unknown_date"]);
    const migrated = userState.exportBackup();
    expect(userState.restoreBackup(migrated)).toEqual({ ok: true });
    expect(userState.exportBackup()).toBe(migrated);
  });

  it("maps every native date into the Date Inspiration category", () => {
    const dateIds = Object.keys(trackerData.dates);
    const inspirations = Object.entries(trackerData.almanac)
      .find(([id]) => id === "date_inspiration")?.[1]
      .items.map((entry) => entry.itemIds[0]);
    expect(dateIds.map((id) => inspirationItem(id)).toSorted()).toEqual(inspirations?.toSorted());
    expect(userState.restoreBackup(legacyBackup(dateIds, []))).toEqual({ ok: true });
    expect(exportedState().progress.almanac).toEqual(inspirations?.toSorted());
  });

  it("replaces local progress when restoring a migrated backup", () => {
    const backup = legacyBackup(["inn_meal"], []);
    userState.toggleAlmanacItem("turnip" as ItemId);
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    expect(exportedState().progress.almanac).toEqual([inspirationItem("inn_meal")]);
  });

  it.each(["inn_meal", null, [42]])("rejects malformed legacy dates: %j", (dates) => {
    expect(userState.restoreBackup(legacyBackup(dates))).toEqual({
      error: "invalid-fields",
      ok: false,
    });
  });

  it("hydrates a launch-format blob without quarantining it", async () => {
    const storage = memoryStorage({ [PROGRESS_STORAGE_KEY]: legacyBackup() });
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", storage);
    vi.resetModules();
    ({ userState } = await import("#lib/stores/user-state.svelte.js"));
    userState.loadFromStorage();

    expect(JSON.parse(userState.exportBackup())).toMatchObject({
      progress: { almanac: [inspirationItem("inn_meal"), "turnip"].toSorted() },
      version: 2,
    });
    expect(storage.getItem(QUARANTINE_STORAGE_KEY)).toBeNull();
  });
});
