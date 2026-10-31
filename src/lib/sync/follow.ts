/**
 * Following a save file through one long-lived code: the follow link, the keys it derives, the
 * sealed envelope, & the relay's mailbox API. See `docs/sync.md` § The follow link, § Mailboxes, &
 * § Following.
 *
 * The link is `https://mistria.fyi/sync#<key>`; the key never reaches a server. HKDF-SHA-256 over
 * the key derives the mailbox ID, the only part the relay sees, & the AES-GCM sealing key. Version 1
 * pins that suite with no negotiation; a different suite means a new protocol version.
 *
 * Building & parsing the link each go through one function ({@link buildFollowLink} &
 * {@link parseFollowLink}), so a change to the link's form changes only them.
 */
import * as v from "valibot";

/** The protocol version every envelope authenticates; the relay's `X-Sync-Version`. */
export const FOLLOW_PROTOCOL_VERSION = 1;

/** The production origin a follow link names. */
export const FOLLOW_LINK_ORIGIN = "https://mistria.fyi";

/** The sync page's path, unprefixed: the bare-path stub picks the locale & keeps the fragment. */
export const FOLLOW_LINK_PATH = "/sync";

/** The relay's origin; `connect-src` allows it for HTTPS & WSS. */
export const RELAY_ORIGIN = "https://relay.mistria.fyi";

const KEY_BYTES = 32;
const WRITE_TOKEN_BYTES = 32;
const MAILBOX_ID_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export const MAILBOX_ID_INFO = "mistria-follow v1 id";
export const SEAL_KEY_INFO = "mistria-follow v1 seal";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------------------------
// Encoding

export function toBase64url(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/[=]+$/, "");
}

/**
 * Decodes canonical base64url of exactly `length` bytes, or `undefined`. Canonical means it
 * re-encodes to the same text, so one key has one spelling.
 */
export function fromBase64url(text: string, length: number): Uint8Array<ArrayBuffer> | undefined {
  if (!BASE64URL.test(text)) return undefined;
  let binary: string;
  try {
    binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  } catch {
    return undefined;
  }
  const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
  if (bytes.length !== length || toBase64url(bytes) !== text) return undefined;
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

// ---------------------------------------------------------------------------------------------
// The follow link

/** A follow key: 32 random bytes as 43 characters of base64url. */
export type FollowKey = string & { readonly __followKey: unique symbol };

/** A relay write token: 256 random bits as 43 characters of base64url. */
export type WriteToken = string;

/** A mailbox ID: the derived 128 bits as 22 characters of base64url. */
export type MailboxId = string;

export function generateFollowKey(): FollowKey {
  return toBase64url(randomBytes(KEY_BYTES)) as FollowKey;
}

export function generateWriteToken(): WriteToken {
  return toBase64url(randomBytes(WRITE_TOKEN_BYTES));
}

/** Whether `text` is a well-formed follow key. */
export function isFollowKey(text: string): text is FollowKey {
  return fromBase64url(text, KEY_BYTES) !== undefined;
}

/** The link a code holds. `origin` is the production site's, unless a preview shares its own. */
export function buildFollowLink(key: FollowKey, origin: string = FOLLOW_LINK_ORIGIN): string {
  return `${origin}${FOLLOW_LINK_PATH}#${key}`;
}

/**
 * The key in a scanned, pasted, or opened link, or `undefined` when it isn't a follow link. A
 * pasted link may leave off its scheme, & the path may carry a locale prefix (`/ja/sync`), since
 * the address bar shows one once the page opens. Any host is accepted: the key alone decides which
 * mailbox opens, so a preview's link works on that preview.
 */
export function parseFollowLink(text: string): FollowKey | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (url.search !== "") return undefined;
  if (!/^(?:\/[A-Za-z-]+)?\/sync\/?$/.test(url.pathname)) return undefined;
  const key = url.hash.slice(1);
  return isFollowKey(key) ? key : undefined;
}

// ---------------------------------------------------------------------------------------------
// Keys

/** What a follow key derives: the raw bytes, for the fixed-vector tests & the AES key import. */
export interface FollowSecrets {
  mailboxId: Uint8Array<ArrayBuffer>;
  sealKey: Uint8Array<ArrayBuffer>;
}

/** What a follow key derives, ready to use. */
export interface FollowKeys {
  mailboxId: MailboxId;
  /** The mailbox ID's raw bytes, which the additional data authenticates. */
  mailboxIdBytes: Uint8Array<ArrayBuffer>;
  sealKey: CryptoKey;
}

