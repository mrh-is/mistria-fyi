import {
  ENVELOPE_CONTENT_TYPE,
  FOLLOW_PROTOCOL_VERSION,
  isEnvelopeSuffix,
  MAILBOX_ROUTE,
  SYNC_COUNTER_HEADER,
  SYNC_VERSION_HEADER,
} from "./wire.js";

import type { MailboxPushMessage, RelayState } from "./wire.js";

interface Env {
  ADMIN_TOKEN: string;
  CONTROL: DurableObjectNamespace;
  CREATE_RATE: RateLimit;
  IP_RATE_SECRET: string;
  MAILBOXES: DurableObjectNamespace;
  READ_RATE: RateLimit;
  TURNSTILE_HOSTNAME: string;
  TURNSTILE_SECRET: string;
}

interface LiveMailbox {
  counter: number;
  createdAt: number;
  digest: string;
  lastUpload: number;
  retired: false;
  tokenHash: string;
  uploadCount: number;
  uploadDay: number;
}
type MailboxMeta = LiveMailbox | { retired: true };
/**
 * The only failure kinds the relay records, as daily counts. A kind names where & how a request
 * failed, never what it carried: no request data, identifiers, tokens, or exception text.
 */
const FAILURE_KINDS = [
  "code-error",
  "object-overloaded",
  "object-transient",
  "secret-missing",
  "siteverify-secret-rejected",
  "siteverify-unreachable",
  "unexpected-error",
] as const;
type FailureKind = (typeof FAILURE_KINDS)[number];
/** UTC date (`YYYY-MM-DD`) → counts per kind, for the last {@link FAILURE_DAYS} days. */
type FailureCounts = Record<string, Partial<Record<FailureKind, number>>>;
/** Carries a kind from a Durable Object to the Worker, which strips it before responding. */
const FAILURE_HEADER = "X-Relay-Failure";
const FAILURE_DAYS = 14;
/** An isolate sends its pending counts at most this often, so an outage can't flood the singleton. */
const FAILURE_FLUSH_INTERVAL = 10_000;
/** The most one batch may add to a kind; an isolate can't plausibly fail more in one interval. */
const MAX_FAILURE_BATCH = 1_000_000;

/** What each follower socket carries through hibernation. */
interface SocketAttachment {
  openedAt: number;
}
interface Usage {
  clients: Record<string, number>;
  count: number;
  day: number;
  hour: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ENVELOPE_TTL = 30 * DAY;
const MAILBOX_TTL = 365 * DAY;
const MAX_ENVELOPE = 256 * 1024;
/** Followers one mailbox holds at once; a player's own devices fit well under it. */
const MAX_FOLLOWERS = 20;
/** A follower reconnects (& reads again) after this long, so no socket outlives it by much. */
const SOCKET_LIFETIME = 6 * HOUR;
/** How long a Worker isolate trusts its last look at the kill switch. See relay/README.md. */
const PAUSE_CHECK_INTERVAL = 30_000;
const encoder = new TextEncoder();

/** This isolate's last look at the kill switch; `until` is 0 when no pause was ever set. */
let pauseCheck: undefined | { checkedAt: number; until: number };
/** Failures this isolate hasn't sent yet, & when it last sent some. */
const pendingFailures = new Map<FailureKind, number>();
let lastFailureFlush = 0;

function json(state: RelayState, status = 200): Response {
  return Response.json({ state }, { status });
}

function rateLimited(retryAt: number): Response {
  return Response.json({ state: "rate-limited" } satisfies { state: RelayState }, {
    headers: { "Retry-After": String(Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))) },
    status: 429,
  });
}

function paused(until: number): Response {
  return Response.json({ state: "paused", until } satisfies { state: RelayState; until: number }, {
    headers: { "Retry-After": String(Math.max(1, Math.ceil((until - Date.now()) / 1000))) },
    status: 503,
  });
}

/** A `503 unavailable` that tells the Worker which kind of failure to count. */
function failed(kind: FailureKind): Response {
  return Response.json({ state: "unavailable" } satisfies { state: RelayState }, {
    headers: { [FAILURE_HEADER]: kind },
    status: 503,
  });
}

