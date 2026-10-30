import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

afterEach(() => {
  userState.resetAll();
});

describe("availability windows", () => {
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

  it("defaults to now and anytime", () => {
    expect(userState.state.availabilityWindows).toEqual(["now", "anytime"]);
  });

  it("toggles windows independently in canonical order", () => {
    userState.toggleAvailabilityWindow("later");
    expect(userState.state.availabilityWindows).toEqual(["now", "anytime", "later"]);

    userState.toggleAvailabilityWindow("now");
    expect(userState.state.availabilityWindows).toEqual(["anytime", "later"]);
  });

  it("refuses to deselect the last remaining window", () => {
    userState.toggleAvailabilityWindow("now");
    expect(userState.state.availabilityWindows).toEqual(["anytime"]);

    userState.toggleAvailabilityWindow("anytime");
    expect(userState.state.availabilityWindows).toEqual(["anytime"]);
  });

  it("keeps preferences out of the backup", () => {
    userState.toggleAvailabilityWindow("later");
    userState.toggleShowSpoilers();

    const exported = JSON.parse(userState.exportBackup()) as Record<string, unknown>;
    expect(exported).not.toHaveProperty("availabilityWindows");
    expect(exported).not.toHaveProperty("showSpoilers");
  });

  it("keeps this device's preferences when restoring a backup", () => {
    const backup = userState.exportBackup();
    userState.toggleAvailabilityWindow("later");
    userState.toggleShowSpoilers();

    expect(userState.restoreBackup(backup)).toEqual({ ok: true });
    expect(userState.state.availabilityWindows).toEqual(["now", "anytime", "later"]);
    expect(userState.state.showSpoilers).toBe(true);
  });

  it("keeps this device's preferences when resetting progress", () => {
    userState.toggleAvailabilityWindow("later");
    userState.toggleShowSpoilers();
    userState.setMineFloor(5);

    userState.resetProgress();
    expect(userState.state.progress.mineFloor).toBe(0);
    expect(userState.state.availabilityWindows).toEqual(["now", "anytime", "later"]);
    expect(userState.state.showSpoilers).toBe(true);
  });
});
