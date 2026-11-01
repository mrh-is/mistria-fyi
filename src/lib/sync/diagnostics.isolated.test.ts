import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractSave } from "#lib/engine/import-save.js";
import {
  MAX_SYNC_EVENTS,
  MAX_SYNC_LOG_BYTES,
  SyncLogSchema,
} from "#lib/feedback/sync-log-schema.js";

import { createSyncDiagnostics } from "./diagnostics.svelte.js";
import { buildFollowLink, mailboxIdFor } from "./follow.js";

import type { SyncApplyOutcome } from "#lib/stores/user-state.svelte.js";

import type { PrivateValues } from "./diagnostics.svelte.js";
import type { FollowKey } from "./follow.js";
import type { ReadSave } from "./read-save.js";

const enabled = vi.hoisted(() => ({ syncSwitchOn: true }));
vi.mock("./sync-switch.js", () => enabled);
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" as FollowKey;
const TOKEN = "HxwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAAAA";

async function fixture(): Promise<ReadSave> {
  return {
    completed: {},
    extraction: extractSave({
      player: {
        items_acquired: [
          "unknown_turnip_v2",
          "SecretFarmer",
          "SecretFarm",
          KEY,
          TOKEN,
          await mailboxIdFor(KEY),
          "1315159680",
          buildFollowLink(KEY),
          String.raw`C:\Users\SecretFarmer\save.sav`,
        ],
      },
    }),
    fileName: "game-1315159680-autosave.sav",
    gameDate: undefined,
    gameVersion: "1.0.8",
    hash: "private-file-hash",
    metadata: {
      farmName: "SecretFarm",
      identity: { creationVersion: null, saveNumber: "1315159680" },
      importedAt: 100,
      playerName: "SecretFarmer",
    },
    modified: 100,
    names: { farm: ["SecretFarm"], player: ["SecretFarmer"] },
    playtime: 123,
  };
}

const NOTHING_PRIVATE = { credentials: [], farmNames: [], playerNames: [] };

/** The IDs a log publishes for a save holding `ids` & these names. */
async function publishedIds(
  ids: string[],
  names: ReadSave["names"],
  privateValues: PrivateValues = NOTHING_PRIVATE,
): Promise<string[] | undefined> {
  const log = createSyncDiagnostics();
  const save = {
    ...(await fixture()),
    extraction: extractSave({ player: { items_acquired: ids } }),
    metadata: {
      farmName: null,
      identity: { creationVersion: null, saveNumber: null },
      importedAt: 100,
      playerName: null,
    },
    names,
  };
  await log.record(save, { kind: "skipped" }, privateValues);
  return log
    .snapshot("build", "manual")
    ?.events[0].unknownFields.find(({ field }) => field === "almanac")?.ids;
}

const ASK: SyncApplyOutcome = {
  kind: "ask",
  questions: [
    {
      differences: [
        {
          applied: false,
          direction: "backward",
          field: "renown",
          key: "private-fact-key",
          kind: "level",
          local: "10",
          policy: "ask-first",
          provenance: "manual",
          save: "5",
        },
      ],
      field: "renown",
      id: "private-question-id",
      kind: "facts",
      reason: "level-decrease",
    },
  ],
};

beforeEach(() => {
  enabled.syncSwitchOn = true;
});

