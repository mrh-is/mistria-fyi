import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

afterEach(() => {
  userState.resetAll();
});

describe("availability windows", () => {
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

  it("serializes the new windows without the legacy mode", () => {
    const exported = JSON.parse(userState.exportState()) as Record<string, unknown>;
    expect(exported.availabilityWindows).toEqual(["now", "anytime"]);
    expect(exported).not.toHaveProperty("availabilityMode");
  });

  it.each([
    ["available", ["now", "anytime"]],
    ["everything", ["now", "anytime", "later"]],
    ["timely", ["now"]],
  ] as const)("migrates the legacy %s mode", (availabilityMode, expected) => {
    const exported = JSON.parse(userState.exportState()) as Record<string, unknown>;
    delete exported.availabilityWindows;
    exported.availabilityMode = availabilityMode;

    expect(userState.importState(JSON.stringify(exported))).toEqual({ ok: true });
    expect(userState.state.availabilityWindows).toEqual(expected);
  });

  it("rejects invalid windows atomically", () => {
    const original = userState.exportState();
    const exported = JSON.parse(original) as Record<string, unknown>;
    exported.availabilityWindows = ["now", "eventually"];

    expect(userState.importState(JSON.stringify(exported))).toEqual({
      error: "invalid-fields",
      ok: false,
    });
    expect(userState.exportState()).toBe(original);
  });

  it("rejects an empty windows array", () => {
    const original = userState.exportState();
    const exported = JSON.parse(original) as Record<string, unknown>;
    exported.availabilityWindows = [];

    expect(userState.importState(JSON.stringify(exported))).toEqual({
      error: "invalid-fields",
      ok: false,
    });
    expect(userState.exportState()).toBe(original);
  });
});
