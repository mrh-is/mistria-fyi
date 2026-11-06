import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRelayClient,
  deriveFollowKeys,
  encodeSavePayload,
  FOLLOW_PROTOCOL_VERSION,
  generateFollowKey,
  generateWriteToken,
  openFollowKey,
  sealEnvelope,
  shareNewCode,
} from "#lib/sync/follow.js";

import {
  relayTestFetch,
  relayTestModules,
  relayTestRuntime,
  TEST_ADMIN,
  TEST_ORIGIN,
} from "./test-runtime.js";

import type { Miniflare } from "miniflare";

let mailboxId: string;
const TOKEN = "a".repeat(43);
const OTHER_TOKEN = "b".repeat(43);
const ADMIN = TEST_ADMIN;
const DAY = 86_400_000;
const HOUR = 3_600_000;
let modules: Awaited<ReturnType<typeof relayTestModules>>;
const runtimes: Miniflare[] = [];
const directories: string[] = [];
let verifications: number;
let shared: Miniflare | undefined;
let caseIndex: number;

// Only the local test module has this storage/clock control. Public routing never exposes it.
// It shares the Worker's isolate & module scope, so it can reset or age the cached pause check.
const testSubclass = `
let mailboxRequests = 0;
let gateRequests = 0;
let throwNext;
let nextReadDelay;
export class TestMailbox extends Mailbox {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/__test") {
      const action = await request.json();
      if (action.throwNext) throwNext = action.throwNext;
      if (action.nextReadDelay) nextReadDelay = action.nextReadDelay;
      if (action.age) {
        const meta = await this.ctx.storage.get("meta");
        meta.lastUpload = Date.now() - action.age;
        meta.createdAt = meta.lastUpload;
        await this.ctx.storage.put("meta", meta);
      }
      if (action.patch) {
        const meta = await this.ctx.storage.get("meta");
        await this.ctx.storage.put("meta", { ...meta, ...action.patch });
      }
      if (action.ageSockets) {
        for (const socket of this.ctx.getWebSockets()) {
          const attachment = socket.deserializeAttachment();
          socket.serializeAttachment({ openedAt: attachment.openedAt - action.ageSockets });
        }
      }
      if (action.alarm) await this.alarm();
      if (action.alarmAt) return Response.json({ alarm: await this.ctx.storage.getAlarm() });
      if (action.sockets) {
        // Count open sockets only: Miniflare takes seconds to finish a close handshake.
        const open = this.ctx.getWebSockets().filter((socket) => socket.readyState === 1);
        return Response.json({ sockets: open.length });
      }
      return Response.json(Object.fromEntries(await this.ctx.storage.list()));
    }
    mailboxRequests++;
    if (url.pathname === "/read" && nextReadDelay) {
      const delay = nextReadDelay;
      nextReadDelay = undefined;
      await scheduler.wait(delay);
    }
    if (throwNext) {
      const message = throwNext;
      throwNext = undefined;
      throw new TypeError(message);
    }
    return super.fetch(request);
  }
}
export class TestControl extends RelayControl {
  async fetch(request) {
    if (new URL(request.url).pathname === "/__test") {
      const action = await request.json();
      if (action.reset) {
        await this.ctx.storage.deleteAll();
        mailboxRequests = 0;
        gateRequests = 0;
        pauseCheck = undefined;
        throwNext = undefined;
        nextReadDelay = undefined;
        pendingFailures.clear();
        lastFailureFlush = 0;
      }
      if (action.pausedUntil) await this.ctx.storage.put("pausedUntil", action.pausedUntil);
      if (action.pauseCheckAge && pauseCheck) pauseCheck.checkedAt = Date.now() - action.pauseCheckAge;
      if (action.requests) return Response.json({ mailboxRequests, gateRequests });
      if (action.usage) await this.ctx.storage.put("usage", action.usage);
      if (action.failures) await this.ctx.storage.put("failures", action.failures);
      if (action.expireFailureFlush) lastFailureFlush = 0;
      if (action.alarmAt) return Response.json({ alarm: await this.ctx.storage.getAlarm() });
      if (action.alarm) await this.alarm();
      return Response.json(Object.fromEntries(await this.ctx.storage.list()));
    }
    if (new URL(request.url).pathname === "/gate") gateRequests++;
    return super.fetch(request);
  }
}
`;

beforeAll(async () => {
  verifications = 0;
  caseIndex = 0;
  modules = await relayTestModules(testSubclass);
  shared = runtime();
});

beforeEach(async () => {
  caseIndex++;
  mailboxId = Buffer.alloc(16, caseIndex).toString("base64url");
  await inspectControl(runtime(), { reset: true });
});