function isFailureKind(value: null | string): value is FailureKind {
  return FAILURE_KINDS.includes(value as FailureKind);
}

/**
 * Names an exception by allowlisted traits only: the runtime's `overloaded` & `retryable` flags
 * mark Durable Object & storage trouble, & the built-in error types a code bug throws. The message
 * never leaves this function.
 */
function failureKind(error: unknown): FailureKind {
  if (typeof error === "object" && error !== null) {
    const flags = error as { overloaded?: unknown; retryable?: unknown };
    if (flags.overloaded === true) return "object-overloaded";
    if (flags.retryable === true) return "object-transient";
  }
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  ) {
    return "code-error";
  }
  return "unexpected-error";
}

function utcDate(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/**
 * Counts a failure in this isolate & sends the pending batch when the last send is old enough.
 * Best effort: a lost batch never changes the player's response, & counts still pending when the
 * isolate ends are lost.
 */
function recordFailure(env: Env, ctx: ExecutionContext, kind: FailureKind): void {
  pendingFailures.set(kind, (pendingFailures.get(kind) ?? 0) + 1);
  const now = Date.now();
  if (now >= lastFailureFlush && now < lastFailureFlush + FAILURE_FLUSH_INTERVAL) return;
  lastFailureFlush = now;
  const batch = JSON.stringify(Object.fromEntries(pendingFailures));
  pendingFailures.clear();
  ctx.waitUntil(sendFailures(env, batch));
}

async function sendFailures(env: Env, batch: string): Promise<void> {
  try {
    await control(env).fetch("https://control/failure", { body: batch, method: "POST" });
  } catch {
    // The singleton may share the outage being counted.
  }
}

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  return (
    Boolean(env.ADMIN_TOKEN) &&
    (await sameSecret(request.headers.get("Authorization") ?? "", `Bearer ${env.ADMIN_TOKEN}`))
  );
}

function bearer(request: Request): string | undefined {
  return /^Bearer ([A-Za-z0-9_-]{43})$/u.exec(request.headers.get("Authorization") ?? "")?.[1];
}

async function hash(value: ArrayBuffer | string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    typeof value === "string" ? encoder.encode(value) : value,
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Compare fixed-size secrets without a content-dependent early return. */
async function sameSecret(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([hash(left), hash(right)]);
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= (a.codePointAt(index) ?? 0) ^ (b.codePointAt(index) ?? 0);
  }
  return difference === 0;
}

