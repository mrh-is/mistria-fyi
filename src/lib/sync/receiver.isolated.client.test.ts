import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GAME_DAY } from "#lib/engine/import-save.js";
import { readProgressBlob, serializeStoredProgress } from "#lib/stores/progress-storage.js";
import { QUARANTINE_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import { deriveFollowKeys, encodeSavePayload, mailboxIdFor, sealEnvelope } from "./follow.js";

import type { FollowKey, MailboxSubscriber, ReadResult } from "./follow.js";
import type { Receiver, ReceiverOptions, ReceiverStatus, SyncTell } from "./receiver.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" as FollowKey;
const OTHER_KEY = "HxwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAAAA" as FollowKey;
const FOLLOWING = { key: KEY, kind: "following" };
const SEASON = 28 * GAME_DAY;
const FARM_FILE = "game-1315159680-autosave.sav";
const OTHER_FARM_FILE = "game-2000000000-autosave.sav";

type Local = Record<string, unknown>;

function blob(local: Local, overrides: Record<string, unknown> = {}): string {
  const { progress, ...rest } = overrides as { progress?: Record<string, unknown> };
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
      renown: 0,
      spells: [],
      ...progress,
    },
    version: 3,
    worldState: { season: "spring", weather: "calm" },
    ...rest,
  });
}

function u64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function saveBytes(date: number, playtime = 100): Uint8Array<ArrayBuffer> {
  const entries: Record<string, unknown> = {
    gamedata: { date },
    header: { farm_name: "Rosewood", name: "Pat", playtime },
    info: { creation_version: { major: 1, minor: 0, patch: 8, pre: null } },
  };
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [u64(Object.keys(entries).length)];
  for (const [name, data] of Object.entries(entries)) {
    const nameBytes = encoder.encode(name);
    const dataBytes = encoder.encode(JSON.stringify(data));
    parts.push(u64(nameBytes.length), nameBytes, u64(dataBytes.length), dataBytes);
  }
  return Uint8Array.from(deflateSync(Buffer.concat(parts)));
}

async function envelope(
  counter: number,
  save: Uint8Array<ArrayBuffer>,
  { fileName = FARM_FILE, key = KEY, version = 1 } = {},
): Promise<Extract<ReadResult, { kind: "envelope" }>> {
  const plaintext = encodeSavePayload({ header: { fileName, modified: 1000 + counter }, save });
  const sealed = await sealEnvelope(await deriveFollowKeys(key), { counter, version }, plaintext);
  return { counter, envelope: sealed, kind: "envelope", version };
}

/** A `LockManager` granting one holder per name, in request order, honoring an abort. */
function queuedLocks() {
  const queues = new Map<string, (() => void)[]>();
  const held = new Set<string>();
  const pump = (name: string): void => {
    if (held.has(name)) return;
    queues.get(name)?.shift()?.();
  };
  const request = (
    name: string,
    ...args: [() => unknown] | [{ signal?: AbortSignal }, () => unknown]
  ): Promise<unknown> => {
    const [options, task] = args.length === 2 ? args : [{}, args[0]];
    return new Promise((resolve, reject) => {
      const hold = async (): Promise<void> => {
        held.add(name);
        try {
          resolve(await task());
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
          held.delete(name);
          pump(name);
        }
      };
      const run = (): void => {
        void hold();
      };
      const queue = queues.get(name) ?? [];
      queues.set(name, queue);
      queue.push(run);
      options.signal?.addEventListener("abort", () => {
        const index = queue.indexOf(run);
        if (index !== -1) {
          queue.splice(index, 1);
          reject(new DOMException("Aborted", "AbortError"));
        }
      });
      pump(name);
    });
  };
  return { request } as unknown as LockManager;
}

/** The relay as a receiver sees it: its latest read, & a socket the test can push through. */
function fakeRelay(initial?: ReadResult) {
  let latest: ReadResult = initial ?? { kind: "empty" };
  const sockets: MailboxSubscriber[] = [];
  return {
    read: vi.fn(() => Promise.resolve(latest)),
    set(next: ReadResult) {
      latest = next;
    },
    sockets,
    subscribe: vi.fn((_id: string, subscriber: MailboxSubscriber) => {
      sockets.push(subscriber);
      return () => {
        sockets.splice(sockets.indexOf(subscriber), 1);
      };
    }),
  };
}

let statusArrived: (() => void) | undefined;

/**
 * Waits for the receiver's next status, which comes last in each read or apply. A test expecting
 * no status waits out the timeout, long enough for hashing, decrypting, & the fake locks.
 */