describe("public sync diagnostics", () => {
  it("projects useful facts while stripping names, paths, numbers, codes, keys & mailbox IDs", async () => {
    const log = createSyncDiagnostics();
    const save = await fixture();
    await log.record(save, ASK, { ...NOTHING_PRIVATE, credentials: [KEY, TOKEN] });
    const snapshot = log.snapshot("build-123", "following");
    expect(v.safeParse(SyncLogSchema, snapshot).success).toBe(true);
    expect(snapshot).toMatchObject({
      appBuild: "build-123",
      events: [
        {
          gameVersion: "1.0.8",
          outcome: "ask",
          policies: [{ count: 1, field: "renown", policy: "ask-first" }],
        },
      ],
      lane: "following",
      protocolVersion: 1,
    });
    expect(snapshot?.events[0].unknownFields).toContainEqual({
      field: "almanac",
      ids: ["unknown_turnip_v2", "[redacted]"],
    });
    const body = JSON.stringify(snapshot);
    for (const secret of [
      "SecretFarmer",
      "SecretFarm",
      "1315159680",
      KEY,
      TOKEN,
      await mailboxIdFor(KEY),
      buildFollowLink(KEY),
      "private-question-id",
      "private-fact-key",
      "private-file-hash",
    ]) {
      expect(body).not.toContain(secret);
    }
    expect(snapshot?.events[0].farmHash).toMatch(/^[a-f0-9]{64}$/u);
    await log.record(save, { kind: "skipped" }, NOTHING_PRIVATE);
    expect(log.snapshot("build", "computer")?.events[1].farmHash).toBe(
      snapshot?.events[0].farmHash,
    );
    const otherSession = createSyncDiagnostics();
    await otherSession.record(save, { kind: "skipped" }, NOTHING_PRIVATE);
    expect(otherSession.snapshot("build", "computer")?.events[0].farmHash).not.toBe(
      snapshot?.events[0].farmHash,
    );
  });

  it("never publishes playtime, which would link one player's reports", async () => {
    const log = createSyncDiagnostics();
    await log.record(await fixture(), ASK, NOTHING_PRIVATE);
    log.status("waiting");
    const events = log.snapshot("build", "manual")?.events;
    expect(events).toHaveLength(2);
    // Naming `playtime` as an unknown field is fine: that says it couldn't be read, not its value.
    expect(JSON.stringify(events)).not.toContain('"playtime":');
    expect(
      v.safeParse(SyncLogSchema, {
        appBuild: "build",
        events: events?.map((event) => ({ ...event, playtime: 123 })),
        lane: "manual",
        protocolVersion: 1,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      "a spaced name, however it's joined",
      "Mary Jane",
      ["mary_jane_note", "maryjane", "Mary-Jane"],
    ],
    ["each word of the character's name", "Mary Jane", ["mary", "jane.note", "summary_x"]],
    ["an accented name", "Zoë", ["zoe_note", "ZOE"]],
    ["a short name as a whole word", "Al", ["al", "al_note"]],
  ])("redacts %s", async (_label, player, ids) => {
    const published = await publishedIds(ids, { farm: [], player: [player] });
    expect(published).toEqual(["[redacted]"]);
  });

  it("keeps ordinary IDs that a short name or a farm's words only happen to touch", async () => {
    const ids = ["almanac_new", "unknown_turnip", "rose_bush", "farm_gate"];
    const published = await publishedIds(ids, { farm: ["Rose Farm"], player: ["Al", "u"] });
    expect(published).toEqual(ids);
  });

  it("redacts a farm's whole name however it's joined", async () => {
    const published = await publishedIds(["rose_farm_sign", "RoseFarm", "rose_bush"], {
      farm: ["Rose Farm"],
      player: [],
    });
    expect(published).toEqual(["[redacted]", "rose_bush"]);
  });

  it("checks every name a save holds, & the farm being replaced", async () => {
    const save = { farm: ["Rosewood", "Oakhill"], player: ["Bo", "Alicia"] };
    const outgoing = { ...NOTHING_PRIVATE, farmNames: ["Old Pines"], playerNames: ["Priya"] };
    const published = await publishedIds(
      ["oakhill_sign", "alicia_note", "old_pines", "priya_note", "new_item"],
      save,
      outgoing,
    );
    expect(published).toEqual(["[redacted]", "new_item"]);
  });

  it("bounds events and returns independent snapshots", () => {
    const log = createSyncDiagnostics();
    log.status("unreadable");
    for (let i = 0; i < MAX_SYNC_EVENTS; i++) log.status("waiting");
    const snapshot = log.snapshot("build", "manual");
    expect(snapshot?.events).toHaveLength(MAX_SYNC_EVENTS);
    expect(snapshot?.events.every((event) => event.outcome === "waiting")).toBe(true);
    snapshot?.events.pop();
    expect(log.snapshot("build", "manual")?.events).toHaveLength(MAX_SYNC_EVENTS);
  });

  it("keeps event order when hashing finishes after a later status", async () => {
    const log = createSyncDiagnostics();
    const pending = log.record(await fixture(), ASK, NOTHING_PRIVATE);
    log.status("waiting");
    await pending;
    expect(log.snapshot("build", "following")?.events.map((event) => event.outcome)).toEqual([
      "ask",
      "waiting",
    ]);
  });

  it("collects and exports nothing with the production switch off", async () => {
    const log = createSyncDiagnostics();
    enabled.syncSwitchOn = false;
    log.status("unreadable");
    await log.record(await fixture(), ASK, { ...NOTHING_PRIVATE, credentials: [KEY] });
    expect(log.snapshot("build", "following")).toBeUndefined();
    enabled.syncSwitchOn = true;
    expect(log.snapshot("build", "manual")?.events).toEqual([]);
  });

  it("keeps large unknown-ID reports within the payload byte limit", async () => {
    const save = await fixture();
    for (const field of Object.values(save.extraction.fields)) {
      field.completeness = "unknown";
      field.diagnostics = Array.from({ length: 40 }, (_, i) => ({
        code: "unknown-id",
        id: `unknown_${i}_${"x".repeat(80)}`,
        path: "player.items_acquired",
      }));
    }
    const log = createSyncDiagnostics();
    await Promise.all(
      Array.from({ length: MAX_SYNC_EVENTS }, () =>
        log.record(save, ASK, { ...NOTHING_PRIVATE, credentials: [KEY, TOKEN] }),
      ),
    );
    const snapshot = log.snapshot("build", "following");
    expect(snapshot?.events.length).toBeGreaterThan(0);
    expect(snapshot?.events.length).toBeLessThan(MAX_SYNC_EVENTS);
    expect(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength).toBeLessThanOrEqual(
      MAX_SYNC_LOG_BYTES,
    );
    expect(v.safeParse(SyncLogSchema, snapshot).success).toBe(true);
    expect(
      v.safeParse(SyncLogSchema, {
        ...snapshot,
        events: Array.from({ length: MAX_SYNC_EVENTS }, () => snapshot?.events[0]),
      }).success,
    ).toBe(false);
  });

  it("rejects raw metadata and credentials at the payload boundary", () => {
    const log = createSyncDiagnostics().snapshot("build", "manual");
    expect(v.safeParse(SyncLogSchema, log).success).toBe(true);
    expect(v.safeParse(SyncLogSchema, { ...log, key: KEY }).success).toBe(false);
    expect(
      v.safeParse(SyncLogSchema, { ...log, lane: { key: KEY, kind: "following" } }).success,
    ).toBe(false);
  });
});
