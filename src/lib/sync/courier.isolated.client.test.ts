import { deflateSync, inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UpdateHolds } from "#lib/pwa/update-holds.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import { decodeSavePayload, deriveFollowKeys, mailboxIdFor, openEnvelope } from "./follow.js";

import type { Courier, CourierOptions, CourierStatus, SaveObserver } from "./courier.js";
import type {
  FollowKey,
  RelayClient,
  SealedEnvelope,
  ShareResult,
  UploadResult,
} from "./follow.js";
import type { LocalSaveResult } from "./receiver.js";
import type { SaveFileHandle, SaveHandleStore } from "./save-source.js";

const PROGRESS_KEY = "mistria-fyi:progress";
const UPLOADS_KEY = "mistria-fyi:sync-uploads";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" as FollowKey;
const OTHER_KEY = "HxwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEAAAA" as FollowKey;
const TOKEN = "__________________________________________8";
const FILE_NAME = "game-1315159680-autosave.sav";
const POLL_MS = 15;
const COALESCE_MS = 5;

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
      renown: 0,
      spells: [],
    },
    version: 3,
    worldState: { season: "spring", weather: "calm" },
  });
}

function u64(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function saveBytes(playtime = 100): Uint8Array<ArrayBuffer> {
  const entries: Record<string, unknown> = {
    date_photos: { photos: "big" },
    farm: { tiles: "big" },
    game_stats: { stats: "big" },
    gamedata: { date: 0 },
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

/** A handle onto a file the test can replace, take away, or lock. */
function fakeHandle(initial: Uint8Array<ArrayBuffer> = saveBytes()) {
  let bytes: Uint8Array<ArrayBuffer> | undefined = initial;
  let modified = 1000;
  let failure: "gone" | "locked" | undefined;
  const handle = {
    getFile: vi.fn(() => {
      if (failure === "locked") {
        return Promise.reject(new DOMException("No access", "NotAllowedError"));
      }
      if (failure === "gone" || !bytes) {
        return Promise.reject(new DOMException("Gone", "NotFoundError"));
      }
      return Promise.resolve(new File([bytes], FILE_NAME, { lastModified: modified }));
    }),
    kind: "file",
    requestPermission: vi.fn(() => {
      failure = undefined;
      return Promise.resolve("granted" as PermissionState);
    }),
  };
  return {
    fail(next: "gone" | "locked" | undefined) {
      failure = next;
    },
    handle: handle as unknown as SaveFileHandle,
    /** Replaces the file, as the game does. */
    replace(next: Uint8Array<ArrayBuffer>) {
      bytes = next;
      modified += 1000;
    },
    spy: handle,
  };
}

/** A `FileSystemObserver` the test can speak through. */
function fakeObservers() {
  const made: (SaveObserver & {
    disconnect: ReturnType<typeof vi.fn>;
    emit: (...types: string[]) => void;
    observe: ReturnType<typeof vi.fn>;
  })[] = [];
  class Observer {
    disconnect = vi.fn();
    observe = vi.fn(() => Promise.resolve());
    readonly #notify: (records: readonly { type: string }[]) => void;
    constructor(notify: (records: readonly { type: string }[]) => void) {
      this.#notify = notify;
      made.push(this);
    }
    emit(...types: string[]): void {
      this.#notify(types.map((type) => ({ type })));
    }
  }
  return { made, Observer: Observer as unknown as NonNullable<CourierOptions["observer"]> };
}

function fakeRelay() {
  return {
    create: vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "created" }),
    read: vi.fn<RelayClient["read"]>().mockResolvedValue({ kind: "empty" }),
    retire: vi.fn<RelayClient["retire"]>().mockResolvedValue({ kind: "retired" }),
    upload: vi.fn<RelayClient["upload"]>().mockResolvedValue({ kind: "stored" }),
  };
}

function memoryHandles(initial?: SaveFileHandle): SaveHandleStore & { current: unknown } {
  const store = {
    clear: vi.fn(() => {
      store.current = undefined;
      return Promise.resolve();
    }),
    current: initial as unknown,
    load: vi.fn(() => Promise.resolve(store.current as SaveFileHandle | undefined)),
    save: vi.fn((handle: SaveFileHandle) => {
      store.current = handle;
      return Promise.resolve();
    }),
  };
  return store;
}

/** One lock per name, with `ifAvailable` & `steal`; a steal rejects the holder's request. */
function fakeLocks() {
  const queue: { grant: () => void; signal?: AbortSignal }[] = [];
  let holder: undefined | { end: () => void; steal: (error: Error) => void };
  const pump = (): void => {
    if (!holder) queue.shift()?.grant();
  };
  const manager = {
    request(_name: string, options: LockOptions, task: (lock: Lock | null) => unknown) {
      return new Promise((resolve, reject) => {
        const grant = (): void => {
          let ended = false;
          const end = (): void => {
            if (ended) return;
            ended = true;
            holder = undefined;
            pump();
          };
          holder = {
            end,
            steal: (error) => {
              ended = true;
              reject(error);
            },
          };
          void (async () => {
            resolve(await task({ name: "lock" } as Lock));
            end();
          })();
        };
        if (options.steal) {
          holder?.steal(new DOMException("Stolen", "AbortError"));
          holder = undefined;
          grant();
          return;
        }
        if (options.ifAvailable && holder) {
          void (async () => {
            resolve(await task(null));
          })();
          return;
        }
        if (!holder) {
          grant();
          return;
        }
        const entry = { grant, signal: options.signal };
        queue.push(entry);
        options.signal?.addEventListener("abort", () => {
          queue.splice(queue.indexOf(entry), 1);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  };
  return manager as unknown as LockManager;
}

async function settle(ms = 20): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function until(check: () => boolean): Promise<void> {
  await vi.waitFor(
    () => {
      expect(check()).toBe(true);
    },
    { interval: 2, timeout: 2000 },
  );
}

const open: Courier[] = [];

interface Setup {
  code?: boolean;
  options?: Partial<CourierOptions>;
  stored?: Record<string, string>;
}

async function load({ code = true, options = {}, stored = {} }: Setup = {}) {
  const lane = code ? { code: { key: KEY, token: TOKEN }, kind: "computer" } : { kind: "computer" };
  const storage = memoryStorage({
    [PROGRESS_KEY]: blob({ syncLane: lane }),
    ...stored,
  });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("navigator", {});
  vi.resetModules();
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  const { createCourier } = await import("./courier.js");
  const statuses: CourierStatus[] = [];
  const relay = fakeRelay();
  const applyLocal = vi.fn<(file: File) => Promise<LocalSaveResult>>(() =>
    Promise.resolve("applied"),
  );
  const observers = fakeObservers();
  const handles = memoryHandles();
  const make = (overrides: Partial<CourierOptions> = {}): Courier => {
    const courier = createCourier({
      applyLocal,
      coalesceMs: COALESCE_MS,
      firstRetryMs: 10,
      handles,
      holds: new UpdateHolds(),
      locks: () => undefined,
      observer: () => observers.Observer as never,
      onstatus: (status) => statuses.push(status),
      pollMs: POLL_MS,
      relay: () => relay,
      renewCode: () => Promise.resolve({ kind: "unreachable" }),
      ...options,
      ...overrides,
    });
    open.push(courier);
    return courier;
  };
  return {
    applyLocal,
    handles,
    last: () => statuses.at(-1),
    make,
    observers,
    relay,
    statuses,
    storage,
    userState,
  };
}

async function opened(sealed: SealedEnvelope, key: FollowKey = KEY) {
  const keys = await deriveFollowKeys(key);
  return decodeSavePayload(
    await openEnvelope(keys, { counter: sealed.counter, version: sealed.version }, sealed.envelope),
  );
}

afterEach(async () => {
  for (const courier of open.splice(0)) courier.stop();
  await settle(0);
  vi.unstubAllGlobals();
});

describe("watching", () => {
  it("coalesces a burst of records into one read of the replaced file", async () => {
    const { applyLocal, make, observers } = await load();
    const file = fakeHandle();
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    expect(applyLocal).toHaveBeenCalledTimes(1);

    file.replace(saveBytes(200));
    file.spy.getFile.mockClear();
    const [observer] = observers.made;
    observer.emit("disappeared");
    observer.emit("appeared");
    observer.emit("modified", "appeared");
    await until(() => applyLocal.mock.calls.length === 2);
    await settle();
    expect(file.spy.getFile).toHaveBeenCalledTimes(1);
    expect(applyLocal).toHaveBeenCalledTimes(2);
  });

  it.each(["appeared", "modified", "unknown"])("reads again on `%s`", async (type) => {
    const { applyLocal, make, observers } = await load();
    const file = fakeHandle();
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    file.replace(saveBytes(200));
    observers.made[0]?.emit(type);
    await until(() => applyLocal.mock.calls.length === 2);
    expect(applyLocal).toHaveBeenCalledTimes(2);
  });

  it("keeps its observer through `disappeared`, & reads nothing for it", async () => {
    const { applyLocal, make, observers } = await load();
    const file = fakeHandle();
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    observers.made[0]?.emit("disappeared");
    await settle();
    expect(observers.made).toHaveLength(1);
    expect(observers.made[0]?.disconnect).not.toHaveBeenCalled();
    expect(applyLocal).toHaveBeenCalledTimes(1);
  });

  it("starts a new observer at the next successful read after `errored`", async () => {
    const { make, observers } = await load();
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    // The file's gone, so nothing starts until it's back, even with the same metadata.
    file.fail("gone");
    await settle(POLL_MS * 2);
    observers.made[0]?.emit("disappeared", "errored");
    expect(observers.made[0]?.disconnect).toHaveBeenCalledWith();
    await settle(POLL_MS * 2);
    expect(observers.made).toHaveLength(1);

    file.fail(undefined);
    await until(() => observers.made.length === 2);
    expect(observers.made[1]?.observe).toHaveBeenCalledWith(file.handle);
  });

  it("catches an event the observer missed with the backstop poll", async () => {
    const { applyLocal, make, relay } = await load();
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    relay.upload.mockClear();

    file.replace(saveBytes(200));
    await until(() => applyLocal.mock.calls.length === 2);
    await until(() => relay.upload.mock.calls.length === 1);
    expect(applyLocal).toHaveBeenCalledTimes(2);
  });

  it("lets the hash decide: a new modification time with the same bytes changes nothing", async () => {
    const { applyLocal, make, relay } = await load();
    const bytes = saveBytes();
    const file = fakeHandle(bytes);
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    relay.upload.mockClear();

    file.replace(bytes);
    await settle(POLL_MS * 3);
    expect(applyLocal).toHaveBeenCalledTimes(1);
    expect(relay.upload).not.toHaveBeenCalled();
  });

  it("stays quiet for one failed poll, says the file moved after two, & recovers", async () => {
    const { last, make, observers, statuses } = await load();
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    file.fail("gone");
    await until(() => file.spy.getFile.mock.calls.length >= 2);
    expect(statuses.some(({ trouble }) => trouble === "moved")).toBe(false);
    await until(() => last()?.trouble === "moved");

    observers.made[0]?.emit("errored");
    file.fail(undefined);
    await until(() => last()?.trouble === undefined);
    await until(() => observers.made.length === 2);
  });

  it("asks for access at once when permission is lost, & again reads once it's back", async () => {
    const { applyLocal, last, make } = await load();
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    file.replace(saveBytes(200));
    file.fail("locked");
    await until(() => last()?.trouble === "reallow");
    await courier.reallow();
    expect(file.spy.requestPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(last()?.trouble).toBeUndefined();
    expect(applyLocal).toHaveBeenCalledTimes(2);
  });

  it("restores its handle on the next visit, & asks when the grant didn't survive", async () => {
    const { handles, last, make } = await load();
    const file = fakeHandle();
    file.fail("locked");
    await handles.save(file.handle);
    const courier = make();
    courier.start();
    await until(() => last()?.trouble === "reallow");
    expect(last()?.source).toBe("watched");
  });

  it("never polls a file it can't watch", async () => {
    const { applyLocal, last, make, observers } = await load();
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    await settle(POLL_MS * 3);
    expect(last()?.source).toBe("file");
    expect(applyLocal).toHaveBeenCalledTimes(1);
    expect(observers.made).toHaveLength(0);
  });

  it("forgets a stored handle when a paste gives only a file", async () => {
    const { handles, make } = await load();
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    expect(handles.current).toBe(file.handle);
    await courier.take({ file: new File([saveBytes(200)], FILE_NAME), kind: "file" });
    expect(handles.current).toBeUndefined();
  });
});

describe("applying here", () => {
  it("applies each new save without the relay, before any code exists", async () => {
    const { applyLocal, make, relay } = await load({ code: false });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(applyLocal).toHaveBeenCalledTimes(1);
    expect(relay.create).not.toHaveBeenCalled();
    expect(relay.read).not.toHaveBeenCalled();
    expect(relay.upload).not.toHaveBeenCalled();
  });

  it("applies the current save again after a reset removes the receipt", async () => {
    const { applyLocal, make, relay, userState } = await load({
      stored: {
        [PROGRESS_KEY]: blob({
          syncLane: { kind: "computer" },
          syncReceipt: { hash: "A".repeat(43) },
        }),
      },
    });
    const file = fakeHandle();
    const courier = make();
    courier.start();
    courier.update();
    await courier.take({ handle: file.handle, kind: "handle" });
    expect(applyLocal).toHaveBeenCalledTimes(1);
    relay.upload.mockClear();

    userState.resetProgress();
    await until(() => userState.syncReceipt === undefined);
    courier.update();
    await until(() => applyLocal.mock.calls.length === 2);
    expect(relay.upload).not.toHaveBeenCalled();
  });

  it("forgets its handle when the lane ends", async () => {
    const { handles, last, make, observers, userState } = await load({ code: false });
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    await userState.stopSyncing();
    courier.update();
    await settle();
    expect(handles.current).toBeUndefined();
    expect(last()?.source).toBe("unknown");
    expect(observers.made[0]?.disconnect).toHaveBeenCalledWith();
  });
});

describe("uploading", () => {
  it("prunes & seals with the file's details inside, the counter beside", async () => {
    const { make, relay } = await load();
    const courier = make();
    courier.start();
    await courier.take({
      file: new File([saveBytes(4321)], FILE_NAME, { lastModified: 5000 }),
      kind: "file",
    });
    expect(relay.upload).toHaveBeenCalledTimes(1);
    const [mailboxId, token, sealed] = relay.upload.mock.calls[0] ?? [];
    expect(mailboxId).toBe(await mailboxIdFor(KEY));
    expect(token).toBe(TOKEN);
    expect(sealed).toMatchObject({ counter: 1, version: 1 });

    const payload = await opened(sealed);
    expect(payload.header).toEqual({ fileName: FILE_NAME, modified: 5000, playtime: 4321 });
    const text = inflateSync(payload.save).toString("utf8");
    expect(text).toContain("gamedata");
    expect(text).not.toContain("game_stats");
    expect(text).not.toContain("date_photos");
    expect(text).not.toContain("tiles");
  });

  it.each<LocalSaveResult>(["ask", "blocked", "write-failed"])(
    "uploads whatever its own tracker does: %s",
    async (result) => {
      const { applyLocal, make, relay } = await load();
      applyLocal.mockResolvedValue(result);
      const courier = make();
      courier.start();
      await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
      expect(relay.upload).toHaveBeenCalledTimes(1);
    },
  );

  it("never waits for an apply that hasn't finished", async () => {
    const { applyLocal, make, relay } = await load();
    const applying = Promise.withResolvers<LocalSaveResult>();
    applyLocal.mockReturnValue(applying.promise);
    const courier = make();
    courier.start();
    const taking = courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    await until(() => relay.upload.mock.calls.length === 1);
    expect(applyLocal).toHaveBeenCalledTimes(1);
    applying.resolve("applied");
    await taking;
  });

  it("uploads a save its own tracker can't read, as long as it prunes", async () => {
    const { applyLocal, last, make, relay } = await load();
    applyLocal.mockResolvedValue("unreadable");
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(1);
    expect(last()?.trouble).toBe("unreadable");
  });

  it("uploads nothing for a save it can't prune, & shows the error", async () => {
    const { last, make, relay } = await load();
    const courier = make();
    courier.start();
    await courier.take({ file: new File(["not a save"], FILE_NAME), kind: "file" });
    expect(relay.upload).not.toHaveBeenCalled();
    expect(last()?.trouble).toBe("unreadable");
  });

  it("clears the unreadable notice once a save reads again", async () => {
    const { applyLocal, last, make } = await load();
    applyLocal.mockResolvedValueOnce("unreadable");
    const file = fakeHandle();
    const courier = make();
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    expect(last()?.trouble).toBe("unreadable");
    file.replace(saveBytes(200));
    await until(() => last()?.trouble === undefined);
  });

  it("raises the counter with each upload, across new codes & an erased lane", async () => {
    const { make, relay, storage, userState } = await load();
    const file = fakeHandle();
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });
    file.replace(saveBytes(200));
    await courier.check();

    expect(
      await userState.setSharedCode(
        { key: OTHER_KEY, token: TOKEN },
        {
          code: { key: KEY, token: TOKEN },
          retire: { mailboxId: await mailboxIdFor(KEY), token: TOKEN },
        },
      ),
    ).toBe(true);
    courier.update();
    await until(() => relay.upload.mock.calls.length === 3);
    const counters = relay.upload.mock.calls.map((call) => call[2].counter);
    expect(counters).toEqual([1, 2, 3]);
    expect(relay.upload.mock.calls[2]?.[0]).toBe(await mailboxIdFor(OTHER_KEY));
    expect(await opened(relay.upload.mock.calls[2]?.[2], OTHER_KEY)).toBeTruthy();

    // A new visit carries on from where it was, even with the progress key gone.
    storage.removeItem(PROGRESS_KEY);
    expect(JSON.parse(storage.getItem(UPLOADS_KEY) ?? "{}")).toMatchObject({ counter: 3 });
  });

  it("reserves a counter before sending, so a crash never reuses it", async () => {
    const { make, relay, storage } = await load();
    relay.upload.mockImplementation(() => {
      expect(JSON.parse(storage.getItem(UPLOADS_KEY) ?? "{}")).toMatchObject({ counter: 1 });
      return Promise.resolve({ kind: "stored" });
    });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(1);
  });

  it("retries the same bytes under the same counter, then shows it's back", async () => {
    const { last, make, relay, statuses } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "unreachable" });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.upload).toBe("unreachable");
    await until(() => relay.upload.mock.calls.length === 2);
    await until(() => last()?.upload === "idle");
    const [first, second] = relay.upload.mock.calls.map((call) => call[2]);
    expect(second.counter).toBe(first.counter);
    expect(second.envelope).toBe(first.envelope);
    expect(statuses.some(({ upload }) => upload === "unreachable")).toBe(true);
  });

  it("says when sync is paused, & catches up once it lifts", async () => {
    const { last, make, relay } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "paused", until: Date.now() });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.upload).toBe("paused");
    await until(() => relay.upload.mock.calls.length === 2 && last()?.upload === "idle");
  });

  it("waits out the relay's upload cap without troubling the player", async () => {
    const { last, make, relay, statuses } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "rate-limited", retryAfterSeconds: 0.01 });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    await until(() => relay.upload.mock.calls.length === 2);
    expect(last()?.upload).toBe("idle");
    expect(statuses.every(({ upload }) => upload === "idle")).toBe(true);
  });

  it("recovers from a counter the mailbox is already past", async () => {
    const { make, relay } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "conflict" });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(2);
    const [first, second] = relay.upload.mock.calls.map((call) => call[2]);
    expect(second.counter).toBeGreaterThan(first.counter);
  });

  it("makes a new code & says so when its own has been retired", async () => {
    const { last, make, relay, userState } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "retired" });
    const renewCode = vi.fn(async () => {
      const code = { key: OTHER_KEY, token: TOKEN };
      await userState.setSharedCode(code, {
        code: { key: KEY, token: TOKEN },
        retire: { mailboxId: await mailboxIdFor(KEY), token: TOKEN },
      });
      return { code, kind: "shared" as const };
    });
    const courier = make({ renewCode });
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(renewCode).toHaveBeenCalledTimes(1);
    expect(relay.upload.mock.calls[1]?.[0]).toBe(await mailboxIdFor(OTHER_KEY));
    expect(last()?.codeRenewed).toBe(true);
  });

  it("holds an update's reload until the upload lands, then lets it go", async () => {
    const holds = new UpdateHolds();
    const { make, relay } = await load({ options: { holds } });
    const landing = Promise.withResolvers<{ kind: "stored" }>();
    relay.upload.mockReturnValue(landing.promise);
    const released = vi.fn();
    holds.onRelease(released);
    const courier = make();
    courier.start();
    const taking = courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    await until(() => relay.upload.mock.calls.length === 1);
    expect(holds.held).toBe(true);
    landing.resolve({ kind: "stored" });
    await taking;
    expect(holds.held).toBe(false);
    expect(released).toHaveBeenCalledWith();
  });

  it("doesn't hold an update's reload while only waiting to retry", async () => {
    const holds = new UpdateHolds();
    const { make, relay } = await load({ options: { firstRetryMs: 60_000, holds } });
    relay.upload.mockResolvedValue({ kind: "unreachable" });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(holds.held).toBe(false);
  });
});