async function flush(): Promise<void> {
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 40);
    statusArrived = () => {
      clearTimeout(timeout);
      statusArrived = undefined;
      setTimeout(resolve, 0);
    };
  });
}

function file(bytes: Uint8Array<ArrayBuffer>): File {
  return new File([bytes], FARM_FILE, { lastModified: 2000 });
}

/** A readable blob as the store itself would serialize it, so counted writes are only the test's. */
function canonical(json: string): string {
  const read = readProgressBlob(json, "repair");
  return read.kind === "ok" ? serializeStoredProgress(read.loaded, read.loaded.local) : json;
}

/** Opens channels that hear each other, as one browser's tabs do. */
function linkedChannels(): () => BroadcastChannel {
  type Listener = (event: { data: unknown }) => void;
  const listeners = new Set<Listener>();
  return () => {
    const own = new Set<Listener>();
    return {
      addEventListener: (_: string, listener: Listener) => {
        own.add(listener);
        listeners.add(listener);
      },
      close: () => {
        for (const listener of own) listeners.delete(listener);
      },
      postMessage: (data: unknown) => {
        for (const listener of listeners) {
          if (!own.has(listener)) listener({ data });
        }
      },
      removeEventListener: (_: string, listener: Listener) => {
        own.delete(listener);
        listeners.delete(listener);
      },
    } as unknown as BroadcastChannel;
  };
}

const open: Receiver[] = [];

async function load(
  initial: string,
  relay: ReturnType<typeof fakeRelay>,
  options: ReceiverOptions = {},
) {
  vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: canonical(initial) }));
  const locks = options.locks?.() ?? queuedLocks();
  vi.stubGlobal("navigator", { locks });
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  const { createReceiver } = await import("./receiver.js");
  const statuses: ReceiverStatus[] = [];
  const tells: SyncTell[] = [];
  const make = (overrides: ReceiverOptions = {}): Receiver => {
    const receiver = createReceiver({
      channel: () => undefined,
      locks: () => locks,
      onstatus: (status) => {
        statuses.push(status);
        statusArrived?.();
      },
      ontell: (tell) => tells.push(tell),
      read: relay.read,
      subscribe: relay.subscribe,
      ...options,
      ...overrides,
    });
    open.push(receiver);
    return receiver;
  };
  const receiver = make();
  return { locks, make, receiver, statuses, tells, userState };
}

function stored(): {
  lastImport: null | { farmName: null | string };
  local: Local;
  progress: { reachedSeason?: string };
} {
  return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null") as ReturnType<typeof stored>;
}

/** No receipt, no freshness, & none of the fixture save's progress. */
function expectNothingApplied(): void {
  const { local, progress } = stored();
  expect(local.syncReceipt).toBeUndefined();
  expect(local.syncFreshness).toBeUndefined();
  expect(progress.reachedSeason ?? "spring").toBe("spring");
}

function countWrites(): { count: () => number } {
  const storage = localStorage;
  const setItem = storage.setItem.bind(storage);
  let writes = 0;
  storage.setItem = (name, value) => {
    if (name === PROGRESS_KEY) writes++;
    setItem(name, value);
  };
  return { count: () => writes };
}

function askedKinds(status: ReceiverStatus): string[] {
  return status.kind === "asking" ? status.questions.map(({ kind }) => kind) : [];
}

function questionId(status: ReceiverStatus): string {
  if (status.kind !== "asking") throw new Error(`Not asking: ${status.kind}`);
  return status.questions[0].id;
}

beforeEach(() => {
  vi.useRealTimers();
  open.length = 0;
});

afterEach(async () => {
  for (const receiver of open) receiver.stop();
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.resetAll();
  // Each test's store ends as a page does. A pending auto-save would otherwise run against the next
  // test's storage, as if another tab had written it.
  globalThis.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals();
});

