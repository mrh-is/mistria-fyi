/**
 * Receiving saves: one tab leads (a held Web Lock), listens to the followed mailbox, & applies each
 * new save through the store's single write path. The gaming computer's courier hands its own saves
 * to {@link Receiver.applyLocalSave}, which takes the same path without the relay. See
 * `docs/sync.md` § Followers.
 *
 * Nothing here writes. The store settles each save inside its write lock, against the progress as it
 * stands then, & advances the receipt in that same write; a crash before it applies the latest
 * envelope again on the next open, & one after it skips that envelope by the receipt. A quarantined
 * store or a newer build's data is never applied to, & never unblocked from here, so whatever the
 * courier uploads is unaffected.
 */
import { receiptCovers } from "#lib/engine/sync-apply.js";
import { updateHolds } from "#lib/pwa/update-holds.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import { syncDiagnostics } from "./diagnostics.js";
import {
  deriveFollowKeys,
  FOLLOW_PROTOCOL_VERSION,
  isFollowKey,
  openEnvelopeRead,
  subscribeToMailbox,
} from "./follow.js";
import { readSaveFile, readSavePayload, stampOf } from "./read-save.js";
import { relayClient } from "./sharing.js";

import type { SyncAnswer, SyncResult } from "#lib/engine/sync-apply.js";
import type {
  SyncApplyOutcome,
  SyncApplyQuestion,
  SyncApplyRequest,
} from "#lib/stores/user-state.svelte.js";

import type { FollowKeys, MailboxSubscriber, ReadResult } from "./follow.js";
import type { ReadSave } from "./read-save.js";

/** Held for as long as a tab leads. A queued tab takes over when the holder's page goes away. */
export const RECEIVER_LOCK = "mistria-fyi:sync-receiver";
/** Tells other tabs what the leader sees, & carries their answers back to it. */
export const RECEIVER_CHANNEL = "mistria-fyi:sync-receiver";

const FIRST_RETRY_MS = 5000;
const MAX_RETRY_MS = 5 * 60_000;

/** What the device's sync is up to, in the terms its status button & notices need. */
export type ReceiverStatus =
  | { kind: "asking"; questions: SyncApplyQuestion[] }
  | {
      kind:
        | "blocked"
        | "idle"
        | "paused"
        | "retired"
        | "switch-failed"
        | "unreachable"
        | "unreadable"
        | "up-to-date"
        | "update-computer"
        | "update-here"
        | "waiting"
        | "write-failed";
    };

/** What an applied save leaves to tell the player. */
export interface SyncTell {
  applied: boolean;
  kept: boolean;
  /** Set on a farm switch: the outgoing farm's name, `null` when it had none. */
  switchedFrom?: { farmName: null | string };
}

export type LocalSaveResult = "unreadable" | SyncApplyOutcome["kind"];

export interface ReceiverOptions {
  channel?: () => BroadcastChannel | undefined;
  locks?: () => LockManager | undefined;
  /** Called on any change to {@link Receiver.status}. */
  onstatus?: (status: ReceiverStatus) => void;
  /** Called once for each applied save with something to tell, in every open tab. */
  ontell?: (tell: SyncTell) => void;
  /** Called when another tab has shown the tells, so this one needn't. */
  ontellsshown?: () => void;
  /** Reads the mailbox once. */
  read?: (mailboxId: string) => Promise<ReadResult>;
  subscribe?: (mailboxId: string, subscriber: MailboxSubscriber) => () => void;
}

export interface Receiver {
  /** Answers a question, applying the save once none is left. */
  answer: (id: string, answer: SyncAnswer) => Promise<void>;
  /**
   * Applies the computer's own save through the same path as a follower's. It never throws, so a
   * failed apply can't hold the courier's upload back.
   */
  applyLocalSave: (file: File) => Promise<LocalSaveResult>;
  /** Reads the mailbox again now, for “Try again” & a page coming back into view. */
  refresh: () => void;
  /** Starts queueing for the lock. Without Web Locks it never leads, so it never applies. */
  start: () => void;
  readonly status: ReceiverStatus;
  /** Lets go of the lock, the socket, & any save waiting on a question. */
  stop: () => void;
  /** Tells other tabs the tells held so far have reached the player. */
  tellsShown: () => void;
  /** Tells the receiver the lane, the store's state, or the receipt may have changed. */
  update: () => void;
}

/** A read save waiting to apply, which a newer one replaces. */
interface Pending {
  request: Pick<SyncApplyRequest, "gameDate" | "modified" | "receipt" | "wantsLane">;
  save: ReadSave;
}

