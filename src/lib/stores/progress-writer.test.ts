import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import { planManualImport } from "./progress-import-write.js";
import {
  emptyProgressHistory,
  emptyRetainedProgress,
  readProgressBlob,
  serializeStoredProgress,
} from "./progress-storage.js";
import { planReplacement, planStoredWrite } from "./progress-writer.js";

import type { DeviceLocalState } from "#lib/sync/lane-state.js";

function progressJson(renown: number, mineFloor: number, local: DeviceLocalState = {}): string {
  return serializeStoredProgress(
    {
      history: emptyProgressHistory(),
      progress: {
        ...createDefaultProgress(Set, Object.keys(trackerData.animals)),
        mineFloor,
        renown,
      },
      retained: emptyRetainedProgress(),
      worldState: { season: "spring", weather: "calm" },
    },
    local,
  );
}

const base = progressJson(2, 0);
const replacement = progressJson(4, 0);
const concurrent = progressJson(6, 20);
const unreadable = "{";
const newer = JSON.stringify({ version: CURRENT_SERIALIZATION_VERSION + 1 });

describe("progress write decisions", () => {
  it.each([
    { auto: "ready", explicit: "ready", mineFloor: 0, name: "unchanged", renown: 4, stored: base },
    { auto: "ready", explicit: "ready", mineFloor: 0, name: "cleared", renown: 4, stored: null },
    {
      auto: "adopt",
      explicit: "ready",
      mineFloor: 20,
      name: "another tab's write",
      renown: 6,
      stored: concurrent,
    },
    {
      auto: "adopt",
      explicit: "preserve",
      mineFloor: 0,
      name: "unreadable",
      renown: 4,
      stored: unreadable,
    },
  ])(
    "decides each write against $name storage",
    ({ auto, explicit, mineFloor, renown, stored }) => {
      const autoSave = planStoredWrite("auto-save", stored, base, undefined);
      const expectedAuto =
        auto === "adopt" ? { kind: auto, newer: false, value: stored } : { kind: auto };
      expect(autoSave).toMatchObject(expectedAuto);

      const restore = planStoredWrite("replace", stored, base, undefined);
      const merge = planStoredWrite("merge", stored, base, undefined);
      const expectedExplicit =
        explicit === "preserve" ? { kind: explicit, value: stored } : { kind: explicit };
      expect(restore).toMatchObject(expectedExplicit);
      expect(merge).toMatchObject(expectedExplicit);

      // Once the adapter has preserved an unreadable value, explicit writes can proceed.
      const restored = planReplacement(
        { dropReceipt: false, json: replacement, keepLocal: true },
        undefined,
      );
      expect(restored.json).toBe(replacement);
      const imported = planManualImport(
        {
          base,
          before: base,
          imported: { renown: 4 },
          options: {},
        },
        stored,
      );
      expect(imported.kind).toBe("write");
      if (imported.kind !== "write") throw new Error("Expected an additive write");
      expect(readProgressBlob(imported.json, "strict")).toMatchObject({
        kind: "ok",
        loaded: { progress: { mineFloor, renown } },
      });
    },
  );

  it.each(["auto-save", "merge", "replace", "local", "staged", "sync"] as const)(
    "adopts newer data without overwriting or quarantining it during %s",
    (mode) => {
      expect(planStoredWrite(mode, newer, base, undefined)).toEqual({
        kind: "adopt",
        newer: true,
        value: newer,
      });
    },
  );

  it("blocks sync on unreadable data even though manual import can preserve it and proceed", () => {
    expect(planStoredWrite("sync", unreadable, base, undefined)).toEqual({
      kind: "quarantine",
      value: unreadable,
    });
  });

  it("blocks an import while either the live or locked stored lane is syncing", () => {
    const lane = { key: "a".repeat(43), kind: "following" } as const;
    expect(planStoredWrite("merge", base, base, lane)).toEqual({ kind: "sync-active" });
    expect(
      planStoredWrite("merge", progressJson(6, 20, { syncLane: lane }), base, undefined),
    ).toEqual({ kind: "sync-active" });
  });
});