describe("one tab leads", () => {
  it("only the lock's holder reads, & a queued tab takes over when it goes", async () => {
    const relay = fakeRelay({ kind: "empty" });
    const { make, receiver } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    expect(relay.read).toHaveBeenCalledTimes(1);

    const second = make();
    second.start();
    second.update();
    await flush();
    expect(relay.read).toHaveBeenCalledTimes(1);
    expect(relay.subscribe).toHaveBeenCalledTimes(1);

    receiver.stop();
    await flush();
    expect(relay.read).toHaveBeenCalledTimes(2);
    expect(second.status.kind).toBe("waiting");
  });

  it("never leads without Web Locks, so it never reads or applies", async () => {
    const relay = fakeRelay(await envelope(1, saveBytes(SEASON)));
    const before = blob({ syncLane: FOLLOWING });
    const { make } = await load(before, relay);
    const lockless = make({ locks: () => undefined });
    lockless.start();
    lockless.update();
    await flush();
    expect(relay.read).not.toHaveBeenCalled();
    expectNothingApplied();
  });

  it("does nothing while tracking by hand", async () => {
    const relay = fakeRelay();
    const { receiver } = await load(blob({}), relay);
    receiver.start();
    await flush();
    expect(relay.read).not.toHaveBeenCalled();
    expect(relay.subscribe).not.toHaveBeenCalled();
    expect(receiver.status.kind).toBe("idle");
  });
});

describe("applying", () => {
  it("lands the save, the receipt, & freshness in one write", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON + 13 * GAME_DAY)));
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    const writes = countWrites();
    receiver.start();
    await flush();

    expect(writes.count()).toBe(1);
    expect(receiver.status.kind).toBe("up-to-date");
    const { local, progress } = stored();
    expect(progress.reachedSeason).toBe("summer");
    expect(local.syncReceipt).toEqual({
      counter: 4,
      hash: expect.stringMatching(/^[\w-]{43}$/u) as string,
      mailboxId: await mailboxIdFor(KEY),
    });
    expect(local.syncFreshness).toEqual({
      gameDate: { day: 14, season: "summer", year: 1 },
      gaps: [],
      modified: 1004,
    });
    expect(userState.syncReceipt?.counter).toBe(4);
    expect(userState.state.progress.reachedSeason).toBe("summer");
    expect(userState.state.lastImport?.farmName).toBe("Rosewood");
    // A later auto-save finds nothing left to write.
    await new Promise((resolve) => {
      setTimeout(resolve, 350);
    });
    expect(writes.count()).toBe(1);
  });

  it("keeps a backup out of the receipt: a backup never carries it", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    expect(userState.exportBackup()).not.toContain("syncReceipt");
    expect(userState.exportBackup()).not.toContain("syncFreshness");
  });

  it("applies the latest envelope again after a crash before the write", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    // The envelope arrived last time, but the write never landed: no receipt.
    const { receiver } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
  });

  it("skips the envelope by its receipt after a crash after the write", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const mailboxId = await mailboxIdFor(KEY);
    const receipt = { counter: 4, hash: "h".repeat(43), mailboxId };
    const before = blob({ syncLane: FOLLOWING, syncReceipt: receipt });
    const { receiver } = await load(before, relay);
    const writes = countWrites();
    receiver.start();
    await flush();
    expect(writes.count()).toBe(0);
    expect(receiver.status.kind).toBe("up-to-date");
  });

  it("skips a lower counter from the same mailbox, & applies a higher one", async () => {
    const mailboxId = await mailboxIdFor(KEY);
    const receipt = { counter: 4, hash: "h".repeat(43), mailboxId };
    const relay = fakeRelay(await envelope(3, saveBytes(SEASON)));
    const { receiver } = await load(blob({ syncLane: FOLLOWING, syncReceipt: receipt }), relay);
    receiver.start();
    await flush();
    expect(stored().local.syncReceipt).toEqual(receipt);

    relay.sockets[0].onpush(await envelope(5, saveBytes(SEASON)));
    await flush();
    expect(stored().local.syncReceipt).toMatchObject({ counter: 5 });
  });

  it("applies a new code's envelopes whatever their counter", async () => {
    const receipt = { counter: 40, hash: "h".repeat(43), mailboxId: "A".repeat(22) };
    const relay = fakeRelay(await envelope(1, saveBytes(SEASON)));
    const { receiver } = await load(blob({ syncLane: FOLLOWING, syncReceipt: receipt }), relay);
    receiver.start();
    await flush();
    expect(stored().local.syncReceipt).toMatchObject({
      counter: 1,
      mailboxId: await mailboxIdFor(KEY),
    });
  });

  it("moves to the new mailbox when the followed code changes", async () => {
    const relay = fakeRelay({ kind: "empty" });
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    relay.set(await envelope(1, saveBytes(SEASON), { key: OTHER_KEY }));
    await userState.switchFollowKey(OTHER_KEY);
    receiver.update();
    await flush();
    expect(relay.subscribe.mock.calls.at(-1)?.[0]).toBe(await mailboxIdFor(OTHER_KEY));
    expect(stored().local.syncReceipt).toMatchObject({
      counter: 1,
      mailboxId: await mailboxIdFor(OTHER_KEY),
    });
  });

  it("applies the latest save again after a reset removes the receipt", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    receiver.update();
    userState.resetProgress();
    receiver.update();
    await flush();
    expect(userState.syncLane).toEqual(FOLLOWING);
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
    expect(userState.state.progress.reachedSeason).toBe("summer");
  });

  it("refuses a save for a lane that stopped while it was read", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    const read = relay.read.getMockImplementation();
    relay.read.mockImplementationOnce(async () => {
      await userState.stopSyncing();
      return read?.() ?? { kind: "empty" };
    });
    receiver.start();
    await flush();
    expect(userState.syncLane).toBeUndefined();
    expect(userState.syncReceipt).toBeUndefined();
    expect(localStorage.getItem(PROGRESS_KEY)).not.toContain("syncReceipt");
  });
});

