import { isRecord } from "#lib/utils/record.js";

import { planManualImport } from "./progress-import-write.js";
import { readProgressBlob, serializeStoredProgress } from "./progress-storage.js";
import {
  planLaneStart,
  planLocalPatch,
  planReplacement,
  planStoredWrite,
  planSyncApply,
} from "./progress-writer.js";
import {
  PREFERENCES_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  PROGRESS_WRITE_LOCK,
  QUARANTINE_STORAGE_KEY,
} from "./storage-keys.js";

import type { ProgressHistory } from "#lib/engine/provenance.js";
import type { DeviceLocalState, SyncApplyOutcome, SyncApplyRequest } from "#lib/sync/lane-state.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { ManualImport, ManualImportOutcome } from "./progress-import-write.js";
import type { LoadedProgress, ProgressReadResult } from "./progress-storage.js";
import type { BackupReplacementQuestion, StagedLaneStart } from "./progress-writer.js";

export type PersistenceFailureKind = "newer-data" | "unavailable" | "unreadable";

export interface SerializedPreferences {
  everythingGrouping: "category" | "source";
  showSpoilers: boolean;
}

export interface PersistenceStatus {
  failureGeneration: number;
  failureKind: PersistenceFailureKind;
  preferencesReady: boolean;
  ready: boolean;
  unreadableData: null | string;
}

export interface ProgressRepositoryEnvironment {
  events?: Partial<Pick<Window, "addEventListener" | "removeEventListener">>;
  locks?: () => ProgressLocks | undefined;
  ownsStorage: (storage: Storage) => boolean;
  read: (key: string) => { ok: false } | { ok: true; value: null | string };
  write: (key: string, value: string) => boolean;
}

interface ProgressLocks {
  request: (name: string, task: () => void) => Promise<unknown>;
}

/** The shell supplies live values; the repository never holds a rune or reaches for window. */
interface LiveProgress {
  emptyProgress: () => Omit<LoadedProgress, "local">;
  historySnapshot: () => ProgressHistory;
  local: DeviceLocalState;
  preferences: SerializedPreferences;
  snapshot: () => Omit<LoadedProgress, "local">;
}

export const PERSIST_DEBOUNCE_MS = 300;

export function createDefaultPreferences(): SerializedPreferences {
  return { everythingGrouping: "category", showSpoilers: false };
}

