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
  SharedCode,
  ShareResult,
} from "./follow.js";
import type { ReadSave } from "./read-save.js";

/**
 * The invisible Turnstile widget for mailbox creation, with the relay's `sync-create` action. This
 * is Cloudflare's always-passing invisible test key until launch (#291) swaps in the dedicated
 * widget's key (`relay/README.md` § Maintainer launch).
 */
const SYNC_TURNSTILE_SITE_KEY = "1x00000000000000000000BB";
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

/** Retries every pending retire once, & forgets the ones the relay confirmed. */
export async function retryPendingRetires(): Promise<void> {
  const pending = userState.syncPendingRetires;
  if (pending.length === 0) return;
  const confirmed = await retirePending(relay, pending);
  if (confirmed.length > 0) await userState.confirmRetired(confirmed);
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