async function hkdf(
  key: Uint8Array<ArrayBuffer>,
  info: string,
  bytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey("raw", key, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      info: new TextEncoder().encode(info),
      name: "HKDF",
      salt: new Uint8Array(0),
    },
    material,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/** HKDF-SHA-256 over the key, with an empty salt: the mailbox ID & the sealing key's bytes. */
export async function deriveFollowSecrets(key: FollowKey): Promise<FollowSecrets> {
  const raw = fromBase64url(key, KEY_BYTES);
  if (raw === undefined) throw new Error("Malformed follow key");
  return {
    mailboxId: await hkdf(raw, MAILBOX_ID_INFO, MAILBOX_ID_BYTES),
    sealKey: await hkdf(raw, SEAL_KEY_INFO, 32),
  };
}

export async function deriveFollowKeys(key: FollowKey): Promise<FollowKeys> {
  const secrets = await deriveFollowSecrets(key);
  const sealKey = await crypto.subtle.importKey("raw", secrets.sealKey, "AES-GCM", false, [
    "decrypt",
    "encrypt",
  ]);
  return {
    mailboxId: toBase64url(secrets.mailboxId),
    mailboxIdBytes: secrets.mailboxId,
    sealKey,
  };
}

/** The mailbox ID alone, for a retire that holds only the key. */
export async function mailboxIdFor(key: FollowKey): Promise<MailboxId> {
  const { mailboxId } = await deriveFollowSecrets(key);
  return toBase64url(mailboxId);
}

// ---------------------------------------------------------------------------------------------
// The envelope

/** What each envelope authenticates beside its ciphertext. */
export interface EnvelopeContext {
  counter: number;
  version: number;
}

/**
 * The additional data: the protocol version (u16), the mailbox ID's 16 bytes, & the counter (u64),
 * big-endian. An envelope sealed for one mailbox, version, or counter won't open as another.
 */
export function envelopeAdditionalData(
  mailboxIdBytes: Uint8Array<ArrayBuffer>,
  { counter, version }: EnvelopeContext,
): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(counter) || counter < 1) throw new Error("Invalid envelope counter");
  if (!Number.isInteger(version) || version < 0 || version > 0xff_ff) {
    throw new Error("Invalid envelope version");
  }
  if (mailboxIdBytes.length !== MAILBOX_ID_BYTES) throw new Error("Invalid mailbox ID");
  const data = new Uint8Array(2 + MAILBOX_ID_BYTES + 8);
  const view = new DataView(data.buffer);
  view.setUint16(0, version);
  data.set(mailboxIdBytes, 2);
  view.setBigUint64(2 + MAILBOX_ID_BYTES, BigInt(counter));
  return data;
}

/** Seals `plaintext`: a random 96-bit nonce, then the AES-GCM ciphertext & its tag. */
export async function sealEnvelope(
  keys: FollowKeys,
  context: EnvelopeContext,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    {
      additionalData: envelopeAdditionalData(keys.mailboxIdBytes, context),
      iv: nonce,
      name: "AES-GCM",
    },
    keys.sealKey,
    plaintext,
  );
  const envelope = new Uint8Array(NONCE_BYTES + ciphertext.byteLength);
  envelope.set(nonce);
  envelope.set(new Uint8Array(ciphertext), NONCE_BYTES);
  return envelope;
}

/** An envelope that fails authentication: tampered, truncated, or sealed for another mailbox. */
export class EnvelopeError extends Error {
  override name = "EnvelopeError";
}

export async function openEnvelope(
  keys: FollowKeys,
  context: EnvelopeContext,
  envelope: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (envelope.length < NONCE_BYTES + TAG_BYTES) throw new EnvelopeError("Envelope too short");
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        additionalData: envelopeAdditionalData(keys.mailboxIdBytes, context),
        iv: envelope.subarray(0, NONCE_BYTES),
        name: "AES-GCM",
      },
      keys.sealKey,
      envelope.subarray(NONCE_BYTES),
    );
    return new Uint8Array(plaintext);
  } catch (error) {
    throw new EnvelopeError("Envelope failed authentication", { cause: error });
  }
}

// ---------------------------------------------------------------------------------------------
// The payload inside an envelope

/** What travels inside the ciphertext beside the save, never beside it. */
export interface SavePayloadHeader {
  /** The save file's name, e.g. `game-1315159680-autosave.sav`. */
  fileName: string;
  /** The save file's modification time, in Unix milliseconds. */
  modified: number;
  /** The save's in-game playtime, when the courier could read it. */
  playtime?: number;
}

export interface SavePayload {
  header: SavePayloadHeader;
  /** The pruned save, in the save's own container format. */
  save: Uint8Array<ArrayBuffer>;
}

const SavePayloadHeaderSchema = v.strictObject({
  fileName: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  modified: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  playtime: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
});

