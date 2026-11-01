/**
 * The side effects of sharing a code & leaving a lane: the relay requests, & the writes that
 * record their results. Each write lands before the request that depends on it, so a code appears
 * only once its mailbox exists, & a code is retired only once the write that stopped it landed.
 */
import { userState } from "#lib/stores/user-state.svelte.js";
import { ensureTurnstileScript } from "#lib/turnstile.js";

import {
  createRelayClient,
  openFollowKey,
  pendingRetireFor,
  retirePending,
  shareNewCode,
} from "./follow.js";
import { readSavePayload, stampOf } from "./read-save.js";

import type {
  FollowKey,
  OpenResult,
  RelayClient,
  RelayFailure,
  RetireResult,
  SharedCode,
  ShareResult,
} from "./follow.js";
import type { ReadSave } from "./read-save.js";

/**
 * The dedicated invisible Turnstile widget for mailbox creation, with the relay's `sync-create`
 * action (`relay/README.md` § Maintainer launch). It's separate from the feedback widget, and its
 * site key is public.
 */
const SYNC_TURNSTILE_SITE_KEY = "0x4AAAAAAFtIVmbS8YY4O4dt";
const SYNC_TURNSTILE_ACTION = "sync-create";

let relay: RelayClient = createRelayClient();

/** Swaps the relay client, for tests. */
export function setRelayClient(client: RelayClient): void {
  relay = client;
}

/** The relay client sharing & following use, which the receiver reads through too. */
export function relayClient(): RelayClient {
  return relay;
}

/** Runs the invisible widget once & resolves with its token. */
export async function syncTurnstileToken(): Promise<string> {
  await ensureTurnstileScript();
  const turnstile = globalThis.turnstile;
  if (!turnstile) throw new Error("Turnstile unavailable");
  const container = document.createElement("div");
  container.hidden = true;
  document.body.append(container);
  let widgetId: string | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      widgetId = turnstile.render(container, {
        action: SYNC_TURNSTILE_ACTION,
        callback: resolve,
        "error-callback": (code) => {
          reject(new Error(`Turnstile failed: ${code}`));
        },
        "expired-callback": () => {
          reject(new Error("Turnstile expired"));
        },
        sitekey: SYNC_TURNSTILE_SITE_KEY,
      });
    });
  } finally {
    if (widgetId !== undefined) turnstile.remove(widgetId);
    container.remove();
  }
}

let turnstileToken: () => Promise<string> = syncTurnstileToken;

/** Swaps the Turnstile token source, for tests. */
export function setTurnstileTokenSource(source: () => Promise<string>): void {
  turnstileToken = source;
}

const FIRST_RETIRE_RETRY_MS = 5000;
const MAX_RETIRE_RETRY_MS = 5 * 60_000;

let retireTimer: ReturnType<typeof setTimeout> | undefined;
let retireDelay = FIRST_RETIRE_RETRY_MS;
/** Attempts run one at a time, so a retire queued meanwhile is tried after the one under way. */
let retiring: Promise<void> = Promise.resolve();
/** Bumped by {@link keepRetiring}'s stop, so an attempt still under way schedules nothing after. */
let retireGeneration = 0;
/** The pending mailboxes this tab last knew of, so another tab's new retire wakes the retries. */
let knownPending = "";

function pendingIds(): string {
  return userState.syncPendingRetires
    .map(({ mailboxId }) => mailboxId)
    .toSorted()
    .join(",");
}

/**
 * How long to wait before trying the failures again, or `undefined` when no retry can help: the
 * relay refused every one, so only the next visit tries them again.
 */
function retireWait(failures: readonly RetireResult[]): number | undefined {
  if (failures.length > 0 && failures.every(({ kind }) => kind === "refused")) return undefined;
  let wait = retireDelay;
  for (const failure of failures) {
    if (failure.kind === "rate-limited" && failure.retryAfterSeconds !== undefined) {
      wait = Math.max(wait, failure.retryAfterSeconds * 1000);
    } else if (failure.kind === "paused" && failure.until !== undefined) {
      wait = Math.max(wait, failure.until - Date.now());
    }
  }
  return Math.min(wait, MAX_RETIRE_RETRY_MS);
}

async function attemptRetires(): Promise<void> {
  const generation = retireGeneration;
  clearTimeout(retireTimer);
  retireTimer = undefined;
  const pending = userState.syncPendingRetires;
  let failures: RetireResult[] = [];
  if (pending.length > 0) {
    try {
      const results = await retirePending(relay, pending);
      const confirmed = pending.filter((_, index) => results[index]?.kind === "retired");
      failures = results.filter(({ kind }) => kind !== "retired");
      if (confirmed.length > 0) await userState.confirmRetired(confirmed);
    } catch {
      // The scheduled retry tries again.
    }
  }
  knownPending = pendingIds();
  if (generation !== retireGeneration) return;
  if (userState.syncPendingRetires.length === 0) {
    retireDelay = FIRST_RETIRE_RETRY_MS;
    return;
  }
  const wait = retireWait(failures);
  if (wait === undefined) return;
  // A leaked code keeps working until this lands, so it retries like an upload does.
  retireTimer = setTimeout(() => {
    void queueAttempt();
  }, wait);
  retireDelay = Math.min(retireDelay * 2, MAX_RETIRE_RETRY_MS);
}

/**
 * Retries every pending retire now, & forgets the ones the relay confirmed. Any still pending
 * retry with backoff for as long as the page stays open.
 */
export function retryPendingRetires(): Promise<void> {
  retireDelay = FIRST_RETIRE_RETRY_MS;
  return queueAttempt();
}