async function uploadOnce() {
  const setup = await load();
  const file = fakeHandle();
  await setup.handles.save(file.handle);
  const first = setup.make();
  first.start();
  await until(() => setup.relay.upload.mock.calls.length === 1);
  await settle();
  first.stop();
  setup.relay.upload.mockClear();
  setup.relay.read.mockClear();
  return { ...setup, file };
}

describe("at start & when showing the code", () => {
  it("uploads at start when the save changed while the page was away", async () => {
    const { file, make, relay } = await uploadOnce();
    file.replace(saveBytes(200));
    make().start();
    await until(() => relay.upload.mock.calls.length === 1);
    expect(relay.read).not.toHaveBeenCalled();
    expect(relay.upload.mock.calls[0]?.[2].counter).toBe(2);
  });

  it("leaves a mailbox alone when it already holds this save", async () => {
    const { make, relay } = await uploadOnce();
    relay.read.mockResolvedValue({
      counter: 1,
      envelope: new Uint8Array(28),
      kind: "envelope",
      version: 1,
    });
    make().start();
    await until(() => relay.read.mock.calls.length === 1);
    await settle();
    expect(relay.upload).not.toHaveBeenCalled();
  });

  it("fills an expired mailbox again when the mailbox answers “empty”", async () => {
    const { make, relay } = await uploadOnce();
    relay.read.mockResolvedValue({ kind: "empty" });
    make().start();
    await until(() => relay.upload.mock.calls.length === 1);
    expect(relay.upload.mock.calls[0]?.[2].counter).toBe(2);
  });

  it("does the same each time the code is shown", async () => {
    const { make, relay } = await uploadOnce();
    relay.read.mockResolvedValue({
      counter: 1,
      envelope: new Uint8Array(28),
      kind: "envelope",
      version: 1,
    });
    const courier = make();
    courier.start();
    await until(() => relay.read.mock.calls.length === 1);
    await settle();

    relay.read.mockResolvedValue({ kind: "empty" });
    await courier.check();
    expect(relay.read).toHaveBeenCalledTimes(2);
    expect(relay.upload).toHaveBeenCalledTimes(1);
  });

  it("looks again later when the relay can't answer", async () => {
    const { make, relay } = await uploadOnce();
    relay.read.mockResolvedValueOnce({ kind: "unreachable" });
    relay.read.mockResolvedValue({ kind: "empty" });
    make().start();
    await until(() => relay.upload.mock.calls.length === 1);
    expect(relay.read).toHaveBeenCalledTimes(2);
  });

  it("uploads the moment a first code exists", async () => {
    const { make, relay, userState } = await load({ code: false });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).not.toHaveBeenCalled();
    await userState.setSharedCode({ key: KEY, token: TOKEN });
    courier.update();
    await until(() => relay.upload.mock.calls.length === 1);
  });
});