/** How a write treats a value another tab stored since this one last read it. */
type WriteIntent =
  | (ManualImport & {
      kind: "merge";
      progress: ProgressState;
      sequence: number;
      settle: (outcome: ManualImportOutcome) => void;
    })
  | (StagedLaneStart & {
      /** Built aside from live state, which takes it only once it's stored (see `startSyncLane`). */
      guard: () => boolean;
      kind: "staged";
    })
  | {
      chooseManual?: boolean;
      /** Removes the receipt from whichever `local` section the write keeps. */
      dropReceipt: boolean;
      /** Serialized at confirmation, so later storage events cannot change the requested write. */
      json: string;
      keepLocal: boolean;
      kind: "replace";
      progress: ProgressState;
      sequence: number;
    }
  | { generation: number; kind: "auto-save" }
  | {
      kind: "local";
      /**
       * The next `local` section, given the one stored now, or `undefined` when the stored one
       * isn't what the change expected (another tab changed the lane or code), so nothing is written.
       */
      update: (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined;
    }
  | {
      kind: "sync";
      request: SyncApplyRequest;
      /** Reports what the write did; left unset, the store was blocked before it could look. */
      settle: (outcome: SyncApplyOutcome) => void;
    };

interface ReplaceOptions {
  chooseManual?: boolean;
  dropReceipt?: boolean;
  keepLocal?: boolean;
}

interface ProgressRepository {
  readonly clockBase: null | string;
  dismissWarning: () => void;
  dispose: () => void;
  enableAfterReplace: () => void;
  merge: (
    imported: Partial<ProgressState>,
    options?: ManualImport["options"],
  ) => Promise<ManualImportOutcome>;
  readonly newerDataBlocked: boolean;
  onExternalChange: (listener: (loaded: Omit<LoadedProgress, "local">) => void) => () => void;
  read: () => void;
  readStored: () => null | string;
  replace: (options?: ReplaceOptions) => void;
  savePreferences: () => void;
  schedule: (json: string) => void;
  serialize: () => string;
  status: () => PersistenceStatus;
  write: (intent: Extract<WriteIntent, { kind: "staged" | "sync" }>) => Promise<boolean>;
  writeLocal: (
    update: (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined,
  ) => Promise<boolean>;
}

export function createProgressRepository(
  live: LiveProgress,
  environment: ProgressRepositoryEnvironment,
  statusChanged: (status: PersistenceStatus) => void,
): ProgressRepository {
  const listeners = new Set<(loaded: Omit<LoadedProgress, "local">) => void>();
  const removers: (() => void)[] = [];
  function publishStatus(): void {
    statusChanged(status());
  }
  function status(): PersistenceStatus {
    return {
      failureGeneration: _persistenceFailureGeneration,
      failureKind: _persistenceFailureKind,
      preferencesReady: _preferencesReady,
      ready: _persistenceReady,
      unreadableData: _unreadableData,
    };
  }
  function listen<K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void,
  ): void {
    environment.events?.addEventListener?.(type, listener);
    removers.push(() => environment.events?.removeEventListener?.(type, listener));
  }
  let _persistenceFailureGeneration = 0;
  let _persistenceReady = false;
  let persistenceBlocked = false;
  let quarantineAvailable = false;
  let _persistenceFailureKind: PersistenceFailureKind = "unavailable";
  let _unreadableData: null | string = null;
  let _preferencesReady = false;
  /** True while stored progress came from a newer build, which this one must leave untouched. */
  let newerDataBlocked = false;
  /** A replacement answer belongs to this exact backup & incoming farm, never just their names. */
  let backupReplacementQuestion: BackupReplacementQuestion | undefined;
  let lastKnownPreferencesValue: null | string = null;
  let lastKnownStoredValue: null | string = null;
  /** The clock still in memory after a missing or unreadable value replaces the stored blob. */
  let lastReadableStoredValue: null | string = null;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;
  let saveGeneration = 0;
  let explicitSequence = 0;
  /**
   * The newest explicit write's payload until it's written. Memory builds on it meanwhile, so it,
   * not the stored value, is the base the next import's history merges against.
   */
  let pendingExplicitJson: string | undefined;
  /** The live progress a pending import captured. Keep it attached while a queued reset lands. */
  let pendingManualProgress: ProgressState | undefined;
  function clearPendingSave(): void {
    saveGeneration++;
    if (saveTimeout !== undefined) clearTimeout(saveTimeout);
    saveTimeout = undefined;
  }

  function reportStorageUnavailable(): void {
    _persistenceFailureKind = "unavailable";
    _persistenceFailureGeneration++;
    publishStatus();
  }

  function snapshot(): Omit<LoadedProgress, "local"> {
    return live.snapshot();
  }
  function serialize(): string {
    return serializeStoredProgress(snapshot(), live.local);
  }
  function replaceProgress(loaded: Omit<LoadedProgress, "local">): void {
    for (const listener of listeners) listener(loaded);
  }
  /** Blocks persistence and keeps the unreadable value, in storage & memory, for recovery. */
  function quarantine(value: string): void {
    _persistenceReady = false;
    persistenceBlocked = true;
    newerDataBlocked = false;
    quarantineAvailable = environment.write(QUARANTINE_STORAGE_KEY, value);
    _unreadableData = value;
    _persistenceFailureKind = "unreadable";
    _persistenceFailureGeneration++;
    publishStatus();
  }

  /**
   * The one function that writes progress. It re-reads the stored value & validates it first,
   * since another tab may have written since this one last read:
   *
   * - A newer build's data blocks the write; nothing is overwritten.
   * - An `auto-save` adopts the other tab's value rather than writing a stale state over it. Its
   *   storage event may never arrive (e.g. while this page sat in the back/forward cache), and
   *   waiting would leave every later save comparing against a value no longer stored.
   * - A `replace` is the player's explicit choice, so it overwrites, once an unreadable value is
   *   safely copied to quarantine.
   * - A `merge` unions the captured import preview into the current stored progress, preserving
   *   both another tab's saved progress & this tab's unsaved edits.
   *
   * Cleared storage has nothing to conflict with, so it's written normally. Callers hold the
   * progress Web Lock (see {@link requestProgressWrite}); only the pagehide flush calls it bare.
   * Returns whether this write's value is now stored.
   */
  function writeProgress(intent: WriteIntent): boolean {
    if (intent.kind === "auto-save" && intent.generation !== saveGeneration) return false;
    if (!_persistenceReady && !(intent.kind === "merge" && quarantineAvailable)) {
      if (intent.kind === "merge" && newerDataBlocked) intent.settle({ kind: "newer-data" });
      return false;
    }
    const storedResult = environment.read(PROGRESS_STORAGE_KEY);
    if (!storedResult.ok) {
      reportStorageUnavailable();
      return false;
    }
    const stored = storedResult.value;
    const plan = planStoredWrite(intent.kind, stored, lastKnownStoredValue, live.local.syncLane);
    switch (plan.kind) {
      case "sync-active":
        if (intent.kind === "merge") intent.settle({ kind: "sync-active" });
        return false;
      case "adopt":
        applyStorageValue(plan.value);
        if (intent.kind === "merge" && plan.newer) intent.settle({ kind: "newer-data" });
        return false;
      case "quarantine":
        quarantine(plan.value);
        return false;
      case "preserve":
        if (!environment.write(QUARANTINE_STORAGE_KEY, plan.value)) {
          quarantine(plan.value);
          return false;
        }
        _unreadableData = plan.value;
        publishStatus();
        break;
      case "ready":
        break;
    }

    const { read } = plan;
    if (intent.kind === "local") return writeLocalPatch(intent.update, stored, read);
    if (intent.kind === "staged") return writeStaged(intent, stored, read);
    if (intent.kind === "sync") return writeSyncApply(intent, stored);
    if (intent.kind === "merge") return writeManualMerge(intent, stored);

    let json: string;
    if (intent.kind === "auto-save") {
      json = serialize();
    } else {
      const replacement = planReplacement(
        intent,
        read?.kind === "ok" ? read.loaded.local : undefined,
      );
      json = replacement.json;
      if (intent.sequence === explicitSequence) {
        if (
          snapshot().progress !== intent.progress ||
          (snapshot().progress !== pendingManualProgress && serialize() === intent.json)
        ) {
          replaceProgress(replacement.loaded);
        }
        live.local = replacement.loaded.local;
      }
    }
    if (!tryWriteProgress(json, stored)) return false;
    if (intent.kind === "replace" && intent.sequence === explicitSequence) {
      pendingExplicitJson = undefined;
    }
    finishProgressWrite(json);
    return true;
  }

  function tryWriteProgress(json: string, stored: null | string): boolean {
    if (json === stored || environment.write(PROGRESS_STORAGE_KEY, json)) return true;
    reportStorageUnavailable();
    return false;
  }

  function finishProgressWrite(json: string): void {
    lastKnownStoredValue = json;
    lastReadableStoredValue = json;
    _persistenceFailureGeneration = 0;
    publishStatus();
  }

  /** Checks both farms under the write lock before applying or exposing any imported progress. */
  function writeManualMerge(
    intent: Extract<WriteIntent, { kind: "merge" }>,
    stored: null | string,
  ): boolean {
    const isCurrent = intent.sequence === explicitSequence;
    const sameProgress = snapshot().progress === intent.progress;
    const laterEdits =
      isCurrent && serialize() !== intent.before
        ? {
            clock: snapshot().worldState,
            ...(sameProgress
              ? {
                  progress: {
                    history: live.historySnapshot(),
                    progress: snapshot().progress,
                  },
                }
              : { clockBase: lastReadableStoredValue }),
          }
        : undefined;
    const plan = planManualImport(intent, stored, laterEdits);
    if (plan.kind === "ask") {
      intent.settle(plan);
      return false;
    }
    if (!tryWriteProgress(plan.json, stored)) return false;
    if (isCurrent) {
      clearPendingSave();
      replaceProgress(plan.live);
      live.local = plan.local;
    }
    enablePersistenceAfterExplicitReplace();
    finishProgressWrite(plan.json);
    intent.settle({ kind: "applied", result: plan.result });
    return true;
  }

  /**
   * Runs {@link writeProgress} under the progress Web Lock, so no other tab writes between its
   * re-read & its write. Without Web Locks it runs at once: the read & write are synchronous, so
   * only another tab running in parallel in that same instant could slip between them.
   */
  function requestProgressWrite(intent: WriteIntent): Promise<boolean> {
    const locks = environment.locks?.();
    if (!locks) return Promise.resolve(writeProgress(intent));
    return writeUnderLock(locks, intent);
  }

  async function writeUnderLock(locks: ProgressLocks, intent: WriteIntent): Promise<boolean> {
    let written = false;
    try {
      await locks.request(PROGRESS_WRITE_LOCK, () => {
        written = writeProgress(intent);
      });
    } catch {
      // The lock couldn't be taken (e.g. a sandboxed frame); write as a browser without locks does.
      written = writeProgress(intent);
    }
    return written;
  }

  /**
   * Writes a change to this device's `local` section alone, as a patch to the document stored when
   * the lock is held: its progress & the rest of `local` stay as stored, whichever tab wrote them.
   * Memory takes the new section only once it's stored, so it never holds a code or lane that
   * storage doesn't.
   */
  function writeLocal(
    update: (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined,
  ): Promise<boolean> {
    return requestProgressWrite({ kind: "local", update });
  }

  /** The body of a {@link writeLocal} write, inside the lock. */
  function writeLocalPatch(
    update: (stored: DeepReadonly<DeviceLocalState>) => DeviceLocalState | undefined,
    stored: null | string,
    read: ProgressReadResult | undefined,
  ): boolean {
    // An unreadable stored value has no `local` section to patch.
    if (stored !== null && read?.kind !== "ok") return false;
    const base = read?.kind === "ok" ? read.loaded : { ...snapshot(), local: live.local };
    const plan = planLocalPatch(base, update);
    if (!plan || !tryWriteProgress(plan.json, stored)) return false;
    // Adopt another tab's newer progress only once the patch lands.
    if (read?.kind === "ok" && stored !== lastKnownStoredValue) {
      clearPendingSave();
      pendingExplicitJson = undefined;
      replaceProgress(read.loaded);
    }
    live.local = plan.local;
    finishProgressWrite(plan.json);
    return true;
  }

  /** Installs a staged lane only after its progress, lane, & receipt are stored together. */
  function writeStaged(
    intent: Extract<WriteIntent, { kind: "staged" }>,
    stored: null | string,
    read: ProgressReadResult | undefined,
  ): boolean {
    if (!intent.guard()) return false;
    const plan = planLaneStart(intent, read?.kind === "ok" ? read.loaded : undefined, live.local);
    if (!tryWriteProgress(plan.json, stored)) return false;
    clearPendingSave();
    pendingExplicitJson = undefined;
    replaceProgress(plan.loaded);
    live.local = plan.loaded.local;
    finishProgressWrite(plan.json);
    return true;
  }

  /** Applies a synced save under the lock without unblocking quarantined or newer data. */
  function writeSyncApply(
    { request, settle }: Extract<WriteIntent, { kind: "sync" }>,
    stored: null | string,
  ): boolean {
    // Another tab's value is adopted first; otherwise this tab's unsaved edits count.
    if (stored !== null && stored !== lastKnownStoredValue) applyStorageValue(stored);
    const current = readProgressBlob(serialize(), "repair");
    if (current.kind !== "ok") {
      settle({ kind: "write-failed" });
      return false;
    }
    if (!request.wantsLane(live.local.syncLane)) {
      settle({ kind: "stale" });
      return false;
    }
    const plan = planSyncApply(
      current.loaded,
      live.local,
      request,
      live.emptyProgress(),
      backupReplacementQuestion,
      Date.now(),
    );
    if (plan.kind === "outcome") {
      settle(plan.outcome);
      return false;
    }
    if (plan.kind === "replace-backup") {
      const { farmName, savedAt, snapshot: backupSnapshot } = plan;
      if (backupReplacementQuestion?.snapshot !== backupSnapshot) {
        // Compare the complete snapshot inside the lock, but send only a small ID between tabs.
        backupReplacementQuestion = {
          id: `replace-backup:${crypto.randomUUID()}`,
          snapshot: backupSnapshot,
        };
      }
      settle({
        kind: "ask",
        questions: [
          { farmName, id: backupReplacementQuestion.id, kind: "replace-backup", savedAt },
        ],
      });
      return false;
    }
    if (!tryWriteProgress(plan.json, stored)) {
      settle({ kind: plan.failure });
      return false;
    }
    clearPendingSave();
    pendingExplicitJson = undefined;
    replaceProgress(plan.loaded);
    live.local = plan.loaded.local;
    finishProgressWrite(plan.json);
    settle({ kind: "applied", result: plan.result });
    return true;
  }

  /** Captures an explicit replacement now, rather than after the auto-save debounce. */
  function writeExplicitProgress({
    chooseManual = false,
    dropReceipt = false,
    keepLocal = true,
  }: ReplaceOptions = {}): void {
    clearPendingSave();
    const json = serialize();
    pendingExplicitJson = json;
    void requestProgressWrite({
      chooseManual,
      dropReceipt,
      json,
      keepLocal,
      kind: "replace",
      progress: snapshot().progress,
      sequence: ++explicitSequence,
    });
  }

  /**
   * The pagehide flush. A page being hidden can't wait for a lock, so this keeps the synchronous
   * compare-before-write: it adopts another tab's value rather than overwriting it.
   */
  function flushCurrentState(): void {
    if (!_persistenceReady) return;
    clearPendingSave();
    writeProgress({ generation: saveGeneration, kind: "auto-save" });
  }

  /**
   * Blocks persistence without copying or touching the stored value: a newer build wrote it, so it
   * isn't unreadable, and an explicit replace mustn't overwrite it either.
   */
  function blockForNewerData(): void {
    _persistenceReady = false;
    persistenceBlocked = true;
    quarantineAvailable = false;
    newerDataBlocked = true;
    _persistenceFailureKind = "newer-data";
    _persistenceFailureGeneration++;
    publishStatus();
  }

  function resumePersistence(): void {
    persistenceBlocked = false;
    quarantineAvailable = false;
    newerDataBlocked = false;
    _persistenceFailureGeneration = 0;
    _persistenceReady = true;
    publishStatus();
  }

  /** Hydrates from a stored value under the repair policy, or blocks persistence if it can't. */
  function adoptStoredValue(value: string): void {
    const result = readProgressBlob(value, "repair");
    if (result.kind === "ok") {
      lastReadableStoredValue = value;
      replaceProgress(result.loaded);
      live.local = result.loaded.local;
      resumePersistence();
    } else if (result.kind === "newer") {
      blockForNewerData();
    } else {
      quarantine(value);
    }
  }

  function applyStorageValue(value: null | string): void {
    clearPendingSave();
    lastKnownStoredValue = value;
    // Memory now builds on the adopted value, not on any write still waiting for the lock.
    pendingExplicitJson = undefined;
    if (value !== null) {
      adoptStoredValue(value);
    } else if (newerDataBlocked) {
      // Another tab cleared the newer data, so there's nothing left to protect.
      resumePersistence();
    }
  }

  function resyncFromStorage(): void {
    const storedResult = environment.read(PROGRESS_STORAGE_KEY);
    if (storedResult.ok && storedResult.value !== lastKnownStoredValue) {
      applyStorageValue(storedResult.value);
    }
    const preferencesResult = environment.read(PREFERENCES_STORAGE_KEY);
    if (preferencesResult.ok && preferencesResult.value !== lastKnownPreferencesValue) {
      applyPreferencesValue(preferencesResult.value);
    }
  }

  /**
   * Adopts stored preferences. They're per-device conveniences, so a missing or unreadable value
   * falls back to defaults field by field instead of blocking anything.
   */
  function applyPreferencesValue(value: null | string): void {
    lastKnownPreferencesValue = value;
    const preferences = deserializePreferences(value);
    live.preferences = preferences;
  }

  function enablePersistenceAfterExplicitReplace(): void {
    if (!persistenceBlocked || !quarantineAvailable) return;

    persistenceBlocked = false;
    quarantineAvailable = false;
    _persistenceReady = true;
    publishStatus();
  }

  listen("pagehide", flushCurrentState);
  // A page restored from the back/forward cache missed any storage events fired while frozen.
  listen("pageshow", (event) => {
    if (event.persisted) resyncFromStorage();
  });
  listen("storage", (event) => {
    if (event.storageArea && !environment.ownsStorage(event.storageArea)) return;
    // A null key means another tab called `localStorage.clear()`.
    if (event.key === null) {
      resyncFromStorage();
    } else if (event.key === PROGRESS_STORAGE_KEY) {
      applyStorageValue(event.newValue);
    } else if (event.key === PREFERENCES_STORAGE_KEY) {
      // Events can arrive after this tab has written something newer, so adopt what's stored now
      // rather than the event's value; every tab then converges on the last write.
      const preferencesResult = environment.read(PREFERENCES_STORAGE_KEY);
      if (preferencesResult.ok) applyPreferencesValue(preferencesResult.value);
    }
  });

  return {
    get clockBase(): null | string {
      return pendingExplicitJson ?? lastReadableStoredValue;
    },
    dismissWarning(): void {
      if (persistenceBlocked) _persistenceFailureGeneration++;
      else _persistenceFailureGeneration = 0;
      publishStatus();
    },
    dispose(): void {
      clearPendingSave();
      for (const remove of removers) remove();
      listeners.clear();
    },
    enableAfterReplace: enablePersistenceAfterExplicitReplace,
    async merge(
      imported: Partial<ProgressState>,
      options: ManualImport["options"] = {},
    ): Promise<ManualImportOutcome> {
      if (live.local.syncLane) return { kind: "sync-active" };
      if (pendingManualProgress) return { kind: "busy" };
      pendingManualProgress = snapshot().progress;
      try {
        const settled: { outcome: ManualImportOutcome } = { outcome: { kind: "write-failed" } };
        await requestProgressWrite({
          base: pendingExplicitJson ?? lastKnownStoredValue,
          before: serialize(),
          fallbackClockBase: lastReadableStoredValue,
          imported: structuredClone(imported),
          kind: "merge",
          options: structuredClone(options),
          progress: pendingManualProgress,
          sequence: explicitSequence,
          settle: (outcome) => {
            settled.outcome = outcome;
          },
        });
        return settled.outcome;
      } finally {
        pendingManualProgress = undefined;
      }
    },
    get newerDataBlocked(): boolean {
      return newerDataBlocked;
    },
    onExternalChange(listener: (loaded: Omit<LoadedProgress, "local">) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    read(): void {
      const storedResult = environment.read(PROGRESS_STORAGE_KEY);
      const preferencesResult = environment.read(PREFERENCES_STORAGE_KEY);
      if (preferencesResult.ok) {
        applyPreferencesValue(preferencesResult.value);
        _preferencesReady = true;
        publishStatus();
      }

      if (!storedResult.ok) {
        _persistenceReady = false;
        persistenceBlocked = true;
        quarantineAvailable = false;
        reportStorageUnavailable();
        return;
      }

      // A blob quarantined on an earlier visit stays retrievable after the tracker moves on.
      const quarantined = environment.read(QUARANTINE_STORAGE_KEY);
      if (quarantined.ok) _unreadableData = quarantined.value;

      const stored = storedResult.value;
      lastKnownStoredValue = stored;
      if (stored === null) {
        resumePersistence();
      } else {
        adoptStoredValue(stored);
      }
    },
    readStored(): null | string {
      const stored = environment.read(PROGRESS_STORAGE_KEY);
      return stored.ok ? stored.value : lastKnownStoredValue;
    },
    replace: writeExplicitProgress,
    savePreferences(): void {
      if (!_preferencesReady) return;
      const json = serializePreferences(live.preferences);
      if (json !== lastKnownPreferencesValue && environment.write(PREFERENCES_STORAGE_KEY, json)) {
        lastKnownPreferencesValue = json;
      }
    },
    schedule(json: string): void {
      clearPendingSave();
      if (!_persistenceReady || json === lastKnownStoredValue) return;
      saveTimeout = setTimeout(() => {
        saveTimeout = undefined;
        void requestProgressWrite({ generation: saveGeneration, kind: "auto-save" });
      }, PERSIST_DEBOUNCE_MS);
    },
    serialize,
    status,
    write: requestProgressWrite,
    writeLocal,
  };
}

/** Reads stored preferences, defaulting each missing or invalid field. */
function deserializePreferences(json: null | string): SerializedPreferences {
  const defaults = createDefaultPreferences();
  if (json === null) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return defaults;
  }
  if (!isRecord(parsed)) return defaults;

  // Older builds also stored `availabilityWindows`; the next write leaves it behind.
  return {
    everythingGrouping: parsed.everythingGrouping === "source" ? "source" : "category",
    showSpoilers:
      typeof parsed.showSpoilers === "boolean" ? parsed.showSpoilers : defaults.showSpoilers,
  };
}

function serializePreferences(state: SerializedPreferences): string {
  const preferences: SerializedPreferences = {
    everythingGrouping: state.everythingGrouping,
    showSpoilers: state.showSpoilers,
  };
  return JSON.stringify(preferences);
}