afterAll(async () => {
  await Promise.all(runtimes.splice(0).map((instance) => instance.dispose()));
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function runtime(persist?: string): Miniflare {
  if (!persist && shared) return shared;
  const mf = relayTestRuntime(modules, {
    durableObjects: {
      CONTROL: { className: "TestControl", useSQLite: true },
      MAILBOXES: { className: "TestMailbox", useSQLite: true },
    },
    outboundService: async (verification) => {
      expect(verification.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      const form = new URLSearchParams(await verification.text());
      expect(form.get("secret")).toBe("placeholder-turnstile-secret");
      expect(form.has("remoteip")).toBe(false);
      verifications++;
      const token = form.get("response");
      if (token === "unavailable") return new Response(null, { status: 503 });
      if (token === "invalid-input-secret" || token === "missing-input-secret") {
        return Response.json({ "error-codes": [token], success: false });
      }
      return Response.json({
        action: token === "wrong-action" ? "feedback" : "sync-create",
        hostname: token === "wrong-host" ? "attacker.test" : "mistria.fyi",
        success: token !== "invalid",
      });
    },
    resourcePersistencePath: persist,
  });
  runtimes.push(mf);
  return mf;
}

async function status(pending: Promise<{ status: number }>): Promise<number> {
  const response = await pending;
  return response.status;
}

function request(mf: Miniflare, method: string, route: string, token?: string, body?: string) {
  return mf.dispatchFetch(`https://relay.mistria.fyi/v1/${route}`, {
    body,
    headers: {
      "CF-Connecting-IP": `192.0.2.${caseIndex}`,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method,
  });
}

function create(
  mf: Miniflare,
  id = mailboxId,
  token = TOKEN,
  turnstile = "valid",
  ip = `192.0.2.${caseIndex}`,
) {
  return mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${id}`, {
    body: JSON.stringify({ turnstile }),
    headers: { Authorization: `Bearer ${token}`, "CF-Connecting-IP": ip },
    method: "POST",
  });
}

function upload(mf: Miniflare, counter = 1, token = TOKEN, body = new Uint8Array(32).fill(7)) {
  return mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${mailboxId}/envelope`, {
    body,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/octet-stream",
      "X-Sync-Counter": String(counter),
      "X-Sync-Version": "1",
    },
    method: "PUT",
  });
}

async function inspect(mf: Miniflare, action: Record<string, unknown> = {}) {
  const namespace = await mf.getDurableObjectNamespace("MAILBOXES");
  const response = await namespace
    .get(namespace.idFromName(mailboxId))
    .fetch("https://internal/__test", {
      body: JSON.stringify(action),
      method: "POST",
    });
  return response.json() as Promise<Record<string, unknown>>;
}

/** Opens a follower socket the way a browser would, accepted so its messages & close arrive. */
async function follow(mf: Miniflare) {
  const response = await mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${mailboxId}`, {
    headers: { "CF-Connecting-IP": `192.0.2.${caseIndex}`, Upgrade: "websocket" },
  });
  response.webSocket?.accept();
  return response;
}

type FollowerSocket = NonNullable<Awaited<ReturnType<Miniflare["dispatchFetch"]>>["webSocket"]>;

/** Waits for the Worker's after-response failure counts to reach `total`. */
async function failures(mf: Miniflare, total: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- Recording runs after the response, so poll.
    const state = (await inspectControl(mf)) as {
      failures?: Record<string, Record<string, number>>;
    };
    const counts = state.failures ?? {};
    const sum = Object.values(counts)
      .flatMap((day) => Object.values(day))
      .reduce((left, right) => left + right, 0);
    if (sum >= total) return counts;
    // oxlint-disable-next-line no-await-in-loop -- See above.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error(`Fewer than ${total} failures recorded`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function controlStub(mf: Miniflare) {
  const namespace = await mf.getDurableObjectNamespace("CONTROL");
  return namespace.get(namespace.idFromName("relay-control-v1"));
}

async function inspectControl(mf: Miniflare, action: Record<string, unknown> = {}) {
  const stub = await controlStub(mf);
  const response = await stub.fetch("https://internal/__test", {
    body: JSON.stringify(action),
    method: "POST",
  });
  return response.json() as Promise<Record<string, unknown>>;
}

describe("sync relay in the local Workers runtime", () => {
  it("rejects writes without the token and never lets another token claim an existing ID", async () => {
    const mf = runtime();
    expect(await status(upload(mf, 1, ""))).toBe(401);
    expect(await status(create(mf))).toBe(201);
    const scheduled = await inspect(mf, { alarmAt: true });
    expect(scheduled.alarm).toBeTypeOf("number");
    expect(await status(create(mf, mailboxId, OTHER_TOKEN))).toBe(409);
    expect(await status(upload(mf, 1, OTHER_TOKEN))).toBe(403);
    const calls = verifications;
    expect(await status(create(mf))).toBe(200);
    expect(verifications).toBe(calls);
  });

  it("requires successful Siteverify with the expected hostname & action", async () => {
    const mf = runtime();
    expect(await status(create(mf, mailboxId, TOKEN, "invalid"))).toBe(403);
    expect(await status(create(mf, mailboxId, TOKEN, "wrong-host"))).toBe(403);
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(404);
    expect(await inspect(mf)).toEqual({});
  });

  it("fails closed when Siteverify is unavailable or its action differs", async () => {
    const mf = runtime();
    expect(await status(create(mf, mailboxId, TOKEN, "wrong-action"))).toBe(403);
    expect(await status(create(mf, mailboxId, TOKEN, "unavailable"))).toBe(503);
    expect(await inspect(mf)).toEqual({});
    expect(await failures(mf, 1)).toEqual({ [today()]: { "siteverify-unreachable": 1 } });
    expect(await inspectControl(mf)).not.toHaveProperty("usage");
  });

  it("distinguishes absent, empty, and permanently retired mailboxes", async () => {
    const mf = runtime();
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(404);
    expect(await status(create(mf))).toBe(201);
    const before = await inspect(mf);
    const empty = await request(mf, "GET", `mailboxes/${mailboxId}`);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ state: "empty" });
    expect(await inspect(mf)).toEqual(before);
    expect(await status(request(mf, "DELETE", `mailboxes/${mailboxId}`, TOKEN))).toBe(200);
    expect(await status(create(mf))).toBe(410);
    expect(await status(create(mf, mailboxId, OTHER_TOKEN))).toBe(410);
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(410);
    const tombstone = await inspect(mf);
    expect(tombstone).toEqual({ meta: { retired: true } });
    expect(await inspect(mf, { alarmAt: true })).toEqual({ alarm: null });
    expect(await inspect(mf, { alarm: true })).toEqual(tombstone);
  });

  it("keeps the counter high-water mark and makes only identical retries idempotent", async () => {
    const mf = runtime();
    await create(mf);
    expect(await status(upload(mf, 10))).toBe(200);
    const saved = await inspect(mf);
    expect(await status(upload(mf, 10))).toBe(200);
    expect(await inspect(mf)).toEqual(saved);
    expect(await status(upload(mf, 9))).toBe(409);
    expect(await status(upload(mf, 10, TOKEN, new Uint8Array(32).fill(8)))).toBe(409);
    expect(await status(upload(mf, 11))).toBe(429);
    const read = await request(mf, "GET", `mailboxes/${mailboxId}`);
    expect(read.headers.get("X-Sync-Counter")).toBe("10");
    expect(read.headers.get("X-Sync-Version")).toBe("1");
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(new Uint8Array(32).fill(7));
    expect(read.headers.get("ETag")).toMatch(/^"10-[\da-f]{64}"$/u);
    const cached = await mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${mailboxId}`, {
      headers: {
        "CF-Connecting-IP": `192.0.2.${caseIndex}`,
        "If-None-Match": read.headers.get("ETag") ?? "",
      },
    });
    expect(cached.status).toBe(304);
    expect(await inspect(mf)).toEqual(saved);
  });

  it("pauses new reads, handshakes, creates, & uploads while preserving retirement, then lifts automatically", async () => {
    const mf = runtime();
    await create(mf);
    await upload(mf);
    expect(await status(request(mf, "PUT", "admin/pause", "wrong", "{}"))).toBe(403);
    const paused = await request(mf, "PUT", "admin/pause", ADMIN, "{}");
    expect(paused.status).toBe(200);
    expect(await status(upload(mf, 2))).toBe(503);
    expect(await status(create(mf, "BBBBBBBBBBBBBBBBBBBBBB"))).toBe(503);
    const read = await request(mf, "GET", `mailboxes/${mailboxId}`);
    expect(read.status).toBe(503);
    expect(read.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/u);
    expect(await read.json()).toMatchObject({ state: "paused" });
    expect(
      await status(
        mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${mailboxId}`, {
          headers: { "CF-Connecting-IP": `192.0.2.${caseIndex}`, Upgrade: "websocket" },
        }),
      ),
    ).toBe(503);
    expect(await status(request(mf, "DELETE", `mailboxes/${mailboxId}`, TOKEN))).toBe(200);
    expect(await status(create(mf))).toBe(503);
    expect(
      await status(
        request(mf, "PUT", "admin/pause", ADMIN, JSON.stringify({ until: Date.now() - 1 })),
      ),
    ).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", "198.51.100.1"))).toBe(410);
  });

  it("lets each Worker isolate trust its last pause check for 30 seconds", async () => {
    const mf = runtime();
    await create(mf);
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(200);
    // Another isolate's admin request pauses the relay without touching this isolate's cache.
    await inspectControl(mf, { pausedUntil: Date.now() + DAY });
    expect(await status(upload(mf))).toBe(200);
    await inspectControl(mf, { pauseCheckAge: 29_000 });
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(200);
    await inspectControl(mf, { pauseCheckAge: 30_000 });
    const read = await request(mf, "GET", `mailboxes/${mailboxId}`);
    expect(read.status).toBe(503);
    expect(await read.json()).toMatchObject({ state: "paused" });
    expect(await status(upload(mf, 2))).toBe(503);
    // Lifting the pause elsewhere reaches this isolate within the same interval.
    await inspectControl(mf, { pausedUntil: Date.now() - 1 });
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(503);
    await inspectControl(mf, { pauseCheckAge: 30_000 });
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(200);
    expect(await inspectControl(mf, { requests: true })).toMatchObject({ gateRequests: 3 });
  });

  it("deletes expired envelopes, preserves ordering, and tombstones year-old mailboxes", async () => {
    const mf = runtime();
    await create(mf);
    await upload(mf, 20);
    const uploaded = (await inspect(mf)) as { meta: { lastUpload: number } };
    expect(await inspect(mf, { alarmAt: true })).toEqual({
      alarm: uploaded.meta.lastUpload + 30 * DAY,
    });
    await inspect(mf, { age: 31 * DAY });
    const before = await inspect(mf);
    const empty = await request(mf, "GET", `mailboxes/${mailboxId}`);
    expect(await empty.json()).toEqual({ state: "empty" });
    expect(await inspect(mf)).toEqual(before);
    const expired = await inspect(mf, { alarm: true });
    expect(expired).not.toHaveProperty("envelope");
    const aged = expired as { meta: { lastUpload: number } };
    expect(await inspect(mf, { alarmAt: true })).toEqual({
      alarm: aged.meta.lastUpload + 365 * DAY,
    });
    expect(await status(upload(mf, 20))).toBe(200);
    expect(await inspect(mf)).toEqual(expired);
    expect(await status(upload(mf, 19))).toBe(409);
    expect(await status(upload(mf, 21))).toBe(200);
    await inspect(mf, { age: 366 * DAY });
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(410);
    expect(await inspect(mf, { alarm: true })).toEqual({ meta: { retired: true } });
    expect(await status(upload(mf, 22))).toBe(410);
    expect(await status(create(mf))).toBe(410);
  });

  it("limits envelopes even without Content-Length and rejects malformed protocol metadata", async () => {
    const mf = runtime();
    await create(mf);
    expect(await status(upload(mf, 1, TOKEN, new Uint8Array(256 * 1024 + 1)))).toBe(413);
    expect(await status(upload(mf, -1))).toBe(400);
    expect(await status(upload(mf, Number.MAX_SAFE_INTEGER + 1))).toBe(400);
    expect(await status(upload(mf, 1, TOKEN, new Uint8Array(256 * 1024)))).toBe(200);
  });

  it("tombstones a never-uploaded mailbox a year after creation", async () => {
    const mf = runtime();
    await create(mf);
    await inspect(mf, { patch: { createdAt: Date.now() - 366 * DAY } });
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(410);
    expect(await inspect(mf, { alarm: true })).toEqual({ meta: { retired: true } });
    expect(await status(create(mf))).toBe(410);
  });

  it("enforces the minute & daily upload caps without charging retries or unauthorized writes", async () => {
    const mf = runtime();
    await create(mf);
    await upload(mf);
    const saved = await inspect(mf);
    const minuteLimited = await upload(mf, 2);
    expect(minuteLimited.status).toBe(429);
    expect(Number(minuteLimited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(minuteLimited.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
    // A new counter must be rejected before digesting or validating the buffered envelope.
    expect(await status(upload(mf, 2, TOKEN, new Uint8Array(0)))).toBe(429);
    expect(await status(upload(mf, 2, OTHER_TOKEN))).toBe(403);
    expect(await inspect(mf)).toEqual(saved);
    await inspect(mf, { patch: { lastUpload: Date.now() - 61_000, uploadCount: 59 } });
    expect(await status(upload(mf, 2))).toBe(200);
    await inspect(mf, { patch: { lastUpload: Date.now() - 61_000 } });
    const dailyLimited = await upload(mf, 3);
    expect(dailyLimited.status).toBe(429);
    expect(Number(dailyLimited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(dailyLimited.headers.get("Retry-After"))).toBeLessThanOrEqual(86_400);
    expect(await status(upload(mf, 2))).toBe(200);
    await inspect(mf, { patch: { uploadDay: Math.floor(Date.now() / DAY) - 1 } });
    expect(await status(upload(mf, 3))).toBe(200);
  });

  it("enforces CREATE_RATE independently of singleton admission, including same-owner retries", async () => {
    const mf = runtime();
    expect(await status(create(mf))).toBe(201);
    expect(await status(create(mf))).toBe(200);
    expect(await status(create(mf))).toBe(200);
    const before = await inspectControl(mf, { requests: true });
    const limited = await create(mf);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await inspectControl(mf, { requests: true })).toEqual(before);
    const control = (await inspectControl(mf)) as {
      usage: { clients: Record<string, number>; count: number };
    };
    expect(control.usage.count).toBe(1);
    expect(Object.keys(control.usage.clients)).toHaveLength(1);
    expect(Object.keys(control.usage.clients)[0]).toMatch(/^[\da-f]{4}$/u);
    const state = JSON.stringify([await inspect(mf), await inspectControl(mf)]);
    expect(state).not.toContain("192.0.2.");
    expect(state).not.toContain(TOKEN);
    expect(state).not.toContain("placeholder");
  });

  it("enforces singleton hourly & account-wide daily creation caps and clears old handles", async () => {
    const mf = runtime();
    const stub = await controlStub(mf);
    const client = "cccc";
    const hour = Math.floor(Date.now() / 3_600_000);
    const day = Math.floor(Date.now() / DAY);
    await inspectControl(mf, { usage: { clients: { [client]: 3 }, count: 10, day, hour } });
    expect(
      await status(stub.fetch("https://control/admit", { body: client, method: "POST" })),
    ).toBe(429);
    await inspectControl(mf, { usage: { clients: {}, count: 199, day, hour } });
    expect(
      await status(stub.fetch("https://control/admit", { body: client, method: "POST" })),
    ).toBe(200);
    expect(
      await status(stub.fetch("https://control/admit", { body: "dddd", method: "POST" })),
    ).toBe(429);
    await inspectControl(mf, {
      usage: { clients: { [client]: 1 }, count: 200, day, hour: hour - 1 },
    });
    expect(await inspectControl(mf, { alarm: true })).toEqual({
      usage: { clients: {}, count: 200, day, hour },
    });
    await inspectControl(mf, { usage: { clients: {}, count: 200, day: day - 1, hour: hour - 1 } });
    expect(
      await status(stub.fetch("https://control/admit", { body: client, method: "POST" })),
    ).toBe(200);
  });

  it("shares both creation budgets across equivalent IPv6 /64 addresses", async () => {
    const mf = runtime();
    const prefix = `2001:db8:${caseIndex}:1`;
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `${prefix}::1`))).toBe(201);
    const initial = (await inspectControl(mf)) as {
      usage: { clients: Record<string, number>; count: number; day: number; hour: number };
    };
    const buckets = Object.keys(initial.usage.clients);
    expect(buckets).toHaveLength(1);
    const otherId = "BBBBBBBBBBBBBBBBBBBBBB";
    expect(await status(create(mf, otherId, TOKEN, "valid", `${prefix}:abcd:0:1234:ffff`))).toBe(
      201,
    );
    const next = (await inspectControl(mf)) as typeof initial;
    expect(next.usage.clients).toEqual({ [buckets[0]]: 2 });
    await inspectControl(mf, { usage: { ...next.usage, clients: { [buckets[0]]: 3 } } });
    const hourly = await create(mf, "CCCCCCCCCCCCCCCCCCCCCC", TOKEN, "valid", `${prefix}::3`);
    expect(hourly.status).toBe(429);
    expect(Number(hourly.headers.get("Retry-After"))).toBeGreaterThan(0);
    // The fourth attempt targets an existing mailbox, so only the edge binding can reject it.
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `${prefix}::4`))).toBe(429);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `2001:db8:${caseIndex}:2::1`))).toBe(
      200,
    );
  });

  it("normalizes compressed IPv6 spellings & mapped IPv4 addresses before limiting", async () => {
    const mf = runtime();
    const ip = `2001:db8:${caseIndex}::1`;
    expect(await status(create(mf, mailboxId, TOKEN, "valid", ip))).toBe(201);
    expect(
      await status(create(mf, mailboxId, TOKEN, "valid", `2001:0DB8:00${caseIndex}:0000:0:0:0:2`)),
    ).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", ip))).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `2001:db8:${caseIndex}::ffff`))).toBe(
      429,
    );
    const ipv4 = `192.0.2.${caseIndex}`;
    expect(await status(create(mf, mailboxId, TOKEN, "valid", ipv4))).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `::ffff:${ipv4}`))).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", ipv4))).toBe(200);
    expect(await status(create(mf, mailboxId, TOKEN, "valid", `::ffff:${ipv4}`))).toBe(429);
  });

  it("limits public reads & handshakes across mailbox IDs before any object request", async () => {
    const mf = runtime();
    const prefix = `2001:db8:${caseIndex}:abcd`;
    // One read from another address fills the pause check, so the batch below never needs it.
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(404);
    const results = await Promise.all(
      Array.from({ length: 60 }, async (_, index) => {
        const id = Buffer.alloc(16, index + 128).toString("base64url");
        const response = await mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${id}`, {
          headers: {
            "CF-Connecting-IP": `${prefix}::${index + 1}`,
            ...(index % 2 ? { Upgrade: "websocket" } : {}),
          },
        });
        return response.status;
      }),
    );
    expect(results).toEqual(Array.from({ length: 60 }, () => 404));
    const before = await inspectControl(mf, { requests: true });
    expect(before).toEqual({ gateRequests: 1, mailboxRequests: 61 });
    for (const upgrade of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- Both request variants must use the exhausted budget.
      const limited = await mf.dispatchFetch(
        `https://relay.mistria.fyi/v1/mailboxes/${mailboxId}`,
        {
          headers: {
            "CF-Connecting-IP": `${prefix}::ffff`,
            ...(upgrade ? { Upgrade: "websocket" } : {}),
          },
        },
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBe("60");
    }
    expect(await inspectControl(mf, { requests: true })).toEqual(before);
    expect(await inspectControl(mf)).toEqual({});
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}`))).toBe(404);
  });

  it("caches preflights & bounds pauses to seven days without changing an existing pause", async () => {
    const mf = runtime();
    const preflight = await request(mf, "OPTIONS", `mailboxes/${mailboxId}`);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Max-Age")).toBe("7200");
    const until = Date.now() + 7 * DAY;
    expect(await status(request(mf, "PUT", "admin/pause", ADMIN, JSON.stringify({ until })))).toBe(
      200,
    );
    const before = await inspectControl(mf);
    expect(
      await status(
        request(mf, "PUT", "admin/pause", ADMIN, JSON.stringify({ until: until + DAY })),
      ),
    ).toBe(400);
    expect(await inspectControl(mf)).toEqual(before);
  });

  it("reports misconfigured Siteverify secrets as unavailable without consuming admission", async () => {
    const mf = runtime();
    expect(await status(create(mf, mailboxId, TOKEN, "invalid-input-secret"))).toBe(503);
    expect(await status(create(mf, mailboxId, TOKEN, "missing-input-secret"))).toBe(503);
    expect(await inspect(mf)).toEqual({});
    // The second failure waits in the isolate until the flush interval passes.
    expect(await failures(mf, 1)).toEqual({ [today()]: { "siteverify-secret-rejected": 1 } });
    await inspectControl(mf, { expireFailureFlush: true });
    expect(await status(create(mf, mailboxId, TOKEN, "invalid-input-secret"))).toBe(503);
    expect(await failures(mf, 3)).toEqual({ [today()]: { "siteverify-secret-rejected": 3 } });
    expect(await inspectControl(mf)).not.toHaveProperty("usage");
  });

  it("buffers a slow upload before entering the mailbox lock so reads can continue", async () => {
    const mf = runtime();
    await create(mf);
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    streamController?.enqueue(new Uint8Array(28));
    const uploading = mf.dispatchFetch(
      `https://relay.mistria.fyi/v1/mailboxes/${mailboxId}/envelope`,
      {
        body: stream,
        duplex: "half",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/octet-stream",
          "X-Sync-Counter": "1",
          "X-Sync-Version": "1",
        },
        method: "PUT",
      },
    );
    // dispatchFetch resolves after headers arrive; let the chunk reach the Worker before reading.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    try {
      const read = await Promise.race([
        request(mf, "GET", `mailboxes/${mailboxId}`),
        new Promise<never>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error("Read blocked by streaming upload"));
          }, 1000);
        }),
      ]);
      expect(await read.json()).toEqual({ state: "empty" });
      // Only the create asks the singleton; the upload & read reuse its pause check.
      expect(await inspectControl(mf, { requests: true })).toEqual({
        gateRequests: 1,
        mailboxRequests: 2,
      });
    } finally {
      streamController?.close();
      expect(await status(uploading)).toBe(200);
    }
  });

  it("serializes racing creates without allowing the loser to replace ownership", async () => {
    const mf = runtime();
    const responses = await Promise.all([create(mf), create(mf, mailboxId, OTHER_TOKEN)]);
    expect(
      responses.map((response) => response.status).toSorted((left, right) => left - right),
    ).toEqual([201, 409]);
    const winner = responses[0].status === 201 ? TOKEN : OTHER_TOKEN;
    const loser = winner === TOKEN ? OTHER_TOKEN : TOKEN;
    expect(await status(upload(mf, 1, loser))).toBe(403);
    expect(await status(upload(mf, 1, winner))).toBe(200);
  });

  it("refuses unsupported versions & spoofed query credentials without changing the mailbox", async () => {
    const mf = runtime();
    await create(mf);
    const before = await inspect(mf);
    const response = await mf.dispatchFetch(
      `https://relay.mistria.fyi/v1/mailboxes/${mailboxId}/envelope`,
      {
        body: new Uint8Array(32),
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/octet-stream",
          "X-Sync-Counter": "1",
          "X-Sync-Version": "2",
        },
        method: "PUT",
      },
    );
    expect(response.status).toBe(400);
    expect(await status(request(mf, "GET", `mailboxes/${mailboxId}?token=${TOKEN}`))).toBe(400);
    expect(await status(request(mf, "POST", "admin/pause", ADMIN, "{}"))).toBe(404);
    expect(await inspect(mf)).toEqual(before);
  });

  it("pushes envelopes over a hibernating read-only WebSocket & closes it on retire", async () => {
    const mf = runtime();
    await create(mf);
    const response = await mf.dispatchFetch(`https://relay.mistria.fyi/v1/mailboxes/${mailboxId}`, {
      headers: { "CF-Connecting-IP": `192.0.2.${caseIndex}`, Upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    expect(socket).toBeTruthy();
    if (!socket) throw new Error("Missing WebSocket");
    const messages: (ArrayBuffer | string | Uint8Array)[] = [];
    socket.addEventListener("message", (event) => {
      messages.push(event.data);
      if (typeof event.data === "string" && event.data === JSON.stringify({ state: "retired" })) {
        socket.close(1000, "retired");
      }
    });
    socket.accept();
    await new Promise<void>((resolve) => {
      socket.addEventListener(
        "message",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    expect(JSON.parse(messages[0] as string)).toEqual({ state: "empty" });
    const before = await inspect(mf);
    await mf.unsafeEvictDurableObject("", "TestMailbox", {
      name: mailboxId,
      webSockets: "hibernate",
    });
    expect(await inspect(mf)).toEqual(before);
    const next = new Promise<void>((resolve) => {
      socket.addEventListener(
        "message",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    await upload(mf);
    await next;
    expect(JSON.parse(messages[1] as string)).toMatchObject({
      counter: 1,
      state: "envelope",
      version: 1,
    });
    const closed = new Promise<void>((resolve) => {
      socket.addEventListener(
        "close",
        () => {
          resolve();
        },
        { once: true },
      );
    });
    await request(mf, "DELETE", `mailboxes/${mailboxId}`, TOKEN);
    await closed;
  });

  it("refuses a 21st follower socket until an expired one makes room", async () => {
    const mf = runtime();
    await create(mf);
    const sockets: FollowerSocket[] = [];
    for (let index = 0; index < 20; index++) {
      // oxlint-disable-next-line no-await-in-loop -- Each handshake must count the previous ones.
      const response = await follow(mf);
      expect(response.status).toBe(101);
      if (response.webSocket) sockets.push(response.webSocket);
    }
    const refused = await follow(mf);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("60");
    expect(await inspect(mf, { sockets: true })).toEqual({ sockets: 20 });
    // The next handshake ends expired sockets before counting, even before the alarm runs.
    await inspect(mf, { ageSockets: 6 * HOUR });
    const admitted = await follow(mf);
    expect(admitted.status).toBe(101);
    expect(await inspect(mf, { sockets: true })).toEqual({ sockets: 1 });
    for (const socket of [...sockets, admitted.webSocket]) socket?.close();
  });

  it("closes a follower socket after six hours through the mailbox alarm", async () => {
    const mf = runtime();
    await create(mf);
    const before = Date.now();
    const response = await follow(mf);
    const socket = response.webSocket;
    if (!socket) throw new Error("Missing WebSocket");
    const { alarm } = (await inspect(mf, { alarmAt: true })) as { alarm: number };
    expect(alarm).toBeGreaterThanOrEqual(before + 6 * HOUR);
    expect(alarm).toBeLessThanOrEqual(Date.now() + 6 * HOUR);
    // An upload's 30-day alarm doesn't push the socket deadline back.
    expect(await status(upload(mf))).toBe(200);
    expect(await inspect(mf, { alarmAt: true })).toEqual({ alarm });
    await inspect(mf, { ageSockets: 6 * HOUR });
    const saved = await inspect(mf, { alarm: true });
    expect(saved).toHaveProperty("envelope");
    expect(await inspect(mf, { sockets: true })).toEqual({ sockets: 0 });
    const uploaded = saved as { meta: { lastUpload: number } };
    expect(await inspect(mf, { alarmAt: true })).toEqual({
      alarm: uploaded.meta.lastUpload + 30 * DAY,
    });
    // The follower's retry gets a fresh socket with the latest envelope.
    const again = await follow(mf);
    expect(again.status).toBe(101);
    again.webSocket?.close();
  });

  it("counts an exception by kind without recording its message or the request", async () => {
    const mf = runtime();
    await create(mf);
    const secret = `leak ${TOKEN} 192.0.2.${caseIndex} ${mailboxId}`;
    await inspect(mf, { throwNext: secret });
    const response = await upload(mf);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: "unavailable" });
    expect(response.headers.has("X-Relay-Failure")).toBe(false);
    expect(await failures(mf, 1)).toEqual({ [today()]: { "code-error": 1 } });
    const recorded = JSON.stringify(await inspectControl(mf));
    for (const fragment of ["leak", TOKEN, "192.0.2.", mailboxId]) {
      expect(recorded).not.toContain(fragment);
    }
  });

  it("serves the failure counts only to the admin & refuses kinds off the allowlist", async () => {
    const mf = runtime();
    const stub = await controlStub(mf);
    for (const body of [
      "free text",
      "{}",
      JSON.stringify({ "free text": 1 }),
      JSON.stringify({ "code-error": 0 }),
      JSON.stringify({ "code-error": 1.5 }),
      JSON.stringify({ "code-error": "1" }),
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- Each refusal must leave storage untouched.
      expect(await status(stub.fetch("https://control/failure", { body, method: "POST" }))).toBe(
        400,
      );
    }
    expect(await inspectControl(mf)).toEqual({});
    expect(
      await status(
        stub.fetch("https://control/failure", {
          body: JSON.stringify({ "code-error": 1 }),
          method: "POST",
        }),
      ),
    ).toBe(204);
    // Counting schedules the alarm that drops today's counts once they leave the window.
    expect(await inspectControl(mf, { alarmAt: true })).toEqual({
      alarm: Date.parse(today()) + 14 * DAY,
    });
    const old = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
    const kept = new Date(Date.now() - 13 * DAY).toISOString().slice(0, 10);
    const state = (await inspectControl(mf)) as { failures: Record<string, unknown> };
    await stub.fetch("https://internal/__test", {
      body: JSON.stringify({
        failures: {
          ...state.failures,
          [kept]: { "object-transient": 2 },
          [old]: { "code-error": 9 },
        },
      }),
      method: "POST",
    });
    expect(await status(request(mf, "GET", "admin/failures", "wrong"))).toBe(403);
    expect(await status(request(mf, "GET", "admin/failures"))).toBe(403);
    const read = await request(mf, "GET", "admin/failures", ADMIN);
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      failures: { [kept]: { "object-transient": 2 }, [today()]: { "code-error": 1 } },
    });
    // The control alarm drops expired days without waiting for a failure or a read.
    expect(await inspectControl(mf, { alarm: true })).toEqual({
      failures: { [kept]: { "object-transient": 2 }, [today()]: { "code-error": 1 } },
    });
  });

  it("survives eviction & a runtime restart with the same SQLite storage", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "mistria-relay-"));
    directories.push(directory);
    const first = runtime(directory);
    await create(first);
    await upload(first, 30);
    await first.unsafeEvictDurableObject("", "TestMailbox", { name: mailboxId });
    expect(await status(upload(first, 29))).toBe(409);
    await first.dispose();
    runtimes.splice(runtimes.indexOf(first), 1);
    const second = runtime(directory);
    expect(await status(upload(second, 29))).toBe(409);
    const saved = await request(second, "GET", `mailboxes/${mailboxId}`);
    expect(saved.headers.get("X-Sync-Counter")).toBe("30");
    await request(second, "DELETE", `mailboxes/${mailboxId}`, TOKEN);
    await second.unsafeEvictDurableObject("", "TestMailbox", { name: mailboxId });
    expect(await status(create(second))).toBe(410);
  });
});

function integrationClient() {
  return createRelayClient(TEST_ORIGIN, relayTestFetch(runtime(), `192.0.2.${caseIndex}`));
}

describe("the app's relay client against the real worker", () => {
  const save = new Uint8Array([1, 2, 3, 4, 5]);

  async function sealed(key: Parameters<typeof deriveFollowKeys>[0], counter = 1) {
    const version = FOLLOW_PROTOCOL_VERSION;
    const header = { fileName: "game-1-autosave.sav", modified: 1000 };
    const envelope = await sealEnvelope(
      await deriveFollowKeys(key),
      { counter, version },
      encodeSavePayload({ header, save }),
    );
    return { counter, envelope, version };
  }

  it("creates a mailbox, uploads a sealed save, reads it back, opens it, & retires it", async () => {
    const relay = integrationClient();
    const share = await shareNewCode(relay, () => Promise.resolve("valid"));
    if (share.kind !== "shared") throw new Error(`Couldn't share: ${share.kind}`);
    const { key, token } = share.code;
    const { mailboxId: id } = await deriveFollowKeys(key);

    expect(await openFollowKey(relay, key)).toEqual({ kind: "empty" });
    expect(await relay.upload(id, token, await sealed(key))).toEqual({ kind: "stored" });

    const opened = await openFollowKey(relay, key);
    if (opened.kind !== "save") throw new Error(`Couldn't open: ${opened.kind}`);
    expect(opened).toMatchObject({ counter: 1, mailboxId: id });
    expect(opened.payload.save).toEqual(save);
    expect(opened.payload.header.fileName).toBe("game-1-autosave.sav");

    expect(await relay.retire(id, token)).toEqual({ kind: "retired" });
    expect(await openFollowKey(relay, key)).toEqual({ kind: "retired" });
    expect(await relay.upload(id, token, await sealed(key, 2))).toEqual({ kind: "retired" });
  });

  it("reports a failed Turnstile check as a refusal", async () => {
    const relay = integrationClient();
    const { mailboxId: id } = await deriveFollowKeys(generateFollowKey());
    expect(await relay.create(id, generateWriteToken(), "invalid")).toEqual({ kind: "refused" });
    expect(await shareNewCode(relay, () => Promise.resolve("invalid"))).toEqual({
      kind: "refused",
    });
  });

  it("reports a pause after the Worker's cached check expires", async () => {
    const mf = runtime();
    const relay = integrationClient();
    const key = generateFollowKey();
    const { mailboxId: id } = await deriveFollowKeys(key);
    expect(await relay.create(id, generateWriteToken(), "valid")).toEqual({ kind: "created" });
    expect(await openFollowKey(relay, key)).toEqual({ kind: "empty" });

    const until = Date.now() + HOUR;
    await inspectControl(mf, { pausedUntil: until });
    expect(await openFollowKey(relay, key)).toEqual({ kind: "empty" });
    await inspectControl(mf, { pauseCheckAge: 30_000 });
    expect(await openFollowKey(relay, key)).toEqual({ kind: "paused", until });
  });

  it("reports a 429 with the relay's retry delay", async () => {
    const relay = integrationClient();
    const { mailboxId: id } = await deriveFollowKeys(generateFollowKey());
    const token = generateWriteToken();
    for (let attempt = 0; attempt < 3; attempt++) {
      // oxlint-disable-next-line no-await-in-loop -- Fill the same address's creation budget.
      expect(await relay.create(id, token, "valid")).toEqual({ kind: "created" });
    }
    expect(await relay.create(id, token, "valid")).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 60,
    });
  });

  it("reports an in-flight relay read as unreachable when its deadline expires", async () => {
    const mf = runtime();
    const relay = integrationClient();
    expect(await relay.create(mailboxId, generateWriteToken(), "valid")).toEqual({
      kind: "created",
    });
    const { mailboxRequests } = await inspectControl(mf, { requests: true });
    await inspect(mf, { nextReadDelay: 2000 });

    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    const reading = relay.read(mailboxId);
    await vi.waitFor(async () => {
      expect(await inspectControl(mf, { requests: true })).toMatchObject({
        mailboxRequests: Number(mailboxRequests) + 1,
      });
    });
    deadline.abort(new DOMException("Read deadline expired", "TimeoutError"));

    expect(await reading).toEqual({ kind: "unreachable" });
    expect(await relay.read(mailboxId)).toEqual({ kind: "empty" });
  });

  it("reports a wrong token as a refusal on upload & retire", async () => {
    const relay = integrationClient();
    const key = generateFollowKey();
    const { mailboxId: id } = await deriveFollowKeys(key);
    expect(await relay.create(id, generateWriteToken(), "valid")).toEqual({ kind: "created" });
    const stranger = generateWriteToken();
    expect(await relay.upload(id, stranger, await sealed(key))).toEqual({ kind: "refused" });
    expect(await relay.retire(id, stranger)).toEqual({ kind: "refused" });
  });

  it("reports a malformed token as a refusal", async () => {
    const relay = integrationClient();
    const key = generateFollowKey();
    const { mailboxId: id } = await deriveFollowKeys(key);
    expect(await relay.upload(id, "short", await sealed(key))).toEqual({ kind: "refused" });
  });

  it("reports a protocol the relay doesn't speak as a version mismatch", async () => {
    const relay = integrationClient();
    const key = generateFollowKey();
    const token = generateWriteToken();
    const { mailboxId: id } = await deriveFollowKeys(key);
    await relay.create(id, token, "valid");
    const envelope = await sealed(key);
    expect(await relay.upload(id, token, { ...envelope, version: 2 })).toEqual({
      kind: "unsupported-version",
    });
  });

  it("reports a stale counter, a too-large envelope, & a mailbox that never existed", async () => {
    const relay = integrationClient();
    const key = generateFollowKey();
    const token = generateWriteToken();
    const { mailboxId: id } = await deriveFollowKeys(key);
    expect(await openFollowKey(relay, key)).toEqual({ kind: "invalid" });
    expect(await relay.upload(id, token, await sealed(key))).toEqual({ kind: "retired" });
    await relay.create(id, token, "valid");
    expect(await relay.upload(id, token, await sealed(key, 5))).toEqual({ kind: "stored" });
    expect(await relay.upload(id, token, await sealed(key, 4))).toEqual({ kind: "conflict" });
    const tooLarge = { counter: 6, envelope: new Uint8Array(256 * 1024 + 1), version: 1 };
    expect(await relay.upload(id, token, tooLarge)).toEqual({ kind: "too-large" });
  });
});
