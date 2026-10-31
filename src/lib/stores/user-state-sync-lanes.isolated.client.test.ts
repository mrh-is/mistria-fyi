import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import type { SyncedSave } from "#lib/stores/user-state.svelte.js";
import type { ItemId } from "#lib/types/tracker-data.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const TOKEN = "__________________________________________8";
const OTHER_KEY = "BBECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const RETIRE = { mailboxId: "Um4iPaITziwZ-9gBeM0c6g", token: TOKEN };
const SAVED_ITEM = "apple" as ItemId;
const HAND_ITEM = "pear" as ItemId;

interface StoredBlob {
  lastImport: null | { farmName: null | string };
  local?: Record<string, unknown>;
  progress: { almanac: string[]; renown: number };
}

function blob(local?: Record<string, unknown>, renown = 7): string {
  return JSON.stringify({
    ...(local ? { local } : {}),
    lastImport: null,
    progress: {
      almanac: [HAND_ITEM],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      mineFloor: 0,
      museum: [],
      renown,
      spells: [],
    },
    version: 1,
    worldState: { season: "spring", weather: "calm" },
  });
}

const SAVE: SyncedSave = {
  completed: { almanac: new Set([SAVED_ITEM]) },
  metadata: {
    farmName: "Sunny Meadow",
    identity: { creationVersion: null, saveNumber: "1315159680" },
    importedAt: 1,
    playerName: "Robin",
  },
  playtime: 3600,
};

let storage: Storage;

function stored(): StoredBlob {
  return JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null") as StoredBlob;
}

async function openStore(initial?: string) {
  storage = memoryStorage(initial === undefined ? {} : { [PROGRESS_KEY]: initial });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { addEventListener: () => undefined });
  vi.resetModules();
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  return userState;
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("starting a syncing lane", () => {
  it("erases progress & applies the first save in the write that records the lane", async () => {
    const backup = { backup: {}, farmName: "Old Farm" };
    const userState = await openStore(
      blob({ farmSwitchBackup: backup, syncPendingRetires: [RETIRE], syncReceipt: { counter: 1 } }),
    );
    let writes = 0;
    const setItem = storage.setItem.bind(storage);
    storage.setItem = (key, value) => {
      if (key === PROGRESS_KEY) writes++;
      setItem(key, value);
    };

    await userState.startSyncLane({ key: KEY, kind: "following" }, SAVE);

    expect(writes).toBe(1);
    const after = stored();
    expect(after.progress.almanac).toEqual([SAVED_ITEM]);
    expect(after.progress.renown).toBe(0);
    expect(after.lastImport?.farmName).toBe("Sunny Meadow");
    expect(after.local).toEqual({
      farmSwitchBackup: backup,
      syncLane: { key: KEY, kind: "following" },
      syncPendingRetires: [RETIRE],
    });
    expect(userState.syncLane).toEqual({ key: KEY, kind: "following" });
    expect(userState.provenanceOf(`almanac/${SAVED_ITEM}`)).toEqual({
      playtime: 3600,
      source: "save",
    });
  });

  it("stores nothing until the first save applies", async () => {
    const userState = await openStore(blob());
    expect(userState.syncLane).toBeUndefined();
    expect(stored().local).toBeUndefined();
  });

  it("leaves the lane & key out of a backup", async () => {
    const userState = await openStore(blob());
    await userState.startSyncLane({ kind: "computer" }, SAVE);
    expect(JSON.parse(userState.exportBackup())).not.toHaveProperty("local");
  });
});

describe("leaving a lane", () => {
  it("keeps progress & history when the device stops syncing", async () => {
    const userState = await openStore(
      blob({ syncLane: { key: KEY, kind: "following" }, syncReceipt: { counter: 3 } }),
    );
    await userState.stopSyncing();
    const after = stored();
    expect(after.progress.almanac).toEqual([HAND_ITEM]);
    expect(after.progress.renown).toBe(7);
    expect(after.local).toBeUndefined();
    expect(userState.syncLane).toBeUndefined();
  });

  it("queues the computer's code to retire in the same write that leaves", async () => {
    const userState = await openStore(
      blob({ syncLane: { code: { key: KEY, token: TOKEN }, kind: "computer" } }),
    );
    await userState.stopSyncing({ code: { key: KEY, token: TOKEN }, retire: RETIRE });
    expect(stored().local).toEqual({ syncPendingRetires: [RETIRE] });
    expect(userState.syncPendingRetires).toEqual([RETIRE]);

    await userState.confirmRetired([RETIRE]);
    expect(stored().local).toBeUndefined();
  });
});

