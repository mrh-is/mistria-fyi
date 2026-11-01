/**
 * The gaming computer's side of sync: it watches the save, applies each new one to this device's own
 * tracker, &, once a code is shared, prunes, seals, & uploads it. See `docs/sync.md` § The courier.
 *
 * Applying & uploading run side by side & neither waits on the other, so a question behind the
 * fullscreen game, a blocked store, or a failed apply never holds an upload back. The upload counter
 * & the last upload live under their own storage key, for the same reason.
 *
 * Every read, apply, & upload attempt takes its turn on one queue, under an update hold, so a waiting
 * app update reloads the page right after an upload lands & never during one.
 */
import * as v from "valibot";

import { pruneSavArchive } from "#lib/engine/parse-sav.js";
import { updateHolds } from "#lib/pwa/update-holds.js";
import { SYNC_UPLOADS_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";

import { syncDiagnostics } from "./diagnostics.svelte.js";
import {
  deriveFollowKeys,
  encodeSavePayload,
  FOLLOW_PROTOCOL_VERSION,
  isFollowKey,
  mailboxIdFor,
  sealEnvelope,
  toBase64url,
} from "./follow.js";
import { readSaveFile } from "./read-save.js";
import { fileOf, indexedDbHandleStore } from "./save-source.js";
import { makeNewCode, relayClient } from "./sharing.js";

import type { SyncLogEvent } from "#lib/feedback/sync-log-schema.js";
import type { UpdateHolds } from "#lib/pwa/update-holds.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type {
  MailboxId,
  RelayClient,
  RelayFailure,
  SavePayloadHeader,
  SealedEnvelope,
  ShareResult,
} from "./follow.js";
import type { LocalSaveResult } from "./receiver.js";
import type { SaveFileHandle, SaveHandleStore, SaveSource } from "./save-source.js";

/** Held for as long as a window is the profile's courier. */
export const COURIER_LOCK = "mistria-fyi:sync-courier";

/** How often the courier checks a watched file, in case its observer missed something. */
export const BACKSTOP_POLL_MS = 60_000;
/** How long a burst of observer records has to settle into one read. */
const COALESCE_MS = 500;
/** How many polls in a row must find no file before the player hears about it. */
const MOVED_AFTER_FAILED_POLLS = 2;
/** The longest any one step may hold up the queue, & an update's reload with it. */
const TASK_TIMEOUT_MS = 60_000;
const FIRST_RETRY_MS = 5000;
const MAX_RETRY_MS = 5 * 60_000;

/** What the sync log records about an upload: the relay's answer, & nothing it was sent. */
export type UploadLogOutcome = Extract<
  SyncLogEvent["outcome"],
  | "code-renewed"
  | "upload-paused"
  | "upload-rate-limited"
  | "upload-too-large"
  | "upload-unreachable"
  | "uploaded"
>;

/** The results a retry can hit over & over while the relay is away, which are logged once a run. */
const WAITS: ReadonlySet<UploadLogOutcome> = new Set<UploadLogOutcome>([
  "upload-paused",
  "upload-rate-limited",
  "upload-unreachable",
]);

/** What needs the player. Only one thing at a time does. */
export type CourierTrouble = "moved" | "other-window" | "reallow" | "unreadable";

export interface CourierStatus {
  /** Sharing's old code had expired, so the courier made a new one (`sync_link_expired`). */
  codeRenewed: boolean;
  /** The save file it last read. */
  fileName: string | undefined;
  /**
   * `watched` is a held handle; `file` only lasts this visit; `none` waits for a save file; & `unknown`
   * hasn't looked yet, or another window has it.
   */
  source: "file" | "none" | "unknown" | "watched";
  trouble: CourierTrouble | undefined;
  upload: "idle" | "paused" | "unreachable";
}

export const IDLE_COURIER: CourierStatus = {
  codeRenewed: false,
  fileName: undefined,
  source: "unknown",
  trouble: undefined,
  upload: "idle",
};