/** The plaintext: the header's JSON length (u32, big-endian), its UTF-8 JSON, then the save. */
export function encodeSavePayload({ header, save }: SavePayload): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(v.parse(SavePayloadHeaderSchema, header)));
  const payload = new Uint8Array(4 + json.length + save.length);
  new DataView(payload.buffer).setUint32(0, json.length);
  payload.set(json, 4);
  payload.set(save, 4 + json.length);
  return payload;
}

export function decodeSavePayload(plaintext: Uint8Array<ArrayBuffer>): SavePayload {
  if (plaintext.length < 4) throw new EnvelopeError("Payload too short");
  const view = new DataView(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength);
  const length = view.getUint32(0);
  if (4 + length > plaintext.length) throw new EnvelopeError("Payload header overruns");
  let header: unknown;
  try {
    header = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(plaintext.subarray(4, 4 + length)),
    );
  } catch (error) {
    throw new EnvelopeError("Payload header unreadable", { cause: error });
  }
  const parsed = v.safeParse(SavePayloadHeaderSchema, header);
  if (!parsed.success) throw new EnvelopeError("Payload header invalid");
  return { header: parsed.output, save: plaintext.slice(4 + length) };
}

// ---------------------------------------------------------------------------------------------
// The relay

/** Why a relay request didn't do what was asked, in the terms the setup copy needs. */
export type RelayFailure =
  | { kind: "paused"; until?: number }
  | { kind: "rate-limited"; retryAfterSeconds?: number }
  | { kind: "unreachable" };

export type CreateResult =
  | RelayFailure
  | { kind: "conflict" }
  | { kind: "created" }
  | { kind: "retired" };

export type ReadResult =
  | RelayFailure
  | { counter: number; envelope: Uint8Array<ArrayBuffer>; kind: "envelope"; version: number }
  | { kind: "absent" }
  | { kind: "empty" }
  | { kind: "retired" };

export type RetireResult = RelayFailure | { kind: "retired" };

export interface RelayClient {
  create: (mailboxId: MailboxId, token: WriteToken, turnstile: string) => Promise<CreateResult>;
  read: (mailboxId: MailboxId) => Promise<ReadResult>;
  retire: (mailboxId: MailboxId, token: WriteToken) => Promise<RetireResult>;
}

async function stateOf(response: Response): Promise<{ state?: unknown; until?: unknown }> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

async function failureOf(response: Response): Promise<RelayFailure> {
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("Retry-After"));
    return Number.isFinite(retryAfter) && retryAfter > 0
      ? { kind: "rate-limited", retryAfterSeconds: retryAfter }
      : { kind: "rate-limited" };
  }
  if (response.status === 503) {
    const body = await stateOf(response);
    if (body.state === "paused") {
      return typeof body.until === "number"
        ? { kind: "paused", until: body.until }
        : { kind: "paused" };
    }
  }
  return { kind: "unreachable" };
}

