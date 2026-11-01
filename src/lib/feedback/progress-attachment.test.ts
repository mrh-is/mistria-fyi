import { describe, expect, it } from "vitest";

import { progressAttachment } from "./progress-attachment.js";

describe("feedback progress redaction", () => {
  it("drops unclassified top-level and history fields", () => {
    expect(
      progressAttachment({
        almanac: ["future_game_item"],
        futureField: { characterName: "Private Person" },
        lastImport: { farmName: "Private Farm" },
        provenance: {
          renown: {
            farmName: "Private Farm",
            obtainedSource: "manual",
            playtime: 42,
            source: "save",
          },
        },
        resolutions: { renown: { privateReceipt: "secret", saveValue: 7 } },
      }),
    ).toEqual({
      almanac: ["future_game_item"],
      provenance: { renown: { obtainedSource: "manual", playtime: "[redacted]", source: "save" } },
      resolutions: { renown: { saveValue: 7 } },
    });
  });

  it("preserves missing playtime fields, game IDs, and non-playtime numeric facts", () => {
    const progress = {
      almanac: ["future_item_2027_01_02"],
      provenance: { "almanac/future_item_2027_01_02": { source: "manual" } },
      renown: 1234,
    };
    expect(progressAttachment(progress)).toEqual(progress);
  });

  it("redacts by source key regardless of the value, without mutating the backup", () => {
    const progress = {
      lastSavePlaytime: 0,
      provenance: {
        first: { playtime: { unexpected: "private-value" }, source: "save" },
        second: { playtime: "[redacted]", source: "manual" },
      },
      renown: 1234,
    };
    const redacted = progressAttachment(progress);
    expect(redacted).toEqual({
      lastSavePlaytime: "[redacted]",
      provenance: {
        first: { playtime: "[redacted]", source: "save" },
        second: { playtime: "[redacted]", source: "manual" },
      },
      renown: 1234,
    });
    expect(progress.lastSavePlaytime).toBe(0);
    expect(progress.provenance.first.playtime).toEqual({ unexpected: "private-value" });
    expect(progressAttachment(redacted)).toEqual(redacted);
  });
});