/** Bound actual streamed bytes; Content-Length is neither required nor trusted. */
async function bodyBytes(request: Request, maximum: number): Promise<ArrayBuffer | null> {
  if (Number(request.headers.get("Content-Length")) > maximum) return null;
  const stream: null | ReadableStream<Uint8Array> = request.body;
  const reader = stream?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- A bounded stream must be consumed sequentially.
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) {
      // oxlint-disable-next-line no-await-in-loop -- Cancel this reader before rejecting its body.
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

async function smallJson(request: Request): Promise<null | Record<string, unknown>> {
  const bytes = await bodyBytes(request, 4096);
  if (!bytes) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function control(env: Env): DurableObjectStub {
  return env.CONTROL.get(env.CONTROL.idFromName("relay-control-v1"));
}

/**
 * The kill switch's end time, from this isolate's cache when it's fresh. A pause reaches every
 * isolate within {@link PAUSE_CHECK_INTERVAL}, so reads & uploads skip the singleton otherwise.
 */
async function pauseEnd(env: Env): Promise<number> {
  const now = Date.now();
  if (
    pauseCheck &&
    now >= pauseCheck.checkedAt &&
    now < pauseCheck.checkedAt + PAUSE_CHECK_INTERVAL
  ) {
    return pauseCheck.until;
  }
  const gate = await control(env).fetch("https://control/gate");
  if (!gate.ok) throw new Error("Relay control gate failed");
  const { until } = await gate.json<{ until: number }>();
  // An admin pause this isolate handled meanwhile is newer than this answer; keep it.
  if (!pauseCheck || pauseCheck.checkedAt <= now) pauseCheck = { checkedAt: now, until };
  return until;
}

/** Canonical IPv4 address or IPv6 /64; temporary IPv6 addresses share one budget. */
function clientPrefix(ip: string): null | string {
  if (!ip.includes(":")) {
    const parts = ip.split(".");
    return parts.length === 4 &&
      parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255)
      ? parts.map(Number).join(".")
      : null;
  }
  if (!/^[\da-f:.]+$/iu.test(ip)) return null;
  let canonical: string;
  try {
    canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [left, right] = canonical.split("::");
  const head = left ? left.split(":") : [];
  const tail = right ? right.split(":") : [];
  const groups = [
    ...head,
    ...Array.from({ length: 8 - head.length - tail.length }, () => "0"),
    ...tail,
  ].map((group) => Number.parseInt(group, 16));
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xff_ff) {
    // IPv4-mapped IPv6 uses the same address budget as its dotted-decimal spelling.
    return [groups[6] >> 8, groups[6] & 255, groups[7] >> 8, groups[7] & 255].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16).padStart(4, "0"))
    .join(":")}/64`;
}

async function clientBucket(prefix: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`sync-create:${Math.floor(Date.now() / HOUR)}:${prefix}`),
  );
  // Deliberately many-to-one: no recoverable per-address pseudonym enters SQLite or its backups.
  return Array.from(new Uint8Array(signature).subarray(0, 2), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.search) return json("bad-request", 400);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/v1/admin/failures" && request.method === "GET") {
    if (!(await isAdmin(request, env))) return json("forbidden", 403);
    return control(env).fetch("https://control/failures");
  }
  if (url.pathname === "/v1/admin/pause" && request.method === "PUT") {
    if (!(await isAdmin(request, env))) return json("forbidden", 403);
    const body = await bodyBytes(request, 4096);
    if (!body) return json("too-large", 413);
    const response = await control(env).fetch(
      new Request("https://control/pause", { body, method: "PUT" }),
    );
    if (response.ok) {
      // This isolate applies its own change at once; the others within the check interval.
      const { until } = await response.clone().json<{ until: number }>();
      pauseCheck = { checkedAt: Date.now(), until };
    }
    return response;
  }
  const match = MAILBOX_ROUTE.exec(url.pathname);
  if (!match) return json("not-found", 404);
  const create = request.method === "POST" && !match[2];
  const upload = request.method === "PUT" && isEnvelopeSuffix(match[2]);
  const read = request.method === "GET" && !match[2];
  const retire = request.method === "DELETE" && !match[2];
  if (!create && !upload && !read && !retire) return json("method-not-allowed", 405);
  if (!read && !bearer(request)) return json("unauthorized", 401);
  const prefix =
    create || read ? clientPrefix(request.headers.get("CF-Connecting-IP") ?? "") : null;
  if ((create || read) && !prefix) return json("bad-request", 400);
  if (read && prefix) {
    const limit = await env.READ_RATE.limit({ key: prefix });
    if (!limit.success) return rateLimited(Date.now() + MINUTE);
  }
  if (create && prefix) {
    if (!env.IP_RATE_SECRET || !env.TURNSTILE_SECRET || !env.TURNSTILE_HOSTNAME) {
      return failed("secret-missing");
    }
    const limit = await env.CREATE_RATE.limit({ key: prefix });
    if (!limit.success) return rateLimited(Date.now() + MINUTE);
  }
  const headers = new Headers();
  for (const name of [
    "Authorization",
    "Content-Type",
    SYNC_VERSION_HEADER,
    SYNC_COUNTER_HEADER,
    "If-None-Match",
    "Upgrade",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (create || upload || read) {
    const until = await pauseEnd(env);
    if (until > Date.now()) return paused(until);
  }
  if (create && prefix) {
    headers.set("X-Relay-Client", await clientBucket(prefix, env.IP_RATE_SECRET));
  }
  // Buffer bounded network input before any mailbox lock; a slow uplink cannot block followers.
  const body =
    create || upload ? await bodyBytes(request, upload ? MAX_ENVELOPE : 4096) : undefined;
  if (body === null) return json("too-large", 413);
  const stub = env.MAILBOXES.get(env.MAILBOXES.idFromName(match[1]));
  // Never forward the client address, cookies, URLs with query strings, or incidental headers.
  let action = "read";
  if (create) action = "create";
  if (upload) action = "upload";
  if (retire) action = "retire";
  return stub.fetch(
    new Request(`https://mailbox/${action}`, {
      body,
      headers,
      method: request.method,
    }),
  );
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let response: Response;
    let failure: FailureKind | undefined;
    try {
      response = await route(request, env);
    } catch (error) {
      // No request, error, address, token, or payload logging: only a fixed kind is counted.
      failure = failureKind(error);
      response = json("unavailable", 503);
    }
    const headers = new Headers(response.headers);
    const reported = headers.get(FAILURE_HEADER);
    headers.delete(FAILURE_HEADER);
    failure ??= isFailureKind(reported) ? reported : undefined;
    if (failure) recordFailure(env, ctx, failure);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set("Access-Control-Max-Age", "7200");
    headers.set(
      "Access-Control-Allow-Headers",
      `Authorization, Content-Type, ${SYNC_VERSION_HEADER}, ${SYNC_COUNTER_HEADER}, If-None-Match`,
    );
    headers.set(
      "Access-Control-Expose-Headers",
      `ETag, ${SYNC_VERSION_HEADER}, ${SYNC_COUNTER_HEADER}, Retry-After`,
    );
    return new Response(response.body, {
      headers,
      status: response.status,
      webSocket: response.webSocket,
    });
  },
} satisfies ExportedHandler<Env>;

