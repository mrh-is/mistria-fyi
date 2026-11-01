import { describe, expect, it } from "vitest";

import { progressAttachment } from "./progress-attachment.js";

describe("feedback progress redaction", () => {
  it("summarizes a large farm, marks replaced fields, & projects the same summary again", () => {
    const progress = {
      almanac: Array.from({ length: 4000 }, (_, i) => `long_game_item_identifier_${String(i)}`),
      provenance: Object.fromEntries(
        Array.from({ length: 4000 }, (_, i) => [
          `almanac/long_game_item_identifier_${String(i)}`,
          { playtime: 42, source: "save" },
        ]),
      ),
      renown: 7,
    };
    const attachment = progressAttachment(progress);
    expect(new TextEncoder().encode(JSON.stringify(attachment)).byteLength).toBeLessThanOrEqual(
      32 * 1024,
    );
    expect(attachment.provenance).toMatchObject({
      byField: { almanac: { save: 4000 } },
      count: 4000,
      summarized: true,
    });
    expect(attachment.almanac).toEqual({ count: 4000, summarized: true });
    expect(attachment.renown).toBe(7);
    expect(progressAttachment(attachment)).toEqual(attachment);
    expect(progress.almanac).toHaveLength(4000);
  });

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
