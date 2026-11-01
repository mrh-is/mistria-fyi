import { deflateSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import { deriveFollowKeys, encodeSavePayload, mailboxIdFor, sealEnvelope } from "./follow.js";

import type { FollowKey, ReadResult, RelayClient } from "./follow.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const OLD_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const TOKEN = "__________________________________________8";

function blob(local: Record<string, unknown>): string {
  return JSON.stringify({
    lastImport: null,
    local,
    progress: {
      almanac: [],
      animalCosmetics: {},
      animals: {},
      cosmetics: [],
      mineFloor: 0,
      museum: [],
      renown: 3,
      spells: [],
    },
    version: 1,
    worldState: { season: "spring", weather: "calm" },
  });
}

function relay(overrides: Partial<RelayClient>): RelayClient {
  return {
    create: vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "created" }),
    read: vi.fn<RelayClient["read"]>().mockResolvedValue({ kind: "empty" }),
    retire: vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "retired" }),
    upload: vi.fn<RelayClient["upload"]>().mockResolvedValue({ kind: "stored" }),
    ...overrides,
  };
}

async function load(local: Record<string, unknown>, client: RelayClient) {
  vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: blob(local) }));
  vi.stubGlobal("navigator", {});
  vi.resetModules();
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  const sharing = await import("./sharing.js");
  sharing.setRelayClient(client);
  sharing.setTurnstileTokenSource(() => Promise.resolve("challenge"));
  return { sharing, userState };
}

const COMPUTER = { code: { key: OLD_KEY, token: TOKEN }, kind: "computer" };

beforeEach(() => {
  vi.useRealTimers();
});

describe("sharing codes", () => {
  it("stores the first code only once its mailbox exists", async () => {
    const create = vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "unreachable" });
    const { sharing, userState } = await load(
      { syncLane: { kind: "computer" } },
      relay({ create }),
    );
    const failed = await sharing.shareCode();
    expect(failed.kind).toBe("unreachable");
    expect(userState.syncLane).toEqual({ kind: "computer" });

    create.mockResolvedValue({ kind: "created" });
    const shared = await sharing.shareCode();
    expect(shared.kind).toBe("shared");
    expect(userState.syncLane).toEqual(
      shared.kind === "shared" ? { code: shared.code, kind: "computer" } : undefined,
    );
  });

  it("keeps the old code working when a new one is made during the kill switch", async () => {
    const create = vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "paused", until: 9 });
    const retire = vi.fn<RelayClient["retire"]>();
    const { sharing, userState } = await load({ syncLane: COMPUTER }, relay({ create, retire }));
    const result = await sharing.makeNewCode();
    expect(result).toEqual({ kind: "paused", until: 9 });
    expect(sharing.shareFailureCopy({ kind: "paused" })).toBe("paused");
    expect(userState.syncLane).toEqual(COMPUTER);
    expect(userState.syncPendingRetires).toEqual([]);
    expect(retire).not.toHaveBeenCalled();
  });

  it("retires the old code after the new one is stored", async () => {
    const { sharing, userState } = await load({ syncLane: COMPUTER }, relay({}));
    const result = await sharing.makeNewCode();
    expect(result.kind).toBe("shared");
    const lane = userState.syncLane;
    expect(lane?.kind === "computer" && lane.code?.key).not.toBe(OLD_KEY);
    expect(userState.syncPendingRetires).toEqual([]);
  });
});

describe("writes that don't land", () => {
  it("keeps the old code & abandons the new mailbox when the new code can't be stored", async () => {
    const retire = vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "retired" });
    const { sharing, userState } = await load({ syncLane: COMPUTER }, relay({ retire }));
    const failing = localStorage;
    const setItem = failing.setItem.bind(failing);
    failing.setItem = (name, value) => {
      if (name === PROGRESS_KEY) throw new Error("quota");
      setItem(name, value);
    };
    expect(await sharing.makeNewCode()).toEqual({ kind: "unreachable" });
    // Only the never-stored new mailbox is retired; the old code was never queued.
    expect(retire).toHaveBeenCalledTimes(1);
    const [[retiredId]] = retire.mock.calls;
    const oldId = await mailboxIdFor(OLD_KEY as FollowKey);
    expect(retiredId).not.toBe(oldId);
    expect(userState.syncLane).toEqual(COMPUTER);
  });
});