/** SQLite-backed, one object per public mailbox ID; no schema initialization on reads. */
export class Mailbox implements DurableObject {
  protected readonly ctx: DurableObjectState;
  private readonly env: Env;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  fetch(request: Request): Promise<Response> {
    // The Worker buffers network bodies first; only the bounded Siteverify fetch waits externally.
    // Serialization includes external awaits, so simultaneous creates cannot change ownership.
    return this.ctx.blockConcurrencyWhile(async () => {
      const meta = await this.ctx.storage.get<MailboxMeta>("meta");
      const path = new URL(request.url).pathname;
      const now = Date.now();
      const retired =
        meta?.retired === true ||
        (meta?.retired === false && now >= Math.max(meta.lastUpload, meta.createdAt) + MAILBOX_TTL);
      if (retired) return json("retired", 410);
      if (path === "/create") return this.create(request, meta);
      if (!meta) return json("not-found", 404);
      if (path === "/read") return this.read(request, meta);
      const token = bearer(request);
      if (!token || !(await sameSecret(await hash(token), meta.tokenHash))) {
        return json("forbidden", 403);
      }
      if (path === "/retire") {
        await this.tombstone();
        return json("retired");
      }
      if (path === "/upload") return this.upload(request, meta);
      return json("not-found", 404);
    });
  }

