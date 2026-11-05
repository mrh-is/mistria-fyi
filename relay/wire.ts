/**
 * The relay's wire contract, which `relay/worker.ts` & `src/lib/sync/follow.ts` both import. See
 * `relay/README.md` § Wire contract.
 *
 * The relay & the app deploy separately, so sharing this source can't stop a running pair from
 * disagreeing. A mismatch still has to reach the player as “update”, through `unsupported-version`.
 *
 * Nothing here may import from either side: this file is bundled into both.
 */

/** The protocol version every envelope authenticates, sent as {@link SYNC_VERSION_HEADER}. */
export const FOLLOW_PROTOCOL_VERSION = 1;

export const SYNC_COUNTER_HEADER = "X-Sync-Counter";
export const SYNC_VERSION_HEADER = "X-Sync-Version";

export const ENVELOPE_CONTENT_TYPE = "application/octet-stream";

const MAILBOXES_PATH = "/v1/mailboxes";
const ENVELOPE_SUFFIX = "/envelope";

/** Captures the mailbox ID, then the envelope suffix when the path has one. */
export const MAILBOX_ROUTE = /^\/v1\/mailboxes\/([A-Za-z0-9_-]{22})(\/envelope)?$/u;

/** Whether a {@link MAILBOX_ROUTE} match named the envelope. */
export function isEnvelopeSuffix(suffix: string | undefined): boolean {
  return suffix === ENVELOPE_SUFFIX;
}

export function mailboxPath(mailboxId: string): string {
  return `${MAILBOXES_PATH}/${mailboxId}`;
}

export function envelopePath(mailboxId: string): string {
  return `${mailboxPath(mailboxId)}${ENVELOPE_SUFFIX}`;
}

/** Every `state` a relay response or push can carry. */
export type RelayState =
  | "bad-request"
  | "conflict"
  | "counter-conflict"
  | "empty"
  | "envelope"
  | "forbidden"
  | "live"
  | "method-not-allowed"
  | "not-found"
  | "paused"
  | "rate-limited"
  | "retired"
  | "stale-counter"
  | "stored"
  | "too-large"
  | "unauthorized"
  | "unavailable"
  | "unsupported-version";

/** What the relay pushes over a mailbox's socket, with the envelope in standard base64. */
export type MailboxPushMessage =
  | { counter: number; envelope: string; state: "envelope"; version: number }
  | { state: "empty" }
  | { state: "retired" };