describe("Data's reset in a syncing lane", () => {
  it("erases progress & the receipt but stays in the lane", async () => {
    const userState = await openStore(
      blob({ syncLane: { kind: "computer" }, syncReceipt: { counter: 3 } }),
    );
    userState.resetProgress();
    const after = stored();
    expect(after.progress.renown).toBe(0);
    expect(after.local).toEqual({ syncLane: { kind: "computer" } });
    expect(userState.syncLane).toEqual({ kind: "computer" });
  });
});

describe("codes", () => {
  it("retires a replaced code only once the new one is stored", async () => {
    const userState = await openStore(
      blob({ syncLane: { code: { key: KEY, token: TOKEN }, kind: "computer" } }),
    );
    await userState.setSharedCode(
      { key: OTHER_KEY, token: TOKEN },
      { code: { key: KEY, token: TOKEN }, retire: RETIRE },
    );
    expect(stored().local).toEqual({
      syncLane: { code: { key: OTHER_KEY, token: TOKEN }, kind: "computer" },
      syncPendingRetires: [RETIRE],
    });
  });

  it("switches the key a following lane reads without leaving it", async () => {
    const userState = await openStore(
      blob({ syncLane: { key: KEY, kind: "following" }, syncReceipt: { counter: 3 } }),
    );
    await userState.switchFollowKey(OTHER_KEY);
    expect(stored().local).toEqual({ syncLane: { key: OTHER_KEY, kind: "following" } });
    expect(stored().progress.renown).toBe(7);
  });

  it("drops a malformed lane without quarantining progress", async () => {
    const userState = await openStore(blob({ syncLane: { key: "short", kind: "following" } }));
    expect(userState.syncLane).toBeUndefined();
    expect(userState.syncBlocked).toBe(false);
    expect(userState.state.progress.renown).toBe(7);
  });
});

describe("writes that don't land, & other tabs", () => {
  it("gives progress back when the lane start can't be stored", async () => {
    const userState = await openStore(blob());
    const setItem = storage.setItem.bind(storage);
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(await userState.startSyncLane({ key: KEY, kind: "following" }, SAVE)).toBe(false);
    expect(userState.state.progress.renown).toBe(7);
    expect(userState.syncLane).toBeUndefined();

    // A later write that does land stores the player's progress, not the erase.
    storage.setItem = setItem;
    expect(await userState.stopSyncing()).toBe(true);
    expect(stored().progress.renown).toBe(7);
    expect(stored().progress.almanac).toEqual([HAND_ITEM]);
  });

  it("starts no lane once the player has left, checked as the write runs", async () => {
    const userState = await openStore(blob());
    const before = storage.getItem(PROGRESS_KEY);
    expect(await userState.startSyncLane({ kind: "computer" }, SAVE, () => false)).toBe(false);
    expect(storage.getItem(PROGRESS_KEY)).toBe(before);
    expect(userState.state.progress.renown).toBe(7);
  });

  it("keeps another tab's newer progress when only the code changes", async () => {
    const userState = await openStore(
      blob({ syncLane: { code: { key: KEY, token: TOKEN }, kind: "computer" } }),
    );
    // Another tab stores newer progress; this tab hasn't heard about it yet.
    storage.setItem(
      PROGRESS_KEY,
      blob({ syncLane: { code: { key: KEY, token: TOKEN }, kind: "computer" } }, 9),
    );
    expect(
      await userState.setSharedCode(
        { key: OTHER_KEY, token: TOKEN },
        { code: { key: KEY, token: TOKEN }, retire: RETIRE },
      ),
    ).toBe(true);
    expect(stored().progress.renown).toBe(9);
    expect(stored().local).toMatchObject({ syncLane: { code: { key: OTHER_KEY } } });
    expect(userState.state.progress.renown).toBe(9);
  });

  it("refuses to replace a code another tab already replaced", async () => {
    const userState = await openStore(
      blob({ syncLane: { code: { key: KEY, token: TOKEN }, kind: "computer" } }),
    );
    const theirs = blob({ syncLane: { code: { key: OTHER_KEY, token: TOKEN }, kind: "computer" } });
    storage.setItem(PROGRESS_KEY, theirs);
    const mine = "CCECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
    expect(
      await userState.setSharedCode(
        { key: mine, token: TOKEN },
        { code: { key: KEY, token: TOKEN }, retire: RETIRE },
      ),
    ).toBe(false);
    expect(storage.getItem(PROGRESS_KEY)).toBe(theirs);
  });
});