  private async create(request: Request, existing: LiveMailbox | undefined): Promise<Response> {
    const token = bearer(request);
    if (!token) return json("unauthorized", 401);
    const tokenHash = await hash(token);
    if (existing) {
      return (await sameSecret(tokenHash, existing.tokenHash))
        ? json("live")
        : json("conflict", 409);
    }
    const body = await smallJson(request);
    if (
      typeof body?.turnstile !== "string" ||
      body.turnstile.length === 0 ||
      body.turnstile.length > 2048
    ) {
      return json("bad-request", 400);
    }
    let result: {
      action?: string;
      "error-codes"?: string[];
      hostname?: string;
      success?: boolean;
    };
    try {
      const verified = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        body: new URLSearchParams({ response: body.turnstile, secret: this.env.TURNSTILE_SECRET }),
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      if (!verified.ok) return failed("siteverify-unreachable");
      result = await verified.json();
    } catch {
      // A timeout, network error, or unreadable answer all mean Siteverify didn't answer usefully.
      return failed("siteverify-unreachable");
    }
    if (
      result["error-codes"]?.some(
        (code) => code === "invalid-input-secret" || code === "missing-input-secret",
      )
    ) {
      return failed("siteverify-secret-rejected");
    }
    if (
      result.success !== true ||
      result.hostname !== this.env.TURNSTILE_HOSTNAME ||
      result.action !== "sync-create"
    ) {
      return json("forbidden", 403);
    }
    const admitted = await control(this.env).fetch("https://control/admit", {
      body: request.headers.get("X-Relay-Client"),
      method: "POST",
    });
    if (!admitted.ok) return admitted;
    const now = Date.now();
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put("meta", {
        counter: 0,
        createdAt: now,
        digest: "",
        lastUpload: 0,
        retired: false,
        tokenHash,
        uploadCount: 0,
        uploadDay: 0,
      } satisfies LiveMailbox);
      await storage.setAlarm(now + MAILBOX_TTL);
    });
    return json("live", 201);
  }

  private async upload(request: Request, meta: LiveMailbox): Promise<Response> {
    if (request.headers.get(SYNC_VERSION_HEADER) !== String(FOLLOW_PROTOCOL_VERSION)) {
      return json("unsupported-version", 400);
    }
    const rawCounter = request.headers.get(SYNC_COUNTER_HEADER) ?? "";
    const counter = Number(rawCounter);
    if (!/^[1-9]\d{0,15}$/u.test(rawCounter) || !Number.isSafeInteger(counter)) {
      return json("bad-request", 400);
    }
    if (request.headers.get("Content-Type") !== ENVELOPE_CONTENT_TYPE) {
      return json("bad-request", 400);
    }
    if (counter < meta.counter) return json("stale-counter", 409);
    const now = Date.now();
    const day = Math.floor(now / DAY);
    const count = day === meta.uploadDay ? meta.uploadCount : 0;
    if (counter > meta.counter) {
      const retryAt = Math.max(meta.lastUpload + MINUTE, count >= 60 ? (day + 1) * DAY : 0);
      if (now < retryAt) return rateLimited(retryAt);
    }
    const bytes = await bodyBytes(request, MAX_ENVELOPE);
    if (!bytes) return json("too-large", 413);
    // AES-GCM's 96-bit nonce & 128-bit tag are part of the opaque body.
    if (bytes.byteLength < 28) return json("bad-request", 400);
    const digest = await hash(bytes);
    if (counter === meta.counter) {
      return digest === meta.digest ? json("stored") : json("counter-conflict", 409);
    }
    const next: LiveMailbox = {
      ...meta,
      counter,
      digest,
      lastUpload: now,
      uploadCount: count + 1,
      uploadDay: day,
    };
    // Close expired followers first, so no deadline is already past.
    const sockets = this.sweepSockets(now, true);
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put({ envelope: bytes, meta: next });
      // Keep an earlier socket deadline; the alarm closes expired followers too.
      await storage.setAlarm(Math.min(now + ENVELOPE_TTL, sockets.next));
    });
    this.broadcast(Mailbox.envelopeMessage(next, bytes));
    return json("stored");
  }

  private async read(request: Request, meta: LiveMailbox): Promise<Response> {
    const bytes =
      Date.now() < meta.lastUpload + ENVELOPE_TTL
        ? await this.ctx.storage.get<ArrayBuffer>("envelope")
        : undefined;
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const now = Date.now();
      if (this.sweepSockets(now, true).open >= MAX_FOLLOWERS) return rateLimited(now + MINUTE);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({ openedAt: now } satisfies SocketAttachment);
      const deadline = now + SOCKET_LIFETIME;
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null || alarm > deadline) await this.ctx.storage.setAlarm(deadline);
      pair[1].send(bytes ? Mailbox.envelopeMessage(meta, bytes) : Mailbox.push({ state: "empty" }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (!bytes) return json("empty");
    const headers = {
      "Content-Type": ENVELOPE_CONTENT_TYPE,
      ETag: `"${meta.counter}-${meta.digest}"`,
      [SYNC_COUNTER_HEADER]: String(meta.counter),
      [SYNC_VERSION_HEADER]: String(FOLLOW_PROTOCOL_VERSION),
    };
    if (request.headers.get("If-None-Match") === headers.ETag) {
      return new Response(null, { headers, status: 304 });
    }
    return new Response(bytes, { headers });
  }

  private static push(message: MailboxPushMessage): string {
    return JSON.stringify(message);
  }

  private static envelopeMessage(meta: LiveMailbox, bytes: ArrayBuffer): string {
    // A loop avoids spreading a 256 KiB array onto the JavaScript call stack.
    let binary = "";
    for (const byte of new Uint8Array(bytes)) binary += String.fromCodePoint(byte);
    return Mailbox.push({
      counter: meta.counter,
      envelope: btoa(binary),
      state: "envelope",
      version: FOLLOW_PROTOCOL_VERSION,
    });
  }

  private broadcast(message: string, close = false): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(message);
        if (close) socket.close(1000, "retired");
      } catch {
        // A disconnected follower does not block persistence or other followers.
        socket.close(1011, "reconnect");
      }
    }
  }

  /**
   * Counts follower sockets & finds the earliest lifetime deadline among them. With `close`, ends
   * the expired ones first; a socket from before attachments existed counts as expired.
   */
  private sweepSockets(now: number, close: boolean): { next: number; open: number } {
    let next = Number.POSITIVE_INFINITY;
    let open = 0;
    for (const socket of this.ctx.getWebSockets()) {
      // A socket already closing, such as after a failed send, no longer holds a place.
      if (socket.readyState !== WebSocket.READY_STATE_OPEN) continue;
      const attachment = socket.deserializeAttachment() as null | SocketAttachment;
      const deadline = (attachment?.openedAt ?? 0) + SOCKET_LIFETIME;
      if (close && now >= deadline) {
        try {
          socket.close(1000, "expired");
        } catch {
          // Already closing; the client reconnects either way.
        }
      } else {
        open++;
        next = Math.min(next, deadline);
      }
    }
    return { next, open };
  }

  private async tombstone(): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put("meta", { retired: true });
      await storage.delete("envelope");
      await storage.deleteAlarm();
    });
    this.broadcast(Mailbox.push({ state: "retired" }), true);
  }

  alarm(): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const sockets = this.sweepSockets(now, true);
      const meta = await this.ctx.storage.get<MailboxMeta>("meta");
      if (!meta || meta.retired) return;
      const retireAt = Math.max(meta.lastUpload, meta.createdAt) + MAILBOX_TTL;
      if (now >= retireAt) {
        await this.tombstone();
      } else {
        const expiresAt = meta.lastUpload + ENVELOPE_TTL;
        // A socket deadline can wake the alarm after expiry too; announce `empty` only once.
        if (now >= expiresAt && (await this.ctx.storage.delete("envelope"))) {
          this.broadcast(Mailbox.push({ state: "empty" }));
        }
        await this.ctx.storage.setAlarm(
          Math.min(now < expiresAt ? expiresAt : retireAt, sockets.next),
        );
      }
    });
  }

  // oxlint-disable-next-line class-methods-use-this -- Hibernation dispatch requires an instance method.
  webSocketMessage(socket: WebSocket): void {
    socket.close(1008, "read-only");
  }
  // oxlint-disable-next-line class-methods-use-this -- Hibernation dispatch requires an instance method.
  webSocketClose(socket: WebSocket): void {
    socket.close(1000, "closed");
  }
  // oxlint-disable-next-line class-methods-use-this -- Hibernation dispatch requires an instance method.
  webSocketError(socket: WebSocket): void {
    socket.close(1011, "reconnect");
  }
}

