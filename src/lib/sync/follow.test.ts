import { describe, expect, it, vi } from "vitest";

import {
  buildFollowLink,
  createRelayClient,
  decodeSavePayload,
  deriveFollowKeys,
  deriveFollowSecrets,
  encodeSavePayload,
  envelopeAdditionalData,
  EnvelopeError,
  FOLLOW_PROTOCOL_VERSION,
  generateFollowKey,
  generateWriteToken,
  isFollowKey,
  mailboxIdFor,
  openEnvelope,
  openFollowKey,
  parseFollowLink,
  pendingRetireFor,
  retirePending,
  sealEnvelope,
  shareNewCode,
  toBase64url,
} from "./follow.js";

import type { FollowKey, ReadResult, RelayClient } from "./follow.js";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fromHex = (text: string) => Uint8Array.from(Buffer.from(text, "hex"));

// Vectors computed independently with Node's `crypto.hkdfSync` & `aes-256-gcm`.
const KEY_0_TO_31 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8" as FollowKey;
const KEY_ALL_FF = "__________________________________________8" as FollowKey;

function dequeue<T>(queue: T[]): T {
  const value = queue.shift();
  if (value === undefined) throw new Error("Queue is empty");
  return value;
}

function relayStub(overrides: Partial<RelayClient> = {}): RelayClient {
  return {
    create: vi.fn(() => Promise.resolve({ kind: "created" as const })),
    read: vi.fn(() => Promise.resolve({ kind: "empty" as const })),
    retire: vi.fn(() => Promise.resolve({ kind: "retired" as const })),
    ...overrides,
  };
}

async function sealedRead(
  key: FollowKey,
  counter: number,
  save: Uint8Array<ArrayBuffer>,
): Promise<ReadResult> {
  const keys = await deriveFollowKeys(key);
  const plaintext = encodeSavePayload({
    header: { fileName: "game-1-autosave.sav", modified: 1_700_000_000_000, playtime: 3600 },
    save,
  });
  const envelope = await sealEnvelope(keys, { counter, version: 1 }, plaintext);
  return { counter, envelope, kind: "envelope", version: 1 };
}

describe("key derivation", () => {
  it("matches fixed HKDF-SHA-256 vectors", async () => {
    const first = await deriveFollowSecrets(KEY_0_TO_31);
    expect(toBase64url(first.mailboxId)).toBe("Um4iPaITziwZ-9gBeM0c6g");
    expect(hex(first.sealKey)).toBe(
      "56b4d77765eca7fb89211ed414b1bfe239307632a25352d001c4341d3e6eb785",
    );
    const second = await deriveFollowSecrets(KEY_ALL_FF);
    expect(toBase64url(second.mailboxId)).toBe("DVZHXiPWtICljJjUx7LEuA");
    expect(hex(second.sealKey)).toBe(
      "5000208291493289510367f5bc87892dd5ba7d1adc74f8d0ffdac7284bc549fe",
    );
  });

  it("gives the relay's 22-character mailbox ID", async () => {
    expect(await mailboxIdFor(KEY_0_TO_31)).toBe("Um4iPaITziwZ-9gBeM0c6g");
  });

  it("makes 43-character keys & write tokens from 32 random bytes", () => {
    const key = generateFollowKey();
    expect(key).toMatch(/^[\w-]{43}$/);
    expect(isFollowKey(key)).toBe(true);
    expect(generateWriteToken()).toMatch(/^[\w-]{43}$/);
    expect(generateFollowKey()).not.toBe(key);
  });
});

