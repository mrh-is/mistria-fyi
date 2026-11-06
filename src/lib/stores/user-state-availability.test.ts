import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getAllProgress } from "#lib/engine/categories.js";
import { userState } from "#lib/stores/user-state.svelte.js";

// These tests assert the defaults, and files in a shared-registry project share `userState`.
beforeEach(() => {
  userState.resetAll();
});

afterEach(() => {
  userState.resetAll();
});

describe("spoilers & availability", () => {
  it("leaves every shelf where it was when spoilers are shown", () => {
    const hidden = getAllProgress(userState.progressContext);
    userState.toggleShowSpoilers();
    expect(getAllProgress(userState.progressContext)).toEqual(hidden);
  });
});

describe("device preferences", () => {
  it("keeps Everything grouping on this device across restore and reset, but outside backups", () => {
    expect(userState.state.everythingGrouping).toBe("category");
    const backup = userState.exportBackup();
    userState.setEverythingGrouping("source");
    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    expect(userState.state.everythingGrouping).toBe("source");
    userState.resetProgress();
    expect(userState.state.everythingGrouping).toBe("source");
    expect(JSON.parse(userState.exportBackup())).not.toHaveProperty("everythingGrouping");
    userState.resetAll();
    expect(userState.state.everythingGrouping).toBe("category");
  });

  it("keeps preferences out of the backup", () => {
    userState.toggleShowSpoilers();

    const exported = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    expect(exported).not.toHaveProperty("showSpoilers");
  });

  it("keeps this device's preferences when restoring a backup", () => {
    const backup = userState.exportBackup();
    userState.toggleShowSpoilers();

    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    expect(userState.state.showSpoilers).toBe(true);
  });

  it("keeps this device's preferences when resetting progress", () => {
    userState.toggleShowSpoilers();
    userState.setMineFloor(5);

    userState.resetProgress();
    expect(userState.state.progress.mineFloor).toBe(0);
    expect(userState.state.showSpoilers).toBe(true);
  });
});
