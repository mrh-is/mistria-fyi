interface Env {
  ADMIN_TOKEN: string;
  CONTROL: DurableObjectNamespace;
  CREATE_RATE: RateLimit;
  IP_RATE_SECRET: string;
  MAILBOXES: DurableObjectNamespace;
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
const encoder = new TextEncoder();

function json(state: string, status = 200): Response {
  return Response.json({ state }, { status });
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

async function clientHandle(ip: string, secret: string): Promise<string> {
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
    encoder.encode(`sync-create:${Math.floor(Date.now() / HOUR)}:${ip}`),
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.search) return json("bad-request", 400);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/v1/admin/pause" && request.method === "PUT") {
    if (
      !env.ADMIN_TOKEN ||
      !(await sameSecret(request.headers.get("Authorization") ?? "", `Bearer ${env.ADMIN_TOKEN}`))
    ) {
      return json("forbidden", 403);
    }
    return control(env).fetch(
      new Request("https://control/pause", { body: request.body, method: "PUT" }),
    );
  }
  const match = /^\/v1\/mailboxes\/([A-Za-z0-9_-]{22})(\/envelope)?$/u.exec(url.pathname);
  if (!match) return json("not-found", 404);
  const create = request.method === "POST" && !match[2];
  const upload = request.method === "PUT" && match[2] === "/envelope";
  const read = request.method === "GET" && !match[2];
  const retire = request.method === "DELETE" && !match[2];
  if (!create && !upload && !read && !retire) return json("method-not-allowed", 405);
  if (!read && !bearer(request)) return json("unauthorized", 401);
  const headers = new Headers();
  for (const name of [
    "Authorization",
    "Content-Type",
    "X-Sync-Version",
    "X-Sync-Counter",
    "If-None-Match",
    "Upgrade",
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (create || upload) {
    const gate = await control(env).fetch("https://control/gate");
    if (!gate.ok) return gate;
  }
  if (create) {
    if (!env.IP_RATE_SECRET || !env.TURNSTILE_SECRET || !env.TURNSTILE_HOSTNAME) {
      return json("unavailable", 503);
    }
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip) return json("bad-request", 400);
    const limit = await env.CREATE_RATE.limit({ key: ip });
    if (!limit.success) return json("rate-limited", 429);
    headers.set("X-Relay-Client", await clientHandle(ip, env.IP_RATE_SECRET));
  }
  const stub = env.MAILBOXES.get(env.MAILBOXES.idFromName(match[1]));
  // Never forward the client address, cookies, URLs with query strings, or incidental headers.
  let action = "read";
  if (create) action = "create";
  if (upload) action = "upload";
  if (retire) action = "retire";
  return stub.fetch(
    new Request(`https://mailbox/${action}`, {
      body: read ? undefined : request.body,
      headers,
      method: request.method,
    }),
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    let response: Response;
    try {
      response = await route(request, env);
    } catch {
      // No request, error, address, token, or payload logging, including unexpected failures.
      response = json("unavailable", 503);
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Sync-Version, X-Sync-Counter, If-None-Match",
    );
    headers.set(
      "Access-Control-Expose-Headers",
      "ETag, X-Sync-Version, X-Sync-Counter, Retry-After",
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
    // A bounded Siteverify fetch & small bodies keep this below the runtime's 30 s lock limit.
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
    const verified = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      body: new URLSearchParams({ response: body.turnstile, secret: this.env.TURNSTILE_SECRET }),
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (!verified.ok) return json("unavailable", 503);
    const result: { action?: string; hostname?: string; success?: boolean } = await verified.json();
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
    if (request.headers.get("X-Sync-Version") !== "1") return json("unsupported-version", 400);
    const rawCounter = request.headers.get("X-Sync-Counter") ?? "";
    const counter = Number(rawCounter);
    if (!/^[1-9]\d{0,15}$/u.test(rawCounter) || !Number.isSafeInteger(counter)) {
      return json("bad-request", 400);
    }
    if (request.headers.get("Content-Type") !== "application/octet-stream") {
      return json("bad-request", 400);
    }
    if (counter < meta.counter) return json("stale-counter", 409);
    const bytes = await bodyBytes(request, MAX_ENVELOPE);
    if (!bytes) return json("too-large", 413);
    // AES-GCM's 96-bit nonce & 128-bit tag are part of the opaque body.
    if (bytes.byteLength < 28) return json("bad-request", 400);
    const digest = await hash(bytes);
    if (counter === meta.counter) {
      return digest === meta.digest ? json("stored") : json("counter-conflict", 409);
    }
    const now = Date.now();
    const day = Math.floor(now / DAY);
    const count = day === meta.uploadDay ? meta.uploadCount : 0;
    if (now < meta.lastUpload + MINUTE || count >= 60) return json("rate-limited", 429);
    const next: LiveMailbox = {
      ...meta,
      counter,
      digest,
      lastUpload: now,
      uploadCount: count + 1,
      uploadDay: day,
    };
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put({ envelope: bytes, meta: next });
      await storage.setAlarm(now + ENVELOPE_TTL);
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
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(
        bytes ? Mailbox.envelopeMessage(meta, bytes) : JSON.stringify({ state: "empty" }),
      );
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (!bytes) return json("empty");
    const headers = {
      "Content-Type": "application/octet-stream",
      ETag: `"${meta.counter}-${meta.digest}"`,
      "X-Sync-Counter": String(meta.counter),
      "X-Sync-Version": "1",
    };
    if (request.headers.get("If-None-Match") === headers.ETag) {
      return new Response(null, { headers, status: 304 });
    }
    return new Response(bytes, { headers });
  }

  private static envelopeMessage(meta: LiveMailbox, bytes: ArrayBuffer): string {
    // A loop avoids spreading a 256 KiB array onto the JavaScript call stack.
    let binary = "";
    for (const byte of new Uint8Array(bytes)) binary += String.fromCodePoint(byte);
    return JSON.stringify({
      counter: meta.counter,
      envelope: btoa(binary),
      state: "envelope",
      version: 1,
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

  private async tombstone(): Promise<void> {
    await this.ctx.storage.transaction(async (storage) => {
      await storage.put("meta", { retired: true });
      await storage.delete("envelope");
      await storage.deleteAlarm();
    });
    this.broadcast(JSON.stringify({ state: "retired" }), true);
  }

  alarm(): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const meta = await this.ctx.storage.get<MailboxMeta>("meta");
      if (!meta || meta.retired) return;
      const now = Date.now();
      const retireAt = Math.max(meta.lastUpload, meta.createdAt) + MAILBOX_TTL;
      if (now >= retireAt) {
        await this.tombstone();
      } else {
        const expiresAt = meta.lastUpload + ENVELOPE_TTL;
        if (now >= expiresAt) {
          await this.ctx.storage.delete("envelope");
          this.broadcast(JSON.stringify({ state: "empty" }));
        }
        await this.ctx.storage.setAlarm(now < expiresAt ? expiresAt : retireAt);
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

  fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const path = new URL(request.url).pathname;
      const now = Date.now();
      if (path === "/pause") {
        const body = await smallJson(request);
        if (!body) return json("bad-request", 400);
        const until = body.until ?? now + DAY;
        if (typeof until !== "number" || !Number.isSafeInteger(until) || until < 0) {
          return json("bad-request", 400);
        }
        await this.ctx.storage.put("pausedUntil", until);
        return Response.json({ until });
      }
      const pausedUntil = await this.ctx.storage.get<number>("pausedUntil");
      if (pausedUntil && pausedUntil > now) {
        return Response.json(
          { state: "paused", until: pausedUntil },
          {
            headers: { "Retry-After": String(Math.ceil((pausedUntil - now) / 1000)) },
            status: 503,
          },
        );
      }
      if (path === "/gate") return json("live");
      if (path !== "/admit") return json("not-found", 404);
      const client = await request.text();
      if (!/^[\da-f]{64}$/u.test(client)) return json("bad-request", 400);
      const day = Math.floor(now / DAY);
      const hour = Math.floor(now / HOUR);
      const previous = await this.ctx.storage.get<Usage>("usage");
      const clients = previous?.hour === hour ? previous.clients : {};
      const count = previous?.day === day ? previous.count : 0;
      if (count >= 200 || (clients[client] ?? 0) >= 3) return json("rate-limited", 429);
      clients[client] = (clients[client] ?? 0) + 1;
      await this.ctx.storage.transaction(async (storage) => {
        await storage.put("usage", { clients, count: count + 1, day, hour } satisfies Usage);
        await storage.setAlarm((hour + 1) * HOUR);
      });
      return json("live");
    });
  }

  alarm(): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const usage = await this.ctx.storage.get<Usage>("usage");
      if (usage && usage.hour < Math.floor(Date.now() / HOUR)) {
        // The global daily counter survives; unlinkable hourly handles do not.
        await this.ctx.storage.put("usage", {
          ...usage,
          clients: {},
          hour: Math.floor(Date.now() / HOUR),
        });
      }
    });
  }
}