describe("a store it must not touch", () => {
  it("never applies after loading a newer build's data, & leaves the blob alone", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const newer = blob({ syncLane: FOLLOWING }, { version: 99 });
    const { receiver, userState } = await load(newer, relay);
    const writes = countWrites();
    receiver.start();
    await flush();
    expect(relay.read).not.toHaveBeenCalled();
    expect(writes.count()).toBe(0);
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(newer);
    expect(userState.syncBlocked).toBe(true);
    // Its lane is in a blob this build can't read, so the persistence warning speaks for it.
    expect(userState.syncLane).toBeUndefined();
    expect(receiver.status.kind).toBe("idle");
  });

  it("never applies after loading quarantined data, & never takes import's way out", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load("{not json", relay);
    receiver.start();
    await flush();
    expect(localStorage.getItem(PROGRESS_KEY)).toBe("{not json");
    expect(userState.persistenceFailureKind).toBe("unreadable");
    expect(userState.syncBlocked).toBe(true);
    expect(relay.read).not.toHaveBeenCalled();
    expect(receiver.status.kind).toBe("idle");
  });

  it("refuses when another tab left unreadable data since this one last read", async () => {
    const relay = fakeRelay();
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    localStorage.setItem(PROGRESS_KEY, "{not json");
    relay.sockets[0].onpush(await envelope(4, saveBytes(SEASON)));
    await flush();
    expect(localStorage.getItem(PROGRESS_KEY)).toBe("{not json");
    expect(localStorage.getItem(QUARANTINE_STORAGE_KEY)).toBe("{not json");
    expect(userState.syncBlocked).toBe(true);
    expect(receiver.status.kind).toBe("blocked");
  });

  it("stops at the newer-data state a newer tab wrote, & resumes when it clears", async () => {
    const relay = fakeRelay();
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    const newer = blob({ syncLane: FOLLOWING }, { version: 99 });
    localStorage.setItem(PROGRESS_KEY, newer);
    relay.sockets[0].onpush(await envelope(4, saveBytes(SEASON)));
    await flush();
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(newer);
    expect(userState.syncBlocked).toBe(true);
    receiver.update();
    expect(receiver.status.kind).toBe("blocked");
    expect(relay.sockets).toHaveLength(0);

    // The newer data is gone, so the store resumes & the receiver listens again.
    relay.set(await envelope(5, saveBytes(SEASON)));
    localStorage.setItem(PROGRESS_KEY, canonical(blob({ syncLane: FOLLOWING })));
    userState.loadFromStorage();
    receiver.update();
    await flush();
    expect(receiver.status.kind).toBe("up-to-date");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 5 });
  });
});

