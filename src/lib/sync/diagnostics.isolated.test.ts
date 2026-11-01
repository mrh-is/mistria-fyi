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

const NOTHING_PRIVATE = { credentials: [], farmNames: [], farmNumbers: [], playerNames: [] };

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
    ["a letter Unicode won't decompose", "Søren", ["soren_note", "SØREN"]],
    ["a stroked letter", "Łukasz", ["lukasz_note"]],
    ["a sharp s", "Straße", ["strasse_x"]],
    ["a ligature", "Ælfric", ["aelfric_x"]],
    ["a short name beside a capital or digit", "Bo", ["BoNote", "bo2", "2bo"]],
    ["a short name before an acronym boundary", "Bo", ["BONote"]],
  ])("redacts %s", async (_label, player, ids) => {
    const published = await publishedIds(ids, { farm: [], player: [player] });
    expect(published).toEqual(["[redacted]"]);
  });

  it("keeps ordinary IDs that a short name or a farm's words only happen to touch", async () => {
    const ids = ["almanac_new", "unknown_turnip", "rose_bush", "farm_gate", "boat_2"];
    const published = await publishedIds(ids, { farm: ["Rose Farm"], player: ["Al", "u", "Bo"] });
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

  it("keeps game-owned IDs without guessing personal information from their shape", async () => {
    const ids = ["future_item_2027_01_02", "prototype_15551234567", "192.168.1.10"];
    expect(await publishedIds(ids, { farm: ["Rose Farm"], player: ["Bo"] })).toEqual(ids);
  });

  it("redacts buffered IDs as soon as a later save supplies a missing name", async () => {
    const log = createSyncDiagnostics();
    const first = {
      ...(await fixture()),
      extraction: extractSave({ player: { items_acquired: ["Alicia_note", "kept_id"] } }),
      metadata: {
        farmName: null,
        identity: { creationVersion: null, saveNumber: null },
        importedAt: 100,
        playerName: null,
      },
      names: { farm: [], player: [] },
    };
    await log.record(first, { kind: "skipped" }, NOTHING_PRIVATE);
    expect(JSON.stringify(log.snapshot("build", "manual"))).toContain("Alicia_note");
    const pending = log.record(
      { ...first, names: { farm: [], player: ["Alicia"] } },
      { kind: "skipped" },
      NOTHING_PRIVATE,
    );
    // The old preview must already be safe while the new event's crypto is pending.
    expect(JSON.stringify(log.snapshot("build", "manual"))).not.toContain("Alicia");
    await pending;
    const snapshot = log.snapshot("build", "manual");
    expect(v.safeParse(SyncLogSchema, snapshot).success).toBe(true);
    expect(snapshot?.events).toHaveLength(2);
    expect(
      snapshot?.events.every(({ unknownFields }) =>
        unknownFields.some(
          ({ field, ids }) =>
            field === "almanac" &&
            JSON.stringify(ids) === JSON.stringify(["[redacted]", "kept_id"]),
        ),
      ),
    ).toBe(true);
  });

  it("remembers private context across farm and credential changes", async () => {
    const log = createSyncDiagnostics();
    const base = {
      ...(await fixture()),
      extraction: extractSave({ player: { items_acquired: ["kept_id"] } }),
    };
    await log.record(base, { kind: "skipped" }, { ...NOTHING_PRIVATE, credentials: [KEY] });
    await log.record(
      { ...base, names: { farm: ["Second Farm"], player: ["Second Player"] } },
      { kind: "skipped" },
      NOTHING_PRIVATE,
    );
    await log.record(
      {
        ...base,
        extraction: extractSave({
          player: { items_acquired: ["kept_id", "SecretFarmer_note", KEY] },
        }),
        names: { farm: ["Third Farm"], player: ["Third Player"] },
      },
      { kind: "skipped" },
      NOTHING_PRIVATE,
    );
    const snapshot = log.snapshot("build", "manual");
    expect(snapshot?.events).toHaveLength(3);
    expect(snapshot?.events.at(-1)?.unknownFields).toContainEqual({
      field: "almanac",
      ids: ["kept_id", "[redacted]"],
    });
    expect(JSON.stringify(snapshot)).not.toContain("SecretFarmer");
    expect(JSON.stringify(snapshot)).not.toContain(KEY);
  });

  it("redacts all IDs rather than forgetting private values when its comparison budget fills", async () => {
    expect(
      await publishedIds(
        ["ordinary_new_id"],
        { farm: [], player: [] },
        {
          ...NOTHING_PRIVATE,
          credentials: ["x".repeat(17 * 1024)],
        },
      ),
    ).toEqual(["[redacted]"]);
  });

  it("rechecks an event whose hashing finishes after a private name becomes known", async () => {
    const log = createSyncDiagnostics();
    const save = {
      ...(await fixture()),
      extraction: extractSave({ player: { items_acquired: ["Alicia_note", "kept_id"] } }),
      names: { farm: [], player: [] },
    };
    let finishHash: ((value: ArrayBuffer) => void) | undefined;
    const hash = vi.spyOn(crypto.subtle, "digest").mockReturnValueOnce(
      new Promise<ArrayBuffer>((resolve) => {
        finishHash = resolve;
      }),
    );
    try {
      const pending = log.record(save, { kind: "skipped" }, NOTHING_PRIVATE);
      await vi.waitFor(() => {
        expect(hash).toHaveBeenCalledTimes(1);
      });
      await log.record(
        {
          ...save,
          metadata: { ...save.metadata, identity: { creationVersion: null, saveNumber: null } },
          names: { farm: [], player: ["Alicia"] },
        },
        { kind: "skipped" },
        NOTHING_PRIVATE,
      );
      expect(log.snapshot("build", "manual")?.events).toHaveLength(1);
      expect(finishHash).toBeDefined();
      finishHash?.(new ArrayBuffer(32));
      await pending;
      const snapshot = log.snapshot("build", "manual");
      expect(snapshot?.events).toHaveLength(2);
      expect(snapshot?.events[0].unknownFields).toContainEqual({
        field: "almanac",
        ids: ["[redacted]", "kept_id"],
      });
      expect(JSON.stringify(snapshot)).not.toContain("Alicia");
    } finally {
      finishHash?.(new ArrayBuffer(32));
      hash.mockRestore();
    }
  });

  it("exports game ID diagnostics without copying unrelated player-entered values", async () => {
    const save = await fixture();
    save.extraction = extractSave({
      gamedata: { maximum_mines_level: "Private Malformed Value" },
      player: {
        children: [{ name: "Private Child Name" }],
        farm_name: "Private Farm Name",
        items_acquired: ["new_game_item"],
        name: "Private Player Name",
      },
    });
    const log = createSyncDiagnostics();
    await log.record(save, { kind: "skipped" }, NOTHING_PRIVATE);
    const snapshot = log.snapshot("build", "manual");
    expect(snapshot?.events[0].unknownFields).toContainEqual({
      field: "almanac",
      ids: ["new_game_item"],
    });
    const payload = JSON.stringify(snapshot);
    for (const privateValue of [
      "Private Child Name",
      "Private Farm Name",
      "Private Player Name",
      "Private Malformed Value",
    ]) {
      expect(payload).not.toContain(privateValue);
    }
  });

  it("keeps the byte limit during a recheck that expands short IDs into redaction markers", async () => {
    const log = createSyncDiagnostics();
    const save = await fixture();
    save.metadata.identity.saveNumber = null;
    save.gameVersion = null;
    save.names = { farm: [], player: [] };
    const populated = new Set([
      "almanac",
      "almanacRecipes",
      "animalCosmetics",
      "animals",
      "cosmetics",
      "mountAppearances",
      "museum",
      "petCosmetics",
      "petSkins",
      "questStates",
      "spells",
      "unlockedPerks",
    ]);
    for (const [field, extracted] of Object.entries(save.extraction.fields)) {
      extracted.completeness = populated.has(field) ? "unknown" : "complete";
      extracted.diagnostics = populated.has(field)
        ? [
            { code: "unknown-id", id: "a", path: "player.items_acquired" },
            { code: "unknown-id", id: "x".repeat(48), path: "player.items_acquired" },
          ]
        : [];
    }
    await Promise.all(
      Array.from({ length: MAX_SYNC_EVENTS }, () =>
        log.record(save, { kind: "skipped" }, NOTHING_PRIVATE),
      ),
    );
    const before = log.snapshot("build", "manual");
    expect(before?.events.length).toBeGreaterThan(0);
    expect(v.safeParse(SyncLogSchema, before).success).toBe(true);
    const pending = log.record(
      { ...save, names: { farm: [], player: ["a"] } },
      { kind: "skipped" },
      NOTHING_PRIVATE,
    );
    try {
      const during = log.snapshot("build", "manual");
      expect(during?.events.length).toBeGreaterThan(0);
      expect(during?.events[0].unknownFields[0].ids).toContain("[redacted]");
      expect(new TextEncoder().encode(JSON.stringify(during)).byteLength).toBeLessThanOrEqual(
        MAX_SYNC_LOG_BYTES,
      );
      expect(v.safeParse(SyncLogSchema, during).success).toBe(true);
    } finally {
      await pending;
    }
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