describe("one courier per profile", () => {
  it("says another window has it, & takes over when that one goes", async () => {
    const locks = fakeLocks();
    const { make, statuses } = await load({ options: { locks: () => locks, pollMs: 60_000 } });
    const file = fakeHandle();
    const first = make();
    first.start();
    await first.take({ handle: file.handle, kind: "handle" });
    file.spy.getFile.mockClear();

    const second = make();
    second.start();
    await until(() => second.status.trouble === "other-window");
    await settle();
    expect(file.spy.getFile).not.toHaveBeenCalled();
    expect(first.status.trouble).toBeUndefined();

    first.stop();
    await until(() => second.status.trouble === undefined && second.status.source === "watched");
    expect(statuses.length).toBeGreaterThan(0);
  });

  it("hands the lead to the window a new save file is dropped in", async () => {
    const locks = fakeLocks();
    const { make, observers } = await load({ options: { locks: () => locks } });
    const file = fakeHandle();
    const first = make();
    first.start();
    await first.take({ handle: file.handle, kind: "handle" });

    const second = make();
    second.start();
    await until(() => second.status.trouble === "other-window");
    await second.take({ handle: fakeHandle(saveBytes(200)).handle, kind: "handle" });
    expect(second.status.trouble).toBeUndefined();
    await until(() => first.status.trouble === "other-window");
    expect(observers.made[0]?.disconnect).toHaveBeenCalledWith();
  });
});