describe("a save it can't use", () => {
  const before = blob({ syncLane: FOLLOWING });

  it.each([
    { kind: "update-computer", version: 0 },
    { kind: "update-here", version: 2 },
  ])("shows $kind for envelope version $version & keeps progress", async ({ kind, version }) => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON), { version }));
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe(kind);
    expectNothingApplied();
  });

  it("shows unreadable for a save this build can't read, keeps progress, & waits", async () => {
    const garbage = Uint8Array.from([1, 2, 3, 4]);
    const relay = fakeRelay(await envelope(4, garbage));
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("unreadable");
    expectNothingApplied();

    relay.sockets[0].onpush(await envelope(5, saveBytes(SEASON)));
    await flush();
    expect(receiver.status.kind).toBe("up-to-date");
  });

  it("shows unreadable for a tampered envelope", async () => {
    const good = await envelope(4, saveBytes(SEASON));
    const relay = fakeRelay({ ...good, counter: 5 });
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("unreadable");
    expectNothingApplied();
  });

  it("reports a retired code & stops listening", async () => {
    const relay = fakeRelay({ kind: "empty" });
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    relay.sockets[0].onpush({ kind: "retired" });
    await flush();
    expect(receiver.status.kind).toBe("retired");
    expect(relay.sockets).toHaveLength(0);
    expectNothingApplied();
  });

  it("treats a mailbox that's gone like a retired code", async () => {
    const relay = fakeRelay({ kind: "absent" });
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("retired");
    expect(relay.sockets).toHaveLength(0);
    expectNothingApplied();
  });

  it.each(["paused", "unreachable"] as const)("reports %s & changes nothing", async (kind) => {
    const relay = fakeRelay({ kind });
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe(kind);
    expectNothingApplied();
  });

  it("retries a socket that closes, reading again", async () => {
    const relay = fakeRelay({ kind: "empty" });
    const { receiver } = await load(before, relay);
    receiver.start();
    await flush();
    expect(relay.read).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const [socket] = relay.sockets;
    relay.sockets.splice(0, 1);
    socket.onclose();
    await vi.advanceTimersByTimeAsync(4000);
    expect(relay.read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(relay.read).toHaveBeenCalledTimes(2);
    expect(relay.sockets).toHaveLength(1);
  });
});

describe("questions", () => {
  const LAST_IMPORT = {
    farmName: "Rosewood",
    identity: { creationVersion: null, saveNumber: "1315159680" },
    importedAt: 1,
    playerName: "Pat",
  };
  const SUMMER_BLOB = blob(
    { syncLane: FOLLOWING },
    {
      lastImport: LAST_IMPORT,
      progress: {
        lastSavePlaytime: 50,
        provenance: { reachedSeason: { playtime: 50, source: "save" } },
        reachedSeason: "fall",
      },
    },
  );

  it("asks before lowering a level, writes nothing until answered, then writes once", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    const writes = countWrites();
    receiver.start();
    await flush();
    expect(askedKinds(receiver.status)).toEqual(["facts"]);
    expect(writes.count()).toBe(0);
    expect(stored().local.syncReceipt).toBeUndefined();

    await receiver.answer(questionId(receiver.status), "accept");
    expect(writes.count()).toBe(1);
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.state.progress.reachedSeason).toBe("summer");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
  });

  it("remembers “keep mine” & advances the receipt", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    await receiver.answer(questionId(receiver.status), "keep");
    expect(userState.state.progress.reachedSeason).toBe("fall");
    expect(userState.resolutionOf("reachedSeason")).toEqual({ saveValue: "summer" });
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
  });

  it("asks again when progress changed while the question waited", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);

    userState.setReachedSeason("winter");
    await receiver.answer(asked, "accept");
    expect(receiver.status.kind).toBe("asking");
    expect(questionId(receiver.status)).not.toBe(asked);
    expect(userState.state.progress.reachedSeason).toBe("winter");
    expect(stored().local.syncReceipt).toBeUndefined();
  });

  it("settles against another tab's write, as an auto-save adopts it", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);

    // Unsaved here, then overtaken by another tab's write of the same progress.
    userState.setReachedSeason("winter");
    localStorage.setItem(PROGRESS_KEY, `${localStorage.getItem(PROGRESS_KEY) ?? ""} `);
    await receiver.answer(asked, "accept");
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.state.progress.reachedSeason).toBe("summer");
  });

  it("asks again when another tab's write changed what it was about", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);

    localStorage.setItem(
      PROGRESS_KEY,
      blob(
        { syncLane: FOLLOWING },
        {
          lastImport: LAST_IMPORT,
          progress: {
            lastSavePlaytime: 50,
            provenance: { reachedSeason: { playtime: 50, source: "save" } },
            reachedSeason: "winter",
          },
        },
      ),
    );
    await receiver.answer(asked, "accept");
    expect(askedKinds(receiver.status)).toEqual(["facts"]);
    expect(questionId(receiver.status)).not.toBe(asked);
    expect(userState.state.progress.reachedSeason).toBe("winter");
  });

  it("replaces the save a question was about when a newer one arrives", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    relay.sockets[0].onpush(await envelope(5, saveBytes(2 * SEASON + GAME_DAY)));
    await flush();
    expect(receiver.status).toEqual({ kind: "up-to-date" });
    expect(userState.state.progress.reachedSeason).toBe("fall");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 5 });
  });

  it("asks the same question after a reload, since nothing was written", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { make, receiver } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);
    receiver.stop();

    const reopened = make();
    reopened.start();
    await flush();
    expect(questionId(reopened.status)).toBe(asked);
  });

  it("asks whether unidentified progress is this farm, first", async () => {
    const unidentified = blob({ syncLane: FOLLOWING }, { progress: { renown: 3 } });
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver, tells, userState } = await load(unidentified, relay);
    receiver.start();
    await flush();
    expect(askedKinds(receiver.status)).toEqual(["farm"]);

    await receiver.answer(questionId(receiver.status), "same-farm");
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.state.progress.renown).toBe(3);
    expect(userState.state.lastImport?.identity.saveNumber).toBe("1315159680");
    expect(tells).toEqual([]);
  });

  it("asks before rolling back to an older save", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(2 * SEASON, 10)));
    const { receiver, userState } = await load(SUMMER_BLOB, relay);
    receiver.start();
    await flush();
    expect(askedKinds(receiver.status)).toEqual(["older-save"]);

    await receiver.answer(questionId(receiver.status), "keep");
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.lastSavePlaytime).toBe(50);
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
    expect(userState.state.lastImport?.identity.saveNumber).toBe("1315159680");
  });

  it("tells when a newer save replaces a manual edit", async () => {
    const mine = blob(
      { syncLane: FOLLOWING },
      {
        lastImport: LAST_IMPORT,
        progress: {
          lastSavePlaytime: 50,
          provenance: { reachedSeason: { playtime: 50, source: "manual" } },
          reachedSeason: "summer",
        },
      },
    );
    const relay = fakeRelay(await envelope(4, saveBytes(2 * SEASON, 100)));
    const { receiver, tells } = await load(mine, relay);
    receiver.start();
    await flush();
    expect(tells).toEqual([{ applied: true, kept: false }]);
  });

  it("tells when a manual edit outlasts the save", async () => {
    const mine = blob(
      { syncLane: FOLLOWING },
      {
        lastImport: LAST_IMPORT,
        progress: {
          lastSavePlaytime: 100,
          provenance: { reachedSeason: { playtime: 100, source: "manual" } },
          reachedSeason: "summer",
        },
      },
    );
    const relay = fakeRelay(await envelope(4, saveBytes(2 * SEASON, 100)));
    const { receiver, tells, userState } = await load(mine, relay);
    receiver.start();
    await flush();
    expect(tells).toEqual([{ applied: false, kept: true }]);
    expect(userState.state.progress.reachedSeason).toBe("summer");
  });

  it("forwards an answer from a tab that isn't leading to the one that is", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { make, userState } = await load(SUMMER_BLOB, relay, { channel: linkedChannels() });
    const leader = make();
    const other = make();
    leader.start();
    await flush();
    other.start();
    await flush();
    expect(leader.status.kind).toBe("asking");
    expect(other.status.kind).toBe("asking");

    await other.answer(questionId(other.status), "accept");
    await flush();
    expect(leader.status.kind).toBe("up-to-date");
    expect(other.status.kind).toBe("up-to-date");
    expect(userState.state.progress.reachedSeason).toBe("summer");
  });
});