/** The parts of `FileSystemObserver`, which TypeScript's DOM library doesn't have yet, that it uses. */
export interface SaveObserver {
  disconnect: () => void;
  observe: (handle: SaveFileHandle) => Promise<void>;
}

export type SaveObserverConstructor = new (
  callback: (records: readonly { type: string }[]) => void,
) => SaveObserver;

export interface CourierOptions {
  /** Applies a save to this device's own tracker. It must not throw. */
  applyLocal: (file: File) => Promise<LocalSaveResult>;
  coalesceMs?: number;
  firstRetryMs?: number;
  handles?: SaveHandleStore;
  holds?: Pick<UpdateHolds, "hold">;
  locks?: () => LockManager | undefined;
  /** Records an upload's result in the sync log. */
  log?: (outcome: UploadLogOutcome) => void;
  observer?: () => SaveObserverConstructor | undefined;
  onstatus?: (status: CourierStatus) => void;
  pollMs?: number;
  relay?: () => RelayClient;
  /** Makes a new code once the old one turns out to be retired. */
  renewCode?: () => Promise<ShareResult>;
  taskTimeoutMs?: number;
}

export interface Courier {
  /** Reads the current save now, for showing a code: uploads it if it changed or the mailbox is empty. */
  check: () => Promise<void>;
  /** Asks the browser for read access again. Must run inside the player's click. */
  reallow: () => Promise<void>;
  /** Tries whatever's waiting again now, for “Try again”, coming back online or into view. */
  retry: () => void;
  /** Starts acting on the lane, which {@link Courier.update} keeps it told about. */
  start: () => void;
  readonly status: CourierStatus;
  /** Lets go of the lock, the observer, & every timer. */
  stop: () => void;
  /**
   * Takes a dropped, pasted, or chosen save file as the one to follow, leading from this window even
   * if another one was. Resolves once it's been read, applied, & uploaded (or queued to retry).
   */
  take: (source: SaveSource) => Promise<void>;
  /** Tells the courier the lane, its code, or the receipt may have changed. */
  update: () => void;
}

const UploadLedgerSchema = v.object({
  /**
   * The shared code, copied from the lane. A store that loads quarantined or from a newer build can't
   * show its lane, & this is what keeps uploads going until it's sorted out.
   */
  code: v.optional(v.object({ key: v.string(), token: v.string() })),
  /** The highest counter ever reserved, in any mailbox. */
  counter: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  hash: v.optional(v.string()),
  mailboxId: v.optional(v.string()),
});
type UploadLedger = v.InferOutput<typeof UploadLedgerSchema>;

function readLedger(): UploadLedger {
  const stored = tryGetItem(SYNC_UPLOADS_STORAGE_KEY);
  if (!stored.ok || stored.value === null) return { counter: 0 };
  try {
    const parsed = v.safeParse(UploadLedgerSchema, JSON.parse(stored.value));
    return parsed.success ? parsed.output : { counter: 0 };
  } catch {
    return { counter: 0 };
  }
}

function writeLedger(ledger: UploadLedger): void {
  trySetItem(SYNC_UPLOADS_STORAGE_KEY, JSON.stringify(ledger));
}

/** A save file's bytes, pinned, so what's applied & what's uploaded can't differ. */
interface SaveRead {
  file: File;
  hash: string;
}

/** A save on its way to the relay. A retry resends these exact bytes under the same counter. */
interface PendingUpload {
  conflicted: boolean;
  hash: string;
  header: SavePayloadHeader;
  pruned: Uint8Array<ArrayBuffer>;
  sealed?: SealedEnvelope & { mailboxId: MailboxId; token: string };
  /** An attempt's answer was lost, so the mailbox may already hold this save. */
  uncertain: boolean;
}

type ReadMode = "change" | "check" | "force";