describe("the sync switch", () => {
  it("does nothing off the computer lane", async () => {
    const { handles, make, relay } = await load({
      stored: { [PROGRESS_KEY]: blob({ syncLane: { key: KEY, kind: "following" } }) },
    });
    make().start();
    await settle();
    expect(handles.load).not.toHaveBeenCalled();
    expect(relay.read).not.toHaveBeenCalled();
  });
});

describe("a step that never settles", () => {
  it("gives up on an upload, retries it, & lets an update's reload through", async () => {
    const holds = new UpdateHolds();
    const { last, make, relay } = await load({
      options: { firstRetryMs: 60_000, holds, taskTimeoutMs: 10 },
    });
    relay.upload.mockReturnValue(Promise.withResolvers<UploadResult>().promise);
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.upload).toBe("unreachable");
    expect(holds.held).toBe(false);
  });

  it("gives up on making a new code the same way", async () => {
    const holds = new UpdateHolds();
    const { last, make, relay } = await load({
      options: {
        firstRetryMs: 60_000,
        holds,
        renewCode: () => Promise.withResolvers<ShareResult>().promise,
        taskTimeoutMs: 10,
      },
    });
    relay.upload.mockResolvedValue({ kind: "retired" });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.upload).toBe("unreachable");
    expect(holds.held).toBe(false);
  });

  it("doesn't let an apply that hangs stop the next read", async () => {
    const { applyLocal, make, relay } = await load({ options: { taskTimeoutMs: 10 } });
    applyLocal.mockReturnValueOnce(Promise.withResolvers<LocalSaveResult>().promise);
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(1);
    await settle(30);
    await courier.take({ file: new File([saveBytes(200)], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(2);
  });
});

/** A first visit copies the code; the next one finds `blocked` under the progress key. */
async function visitBlocked(blocked: string) {
  const first = await load();
  const file = fakeHandle();
  await first.handles.save(file.handle);
  const courier = first.make();
  courier.start();
  await until(() => first.relay.upload.mock.calls.length === 1);
  await settle();
  courier.stop();
  expect(JSON.parse(first.storage.getItem(UPLOADS_KEY) ?? "{}")).toMatchObject({
    code: { key: KEY, token: TOKEN },
  });

  first.storage.setItem(PROGRESS_KEY, blocked);
  vi.resetModules();
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  expect(userState.syncLane).toBeUndefined();
  expect(userState.syncBlocked).toBe(true);
  const { createCourier } = await import("./courier.js");
  first.applyLocal.mockClear();
  first.relay.upload.mockClear();
  file.replace(saveBytes(200));
  const again = createCourier({
    applyLocal: first.applyLocal,
    handles: first.handles,
    holds: new UpdateHolds(),
    locks: () => undefined,
    relay: () => first.relay,
  });
  open.push(again);
  return { again, first };
}

describe("a store that loads blocked", () => {
  it.each([
    ["from a newer build", JSON.stringify({ local: {}, version: 999 })],
    ["unreadable", "{not json"],
  ])("still uploads when it's %s, & applies nothing", async (_name, blocked) => {
    const { again, first } = await visitBlocked(blocked);
    again.start();
    await until(() => first.relay.upload.mock.calls.length === 1);
    const sealed = first.relay.upload.mock.calls[0]?.[2];
    expect(sealed.counter).toBe(2);
    const { header } = await opened(sealed);
    expect(header.playtime).toBe(200);
    expect(first.applyLocal).not.toHaveBeenCalled();
    // Nothing a blocked page does forgets the handle or the code.
    expect(first.handles.current).toBeDefined();
    expect(JSON.parse(first.storage.getItem(UPLOADS_KEY) ?? "{}")).toHaveProperty("code");
  });

  it("removes its copy of the code when the lane ends", async () => {
    const { make, storage, userState } = await load();
    const courier = make();
    courier.start();
    await courier.check();
    expect(JSON.parse(storage.getItem(UPLOADS_KEY) ?? "{}")).toHaveProperty("code");
    await userState.stopSyncing({
      code: { key: KEY, token: TOKEN },
      retire: { mailboxId: await mailboxIdFor(KEY), token: TOKEN },
    });
    courier.update();
    expect(JSON.parse(storage.getItem(UPLOADS_KEY) ?? "{}")).not.toHaveProperty("code");
  });
});

describe("races", () => {
  it("still says a new code was made when storing it reaches `update` first", async () => {
    const { last, make, relay, userState } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "retired" });
    const opening: { courier?: Courier } = {};
    const renewCode = vi.fn(async () => {
      const code = { key: OTHER_KEY, token: TOKEN };
      await userState.setSharedCode(code, {
        code: { key: KEY, token: TOKEN },
        retire: { mailboxId: await mailboxIdFor(KEY), token: TOKEN },
      });
      opening.courier?.update();
      return { code, kind: "shared" as const };
    });
    const courier = make({ renewCode });
    opening.courier = courier;
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    await until(() => relay.upload.mock.calls.length === 2);
    expect(relay.upload.mock.calls[1]?.[0]).toBe(await mailboxIdFor(OTHER_KEY));
    expect(last()?.codeRenewed).toBe(true);
  });

  it("keeps the save file just dropped when a stored handle finishes loading after it", async () => {
    const stale = fakeHandle();
    const loading = Promise.withResolvers<SaveFileHandle | undefined>();
    const handles = memoryHandles();
    vi.spyOn(handles, "load").mockReturnValue(loading.promise);
    const { make, relay } = await load({ options: { handles } });
    const courier = make();
    courier.start();
    await settle(0);
    expect(handles.load).toHaveBeenCalledTimes(1);
    const fresh = fakeHandle(saveBytes(200));
    const taking = courier.take({ handle: fresh.handle, kind: "handle" });
    await settle(0);
    loading.resolve(stale.handle);
    await taking;
    await settle();
    expect(stale.spy.getFile).not.toHaveBeenCalled();
    expect(fresh.spy.getFile).toHaveBeenCalledWith();
    const sealed = relay.upload.mock.calls[0]?.[2];
    const { header } = await opened(sealed);
    expect(header.playtime).toBe(200);
  });

  it("leaves nothing stored when the lane ends while a handle is being saved", async () => {
    const saving = Promise.withResolvers<undefined>();
    const handles = memoryHandles();
    vi.spyOn(handles, "save").mockImplementation(async (handle) => {
      await saving.promise;
      handles.current = handle;
    });
    const { make, relay, userState } = await load({ code: false, options: { handles } });
    const courier = make();
    courier.start();
    await courier.check();
    const file = fakeHandle();
    const taking = courier.take({ handle: file.handle, kind: "handle" });
    await userState.stopSyncing();
    courier.update();
    saving.resolve(undefined);
    await taking;
    expect(handles.current).toBeUndefined();
    expect(file.spy.getFile).not.toHaveBeenCalled();
    expect(relay.upload).not.toHaveBeenCalled();
  });

  it("drops a save still retrying once the file goes back to what the mailbox holds", async () => {
    const { make, relay } = await load({ options: { firstRetryMs: 40 } });
    const bytes = saveBytes();
    const file = fakeHandle(bytes);
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    relay.upload.mockResolvedValueOnce({ kind: "rate-limited" });
    relay.read.mockResolvedValue({
      counter: 1,
      envelope: new Uint8Array(28),
      kind: "envelope",
      version: 1,
    });
    file.replace(saveBytes(200));
    await courier.check();
    expect(relay.upload).toHaveBeenCalledTimes(2);

    file.replace(bytes);
    await courier.check();
    await settle(80);
    // The newer save's retry never went, so the mailbox & the ledger stay with what's in the file.
    expect(relay.upload).toHaveBeenCalledTimes(2);
  });

  it("lets “Try again” read the file again after an envelope too large to send", async () => {
    const { last, make, relay } = await load();
    relay.upload.mockResolvedValueOnce({ kind: "too-large" });
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.upload).toBe("unreachable");
    courier.retry();
    await until(() => relay.upload.mock.calls.length === 2);
    await until(() => last()?.upload === "idle");
    expect(relay.upload).toHaveBeenCalledTimes(2);
  });

  it("still says a new code was made when that lands after its wait timed out", async () => {
    const { last, make, relay } = await load({
      options: { firstRetryMs: 60_000, taskTimeoutMs: 5 },
    });
    relay.upload.mockResolvedValueOnce({ kind: "retired" });
    const renewal = Promise.withResolvers<ShareResult>();
    const courier = make({ renewCode: () => renewal.promise });
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(last()?.codeRenewed).toBe(false);
    renewal.resolve({ code: { key: OTHER_KEY, token: TOKEN }, kind: "shared" });
    await until(() => last()?.codeRenewed === true);
    expect(last()?.codeRenewed).toBe(true);
  });

  it("clears “can't connect” when the file goes back & nothing is left to send", async () => {
    const { last, make, relay } = await load({ options: { firstRetryMs: 60_000 } });
    const bytes = saveBytes();
    const file = fakeHandle(bytes);
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    relay.upload.mockResolvedValueOnce({ kind: "paused" });
    file.replace(saveBytes(200));
    await courier.check();
    expect(last()?.upload).toBe("paused");

    relay.read.mockResolvedValue({
      counter: 1,
      envelope: new Uint8Array(28),
      kind: "envelope",
      version: 1,
    });
    file.replace(bytes);
    await courier.check();
    expect(last()?.upload).toBe("idle");
    expect(relay.upload).toHaveBeenCalledTimes(2);
  });

  it("sends the save again when an answer lost means the mailbox may hold a newer one", async () => {
    const { make, relay } = await load({ options: { firstRetryMs: 60_000 } });
    const bytes = saveBytes(100);
    const file = fakeHandle(bytes);
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.take({ handle: file.handle, kind: "handle" });

    relay.upload.mockResolvedValueOnce({ kind: "unreachable" });
    file.replace(saveBytes(200));
    await courier.check();
    file.replace(bytes);
    await courier.check();

    expect(relay.upload).toHaveBeenCalledTimes(3);
    const sealed = relay.upload.mock.calls[2]?.[2];
    expect(sealed.counter).toBe(3);
    const { header } = await opened(sealed);
    expect(header.playtime).toBe(100);
  });

  it("doesn't strand a take that a newer one overtook while waiting for the lead", async () => {
    const inner = fakeLocks();
    const gate = Promise.withResolvers<undefined>();
    const locks = {
      request: async (name: string, options: LockOptions, task: LockGrantedCallback<unknown>) => {
        if (options.steal) await gate.promise;
        return inner.request(name, options, task);
      },
    } as unknown as LockManager;
    const { make, relay } = await load({ options: { locks: () => locks, pollMs: 60_000 } });
    const first = make();
    first.start();
    await first.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });

    const second = make();
    second.start();
    await until(() => second.status.trouble === "other-window");
    relay.upload.mockClear();
    const older = second.take({ file: new File([saveBytes(200)], FILE_NAME), kind: "file" });
    const newer = second.take({ file: new File([saveBytes(300)], FILE_NAME), kind: "file" });
    await settle();
    gate.resolve(undefined);
    await Promise.all([older, newer]);

    const sealed = relay.upload.mock.lastCall?.[2];
    if (!sealed) throw new Error("Expected an upload");
    const { header } = await opened(sealed);
    expect(header.playtime).toBe(300);
    await until(() => first.status.trouble === "other-window");
  });

  it("drops an older take once a newer one has stored its handle", async () => {
    const { handles, make } = await load();
    const courier = make({ pollMs: 60_000 });
    courier.start();
    await courier.check();
    const older = fakeHandle(saveBytes(100));
    const newer = fakeHandle(saveBytes(200));
    await Promise.all([
      courier.take({ handle: older.handle, kind: "handle" }),
      courier.take({ handle: newer.handle, kind: "handle" }),
    ]);
    expect(handles.current).toBe(newer.handle);
    expect(older.spy.getFile).not.toHaveBeenCalled();
  });
});