describe("switching farms", () => {
  const TRACKED = {
    lastImport: {
      farmName: "Rosewood",
      identity: { creationVersion: null, saveNumber: "1315159680" },
      importedAt: 1,
      playerName: "Pat",
    },
    progress: { renown: 3 },
  };
  const earlier = {
    backup: JSON.parse(blob({})) as unknown,
    farmName: "Old Acres",
    savedAt: 5,
  };

  it("backs the outgoing farm up in the same write, & tells", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON), { fileName: OTHER_FARM_FILE }));
    const { receiver, tells, userState } = await load(
      blob({ syncLane: FOLLOWING }, TRACKED),
      relay,
    );
    const writes = countWrites();
    receiver.start();
    await flush();

    expect(writes.count()).toBe(1);
    expect(userState.state.progress.renown).toBe(0);
    expect(userState.farmSwitchBackup?.farmName).toBe("Rosewood");
    expect(tells).toEqual([
      { applied: false, kept: false, switchedFrom: { farmName: "Rosewood" } },
    ]);
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });

    expect(userState.restoreFarmSwitchBackup()).toEqual({ ok: true });
    expect(userState.state.progress.renown).toBe(3);
    expect(userState.syncLane).toEqual(FOLLOWING);
  });

  it("says so before replacing an existing backup", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON), { fileName: OTHER_FARM_FILE }));
    const { receiver, userState } = await load(
      blob({ farmSwitchBackup: earlier, syncLane: FOLLOWING }, TRACKED),
      relay,
    );
    receiver.start();
    await flush();
    expect(receiver.status).toMatchObject({
      kind: "asking",
      questions: [{ farmName: "Old Acres", kind: "replace-backup", savedAt: 5 }],
    });
    expect(userState.farmSwitchBackup?.farmName).toBe("Old Acres");
    expect(userState.state.progress.renown).toBe(3);

    await receiver.answer(questionId(receiver.status), "accept");
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.farmSwitchBackup?.farmName).toBe("Rosewood");
  });

  it("doesn't switch when the backup can't be written, & doesn't advance the receipt", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON), { fileName: OTHER_FARM_FILE }));
    const { receiver, userState } = await load(blob({ syncLane: FOLLOWING }, TRACKED), relay);
    const before = localStorage.getItem(PROGRESS_KEY);
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (name, value) => {
      if (name === PROGRESS_KEY) throw new Error("quota");
      setItem(name, value);
    };
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("switch-failed");
    expect(userState.state.progress.renown).toBe(3);
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(before);
  });
});