type ChannelMessage =
  | { type: "answer"; answer: SyncAnswer; id: string }
  | { type: "hello" }
  | { type: "refresh" }
  | { type: "status"; status: ReceiverStatus }
  | { type: "tell"; tell: SyncTell }
  | { type: "tells-shown" };

function defaultChannel(): BroadcastChannel | undefined {
  return "BroadcastChannel" in globalThis ? new BroadcastChannel(RECEIVER_CHANNEL) : undefined;
}

function defaultLocks(): LockManager | undefined {
  const { navigator } = globalThis as { navigator?: { locks?: LockManager } };
  return navigator?.locks;
}

function tellOf(result: SyncResult, outgoingFarm: null | string): SyncTell | undefined {
  const applied = result.differences.some(
    ({ applied: wrote, policy }) => wrote && policy === "apply-and-tell",
  );
  const kept = result.differences.some(({ policy }) => policy === "keep-local-and-tell");
  if (!applied && !kept && !result.farmSwitch) return undefined;
  return {
    applied,
    kept,
    ...(result.farmSwitch ? { switchedFrom: { farmName: outgoingFarm } } : {}),
  };
}

export function createReceiver({
  channel: openChannel = defaultChannel,
  locks: lockManager = defaultLocks,
  onstatus,
  ontell,
  ontellsshown,
  read = (mailboxId) => relayClient().read(mailboxId),
  subscribe = subscribeToMailbox,
}: ReceiverOptions = {}): Receiver {
  let status: ReceiverStatus = { kind: "idle" };
  let leading = false;
  let release: (() => void) | undefined;
  let abort: AbortController | undefined;
  let channel: BroadcastChannel | undefined;

  /** The key being listened to; a change of lane or code makes everything in flight stale. */
  let listening: string | undefined;
  let generation = 0;
  let keys: FollowKeys | undefined;
  let closeSocket: (() => void) | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = FIRST_RETRY_MS;
  let retired = false;
  let lastReceipt: unknown;

  let pending: Pending | undefined;
  let answers: Record<string, SyncAnswer> = {};
  /** Trouble a read found while a question waited. */
  let afterQuestion: ReceiverStatus | undefined;
  /** An envelope that couldn't be read isn't read again until the page reloads with a new build. */
  let unreadable: string | undefined;
  /** Serializes everything that reads or applies, so the latest save always goes last. */
  let queue: Promise<void> = Promise.resolve();

  function enqueue(task: () => Promise<void>): Promise<void> {
    const previous = queue;
    queue = (async () => {
      try {
        await previous;
      } catch {
        // A failed task doesn't stop the ones behind it.
      }
      await task();
    })();
    return queue;
  }

  function setStatus(next: ReceiverStatus): void {
    if (next.kind !== status.kind) syncDiagnostics.status(next.kind);
    status = next;
    onstatus?.(next);
    post({ type: "status", status: next });
  }

  /** Trouble a read found. A waiting question stays up, & the trouble comes out once it settles. */
  function reportTrouble(next: ReceiverStatus): void {
    if (pending) afterQuestion = next;
    else setStatus(next);
  }

  /** The waiting save has settled, so the status is whatever the latest read found. */
  function reportSettled(): void {
    setStatus(afterQuestion ?? { kind: "up-to-date" });
    afterQuestion = undefined;
  }

  function post(message: ChannelMessage): void {
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel's `postMessage` has no target origin
      channel?.postMessage(message);
    } catch {
      // A closed channel only costs other tabs a status they can read again.
    }
  }

  function clearRetry(): void {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function disconnect(): void {
    clearRetry();
    closeSocket?.();
    closeSocket = undefined;
  }

  function scheduleRetry(): void {
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

  async function handleRead(result: ReadResult, current: number): Promise<void> {
    if (current !== generation) return;
    switch (result.kind) {
      case "empty":
        if (!pending) setStatus({ kind: "waiting" });
        return;
      case "paused":
      case "unreachable":
        if (!pending) setStatus({ kind: result.kind });
        return;
      case "rate-limited":
        if (!pending) setStatus({ kind: "unreachable" });
        return;
      // A mailbox that's gone is as good as retired: only a new code can bring this device back.
      case "absent":
      case "retired":
        retired = true;
        disconnect();
        // Nobody will write here again, but a question about its last save still stands.
        reportTrouble({ kind: "retired" });
        return;
      case "envelope":
        await handleEnvelope(result, current);
    }
  }

  async function handleEnvelope(
    envelope: Extract<ReadResult, { kind: "envelope" }>,
    current: number,
  ): Promise<void> {
    if (envelope.version !== FOLLOW_PROTOCOL_VERSION) {
      reportTrouble({
        kind: envelope.version < FOLLOW_PROTOCOL_VERSION ? "update-computer" : "update-here",
      });
      return;
    }
    const opening = keys;
    if (!opening) return;
    const { counter } = envelope;
    const { mailboxId } = opening;
    const placeholder = { counter, hash: "", mailboxId };
    if (receiptCovers(userState.syncReceipt, placeholder)) {
      if (!pending) setStatus({ kind: "up-to-date" });
      return;
    }
    // The save a question is about, read again by the socket's first message, or an older one.
    const waiting = pending?.request.receipt;
    if (waiting?.mailboxId === mailboxId && (waiting.counter ?? 0) >= counter) return;
    const attempt = `${mailboxId}:${counter}`;
    if (unreadable === attempt) {
      reportTrouble({ kind: "unreadable" });
      return;
    }

    const opened = await openEnvelopeRead(opening, envelope);
    if (current !== generation) return;
    if (opened.kind !== "save") {
      unreadable = attempt;
      reportTrouble({ kind: "unreadable" });
      return;
    }
    let save: ReadSave;
    try {
      save = await readSavePayload(opened.payload);
    } catch {
      unreadable = attempt;
      if (current === generation) reportTrouble({ kind: "unreadable" });
      return;
    }
    if (current !== generation) return;
    const followed = listening;
    afterQuestion = undefined;
    pending = {
      request: {
        ...stampOf(save, { counter, mailboxId }),
        wantsLane: (lane) => lane?.kind === "following" && lane.key === followed,
      },
      save,
    };
    await applyPending();
  }

  /** Tries the waiting save with the answers so far; the store decides what that does. */
  async function applyPending(): Promise<SyncApplyOutcome["kind"] | undefined> {
    if (!pending) return undefined;
    const { request, save } = pending;
    const outgoingFarm = userState.state.lastImport?.farmName ?? null;
    const outgoingPlayer = userState.state.lastImport?.playerName;
    const lane = userState.syncLane;
    const privateValues = [
      outgoingFarm,
      outgoingPlayer,
      request.receipt.mailboxId,
      lane?.kind === "following" ? lane.key : lane?.code?.key,
      lane?.kind === "computer" ? lane.code?.token : undefined,
    ];
    let outcome: SyncApplyOutcome;
    // An app update's reload waits until the apply has landed.
    const releaseHold = updateHolds.hold();
    try {
      outcome = await userState.applySyncedSave({
        ...request,
        answers,
        extraction: save.extraction,
        metadata: save.metadata,
      });
    } catch {
      outcome = { kind: "write-failed" };
    } finally {
      releaseHold();
    }
    // Optional diagnostics must not delay the receiver's status, tells, or next queued save.
    void syncDiagnostics.record(save, outcome, privateValues);
    // A newer save arrived behind this one; it takes its own turn on the queue.
    const isWaiting = (): boolean => pending?.save === save;
    if (!isWaiting() && outcome.kind !== "applied") return outcome.kind;
    switch (outcome.kind) {
      case "ask":
        setStatus({ kind: "asking", questions: outcome.questions });
        return outcome.kind;
      case "applied": {
        if (isWaiting()) pending = undefined;
        answers = {};
        reportSettled();
        const tell = tellOf(outcome.result, outgoingFarm);
        if (tell) {
          post({ type: "tell", tell });
          ontell?.(tell);
        }
        return outcome.kind;
      }
      case "skipped":
        pending = undefined;
        answers = {};
        reportSettled();
        return outcome.kind;
      case "stale":
        pending = undefined;
        return outcome.kind;
      case "blocked":
      case "switch-failed":
      case "write-failed":
        setStatus({ kind: outcome.kind });
        return outcome.kind;
    }
  }

  async function readMailbox(mailboxId: string): Promise<ReadResult> {
    try {
      return await read(mailboxId);
    } catch {
      return { kind: "unreachable" };
    }
  }

  function connect(): void {
    if (!leading || !keys || closeSocket) return;
    const current = generation;
    const { mailboxId } = keys;
    void enqueue(async () => {
      if (current !== generation) return;
      await handleRead(await readMailbox(mailboxId), current);
    });
    if (retired) return;
    closeSocket = subscribe(mailboxId, {
      onclose: () => {
        if (current !== generation) return;
        closeSocket = undefined;
        if (!retired) scheduleRetry();
      },
      onpush: (push) => {
        if (current !== generation) return;
        retryDelay = FIRST_RETRY_MS;
        void enqueue(() => handleRead(push, current));
      },
    });
  }

  function listen(key: string): void {
    const current = ++generation;
    listening = key;
    keys = undefined;
    afterQuestion = undefined;
    answers = {};
    pending = undefined;
    retired = false;
    unreadable = undefined;
    retryDelay = FIRST_RETRY_MS;
    disconnect();
    void enqueue(async () => {
      if (!isFollowKey(key)) return;
      const derived = await deriveFollowKeys(key);
      if (current !== generation) return;
      keys = derived;
      connect();
    });
  }

  function stopListening(): void {
    generation++;
    listening = undefined;
    keys = undefined;
    afterQuestion = undefined;
    answers = {};
    pending = undefined;
    disconnect();
  }

  function update(): void {
    const lane = userState.syncLane;
    const receipt = userState.syncReceipt;
    const receiptCleared = lastReceipt !== undefined && receipt === undefined;
    lastReceipt = receipt;
    if (!leading) return;
    if (lane?.kind !== "following") {
      if (listening !== undefined) stopListening();
      // A computer's own question stays up until it's answered, or the lane ends.
      if (lane === undefined) {
        afterQuestion = undefined;
        answers = {};
        pending = undefined;
      }
      if (!pending && status.kind !== "idle") setStatus({ kind: "idle" });
      return;
    }
    if (userState.syncBlocked) {
      stopListening();
      setStatus({ kind: "blocked" });
      return;
    }
    if (listening !== lane.key) {
      listen(lane.key);
    } else if (receiptCleared) {
      // A reset removed the receipt, so the latest save file applies again.
      refresh();
    }
  }

  function refresh(): void {
    if (pending) {
      void enqueue(async () => {
        await applyPending();
      });
    } else if (!leading) {
      // The leader holds the socket & the note this tab is showing.
      post({ type: "refresh" });
    }
    if (!leading || !keys) return;
    retryDelay = FIRST_RETRY_MS;
    clearRetry();
    closeSocket?.();
    closeSocket = undefined;
    connect();
  }

  function answer(id: string, value: SyncAnswer): Promise<void> {
    if (!pending) {
      // Another tab holds the save this question is about.
      post({ type: "answer", answer: value, id });
      return Promise.resolve();
    }
    answers[id] = value;
    return enqueue(async () => {
      await applyPending();
    });
  }

  async function lead(locks: LockManager, signal: AbortSignal): Promise<void> {
    try {
      await locks.request(RECEIVER_LOCK, { signal }, () => {
        if (signal.aborted) return undefined;
        leading = true;
        update();
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      });
    } catch {
      // Aborted by `stop` while queued, or the lock isn't available in this frame.
    }
  }

  function handleMessage({ data }: MessageEvent<ChannelMessage>): void {
    switch (data.type) {
      case "answer":
        if (pending) void answer(data.id, data.answer);
        return;
      case "hello":
        if (leading || pending) post({ type: "status", status });
        return;
      case "status":
        if (pending || leading) return;
        status = data.status;
        onstatus?.(status);
        return;
      case "refresh":
        if (leading) refresh();
        return;
      case "tell":
        ontell?.(data.tell);
        return;
      case "tells-shown":
        ontellsshown?.();
    }
  }

  return {
    start() {
      const locks = lockManager();
      if (!locks || abort) return;
      channel = openChannel();
      channel?.addEventListener("message", handleMessage);
      post({ type: "hello" });
      abort = new AbortController();
      void lead(locks, abort.signal);
    },
    answer,
    async applyLocalSave(file) {
      let result: LocalSaveResult = "blocked";
      await enqueue(async () => {
        let save: ReadSave;
        try {
          save = await readSaveFile(file);
        } catch {
          result = "unreadable";
          syncDiagnostics.status("unreadable");
          return;
        }
        // Replace in arrival order, even when the writer skips this file by its receipt. That
        // skip must also retire any older pending save & question before a queued answer runs.
        pending = {
          request: { ...stampOf(save), wantsLane: (lane) => lane?.kind === "computer" },
          save,
        };
        result = (await applyPending()) ?? "skipped";
      });
      return result;
    },
    refresh,
    get status() {
      return status;
    },
    stop() {
      abort?.abort();
      abort = undefined;
      release?.();
      release = undefined;
      leading = false;
      stopListening();
      channel?.removeEventListener("message", handleMessage);
      channel?.close();
      channel = undefined;
      status = { kind: "idle" };
      onstatus?.(status);
    },
    tellsShown() {
      post({ type: "tells-shown" });
    },
    update,
  };
}