/** One account-wide cap & expiring kill switch, with no mailbox inventory or raw addresses. */
export class RelayControl implements DurableObject {
  private readonly ctx: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/gate") {
      // A read-only lookup needs no lock; Worker isolates cache its answer.
      return Response.json({ until: (await this.ctx.storage.get<number>("pausedUntil")) ?? 0 });
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      if (path === "/failure") return this.countFailures(await smallJson(request), now);
      if (path === "/failures") return Response.json({ failures: await this.failures(now) });
      if (path === "/pause") {
        const body = await smallJson(request);
        if (!body) return json("bad-request", 400);
        const until = body.until ?? now + DAY;
        if (
          typeof until !== "number" ||
          !Number.isSafeInteger(until) ||
          until < 0 ||
          until > now + 7 * DAY
        ) {
          return json("bad-request", 400);
        }
        await this.ctx.storage.put("pausedUntil", until);
        return Response.json({ until });
      }
      const pausedUntil = await this.ctx.storage.get<number>("pausedUntil");
      if (pausedUntil && pausedUntil > now) return paused(pausedUntil);
      if (path !== "/admit") return json("not-found", 404);
      const client = await request.text();
      if (!/^[\da-f]{4}$/u.test(client)) return json("bad-request", 400);
      const day = Math.floor(now / DAY);
      const hour = Math.floor(now / HOUR);
      const previous = await this.ctx.storage.get<Usage>("usage");
      const clients = previous?.hour === hour ? previous.clients : {};
      const count = previous?.day === day ? previous.count : 0;
      if (count >= 200 || (clients[client] ?? 0) >= 3) {
        return rateLimited(count >= 200 ? (day + 1) * DAY : (hour + 1) * HOUR);
      }
      clients[client] = (clients[client] ?? 0) + 1;
      await this.ctx.storage.transaction(async (storage) => {
        await storage.put("usage", { clients, count: count + 1, day, hour } satisfies Usage);
        await storage.setAlarm((hour + 1) * HOUR);
      });
      return json("live");
    });
  }

  /** The kept days' counts, dropping any older than {@link FAILURE_DAYS}. */
  private async failures(now: number): Promise<FailureCounts> {
    const oldest = utcDate(now - (FAILURE_DAYS - 1) * DAY);
    const stored = (await this.ctx.storage.get<FailureCounts>("failures")) ?? {};
    return Object.fromEntries(Object.entries(stored).filter(([date]) => date >= oldest));
  }

  /** Adds a batch of `{ kind: count }` to today, accepting only allowlisted kinds. */
  private async countFailures(
    batch: null | Record<string, unknown>,
    now: number,
  ): Promise<Response> {
    const entries = Object.entries(batch ?? {});
    // The allowlist is checked again here, so nothing else can reach storage under this key.
    if (
      entries.length === 0 ||
      !entries.every(
        ([kind, count]) =>
          isFailureKind(kind) &&
          Number.isSafeInteger(count) &&
          (count as number) > 0 &&
          (count as number) <= MAX_FAILURE_BATCH,
      )
    ) {
      return json("bad-request", 400);
    }
    const failures = await this.failures(now);
    const today = utcDate(now);
    const counts = { ...failures[today] };
    for (const [kind, count] of entries as [FailureKind, number][]) {
      counts[kind] = (counts[kind] ?? 0) + count;
    }
    failures[today] = counts;
    const pruneAt = RelayControl.pruneAt(failures);
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put("failures", failures);
      const alarm = await storage.getAlarm();
      if (alarm === null || alarm > pruneAt) await storage.setAlarm(pruneAt);
    });
    return new Response(null, { status: 204 });
  }

  /** When the oldest kept day's counts fall out of the {@link FAILURE_DAYS} window. */
  private static pruneAt(failures: FailureCounts): number {
    const oldest = Math.min(...Object.keys(failures).map((date) => Date.parse(date)));
    return oldest + FAILURE_DAYS * DAY;
  }

  alarm(): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const usage = await this.ctx.storage.get<Usage>("usage");
      if (usage && usage.hour < Math.floor(Date.now() / HOUR)) {
        // The global daily counter survives; the previous hour's shared buckets do not.
        await this.ctx.storage.put("usage", {
          ...usage,
          clients: {},
          hour: Math.floor(Date.now() / HOUR),
        });
      }
      // Drop counts past the window even when no failure or admin read comes along to do it.
      const stored = await this.ctx.storage.get<FailureCounts>("failures");
      if (stored) {
        const failures = await this.failures(Date.now());
        if (Object.keys(failures).length === 0) {
          await this.ctx.storage.delete("failures");
        } else {
          await this.ctx.storage.put("failures", failures);
          await this.ctx.storage.setAlarm(RelayControl.pruneAt(failures));
        }
      }
    });
  }
}