describe("the envelope", () => {
  it("authenticates the version, mailbox ID, & counter in a fixed layout", async () => {
    const keys = await deriveFollowKeys(KEY_0_TO_31);
    expect(hex(envelopeAdditionalData(keys.mailboxIdBytes, { counter: 7, version: 1 }))).toBe(
      "0001526e223da213ce2c19fbd80178cd1cea0000000000000007",
    );
  });

  it("opens a fixed AES-GCM vector", async () => {
    const keys = await deriveFollowKeys(KEY_0_TO_31);
    const envelope = fromHex("000102030405060708090a0bc073b71a2e69c5accdd7d4ef49f29c3bd422f3d58c");
    const plaintext = await openEnvelope(keys, { counter: 7, version: 1 }, envelope);
    expect(new TextDecoder().decode(plaintext)).toBe("hello");
  });

  it("round-trips with a fresh 96-bit nonce each time", async () => {
    const keys = await deriveFollowKeys(KEY_0_TO_31);
    const plaintext = new TextEncoder().encode("save bytes");
    const a = await sealEnvelope(keys, { counter: 1, version: 1 }, plaintext);
    const b = await sealEnvelope(keys, { counter: 1, version: 1 }, plaintext);
    expect(hex(a.subarray(0, 12))).not.toBe(hex(b.subarray(0, 12)));
    expect(await openEnvelope(keys, { counter: 1, version: 1 }, a)).toEqual(plaintext);
  });

  it("rejects a tampered envelope", async () => {
    const keys = await deriveFollowKeys(KEY_0_TO_31);
    const envelope = await sealEnvelope(keys, { counter: 1, version: 1 }, new Uint8Array([1, 2]));
    envelope[envelope.length - 1] ^= 1;
    await expect(openEnvelope(keys, { counter: 1, version: 1 }, envelope)).rejects.toThrow(
      EnvelopeError,
    );
  });

  it("rejects an envelope replayed under another mailbox ID, counter, or version", async () => {
    const keys = await deriveFollowKeys(KEY_0_TO_31);
    const envelope = await sealEnvelope(keys, { counter: 4, version: 1 }, new Uint8Array([1]));
    const other = await deriveFollowKeys(KEY_ALL_FF);
    // Same sealing key, another mailbox: only the additional data differs.
    const replayed = { ...keys, mailboxIdBytes: other.mailboxIdBytes };
    await expect(openEnvelope(replayed, { counter: 4, version: 1 }, envelope)).rejects.toThrow(
      EnvelopeError,
    );
    await expect(openEnvelope(keys, { counter: 5, version: 1 }, envelope)).rejects.toThrow(
      EnvelopeError,
    );
    await expect(openEnvelope(keys, { counter: 4, version: 2 }, envelope)).rejects.toThrow(
      EnvelopeError,
    );
  });

  it("carries the file name, modification time, & playtime inside the plaintext", () => {
    const payload = {
      header: { fileName: "game-1-autosave.sav", modified: 5, playtime: 12.5 },
      save: new Uint8Array([9, 8, 7]),
    };
    expect(decodeSavePayload(encodeSavePayload(payload))).toEqual(payload);
    expect(() => decodeSavePayload(new Uint8Array([0, 0, 0, 9, 1]))).toThrow(EnvelopeError);
  });
});

describe("the follow link", () => {
  it("is the sync page with the key in the fragment", () => {
    expect(buildFollowLink(KEY_0_TO_31)).toBe(`https://mistria.fyi/sync#${KEY_0_TO_31}`);
    expect(buildFollowLink(KEY_0_TO_31, "https://preview.example")).toBe(
      `https://preview.example/sync#${KEY_0_TO_31}`,
    );
  });

  it.each([
    `https://mistria.fyi/sync#${KEY_0_TO_31}`,
    `mistria.fyi/sync#${KEY_0_TO_31}`,
    `  https://mistria.fyi/ja/sync#${KEY_0_TO_31}  `,
    `https://preview.example/sync/#${KEY_0_TO_31}`,
  ])("reads the key from %s", (link) => {
    expect(parseFollowLink(link)).toBe(KEY_0_TO_31);
  });

  it.each([
    "",
    "mistria.fyi/sync#k3Xq9",
    `https://mistria.fyi/data#${KEY_0_TO_31}`,
    `https://mistria.fyi/sync?x=1#${KEY_0_TO_31}`,
    `ftp://mistria.fyi/sync#${KEY_0_TO_31}`,
    // Not canonical: the last character's spare bits are set.
    "https://mistria.fyi/sync#__________________________________________9",
  ])("rejects %j", (link) => {
    expect(parseFollowLink(link)).toBeUndefined();
  });
});

describe("the relay client", () => {
  it("maps the wire contract's answers", async () => {
    const responses: Response[] = [
      Response.json({ state: "live" }, { status: 201 }),
      new Response(null, { status: 409 }),
      Response.json({ state: "paused", until: 99 }, { status: 503 }),
      new Response(null, { headers: { "Retry-After": "30" }, status: 429 }),
    ];
    const fetcher = vi.fn(() => Promise.resolve(dequeue(responses)));
    const relay = createRelayClient("https://relay.test", fetcher);
    expect(await relay.create("id", "token", "challenge")).toEqual({ kind: "created" });
    expect(await relay.create("id", "token", "challenge")).toEqual({ kind: "conflict" });
    expect(await relay.create("id", "token", "challenge")).toEqual({ kind: "paused", until: 99 });
    expect(await relay.create("id", "token", "challenge")).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 30,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://relay.test/v1/mailboxes/id",
      expect.objectContaining({
        body: JSON.stringify({ turnstile: "challenge" }),
        headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
        method: "POST",
      }),
    );
  });

  it("reads an envelope, an empty mailbox, & a retired one", async () => {
    const responses: Response[] = [
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Sync-Counter": "4",
          "X-Sync-Version": "1",
        },
      }),
      Response.json({ state: "empty" }),
      Response.json({ state: "retired" }, { status: 410 }),
    ];
    const relay = createRelayClient("https://relay.test", () =>
      Promise.resolve(dequeue(responses)),
    );
    expect(await relay.read("id")).toEqual({
      counter: 4,
      envelope: new Uint8Array([1, 2, 3]),
      kind: "envelope",
      version: 1,
    });
    expect(await relay.read("id")).toEqual({ kind: "empty" });
    expect(await relay.read("id")).toEqual({ kind: "retired" });
  });

  it("counts a 410 as a confirmed retire & a network failure as unreachable", async () => {
    const responses: (Error | Response)[] = [new Response(null, { status: 410 }), new Error("x")];
    const relay = createRelayClient("https://relay.test", () => {
      const next = dequeue(responses);
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    });
    expect(await relay.retire("id", "token")).toEqual({ kind: "retired" });
    expect(await relay.retire("id", "token")).toEqual({ kind: "unreachable" });
  });
});