/** The relay's wire contract (`relay/README.md` § Wire contract) as plain results. */
export function createRelayClient(
  origin: string = RELAY_ORIGIN,
  fetcher: typeof fetch = (...args) => fetch(...args),
): RelayClient {
  const mailboxUrl = (id: MailboxId) => `${origin}/v1/mailboxes/${id}`;
  async function send(url: string, init: RequestInit): Promise<Response | undefined> {
    try {
      return await fetcher(url, { cache: "no-store", credentials: "omit", ...init });
    } catch {
      return undefined;
    }
  }

  return {
    async create(mailboxId, token, turnstile) {
      const response = await send(mailboxUrl(mailboxId), {
        body: JSON.stringify({ turnstile }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST",
      });
      if (response === undefined) return { kind: "unreachable" };
      if (response.status === 200 || response.status === 201) return { kind: "created" };
      if (response.status === 409) return { kind: "conflict" };
      if (response.status === 410) return { kind: "retired" };
      return failureOf(response);
    },
    async read(mailboxId) {
      const response = await send(mailboxUrl(mailboxId), { method: "GET" });
      if (response === undefined) return { kind: "unreachable" };
      if (response.status === 404) return { kind: "absent" };
      if (response.status === 410) return { kind: "retired" };
      if (response.status !== 200) return failureOf(response);
      if (response.headers.get("Content-Type")?.startsWith("application/octet-stream")) {
        const counter = Number(response.headers.get("X-Sync-Counter"));
        const version = Number(response.headers.get("X-Sync-Version"));
        if (!Number.isSafeInteger(counter) || counter < 1 || !Number.isInteger(version)) {
          return { kind: "unreachable" };
        }
        const envelope = new Uint8Array(await response.arrayBuffer());
        return { counter, envelope, kind: "envelope", version };
      }
      const body = await stateOf(response);
      return body.state === "empty" ? { kind: "empty" } : { kind: "unreachable" };
    },
    async retire(mailboxId, token) {
      const response = await send(mailboxUrl(mailboxId), {
        headers: { Authorization: `Bearer ${token}` },
        method: "DELETE",
      });
      if (response === undefined) return { kind: "unreachable" };
      // A `410` is also a terminal acknowledgment: an earlier attempt landed.
      if (response.status === 200 || response.status === 410) return { kind: "retired" };
      return failureOf(response);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Sharing & opening

/** A code this device shares: its key & the write token only this device holds. */
export interface SharedCode {
  key: FollowKey;
  token: WriteToken;
}

export type ShareResult = RelayFailure | { code: SharedCode; kind: "shared" };

/** How many fresh keys a share tries when a mailbox ID is already someone else's. */
const SHARE_ATTEMPTS = 3;

/**
 * Makes a new code & creates its mailbox. The code exists only once that succeeds, so nobody can
 * hold a code whose mailbox someone else could claim. An ID already held under another token (or
 * retired) means a fresh key, silently, since nobody has seen this one yet.
 */
export async function shareNewCode(
  relay: RelayClient,
  turnstile: () => Promise<string>,
  attemptsLeft = SHARE_ATTEMPTS,
): Promise<ShareResult> {
  if (attemptsLeft <= 0) return { kind: "unreachable" };
  const key = generateFollowKey();
  const token = generateWriteToken();
  let challenge: string;
  try {
    challenge = await turnstile();
  } catch {
    return { kind: "unreachable" };
  }
  const result = await relay.create(await mailboxIdFor(key), token, challenge);
  if (result.kind === "created") return { code: { key, token }, kind: "shared" };
  if (result.kind === "conflict" || result.kind === "retired") {
    return shareNewCode(relay, turnstile, attemptsLeft - 1);
  }
  return result;
}

export type OpenResult =
  | RelayFailure
  | { counter: number; kind: "save"; mailboxId: MailboxId; payload: SavePayload }
  | { kind: "empty" }
  | { kind: "invalid" }
  | { kind: "retired" }
  | { kind: "unsupported-version"; version: number };

/**
 * Reads the latest save behind a key. Only reads: opening a link spends nothing & writes nothing,
 * here or on the relay. `invalid` covers a mailbox that never existed & an envelope that fails
 * authentication, tampered or replayed under another mailbox ID.
 */
export async function openFollowKey(relay: RelayClient, key: FollowKey): Promise<OpenResult> {
  const keys = await deriveFollowKeys(key);
  const read = await relay.read(keys.mailboxId);
  switch (read.kind) {
    case "absent":
      return { kind: "invalid" };
    case "empty":
    case "paused":
    case "rate-limited":
    case "retired":
    case "unreachable":
      return read;
    case "envelope":
      return openEnvelopeRead(keys, read);
  }
}

async function openEnvelopeRead(
  keys: FollowKeys,
  read: Extract<ReadResult, { kind: "envelope" }>,
): Promise<OpenResult> {
  if (read.version !== FOLLOW_PROTOCOL_VERSION) {
    return { kind: "unsupported-version", version: read.version };
  }
  try {
    const plaintext = await openEnvelope(
      keys,
      { counter: read.counter, version: read.version },
      read.envelope,
    );
    return {
      counter: read.counter,
      kind: "save",
      mailboxId: keys.mailboxId,
      payload: decodeSavePayload(plaintext),
    };
  } catch (error) {
    if (error instanceof EnvelopeError) return { kind: "invalid" };
    throw error;
  }
}

/** A code waiting to be retired: only what the relay needs, never the key that reads it. */
export interface PendingRetire {
  mailboxId: MailboxId;
  token: WriteToken;
}

/** What a code leaves behind once it stops: its mailbox & write token. */
export async function pendingRetireFor(code: {
  readonly key: string;
  readonly token: WriteToken;
}): Promise<PendingRetire> {
  if (!isFollowKey(code.key)) throw new Error("Malformed follow key");
  return { mailboxId: await mailboxIdFor(code.key), token: code.token };
}

/**
 * Retires every pending code, & reports the ones the relay confirmed. A retire that can't
 * reach the relay stays pending for the next try; a pause doesn't hold one back, since retiring
 * bypasses it.
 */
export async function retirePending(
  relay: RelayClient,
  pending: readonly PendingRetire[],
): Promise<PendingRetire[]> {
  const results = await Promise.all(
    pending.map((retire) => relay.retire(retire.mailboxId, retire.token)),
  );
  return pending.filter((_, index) => results[index]?.kind === "retired");
}
