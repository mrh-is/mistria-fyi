import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { userState } from "./user-state.svelte.js";

const metadata = {
  farmName: "Fern",
  identity: { creationVersion: null, saveNumber: "123" },
  importedAt: 1_792_531_800_000,
  playerName: "Ada",
};

beforeEach(() => {
  userState.loadFromStorage();
  userState.resetAll();
});

afterEach(() => {
  userState.resetAll();
});

describe("manual import metadata", () => {
  it("travels in backups, restores, and survives progress-only merges", async () => {
    await userState.mergeFromSave({}, { metadata });
    const backup = userState.exportBackup();
    userState.resetAll();
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    await userState.mergeFromSave({ renown: 4 });
    expect(userState.state.lastImport).toEqual(metadata);
    expect(userState.state.progress.renown).toBe(4);
  });

  it("updates the display on a rename while keeping the stable identity", async () => {
    await userState.mergeFromSave({}, { metadata });
    await userState.mergeFromSave(
      {},
      {
        metadata: {
          ...metadata,
          farmName: "Moss",
          importedAt: metadata.importedAt + 60_000,
          playerName: "Bea",
        },
      },
    );
    expect(userState.state.lastImport).toMatchObject({
      farmName: "Moss",
      identity: metadata.identity,
      playerName: "Bea",
    });
  });

  it("clears import history when progress is reset", async () => {
    await userState.mergeFromSave({}, { metadata });
    userState.resetProgress();
    expect(userState.state.lastImport).toBeNull();
  });

  it("keeps the known farm identity when a renamed save has no save number", async () => {
    await userState.mergeFromSave({}, { metadata });
    const renamed = {
      ...metadata,
      identity: { creationVersion: null, saveNumber: null },
      importedAt: metadata.importedAt + 60_000,
    };
    const outcome = await userState.mergeFromSave({ mineFloor: 10 }, { metadata: renamed });
    expect(outcome.kind).toBe("applied");
    expect(userState.state.lastImport).toEqual({ ...renamed, identity: metadata.identity });
  });

  it("does not attach a renamed save’s creation version to a newly identified farm", async () => {
    await userState.mergeFromSave(
      {},
      {
        metadata: {
          ...metadata,
          identity: {
            creationVersion: { major: 1, minor: 0, patch: 8, pre: null },
            saveNumber: null,
          },
        },
      },
    );
    await userState.mergeFromSave({}, { metadata });
    expect(userState.state.lastImport).toEqual(metadata);

    const identified = {
      ...metadata,
      identity: {
        ...metadata.identity,
        creationVersion: { major: 1, minor: 0, patch: 4, pre: null },
      },
    };
    const outcome = await userState.mergeFromSave({}, { metadata: identified });
    expect(outcome.kind).toBe("applied");
  });
});