describe("a store blocked while the page is open", () => {
  it("makes no new code it couldn't store", async () => {
    const renewCode = vi.fn(() => Promise.resolve<ShareResult>({ kind: "unreachable" }));
    const { make, relay, userState } = await load({
      options: { firstRetryMs: 60_000, renewCode },
    });
    relay.upload.mockResolvedValue({ kind: "retired" });
    vi.spyOn(userState, "syncBlocked", "get").mockReturnValue(true);
    const courier = make();
    courier.start();
    await courier.take({ file: new File([saveBytes()], FILE_NAME), kind: "file" });
    expect(relay.upload).toHaveBeenCalledTimes(1);
    expect(renewCode).not.toHaveBeenCalled();
  });

  it("applies the current save once the store can take it again", async () => {
    const { again, first } = await visitBlocked("{not json");
    again.start();
    await until(() => first.relay.upload.mock.calls.length === 1);
    expect(first.applyLocal).not.toHaveBeenCalled();

    const { userState } = await import("#lib/stores/user-state.svelte.js");
    vi.spyOn(userState, "syncBlocked", "get").mockReturnValue(false);
    vi.spyOn(userState, "syncLane", "get").mockReturnValue({
      code: { key: KEY, token: TOKEN },
      kind: "computer",
    });
    again.update();
    await until(() => first.applyLocal.mock.calls.length === 1);
    expect(first.applyLocal).toHaveBeenCalledTimes(1);
    expect(first.relay.upload).toHaveBeenCalledTimes(1);
  });
});