describe("the computer's own saves", () => {
  const computer = blob({ syncLane: { kind: "computer" } });

  it("applies without the relay, then skips by the save's hash", async () => {
    const relay = fakeRelay();
    const { receiver, userState } = await load(computer, relay);
    const writes = countWrites();
    receiver.start();
    await flush();
    expect(relay.subscribe).not.toHaveBeenCalled();

    expect(await receiver.applyLocalSave(file(saveBytes(SEASON)))).toBe("applied");
    expect(writes.count()).toBe(1);
    expect(userState.syncReceipt?.mailboxId).toBeUndefined();
    expect(userState.syncReceipt?.hash).toMatch(/^[\w-]{43}$/u);

    expect(await receiver.applyLocalSave(file(saveBytes(SEASON)))).toBe("skipped");
    expect(writes.count()).toBe(1);
    expect(await receiver.applyLocalSave(file(saveBytes(2 * SEASON)))).toBe("applied");
    expect(writes.count()).toBe(2);
  });

  it("reports a blocked store without throwing, so the courier can still upload", async () => {
    const newer = blob({ syncLane: { kind: "computer" } }, { version: 99 });
    const { receiver } = await load(newer, fakeRelay());
    expect(await receiver.applyLocalSave(file(saveBytes(SEASON)))).toBe("blocked");
    expect(localStorage.getItem(PROGRESS_KEY)).toBe(newer);
  });

  it("reports a save it can't read without throwing", async () => {
    const { receiver } = await load(computer, fakeRelay());
    const garbage = Uint8Array.from([1, 2, 3]);
    expect(await receiver.applyLocalSave(file(garbage))).toBe("unreadable");
    expectNothingApplied();
  });

  it("refuses a save once the lane has stopped", async () => {
    const { receiver } = await load(blob({}), fakeRelay());
    expect(await receiver.applyLocalSave(file(saveBytes(SEASON)))).toBe("stale");
  });
});