describe("sharing a code", () => {
  it("creates the mailbox before the code exists", async () => {
    const create = vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "created" });
    const relay = relayStub({ create });
    const result = await shareNewCode(relay, () => Promise.resolve("challenge"));
    expect(result.kind).toBe("shared");
    if (result.kind !== "shared") return;
    expect(create).toHaveBeenCalledWith(
      await mailboxIdFor(result.code.key),
      result.code.token,
      "challenge",
    );
  });

  it("makes a fresh key when the mailbox ID belongs to someone else", async () => {
    const create = vi
      .fn<RelayClient["create"]>()
      .mockResolvedValueOnce({ kind: "conflict" })
      .mockResolvedValueOnce({ kind: "created" });
    const result = await shareNewCode(relayStub({ create }), () => Promise.resolve("c"));
    expect(result.kind).toBe("shared");
    const [first, second] = create.mock.calls.map(([mailboxId]) => mailboxId);
    expect(first).not.toBe(second);
  });

  it("returns no code during the kill switch", async () => {
    const create = vi.fn<RelayClient["create"]>().mockResolvedValue({ kind: "paused", until: 5 });
    expect(await shareNewCode(relayStub({ create }), () => Promise.resolve("c"))).toEqual({
      kind: "paused",
      until: 5,
    });
  });

  it("returns no code when Turnstile fails", async () => {
    const create = vi.fn<RelayClient["create"]>();
    expect(
      await shareNewCode(relayStub({ create }), () => Promise.reject(new Error("no"))),
    ).toEqual({ kind: "unreachable" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("opening a code", () => {
  it("decrypts the latest save", async () => {
    const read = await sealedRead(KEY_0_TO_31, 3, new Uint8Array([4, 5]));
    const result = await openFollowKey(
      relayStub({ read: () => Promise.resolve(read) }),
      KEY_0_TO_31,
    );
    expect(result).toMatchObject({
      counter: 3,
      kind: "save",
      mailboxId: "Um4iPaITziwZ-9gBeM0c6g",
      payload: { header: { fileName: "game-1-autosave.sav" }, save: new Uint8Array([4, 5]) },
    });
  });

  it("treats an envelope from another mailbox as invalid", async () => {
    const read = await sealedRead(KEY_ALL_FF, 3, new Uint8Array([4, 5]));
    const result = await openFollowKey(
      relayStub({ read: () => Promise.resolve(read) }),
      KEY_0_TO_31,
    );
    expect(result).toEqual({ kind: "invalid" });
  });

  it("passes through empty, retired, & unknown mailboxes", async () => {
    const answers: ReadResult[] = [{ kind: "empty" }, { kind: "retired" }, { kind: "absent" }];
    const relay = relayStub({ read: () => Promise.resolve(dequeue(answers)) });
    expect(await openFollowKey(relay, KEY_0_TO_31)).toEqual({ kind: "empty" });
    expect(await openFollowKey(relay, KEY_0_TO_31)).toEqual({ kind: "retired" });
    expect(await openFollowKey(relay, KEY_0_TO_31)).toEqual({ kind: "invalid" });
  });

  it("refuses another protocol version without decrypting", async () => {
    const read = { ...(await sealedRead(KEY_0_TO_31, 1, new Uint8Array())), version: 2 };
    expect(
      await openFollowKey(relayStub({ read: () => Promise.resolve(read) }), KEY_0_TO_31),
    ).toEqual({ kind: "unsupported-version", version: 2 });
    expect(FOLLOW_PROTOCOL_VERSION).toBe(1);
  });
});

describe("retiring", () => {
  it("keeps a retire the relay hasn't confirmed", async () => {
    const first = await pendingRetireFor({ key: KEY_0_TO_31, token: "a" });
    const second = await pendingRetireFor({ key: KEY_ALL_FF, token: "b" });
    const retire = vi
      .fn<RelayClient["retire"]>()
      .mockResolvedValueOnce({ kind: "unreachable" })
      .mockResolvedValueOnce({ kind: "retired" });
    expect(await retirePending(relayStub({ retire }), [first, second])).toEqual([second]);
    expect(first).toEqual({ mailboxId: "Um4iPaITziwZ-9gBeM0c6g", token: "a" });
  });
});
