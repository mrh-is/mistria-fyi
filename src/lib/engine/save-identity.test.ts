import { describe, expect, it } from "vitest";

import { compareFarms, readSaveIdentity } from "./save-identity.js";

describe("readSaveIdentity", () => {
  it("keeps identity separate from names, and normalizes an omitted prerelease", () => {
    expect(
      readSaveIdentity({
        info: { creation_version: { major: 0, minor: 11, patch: 7 } },
        player: { farm_name: "Fern", name: "Ada" },
        saveNumber: "123",
      }),
    ).toEqual({
      farmName: "Fern",
      identity: {
        creationVersion: { major: 0, minor: 11, patch: 7, pre: null },
        saveNumber: "123",
      },
      playerName: "Ada",
    });
  });

  it.each([undefined, null, "0.11.7", { major: -1, minor: 0, patch: 0 }])(
    "tolerates a missing or malformed creation version: %j",
    (creation_version) => {
      expect(readSaveIdentity({ info: { creation_version }, saveNumber: "123" }).identity).toEqual({
        creationVersion: null,
        saveNumber: "123",
      });
    },
  );

  it("leaves identity unknown for extracted JSON and ignores malformed display names", () => {
    expect(readSaveIdentity({ player: { farm_name: {}, name: 42 } })).toEqual({
      farmName: null,
      identity: { creationVersion: null, saveNumber: null },
      playerName: null,
    });
  });
});

describe("compareFarms", () => {
  const version = { major: 1, minor: 0, patch: 8, pre: null };
  const farm = { creationVersion: version, saveNumber: "123" };

  it("matches on the game number, guarded by a creation version both sides read", () => {
    expect(compareFarms(farm, farm)).toBe("same");
    expect(compareFarms(farm, { ...farm, creationVersion: null })).toBe("same");
    expect(compareFarms({ ...farm, creationVersion: null }, farm)).toBe("same");
    expect(compareFarms(farm, { ...farm, saveNumber: "456" })).toBe("different");
    expect(compareFarms(farm, { ...farm, creationVersion: { ...version, patch: 7 } })).toBe(
      "different",
    );
  });

  it("leaves unidentified progress or an unnumbered save for the player to decide", () => {
    expect(compareFarms(null, farm)).toBe("unidentified");
    expect(compareFarms({ creationVersion: version, saveNumber: null }, farm)).toBe("unidentified");
    expect(compareFarms(farm, { creationVersion: version, saveNumber: null })).toBe("unidentified");
  });
});