describe("what the review found", () => {
  const LAST_IMPORT = {
    farmName: "Rosewood",
    identity: { creationVersion: null, saveNumber: "1315159680" },
    importedAt: 1,
    playerName: "Pat",
  };
  const ASKS = blob(
    { syncLane: FOLLOWING },
    {
      lastImport: LAST_IMPORT,
      progress: {
        lastSavePlaytime: 50,
        provenance: { reachedSeason: { playtime: 50, source: "save" } },
        reachedSeason: "fall",
      },
    },
  );
  const GARBAGE = Uint8Array.from([1, 2, 3, 4]);

  it("says a save is unreadable again after a transient status (F1)", async () => {
    const unreadable = await envelope(4, GARBAGE);
    const relay = fakeRelay(unreadable);
    const { receiver } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("unreadable");

    relay.set({ kind: "unreachable" });
    receiver.refresh();
    await flush();
    expect(receiver.status.kind).toBe("unreachable");

    relay.set(unreadable);
    receiver.refresh();
    await flush();
    expect(receiver.status.kind).toBe("unreadable");
  });

  it("keeps a question up when a newer save can't be read, then says so (F2)", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver } = await load(ASKS, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);

    relay.sockets[0].onpush(await envelope(5, GARBAGE));
    await flush();
    expect(questionId(receiver.status)).toBe(asked);

    await receiver.answer(asked, "accept");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
    expect(receiver.status.kind).toBe("unreadable");
  });

  it("keeps a question up when a newer version arrives, then says so (F2)", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver } = await load(ASKS, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);

    relay.sockets[0].onpush(await envelope(5, saveBytes(SEASON), { version: 2 }));
    await flush();
    expect(questionId(receiver.status)).toBe(asked);

    await receiver.answer(asked, "accept");
    expect(receiver.status.kind).toBe("update-here");
  });

  it("drops a newer save's trouble when a good one replaces it (F2)", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver } = await load(ASKS, relay);
    receiver.start();
    await flush();
    const [socket] = relay.sockets;
    socket.onpush(await envelope(5, GARBAGE));
    await flush();
    socket.onpush(await envelope(6, saveBytes(2 * SEASON + GAME_DAY)));
    await flush();
    expect(receiver.status.kind).toBe("up-to-date");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 6 });
  });

  it("reports a retired code once a waiting question is answered (F3)", async () => {
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver } = await load(ASKS, relay);
    receiver.start();
    await flush();
    const asked = questionId(receiver.status);
    relay.sockets[0].onpush({ kind: "retired" });
    await flush();
    expect(questionId(receiver.status)).toBe(asked);

    await receiver.answer(asked, "accept");
    expect(receiver.status.kind).toBe("retired");
    expect(stored().local.syncReceipt).toMatchObject({ counter: 4 });
  });

  it("retries from a tab that isn't leading (F4)", async () => {
    const relay = fakeRelay({ kind: "unreachable" });
    const { make } = await load(blob({ syncLane: FOLLOWING }), relay, {
      channel: linkedChannels(),
    });
    const leader = make();
    const other = make();
    leader.start();
    await flush();
    other.start();
    await flush();
    expect(other.status.kind).toBe("unreachable");

    relay.set({ kind: "empty" });
    other.refresh();
    await flush();
    expect(relay.read).toHaveBeenCalledTimes(2);
    expect(leader.status.kind).toBe("waiting");
    expect(other.status.kind).toBe("waiting");
  });

  it("names the save's farm on the farm question, not the stored one (F5)", async () => {
    const unidentified = blob({ syncLane: FOLLOWING }, { progress: { renown: 3 } });
    const relay = fakeRelay(await envelope(4, saveBytes(SEASON)));
    const { receiver } = await load(unidentified, relay);
    receiver.start();
    await flush();
    expect(receiver.status).toMatchObject({
      kind: "asking",
      questions: [{ farmName: "Rosewood", kind: "farm" }],
    });
  });

  it("retries a computer's failed apply on request (F7)", async () => {
    const { receiver, userState } = await load(
      blob({ syncLane: { kind: "computer" } }),
      fakeRelay(),
    );
    receiver.start();
    await flush();
    const setItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error("quota");
    };
    expect(await receiver.applyLocalSave(file(saveBytes(SEASON)))).toBe("write-failed");
    expect(receiver.status.kind).toBe("write-failed");

    localStorage.setItem = setItem;
    receiver.refresh();
    await flush();
    expect(receiver.status.kind).toBe("up-to-date");
    expect(userState.syncReceipt?.hash).toMatch(/^[\w-]{43}$/u);
  });

  it("keeps a backup another tab just wrote when this tab resets (F12)", async () => {
    const receipt = { counter: 4, hash: "h".repeat(43) };
    const { userState } = await load(
      blob({ syncLane: FOLLOWING, syncReceipt: receipt }),
      fakeRelay(),
    );
    const farmSwitchBackup = {
      backup: JSON.parse(blob({})) as unknown,
      farmName: "Kept",
      savedAt: 5,
    };
    const syncPendingRetires = [{ mailboxId: "A".repeat(22), token: "t".repeat(43) }];
    // Another tab's write, whose storage event hasn't reached this one.
    localStorage.setItem(
      PROGRESS_KEY,
      canonical(
        blob({ farmSwitchBackup, syncLane: FOLLOWING, syncPendingRetires, syncReceipt: receipt }),
      ),
    );
    userState.resetProgress();
    await flush();
    const { local } = stored();
    expect(local.syncReceipt).toBeUndefined();
    expect(local.syncLane).toEqual(FOLLOWING);
    expect(local.farmSwitchBackup).toMatchObject({ farmName: "Kept" });
    expect(local.syncPendingRetires).toEqual(syncPendingRetires);
  });

  it("treats a read that throws as unreachable (F13)", async () => {
    const relay = fakeRelay();
    relay.read.mockRejectedValueOnce(new Error("body failed"));
    const { receiver } = await load(blob({ syncLane: FOLLOWING }), relay);
    receiver.start();
    await flush();
    expect(receiver.status.kind).toBe("unreachable");
  });
});