describe("stopping", () => {
  it("keeps a retire the relay hasn't confirmed & retries it later", async () => {
    const retire = vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "unreachable" });
    const { sharing, userState } = await load({ syncLane: COMPUTER }, relay({ retire }));
    await sharing.stopSyncing();
    expect(userState.syncLane).toBeUndefined();
    expect(userState.state.progress.renown).toBe(3);
    expect(userState.syncPendingRetires).toHaveLength(1);

    retire.mockResolvedValue({ kind: "retired" });
    await sharing.retryPendingRetires();
    expect(userState.syncPendingRetires).toEqual([]);
  });

  it("retires nothing when a following device stops", async () => {
    const retire = vi.fn<RelayClient["retire"]>();
    const { sharing, userState } = await load(
      { syncLane: { key: OLD_KEY, kind: "following" } },
      relay({ retire }),
    );
    await sharing.stopSyncing();
    expect(userState.syncLane).toBeUndefined();
    expect(retire).not.toHaveBeenCalled();
  });
});

function u64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

/** A `.sav` container (u64 little-endian counts & lengths), deflated as the game writes it. */
function savBytes(entries: Record<string, object>): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [u64(Object.keys(entries).length)];
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(JSON.stringify(data));
    parts.push(u64(nameBytes.length), nameBytes, u64(dataBytes.length), dataBytes);
  }
  return Uint8Array.from(deflateSync(Buffer.concat(parts)));
}

async function envelopeRead(key: FollowKey, save: Uint8Array<ArrayBuffer>): Promise<ReadResult> {
  const keys = await deriveFollowKeys(key);
  const plaintext = encodeSavePayload({
    header: { fileName: "game-1315159680-autosave.sav", modified: 1_700_000_000_000 },
    save,
  });
  const envelope = await sealEnvelope(keys, { counter: 2, version: 1 }, plaintext);
  return { counter: 2, envelope, kind: "envelope", version: 1 };
}

describe("following a code", () => {
  const key = OLD_KEY as FollowKey;

  it("changes nothing when the first fetch fails", async () => {
    const read = vi.fn<RelayClient["read"]>().mockResolvedValue({ kind: "unreachable" });
    const { sharing, userState } = await load({}, relay({ read }));
    const before = localStorage.getItem(PROGRESS_KEY);
    expect(await sharing.followCode(key)).toEqual({ kind: "unreachable" });
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(before);
    expect(userState.syncLane).toBeUndefined();
    expect(userState.state.progress.renown).toBe(3);
  });

  it("changes nothing while the mailbox is empty or retired", async () => {
    const read = vi
      .fn<RelayClient["read"]>()
      .mockResolvedValueOnce({ kind: "empty" })
      .mockResolvedValueOnce({ kind: "retired" });
    const { sharing, userState } = await load({}, relay({ read }));
    expect(await sharing.followCode(key)).toEqual({ kind: "empty" });
    expect(await sharing.followCode(key)).toEqual({ kind: "retired" });
    expect(userState.syncLane).toBeUndefined();
    expect(userState.state.progress.renown).toBe(3);
  });

  it("starts the lane in the write that applies the first save", async () => {
    const save = savBytes({
      header: { farm_name: "Sunny Meadow", name: "Robin" },
      player: { name: "Robin" },
    });
    const read = vi.fn<RelayClient["read"]>().mockResolvedValue(await envelopeRead(key, save));
    const { sharing, userState } = await load({}, relay({ read }));
    const outcome = await sharing.followCode(key);
    expect(outcome.kind).toBe("applied");
    expect(userState.syncLane).toEqual({ key, kind: "following" });
    expect(userState.state.progress.renown).toBe(0);
    expect(userState.state.lastImport?.playerName).toBe("Robin");
    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null") as {
      local: unknown;
    };
    // The receipt lands in that same write, so the receiver doesn't apply this envelope again.
    expect(stored.local).toEqual({
      syncFreshness: { gaps: [], modified: 1_700_000_000_000 },
      syncLane: { key, kind: "following" },
      syncReceipt: {
        counter: 2,
        hash: expect.stringMatching(/^[\w-]{43}$/u) as string,
        mailboxId: await mailboxIdFor(key),
      },
    });
  });

  it("changes nothing when the player left before the save arrived", async () => {
    const save = savBytes({ player: { name: "Robin" } });
    const read = vi.fn<RelayClient["read"]>().mockResolvedValue(await envelopeRead(key, save));
    const { sharing, userState } = await load({}, relay({ read }));
    const before = localStorage.getItem(PROGRESS_KEY);
    expect(await sharing.followCode(key, () => false)).toEqual({ kind: "unreachable" });
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(before);
    expect(userState.syncLane).toBeUndefined();
  });

  it("changes nothing when the save inside can't be read", async () => {
    const read = vi
      .fn<RelayClient["read"]>()
      .mockResolvedValue(await envelopeRead(key, new Uint8Array([1, 2, 3])));
    const { sharing, userState } = await load({}, relay({ read }));
    expect(await sharing.followCode(key)).toEqual({ kind: "unreadable" });
    expect(userState.syncLane).toBeUndefined();
  });
});