function nameOf(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function defaultLocks(): LockManager | undefined {
  const { navigator } = globalThis as { navigator?: { locks?: LockManager } };
  return navigator?.locks;
}

function defaultObserver(): SaveObserverConstructor | undefined {
  return (globalThis as { FileSystemObserver?: SaveObserverConstructor }).FileSystemObserver;
}

function sharedCode(): DeepReadonly<{ key: string; token: string }> | undefined {
  const lane = userState.syncLane;
  if (lane?.kind === "computer") return lane.code;
  return userState.syncBlocked ? readLedger().code : undefined;
}

/** Keeps the ledger's copy of the code in step with the lane, while the lane can be read. */
function mirrorCode(): void {
  const lane = userState.syncLane;
  if (lane?.kind !== "computer" && userState.syncBlocked) return;
  const code = lane?.kind === "computer" ? lane.code : undefined;
  const ledger = readLedger();
  if (code?.key === ledger.code?.key && code?.token === ledger.code?.token) return;
  const { code: _old, ...rest } = ledger;
  writeLedger(code ? { ...rest, code: { key: code.key, token: code.token } } : rest);
}

/** `work`'s result, or `fallback` if it hasn't settled in time. Rejections pass through. */
async function within<T>(work: Promise<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function createCourier({
  applyLocal,
  coalesceMs = COALESCE_MS,
  firstRetryMs = FIRST_RETRY_MS,
  handles = indexedDbHandleStore,
  holds = updateHolds,
  locks: lockManager = defaultLocks,
  log: record = (outcome) => {
    syncDiagnostics.status(outcome);
  },
  observer: observerClass = defaultObserver,
  onstatus,
  pollMs = BACKSTOP_POLL_MS,
  relay = relayClient,
  renewCode = makeNewCode,
  taskTimeoutMs = TASK_TIMEOUT_MS,
}: CourierOptions): Courier {
  let status: CourierStatus = IDLE_COURIER;
  let started = false;
  let inLane = false;
  /** Running on the ledger's copy of the code, with no lane to read. */
  let blockedLane = false;

  // Leading: `attempts` orphans any lock request a newer decision replaced.
  let leading = false;
  let seeking = false;
  let attempts = 0;
  let abort: AbortController | undefined;
  let release: (() => void) | undefined;
  let leadArrived: (() => void) | undefined;

  // Bumped whenever leading ends, so anything still running can't act on what it found.
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();

  let source: SaveSource | undefined;
  /** Each {@link Courier.take} under way, & which is the newest. */
  let taking = 0;
  let latestTake = 0;
  let watcher: SaveObserver | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let coalesceTimer: ReturnType<typeof setTimeout> | undefined;
  let failedPolls = 0;
  let lastHash: string | undefined;
  let fingerprint: undefined | { modified: number; size: number };

  let codeKey: string | undefined;
  let lastReceipt: unknown;
  let pending: PendingUpload | undefined;
  let highestCounter = 0;
  /** A look at the mailbox couldn't finish, so the retry looks again. */
  let recheck = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = firstRetryMs;
  /** The last upload result logged, so a retry that has to wait the same way again isn't. */
  let lastLogged: undefined | UploadLogOutcome;

  function setStatus(next: Partial<CourierStatus>): void {
    status = { ...status, ...next };
    onstatus?.(status);
  }

  function log(outcome: UploadLogOutcome): void {
    if (outcome === lastLogged && WAITS.has(outcome)) return;
    lastLogged = outcome;
    try {
      record(outcome);
    } catch {
      // Diagnostics must never hold up an upload.
    }
  }

  function enqueue(task: () => Promise<void>): Promise<void> {
    const current = generation;
    const previous = queue;
    queue = (async () => {
      await previous;
      if (current !== generation) return;
      const releaseHold = holds.hold();
      try {
        await task();
      } catch {
        // A failed task doesn't stop the ones behind it; the next read or retry starts over.
      } finally {
        releaseHold();
      }
    })();
    return queue;
  }

  // -------------------------------------------------------------------------------------------
  // Watching

  function stopWatching(): void {
    watcher?.disconnect();
    watcher = undefined;
    clearInterval(pollTimer);
    pollTimer = undefined;
    clearTimeout(coalesceTimer);
    coalesceTimer = undefined;
  }

  function startPolling(): void {
    if (pollTimer !== undefined || source?.kind !== "handle") return;
    pollTimer = setInterval(() => {
      void enqueue(poll);
    }, pollMs);
  }

  /** Starts a new observer if there's none. Only a successful read gets here. */
  function observe(): void {
    if (watcher || source?.kind !== "handle") return;
    const Observer = observerClass();
    if (!Observer) return;
    const made = new Observer((records) => {
      if (watcher === made) handleRecords(records, made);
    });
    watcher = made;
    void startObserving(made, source.handle);
  }

  async function startObserving(made: SaveObserver, handle: SaveFileHandle): Promise<void> {
    try {
      await made.observe(handle);
    } catch {
      // A later read tries again.
      if (watcher === made) dropObserver(made);
    }
  }

  function dropObserver(ended: SaveObserver): void {
    ended.disconnect();
    watcher = undefined;
  }

  function handleRecords(records: readonly { type: string }[], from: SaveObserver): void {
    let changed = false;
    for (const { type } of records) {
      // `appeared` is the usual one: the game replaces its save rather than rewriting it.
      if (type === "appeared" || type === "modified" || type === "moved" || type === "unknown") {
        changed = true;
      }
      // An ended observer reports nothing again, even once the file's back. A `disappeared` file
      // may just be the replacement's brief gap, so that one keeps watching.
      if (type === "errored") dropObserver(from);
    }
    if (!changed || coalesceTimer !== undefined) return;
    coalesceTimer = setTimeout(() => {
      coalesceTimer = undefined;
      void enqueue(() => readAndHandle("change"));
    }, coalesceMs);
  }

  /** The file is there: whatever the last failed read reported is over, & watching can resume. */
  function noteFile(file: File): void {
    failedPolls = 0;
    fingerprint = { modified: file.lastModified, size: file.size };
    if (status.trouble === "moved" || status.trouble === "reallow") {
      setStatus({ trouble: undefined });
    }
    observe();
  }

  function noteNoAccess(error: unknown): boolean {
    if (nameOf(error) !== "NotAllowedError") return false;
    setStatus({ trouble: "reallow" });
    return true;
  }

  async function poll(): Promise<void> {
    if (source?.kind !== "handle") return;
    const current = generation;
    let file: File;
    try {
      file = await source.handle.getFile();
    } catch (error) {
      if (current !== generation || noteNoAccess(error)) return;
      failedPolls += 1;
      if (failedPolls >= MOVED_AFTER_FAILED_POLLS) setStatus({ trouble: "moved" });
      return;
    }
    if (current !== generation) return;
    const same = file.size === fingerprint?.size && file.lastModified === fingerprint.modified;
    if (same) noteFile(file);
    else await readAndHandle("change");
  }

  // -------------------------------------------------------------------------------------------
  // Reading

  async function readSource(): Promise<SaveRead | undefined> {
    if (!source) return undefined;
    const current = generation;
    try {
      const file = await fileOf(source);
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      if (current !== generation) return undefined;
      noteFile(file);
      return {
        file: new File([bytes], file.name, { lastModified: file.lastModified }),
        hash: toBase64url(new Uint8Array(digest)),
      };
    } catch (error) {
      // No file is the game's replacement mid-swap until the polls say otherwise.
      if (current === generation) noteNoAccess(error);
      return undefined;
    }
  }

  async function readAndHandle(mode: ReadMode): Promise<void> {
    const current = generation;
    const read = await readSource();
    if (!read || current !== generation) return;
    const changed = read.hash !== lastHash;
    lastHash = read.hash;
    if (!changed && mode === "change") return;
    if (read.file.name !== status.fileName) setStatus({ fileName: read.file.name });
    const [applied, prunable] = await Promise.all([
      applyHere(read.file),
      uploadHere(read, mode === "check"),
    ]);
    if (current !== generation) return;
    setStatus({ trouble: applied === "unreadable" || !prunable ? "unreadable" : undefined });
  }

  async function applyHere(file: File): Promise<LocalSaveResult> {
    // A store that can't show its lane is never applied to; the upload still goes.
    if (userState.syncLane?.kind !== "computer") return "blocked";
    try {
      return await within(applyLocal(file), "write-failed", taskTimeoutMs);
    } catch {
      return "write-failed";
    }
  }

  // -------------------------------------------------------------------------------------------
  // Uploading

  /** Reserves the next counter before it's used, so a crash can't send one twice with new bytes. */
  function nextCounter(): number {
    const ledger = readLedger();
    highestCounter = Math.max(highestCounter, ledger.counter) + 1;
    writeLedger({ ...ledger, counter: highestCounter });
    return highestCounter;
  }

  function clearRetry(): void {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  function scheduleRetry(afterMs?: number): void {
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void enqueue(retryWaiting);
    }, afterMs ?? retryDelay);
    if (afterMs === undefined) retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
  }

  /** A relay that said no for now: what the player sees, & when to ask again. */
  function waitOut(failure: RelayFailure): void {
    log(`upload-${failure.kind}`);
    switch (failure.kind) {
      case "paused":
        setStatus({ upload: "paused" });
        // It lifts by itself, so the retry waits for that, or at most the usual longest gap.
        scheduleRetry(
          failure.until === undefined
            ? MAX_RETRY_MS
            : Math.max(firstRetryMs, Math.min(failure.until - Date.now(), MAX_RETRY_MS)),
        );
        return;
      case "rate-limited":
        // Uploading about once a minute is the relay's own limit, not trouble worth showing.
        scheduleRetry(
          failure.retryAfterSeconds === undefined ? undefined : failure.retryAfterSeconds * 1000,
        );
        return;
      case "unreachable":
        setStatus({ upload: "unreachable" });
        scheduleRetry();
    }
  }

  async function retryWaiting(): Promise<void> {
    if (pending) {
      await send(pending);
    } else if (recheck) {
      recheck = false;
      await readAndHandle("check");
    }
  }

  /** Uploads this save if it's new to the mailbox. Resolves `false` only when it can't be pruned. */
  async function uploadHere(read: SaveRead, look: boolean): Promise<boolean> {
    const current = generation;
    const code = sharedCode();
    if (!code || !isFollowKey(code.key)) return true;
    const stillCurrent = (): boolean =>
      leading && current === generation && sharedCode()?.key === code.key;
    const mailboxId = await mailboxIdFor(code.key);
    if (!stillCurrent()) return true;
    const ledger = readLedger();
    if (ledger.hash === read.hash && ledger.mailboxId === mailboxId) {
      // The file went back to the last upload, so a newer save still retrying is out of date. If an
      // answer to that one was lost, the mailbox may hold it, so this save goes up again to be sure.
      const overtaken = pending?.uncertain === true;
      if (pending) {
        pending = undefined;
        retryDelay = firstRetryMs;
        clearRetry();
        setStatus({ upload: "idle" });
      }
      // Only a start or a shown code looks further: an envelope can expire with nothing changing.
      if (!overtaken && (!look || !(await mailboxWantsSave(mailboxId)))) return true;
    } else if (pending?.hash === read.hash && pending.sealed?.mailboxId === mailboxId) {
      // Already on its way; a newer read mustn't spend a new counter on the same save.
      await send(pending);
      return true;
    }
    if (!stillCurrent()) return true;
    let pruned: Uint8Array<ArrayBuffer>;
    try {
      pruned = await pruneSavArchive(read.file);
    } catch {
      return false;
    }
    if (!stillCurrent()) return true;
    let playtime: number | undefined;
    try {
      ({ playtime } = await readSaveFile(read.file));
    } catch {
      // A save this build can't read but can still prune goes up anyway, for a newer build.
    }
    if (!stillCurrent()) return true;
    pending = {
      conflicted: false,
      hash: read.hash,
      header: {
        fileName: read.file.name,
        modified: read.file.lastModified,
        ...(playtime === undefined ? {} : { playtime }),
      },
      pruned,
      uncertain: false,
    };
    await send(pending);
    return true;
  }

  async function mailboxWantsSave(mailboxId: MailboxId): Promise<boolean> {
    const current = generation;
    let answer: Awaited<ReturnType<RelayClient["read"]>>;
    try {
      answer = await relay().read(mailboxId);
    } catch {
      answer = { kind: "unreachable" };
    }
    if (current !== generation) return false;
    switch (answer.kind) {
      case "envelope":
        setStatus({ upload: "idle" });
        return false;
      case "paused":
      case "rate-limited":
      case "unreachable":
        recheck = true;
        waitOut(answer);
        return false;
      // An upload to a retired mailbox finds that out & makes the new code.
      case "absent":
      case "empty":
      case "retired":
        return true;
    }
  }

  function ownsUpload(upload: PendingUpload, current: number): boolean {
    return leading && current === generation && pending === upload;
  }

  async function seal(upload: PendingUpload, current: number): Promise<boolean> {
    const code = sharedCode();
    if (!code || !isFollowKey(code.key)) return false;
    const keys = await deriveFollowKeys(code.key);
    if (!ownsUpload(upload, current) || sharedCode()?.key !== code.key) return false;
    const counter = nextCounter();
    const version = FOLLOW_PROTOCOL_VERSION;
    const envelope = await sealEnvelope(
      keys,
      { counter, version },
      encodeSavePayload({ header: upload.header, save: upload.pruned }),
    );
    if (!ownsUpload(upload, current) || sharedCode()?.key !== code.key) return false;
    upload.sealed = { counter, envelope, mailboxId: keys.mailboxId, token: code.token, version };
    return true;
  }

  async function send(upload: PendingUpload): Promise<void> {
    const current = generation;
    if (!ownsUpload(upload, current)) return;
    if (!upload.sealed && !(await seal(upload, current))) return;
    if (!ownsUpload(upload, current)) return;
    const sealed = upload.sealed;
    if (!sealed) return;
    // Until the answer is known, the mailbox may stop holding the last confirmed save. Clear the
    // optional confirmation before sending so a crash or reload can't reuse that shortcut.
    const { hash, mailboxId, ...unconfirmed } = readLedger();
    writeLedger(unconfirmed);
    let result: Awaited<ReturnType<RelayClient["upload"]>>;
    try {
      result = await within(
        relay().upload(sealed.mailboxId, sealed.token, sealed),
        { kind: "unreachable" },
        taskTimeoutMs,
      );
    } catch {
      result = { kind: "unreachable" };
    }
    if (!ownsUpload(upload, current)) return;
    if (result.kind !== "stored" && result.kind !== "unreachable") {
      // A definite rejection changed nothing. Keep the previous confirmation, unless another
      // courier has reserved a newer counter while this request was away.
      const ledger = readLedger();
      if (ledger.counter === sealed.counter) writeLedger({ ...ledger, hash, mailboxId });
    }
    switch (result.kind) {
      case "stored":
        writeLedger({
          ...readLedger(),
          counter: Math.max(readLedger().counter, sealed.counter),
          hash: upload.hash,
          mailboxId: sealed.mailboxId,
        });
        pending = undefined;
        retryDelay = firstRetryMs;
        clearRetry();
        setStatus({ upload: "idle" });
        log("uploaded");
        return;
      case "unreachable":
        upload.uncertain = true;
        waitOut(result);
        return;
      case "paused":
      case "rate-limited":
        waitOut(result);
        return;
      case "conflict":
        await recoverCounter(upload, sealed);
        return;
      case "retired":
        await renewAndResend(upload);
        return;
      case "too-large":
        // Only a new save can help, so “Try again” reads the file once more.
        pending = undefined;
        recheck = true;
        setStatus({ upload: "unreachable" });
        log("upload-too-large");
    }
  }

  /**
   * The mailbox is ahead of this device's counter, so stored data was lost. The clock's reading is
   * above any counter a mailbox could have reached by counting, even when its envelope has expired.
   */
  async function recoverCounter(
    upload: PendingUpload,
    sealed: NonNullable<PendingUpload["sealed"]>,
  ): Promise<void> {
    if (upload.conflicted) {
      waitOut({ kind: "unreachable" });
      return;
    }
    upload.conflicted = true;
    highestCounter = Math.max(highestCounter, sealed.counter, Date.now());
    upload.sealed = undefined;
    await send(upload);
  }

  async function renewAndResend(upload: PendingUpload): Promise<void> {
    const current = generation;
    // Only a store that can be written can hold a new code, so trying would just burn mailboxes.
    if (userState.syncLane?.kind !== "computer" || userState.syncBlocked) {
      waitOut({ kind: "unreachable" });
      return;
    }
    const renewal = renewCode();
    void noteRenewal(renewal, current);
    let renewed: ShareResult;
    try {
      renewed = await within(renewal, { kind: "unreachable" }, taskTimeoutMs);
    } catch {
      renewed = { kind: "unreachable" };
    }
    if (current !== generation || pending !== upload) return;
    if (renewed.kind !== "shared") {
      waitOut(renewed);
      return;
    }
    codeKey = renewed.code.key;
    upload.sealed = undefined;
    await send(upload);
  }

  /**
   * Says a new code was made whenever that lands, even after its wait timed out: storing the code
   * sends `update` to upload under it, whatever the attempt that asked for it is doing by then.
   */
  async function noteRenewal(renewal: Promise<ShareResult>, current: number): Promise<void> {
    try {
      const renewed = await renewal;
      if (renewed.kind === "shared" && current === generation) {
        setStatus({ codeRenewed: true });
        log("code-renewed");
      }
    } catch {
      // The attempt that asked reports this one.
    }
  }

  // -------------------------------------------------------------------------------------------
  // Leading

  function sourceKind(): CourierStatus["source"] {
    if (source?.kind === "handle") return "watched";
    return source ? "file" : "none";
  }

  function endLead(): void {
    generation += 1;
    leading = false;
    release = undefined;
    stopWatching();
    clearRetry();
    pending = undefined;
    recheck = false;
    lastLogged = undefined;
    failedPolls = 0;
    fingerprint = undefined;
  }

  /** A stored handle only fills an empty place: a save file dropped meanwhile is the newer one. */
  function adoptStored(handle: SaveFileHandle): void {
    source ??= { handle, kind: "handle" };
  }

  function begin(): void {
    leading = true;
    seeking = false;
    abort = undefined;
    codeKey = sharedCode()?.key;
    void enqueue(async () => {
      const current = generation;
      if (!source) {
        const handle = await handles.load();
        if (current !== generation) return;
        if (handle) adoptStored(handle);
      }
      // A save file arriving right now brings its own read.
      if (taking > 0) return;
      setStatus({ source: sourceKind(), trouble: undefined });
      startPolling();
      await readAndHandle("check");
    });
    leadArrived?.();
    leadArrived = undefined;
  }

  /** Runs the lock request for one attempt, holding the lock until this window stops leading. */
  async function requestLead(locks: LockManager, options: LockOptions): Promise<boolean> {
    const attempt = attempts;
    let denied = false;
    await locks.request(COURIER_LOCK, options, (lock) => {
      if (attempt !== attempts) return undefined;
      if (!lock) {
        denied = true;
        return undefined;
      }
      begin();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    return denied;
  }

  /** Another window stole the lead, or the lock failed: this window waits its turn again. */
  function lostLead(attempt: number): void {
    if (attempt !== attempts) return;
    const wasLeading = leading;
    seeking = false;
    if (wasLeading) {
      endLead();
      source = undefined;
    }
    if (started && inLane) seek();
  }

  function seek(): void {
    const locks = lockManager();
    // Without Web Locks nothing can coordinate windows, & extra uploads only spend a counter.
    if (!locks) {
      begin();
      return;
    }
    seeking = true;
    attempts += 1;
    const attempt = attempts;
    void (async () => {
      try {
        if (await requestLead(locks, { ifAvailable: true })) {
          if (attempt !== attempts) return;
          setStatus({ source: "unknown", trouble: "other-window" });
          abort = new AbortController();
          await requestLead(locks, { signal: abort.signal });
        }
      } catch {
        lostLead(attempt);
      }
    })();
  }

  function stealLead(): Promise<void> {
    const locks = lockManager();
    if (!locks) {
      begin();
      return Promise.resolve();
    }
    attempts += 1;
    const attempt = attempts;
    abort?.abort();
    abort = undefined;
    seeking = true;
    // A take already waiting gives way to this one, which is newer.
    leadArrived?.();
    const arrived = new Promise<void>((resolve) => {
      leadArrived = resolve;
    });
    void (async () => {
      try {
        await requestLead(locks, { steal: true });
      } catch {
        lostLead(attempt);
      }
    })();
    return arrived;
  }

  function letGo(): void {
    attempts += 1;
    abort?.abort();
    abort = undefined;
    release?.();
    seeking = false;
    endLead();
  }

  return {
    start() {
      started = true;
      this.update();
    },
    check() {
      if (!leading) return Promise.resolve();
      return enqueue(() => readAndHandle("check"));
    },
    async reallow() {
      if (source?.kind !== "handle") return;
      const granted = await source.handle.requestPermission?.({ mode: "read" });
      if (granted === undefined || granted === "granted") await this.check();
    },
    retry() {
      if (!leading) return;
      clearRetry();
      retryDelay = firstRetryMs;
      void enqueue(async () => {
        await (pending || recheck ? retryWaiting() : poll());
      });
    },
    get status() {
      return status;
    },
    stop() {
      started = false;
      letGo();
      setStatus({ trouble: undefined });
    },
    async take(next) {
      taking += 1;
      latestTake += 1;
      const mine = latestTake;
      source = next;
      lastHash = undefined;
      fingerprint = undefined;
      failedPolls = 0;
      try {
        // A paste that gave only a file means the old handle isn't this save file anymore.
        await (next.kind === "handle" ? handles.save(next.handle) : handles.clear());
        if (mine !== latestTake) return;
        // The lane ended while that was stored, so nothing should be left behind.
        if (userState.syncLane?.kind !== "computer") {
          source = undefined;
          await handles.clear();
          return;
        }
        if (!leading) await stealLead();
        if (mine !== latestTake) return;
        stopWatching();
        setStatus({ source: sourceKind(), trouble: undefined });
        startPolling();
        await enqueue(() => readAndHandle("check"));
      } finally {
        taking -= 1;
      }
    },
    update() {
      const lane = userState.syncLane;
      const receipt = userState.syncReceipt;
      const receiptCleared = lastReceipt !== undefined && receipt === undefined;
      lastReceipt = receipt;
      mirrorCode();
      const blocked = lane === undefined && userState.syncBlocked && sharedCode() !== undefined;
      const unblocked = blockedLane && !blocked;
      blockedLane = blocked;
      if (lane?.kind !== "computer" && !blocked) {
        if (!inLane) return;
        inLane = false;
        letGo();
        source = undefined;
        lastHash = undefined;
        void handles.clear();
        setStatus(IDLE_COURIER);
        return;
      }
      inLane = true;
      if (!started) return;
      if (!leading) {
        if (!seeking) seek();
        return;
      }
      const key = sharedCode()?.key;
      if (key !== codeKey) {
        // A new code gets the current save at once, whatever the old one was sending.
        codeKey = key;
        pending = undefined;
        clearRetry();
        if (key !== undefined) void enqueue(() => readAndHandle("check"));
      } else if (receiptCleared || unblocked) {
        // A reset removed the receipt, or the store can take a save again, so the current one applies.
        void enqueue(() => readAndHandle("force"));
      }
    },
  };
}