function queueAttempt(): Promise<void> {
  const previous = retiring;
  retiring = (async () => {
    await previous;
    try {
      await attemptRetires();
    } catch {
      // A failed attempt mustn't stop the ones queued behind it.
    }
  })();
  return retiring;
}

function retryOnline(): void {
  void retryPendingRetires();
}

/** Another tab queued a retire: this one tries it too, in case that tab closes first. */
function retryNewlyPending(): void {
  const ids = pendingIds();
  if (ids === knownPending) return;
  knownPending = ids;
  if (ids !== "") void retryPendingRetires();
}

/**
 * Retries pending retires now, whenever the browser comes back online, & whenever another tab
 * queues one. Returns what stops it.
 */
export function keepRetiring(): () => void {
  globalThis.addEventListener("online", retryOnline);
  // The store's own listener, added first, has already read the other tab's write.
  globalThis.addEventListener("storage", retryNewlyPending);
  retryOnline();
  return () => {
    globalThis.removeEventListener("online", retryOnline);
    globalThis.removeEventListener("storage", retryNewlyPending);
    retireGeneration += 1;
    clearTimeout(retireTimer);
    retireTimer = undefined;
  };
}

/**
 * Retires a mailbox this device created but couldn't store the code for, so no code nobody holds
 * stays live. Best effort: nobody has seen the code, so a failure leaves nothing reachable.
 */
async function abandon(code: SharedCode): Promise<void> {
  const { mailboxId, token } = await pendingRetireFor(code);
  await relay.retire(mailboxId, token);
}

/** The first code the computer lane shares; stored only once its mailbox exists. */
export async function shareCode(): Promise<ShareResult> {
  const result = await shareNewCode(relay, turnstileToken);
  if (result.kind !== "shared") return result;
  if (await userState.setSharedCode(result.code)) return result;
  await abandon(result.code);
  return { kind: "unreachable" };
}

/**
 * “Make a new code”: creates & stores the new code first, then retires the old one. If the new
 * one can't be made, the old one keeps working.
 */
export async function makeNewCode(): Promise<ShareResult> {
  const lane = userState.syncLane;
  const old = lane?.kind === "computer" ? lane.code : undefined;
  const result = await shareNewCode(relay, turnstileToken);
  if (result.kind !== "shared") return result;
  const replaced = old ? { code: old, retire: await pendingRetireFor(old) } : undefined;
  if (!(await userState.setSharedCode(result.code, replaced))) {
    // The new code never stored (or another tab replaced the old one first), so whichever code is
    // stored keeps working.
    await abandon(result.code);
    return { kind: "unreachable" };
  }
  await retryPendingRetires();
  return result;
}

/**
 * “Stop syncing”: leaves the lane, keeping progress. On the computer, its code is queued to retire
 * in that same write & retired after it.
 */
export async function stopSyncing(): Promise<void> {
  const lane = userState.syncLane;
  const code = lane?.kind === "computer" ? lane.code : undefined;
  const stopped = code ? { code, retire: await pendingRetireFor(code) } : undefined;
  if (await userState.stopSyncing(stopped)) await retryPendingRetires();
}

/** The copy a failed share shows. */
export type ShareFailureCopy = "paused" | "too-many" | "unreachable";

export function shareFailureCopy(failure: RelayFailure): ShareFailureCopy {
  if (failure.kind === "paused") return "paused";
  if (failure.kind === "rate-limited") return "too-many";
  return "unreachable";
}

/** What following a code did. Anything but `applied` changed nothing on this device. */
export type FollowOutcome =
  | Exclude<OpenResult, { kind: "save" }>
  | { kind: "applied"; save: ReadSave }
  | { kind: "unreadable" };

/**
 * Follows a code: reads its latest save &, only if one is there & readable, starts the following
 * lane with it in one write that erases progress. Until then the key lives only in the page, so a
 * fetch that fails, an empty mailbox, or a retired code leaves the device exactly as it was. The
 * erase also waits on `stillWanted`, so a player who left the page meanwhile keeps their progress.
 */
export async function followCode(
  key: FollowKey,
  stillWanted: () => boolean = () => true,
): Promise<FollowOutcome> {
  const opened = await openFollowKey(relay, key);
  if (opened.kind !== "save") return opened;
  let save: ReadSave;
  try {
    save = await readSavePayload(opened.payload);
  } catch {
    return { kind: "unreadable" };
  }
  // A player who left setup while the fetch ran never sees their progress erased.
  if (!stillWanted()) return { kind: "unreachable" };
  const stamp = stampOf(save, { counter: opened.counter, mailboxId: opened.mailboxId });
  if (!(await userState.startSyncLane({ key, kind: "following" }, save, stillWanted, stamp))) {
    return { kind: "unreachable" };
  }
  return { kind: "applied", save };
}

/**
 * Switches a following device to another code without leaving its lane. The next save applies
 * with the usual rules, so this only checks the code can be read before switching.
 */
export async function switchCode(
  key: FollowKey,
  stillWanted: () => boolean = () => true,
): Promise<FollowOutcome> {
  const opened = await openFollowKey(relay, key);
  if (opened.kind !== "save") return opened;
  let save: ReadSave;
  try {
    save = await readSavePayload(opened.payload);
  } catch {
    return { kind: "unreadable" };
  }
  // Checked again inside the write lock, so leaving while it waits switches nothing.
  if (!stillWanted() || !(await userState.switchFollowKey(key, stillWanted))) {
    return { kind: "unreachable" };
  }
  return { kind: "applied", save };
}
