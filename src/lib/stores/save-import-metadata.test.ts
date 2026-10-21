import { afterEach, describe, expect, it } from "vitest";

import { userState } from "./user-state.svelte.js";

const metadata = {
  farmName: "Fern",
  identity: { creationVersion: null, saveNumber: "123" },
  importedAt: 1_792_531_800_000,
  playerName: "Ada",
};

afterEach(() => {
  userState.resetAll();
});

describe("manual import metadata", () => {
  it("travels in backups, restores, and survives progress-only merges", () => {
    userState.mergeFromSave({}, { metadata });
    const backup = userState.exportBackup();
    userState.resetAll();
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    userState.mergeFromSave({ renown: 4 });
    expect(userState.state.lastImport).toEqual(metadata);
    expect(userState.state.progress.renown).toBe(4);
  });

  it("updates the display on a rename while keeping the stable identity", () => {
    userState.mergeFromSave({}, { metadata });
    userState.mergeFromSave(
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

  it("clears import history when progress is reset", () => {
    userState.mergeFromSave({}, { metadata });
    userState.resetProgress();
    expect(userState.state.lastImport).toBeNull();
  });
});
