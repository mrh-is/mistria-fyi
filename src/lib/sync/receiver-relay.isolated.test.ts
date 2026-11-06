import { expect, it, vi } from "vitest";

import { readProgressBlob, serializeStoredProgress } from "#lib/stores/progress-storage.js";
import { PROGRESS_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";

import {
  relayTestFetch,
  relayTestModules,
  relayTestRuntime,
  TEST_ORIGIN,
} from "../../../relay/test-runtime.js";
import {
  createRelayClient,
  deriveFollowKeys,
  generateFollowKey,
  generateWriteToken,
  subscribeToMailbox,
} from "./follow.js";

it("retries a refused follower socket, rereads the mailbox, & receives a relay push", async () => {
  const storage = memoryStorage();
  // The store checks for a browser when imported. Keep Node's real socket & lock APIs.
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", storage);
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  const { createReceiver } = await import("./receiver.js");
  const mf = relayTestRuntime(await relayTestModules());
  const ip = "192.0.2.1";
  const headers = { "CF-Connecting-IP": ip };
  const relay = createRelayClient(TEST_ORIGIN, relayTestFetch(mf, ip));
  const key = generateFollowKey();
  const token = generateWriteToken();
  const { mailboxId } = await deriveFollowKeys(key);
  const read = vi.fn(relay.read);
  const opened = vi.fn();
  const refused = vi.fn();
  // Node's WebSocket accepts extra handshake headers, standing in for the Cloudflare edge.
  const Socket = class extends WebSocket {
    constructor(url: string | URL) {
      super(url, { headers } as unknown as string[]);
      this.addEventListener("open", opened);
      this.addEventListener("error", refused);
    }
  };
  const receiver = createReceiver({
    channel: () => undefined,
    read,
    subscribe: (id, subscriber) => subscribeToMailbox(id, subscriber, origin, Socket),
  });
  const occupied = new Set<
    NonNullable<Awaited<ReturnType<typeof mf.dispatchFetch>>["webSocket"]>
  >();
  let origin: string;
  try {
    const url = await mf.ready;
    origin = url.origin;
    expect(await relay.create(mailboxId, token, "valid")).toEqual({ kind: "created" });
    const upgrade = () =>
      mf.dispatchFetch(`${TEST_ORIGIN}/v1/mailboxes/${mailboxId}`, {
        headers: { ...headers, Upgrade: "websocket" },
      });
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        const response = await upgrade();
        expect(response.status).toBe(101);
        const socket = response.webSocket;
        if (!socket) throw new Error("Missing follower socket");
        socket.accept();
        occupied.add(socket);
      }),
    );
    const full = await upgrade();
    expect(full.status).toBe(429);
    await full.text();

    userState.loadFromStorage();
    const baseline = readProgressBlob(userState.exportBackup(), "strict");
    if (baseline.kind !== "ok") {
      throw new Error(`Could not read default progress: ${baseline.kind}`);
    }
    storage.setItem(
      PROGRESS_STORAGE_KEY,
      serializeStoredProgress(baseline.loaded, {
        syncLane: { key, kind: "following" },
        trackingLane: "sync",
      }),
    );
    userState.loadFromStorage();
    expect(userState.syncLane).toEqual({ key, kind: "following" });
    expect(userState.syncBlocked).toBe(false);
    receiver.start();
    await vi.waitFor(
      () => {
        expect(receiver.status).toEqual({ kind: "waiting" });
        expect(refused).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
    expect(read).toHaveBeenCalledExactlyOnceWith(mailboxId);

    const [slot] = occupied;
    slot.close(1000, "free a slot");
    occupied.delete(slot);
    // No refresh or manual reconnect. The receiver's own five-second retry must do both.
    await vi.waitFor(
      () => {
        expect(opened).toHaveBeenCalledTimes(1);
        expect(read).toHaveBeenCalledTimes(2);
        expect(read).toHaveNthResolvedWith(2, { kind: "empty" });
      },
      { timeout: 8000 },
    );
    expect(await relay.retire(mailboxId, token)).toEqual({ kind: "retired" });
    await vi.waitFor(() => {
      expect(receiver.status).toEqual({ kind: "retired" });
    });
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    receiver.stop();
    for (const socket of occupied) socket.close();
    await mf.dispose();
  }
});
