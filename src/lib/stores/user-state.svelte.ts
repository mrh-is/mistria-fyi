import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "#lib/data/index.js";
import { nextQuestState, seasonOrdinal } from "#lib/engine/domain-primitives.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "#lib/engine/progress.js";
import {
  changedFacts,
  editPlaytime,
  factKey,
  obtainedSourceOf,
  progressFacts,
} from "#lib/engine/provenance.js";
import { findRecipesForQuest } from "#lib/engine/quest-rewards.js";
import { applyEngagementCascade, getSpouseId } from "#lib/engine/relationships.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";
import { stageSyncSave, syncLaneOperations } from "#lib/sync/lane-operations.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import {
  getOrCreate,
  isRecord,
  recordEntries,
  recordKeys,
  recordValues,
} from "#lib/utils/record.js";

import { planManualImport } from "./progress-import-write.js";
import {
  emptyProgressHistory,
  emptyRetainedProgress,
  readFarmSwitchBackup,
  readProgressBlob,
  serializeProgress,
  serializeStoredProgress,
  withoutDeviceLocal,
} from "./progress-storage.js";
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

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  FactProvenance,
  ProgressHistory,
  ProvenanceSource,
  Resolution,
} from "#lib/engine/provenance.js";
import type { SyncReceipt } from "#lib/engine/sync-apply.js";
import type { SyncFreshness } from "#lib/engine/sync-freshness.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type {
  DeviceLocalState,
  PendingRetire,
  SyncApplyOutcome,
  SyncApplyRequest,
  SyncApplyStamp,
  SyncedSave,
  SyncLane,
} from "#lib/sync/lane-state.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  JsonValue,
  MountAppearanceId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  SpellId,
  VillagerId,
  VillagerRelationship,
  Weather,
} from "#lib/types/tracker-data.js";
import type { ChildChoice, ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { ManualImport, ManualImportOutcome } from "./progress-import-write.js";
import type {
  FarmSwitchBackup,
  LoadedProgress,
  ProgressReadResult,
  ProgressSnapshot,
  RetainedProgress,
} from "./progress-storage.js";
import type { BackupReplacementQuestion } from "./progress-writer.js";

export type { SyncApplyOutcome, SyncApplyQuestion, SyncedSave } from "#lib/sync/lane-state.js";

/** How a write treats a value another tab stored since this one last read it. */
type WriteIntent =
  | (ManualImport & {
      kind: "merge";
      progress: ProgressState;
      sequence: number;
      settle: (outcome: ManualImportOutcome) => void;
    })
  | {
      /** Built aside from live state, which takes it only once it's stored (see `startSyncLane`). */
      guard: () => boolean;
      kind: "staged";
      lane: SyncLane;
      staged: Omit<LoadedProgress, "local">;
      stamp?: SyncApplyStamp;
    }
  | {
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

/** The browser's Web Locks, where it has them; absent in old browsers & insecure contexts. */
function progressLockManager(): LockManager | undefined {
  const { navigator } = globalThis as { navigator?: { locks?: LockManager } };
  return navigator?.locks;
}

// ─── Types ──────────────────────────────────────────────────────────

/** The outcome of restoring a backup with `restoreBackup`, which replaces all progress. */
export type BackupRestoreResult = { error: BackupRestoreErrorKind; ok: false } | { ok: true };
/** `newer-version`: a newer build wrote the backup, so this one can't read it. */
export type BackupRestoreErrorKind = "invalid-fields" | "malformed-json" | "newer-version";

/**
 * Why changes aren't being saved: browser storage refused a read or write, the stored progress
 * couldn't be read and was quarantined, or a newer build wrote it and this one mustn't overwrite it.
 */
export type PersistenceFailureKind = "newer-data" | "unavailable" | "unreadable";

/** The outcome of one `completeQuestWithRecipes` call, enough to undo exactly that call. */
export interface QuestCompletion {
  newlyAdded: RecipeId[];
  previousState: QuestState;
}

export interface UserState {
  everythingGrouping: "category" | "source";
  lastImport: null | SaveImportMetadata;
  progress: ProgressState;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

/** Per-device display preferences, stored apart from progress so a backup restore keeps them. */
export interface SerializedPreferences {
  everythingGrouping: "category" | "source";
  showSpoilers: boolean;
}

/** Quiet period after the last change before progress is written to localStorage. */
export const PERSIST_DEBOUNCE_MS = 300;

function addDefaultUnlocks(progress: ProgressState): void {
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.sources.some((s) => s.type === "default")) {
      progress.cosmetics.add(id);
    }
  }

  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const variantSet = getOrCreate(
      progress.animals,
      animalId,
      () => new SvelteSet<AnimalVariantId>(),
    );
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        if (variant.source.type === "default") {
          variantSet.add(variantId);
        }
      }
    }
  }

  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    if (recipe.sources.some((s) => s.type === "default")) {
      progress.almanacRecipes.add(id);
    }
  }
}

const ANIMAL_IDS = recordKeys(trackerData.animals);

// ─── Store ──────────────────────────────────────────────────────────

function createDefaultPreferences(): SerializedPreferences {
  return {
    everythingGrouping: "category",
    showSpoilers: false,
  };
}

function createDefaultState(): UserState {
  return {
    ...createDefaultPreferences(),
    lastImport: null,
    progress: createDefaultProgress(SvelteSet, ANIMAL_IDS),
    worldState: createDefaultWorldState(),
  };
}

function createDefaultWorldState(): UserState["worldState"] {
  return { season: "spring", weather: "calm" };
}

function emptyLoadedProgress(): Omit<LoadedProgress, "local"> {
  return {
    history: emptyProgressHistory(),
    lastImport: null,
    progress: createDefaultProgress(SvelteSet, ANIMAL_IDS),
    retained: emptyRetainedProgress(),
    worldState: createDefaultWorldState(),
  };
}

function createUserState() {
  let state = $state<UserState>(createDefaultState());
  let _persistenceFailureGeneration = $state(0);
  let _persistenceReady = $state(false);
  let persistenceBlocked = false;
  let quarantineAvailable = false;
  let _persistenceFailureKind = $state<PersistenceFailureKind>("unavailable");
  let _unreadableData = $state<null | string>(null);
  let _preferencesReady = $state(false);
  /** True while stored progress came from a newer build, which this one must leave untouched. */
  let newerDataBlocked = false;
  let retained = $state.raw<RetainedProgress>(emptyRetainedProgress());
  /** This device's own section of the stored blob; never exported, kept across a restore. */
  let local = $state.raw<DeviceLocalState>({});
  /** A replacement answer belongs to this exact backup & incoming farm, never just their names. */
  let backupReplacementQuestion: BackupReplacementQuestion | undefined;
  /** Provenance & resolutions for every fact, which backups carry. */
  let history = $state<ProgressHistory>(emptyProgressHistory());
  /** The source the outermost {@link track} call is recording, while one runs. */
  let trackingSource: ProvenanceSource | undefined;
  let lastKnownPreferencesValue: null | string = null;
  let lastKnownStoredValue: null | string = null;
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
  }

  function snapshot(): ProgressSnapshot {
    return {
      history,
      lastImport: state.lastImport,
      progress: state.progress,
      retained,
      worldState: state.worldState,
    };
  }

  /** The stored form of the current state, `local` section included. */
  function serialize(): string {
    return serializeStoredProgress(snapshot(), local);
  }

  /**
   * Records `source` & `playtime` for one fact. A manual edit also clears the fact's “keep mine”,
   * since the player has now decided it themselves.
   */
  function recordFact(
    key: string,
    source: ProvenanceSource,
    playtime: number | undefined,
    obtainedSource: ProvenanceSource | undefined,
  ): void {
    history.provenance[key] = {
      ...(obtainedSource === undefined ? {} : { obtainedSource }),
      ...(playtime === undefined ? {} : { playtime }),
      source,
    };
    if (source === "manual" && Object.hasOwn(history.resolutions, key)) {
      const { [key]: _cleared, ...kept } = history.resolutions;
      history.resolutions = kept;
    }
  }

  /**
   * Runs `mutate` & records provenance for every fact it changed, ticks & unticks alike. A manual
   * change that names its `primary` facts records the rest (an engagement cascade, a quest's recipe
   * rewards) as `inferred`. Each record carries `stamp`'s playtime, by default the last applied
   * save's, or none if that save's couldn't be read. Nested calls record nothing themselves; the outermost call does.
   */
  function track<T>(
    source: ProvenanceSource,
    mutate: () => T,
    primary: readonly string[] = [],
    stamp?: { playtime: number | undefined },
  ): T {
    if (trackingSource !== undefined) return mutate();
    const { playtime } = stamp ?? { playtime: editPlaytime(history) };
    const before = progressFacts(state.progress);
    trackingSource = source;
    let result: T;
    try {
      result = mutate();
    } finally {
      trackingSource = undefined;
    }
    const after = progressFacts(state.progress);
    for (const key of changedFacts(before, after)) {
      const consequence = source === "manual" && primary.length > 0 && !primary.includes(key);
      const factSource = consequence ? "inferred" : source;
      const obtainedSource = obtainedSourceOf(
        history.provenance[key],
        factSource,
        before.get(key),
        after.get(key),
      );
      recordFact(key, factSource, playtime, obtainedSource);
    }
    return result;
  }

  /** Blocks persistence and keeps the unreadable value, in storage & memory, for recovery. */
  function quarantine(value: string): void {
    _persistenceReady = false;
    persistenceBlocked = true;
    newerDataBlocked = false;
    quarantineAvailable = trySetItem(QUARANTINE_STORAGE_KEY, value);
    _unreadableData = value;
    _persistenceFailureKind = "unreadable";
    _persistenceFailureGeneration++;
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
    const storedResult = tryGetItem(PROGRESS_STORAGE_KEY);
    if (!storedResult.ok) {
      reportStorageUnavailable();
      return false;
    }
    const stored = storedResult.value;
    const plan = planStoredWrite(intent.kind, stored, lastKnownStoredValue, local.syncLane);
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
        if (!trySetItem(QUARANTINE_STORAGE_KEY, plan.value)) {
          quarantine(plan.value);
          return false;
        }
        _unreadableData = plan.value;
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
          state.progress !== intent.progress ||
          (state.progress !== pendingManualProgress && serialize() === intent.json)
        ) {
          replaceProgress(replacement.loaded);
        }
        local = replacement.loaded.local;
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
    if (json === stored || trySetItem(PROGRESS_STORAGE_KEY, json)) return true;
    reportStorageUnavailable();
    return false;
  }

  function finishProgressWrite(json: string): void {
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
  }

  /** Checks both farms under the write lock before applying or exposing any imported progress. */
  function writeManualMerge(
    intent: Extract<WriteIntent, { kind: "merge" }>,
    stored: null | string,
  ): boolean {
    const isCurrent = intent.sequence === explicitSequence;
    const laterEdits =
      isCurrent && state.progress === intent.progress && serialize() !== intent.before
        ? {
            history: $state.snapshot<unknown>(history) as ProgressHistory,
            progress: state.progress,
            worldState: state.worldState,
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
      local = plan.local;
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
    const locks = progressLockManager();
    if (!locks) return Promise.resolve(writeProgress(intent));
    return writeUnderLock(locks, intent);
  }

  async function writeUnderLock(locks: LockManager, intent: WriteIntent): Promise<boolean> {
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
    const base = read?.kind === "ok" ? read.loaded : { ...snapshot(), local };
    const plan = planLocalPatch(base, update);
    if (!plan || !tryWriteProgress(plan.json, stored)) return false;
    // Adopt another tab's newer progress only once the patch lands.
    if (read?.kind === "ok" && stored !== lastKnownStoredValue) {
      clearPendingSave();
      pendingExplicitJson = undefined;
      replaceProgress(read.loaded);
    }
    local = plan.local;
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
    const storedLocal = read?.kind === "ok" ? read.loaded.local : local;
    const plan = planLaneStart(intent.staged, storedLocal, intent.lane, intent.stamp);
    if (!tryWriteProgress(plan.json, stored)) return false;
    clearPendingSave();
    pendingExplicitJson = undefined;
    replaceProgress(intent.staged);
    local = plan.local;
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
    if (!request.wantsLane(local.syncLane)) {
      settle({ kind: "stale" });
      return false;
    }
    const plan = planSyncApply(
      current.loaded,
      local,
      request,
      emptyLoadedProgress(),
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
    local = plan.loaded.local;
    finishProgressWrite(plan.json);
    settle({ kind: "applied", result: plan.result });
    return true;
  }

  /** Captures an explicit replacement now, rather than after the auto-save debounce. */
  function writeExplicitProgress(keepLocal = true, dropReceipt = false): void {
    clearPendingSave();
    const json = serialize();
    pendingExplicitJson = json;
    void requestProgressWrite({
      dropReceipt,
      json,
      keepLocal,
      kind: "replace",
      progress: state.progress,
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
  }

  function resumePersistence(): void {
    persistenceBlocked = false;
    quarantineAvailable = false;
    newerDataBlocked = false;
    _persistenceFailureGeneration = 0;
    _persistenceReady = true;
  }

  /** Hydrates from a stored value under the repair policy, or blocks persistence if it can't. */
  function adoptStoredValue(value: string): void {
    const result = readProgressBlob(value, "repair");
    if (result.kind === "ok") {
      replaceProgress(result.loaded);
      local = result.loaded.local;
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
    const storedResult = tryGetItem(PROGRESS_STORAGE_KEY);
    if (storedResult.ok && storedResult.value !== lastKnownStoredValue) {
      applyStorageValue(storedResult.value);
    }
    const preferencesResult = tryGetItem(PREFERENCES_STORAGE_KEY);
    if (preferencesResult.ok && preferencesResult.value !== lastKnownPreferencesValue) {
      applyPreferencesValue(preferencesResult.value);
    }
  }

  /**
   * Swaps in loaded progress, world state, retained unknown entries, & history, leaving this
   * device's preferences & `local` section untouched.
   */
  function replaceProgress(loaded: Omit<LoadedProgress, "local">): void {
    state.lastImport = loaded.lastImport;
    state.progress = loaded.progress;
    state.worldState = loaded.worldState;
    retained = loaded.retained;
    history = loaded.history;
  }

  /**
   * Adopts stored preferences. They're per-device conveniences, so a missing or unreadable value
   * falls back to defaults field by field instead of blocking anything.
   */
  function applyPreferencesValue(value: null | string): void {
    lastKnownPreferencesValue = value;
    const preferences = deserializePreferences(value);
    state.everythingGrouping = preferences.everythingGrouping;
    state.showSpoilers = preferences.showSpoilers;
  }

  function enablePersistenceAfterExplicitReplace(): void {
    if (!persistenceBlocked || !quarantineAvailable) return;

    persistenceBlocked = false;
    quarantineAvailable = false;
    _persistenceReady = true;
  }

  const progressionState = $derived(
    deriveProgressionState(state.progress, trackerData, state.showSpoilers),
  );
  // "Show spoilers" changes what the spoiler UI reveals, never what's doable today.
  const availabilityProgressionState = $derived(
    state.showSpoilers
      ? deriveProgressionState(state.progress, trackerData, false)
      : progressionState,
  );
  const progressContext: ProgressContext = $derived({
    progress: state.progress,
    progressionState: availabilityProgressionState,
    worldState: state.worldState,
  });

  // Auto-save to localStorage (debounced)
  if ("window" in globalThis) {
    $effect.root(() => {
      $effect(() => {
        if (!_persistenceReady) return;

        // Every change, including a hydrated blob that migration or repair rewrote, is saved by an
        // auto-save write once the quiet period passes.
        const json = serialize();
        clearPendingSave();
        if (json === lastKnownStoredValue) return;

        saveTimeout = setTimeout(() => {
          saveTimeout = undefined;
          void requestProgressWrite({ generation: saveGeneration, kind: "auto-save" });
        }, PERSIST_DEBOUNCE_MS);
      });

      // Preferences are tiny & rarely change, so they're written immediately; a failed write only
      // costs this device its preferences, which the progress save reports anyway.
      $effect(() => {
        if (!_preferencesReady) return;

        const json = serializePreferences(state);
        if (json === lastKnownPreferencesValue) return;
        if (trySetItem(PREFERENCES_STORAGE_KEY, json)) lastKnownPreferencesValue = json;
      });
    });

    const windowWithEvents = globalThis.window as { addEventListener?: Window["addEventListener"] };
    windowWithEvents.addEventListener?.("pagehide", flushCurrentState);
    // A page restored from the back/forward cache missed any storage events fired while frozen.
    windowWithEvents.addEventListener?.("pageshow", (event) => {
      if (event.persisted) resyncFromStorage();
    });
    windowWithEvents.addEventListener?.("storage", (event) => {
      if (event.storageArea && event.storageArea !== localStorage) return;
      // A null key means another tab called `localStorage.clear()`.
      if (event.key === null) {
        resyncFromStorage();
      } else if (event.key === PROGRESS_STORAGE_KEY) {
        applyStorageValue(event.newValue);
      } else if (event.key === PREFERENCES_STORAGE_KEY) {
        // Events can arrive after this tab has written something newer, so adopt what's stored now
        // rather than the event's value; every tab then converges on the last write.
        const preferencesResult = tryGetItem(PREFERENCES_STORAGE_KEY);
        if (preferencesResult.ok) applyPreferencesValue(preferencesResult.value);
      }
    });
  }

  const hasAnyProgress = $derived(
    state.progress.almanac.size > 0 ||
      state.progress.almanacRecipes.size > 0 ||
      state.progress.cosmetics.size > 0 ||
      state.progress.hasUpperFloor ||
      state.progress.museum.size > 0 ||
      state.progress.reachedSeason !== "spring" ||
      Object.keys(state.progress.villagerRelationships).length > 0 ||
      state.progress.breakUpsDisabled ||
      state.progress.childChoice !== "undeclared" ||
      state.progress.mineFloor > 0 ||
      state.progress.spells.size > 0 ||
      state.progress.renown > 0 ||
      state.progress.mountAppearances.size > 0 ||
      state.progress.petCosmetics.size > 0 ||
      state.progress.petSkins.size > 0 ||
      state.progress.unlockedPerks.size > 0 ||
      recordValues(state.progress.heartLevels).some((v) => v > 0) ||
      recordValues(state.progress.skillLevels).some((v) => v > 0) ||
      recordValues(state.progress.questStates).some((v) => v !== "none") ||
      recordValues(state.progress.animals).some((s) => s.size > 0) ||
      recordValues(state.progress.animalCosmetics).some((s) => s.size > 0),
  );

  /** Runs a player's edit of one fact, recording it as `manual`; see {@link track}. */
  function manual(key: string, edit: () => void): void {
    track("manual", edit, [key]);
  }

  /** Ticks or unticks one listed fact by hand. */
  function toggleFact<T extends string>(field: string, set: Set<T>, id: T): void {
    manual(factKey(field, id), () => {
      toggleInSet(set, id);
    });
  }

  /** {@link restoreBackup}'s body, so the farm-switch backup restores the same way. */
  function restoreBackupJson(json: string): BackupRestoreResult {
    const result = readProgressBlob(json, "strict");
    if (result.kind === "newer") return { error: "newer-version", ok: false };
    if (result.kind === "unreadable") return { error: result.error, ok: false };
    replaceProgress(result.loaded);
    enablePersistenceAfterExplicitReplace();
    writeExplicitProgress();
    return { ok: true };
  }

  return {
    /**
     * Applies a synced save in one immediate write: the settled progress, the receipt, & any
     * farm-switch backup land together or not at all, so the receipt advances only here. It never
     * unblocks a quarantined store or a newer build's data.
     */
    async applySyncedSave(request: SyncApplyRequest): Promise<SyncApplyOutcome> {
      const settled: { outcome: SyncApplyOutcome } = { outcome: { kind: "blocked" } };
      await requestProgressWrite({
        kind: "sync",
        request,
        settle: (outcome) => {
          settled.outcome = outcome;
        },
      });
      return settled.outcome;
    },
    /** Cycles the quest's state, completing its recipe rewards on the obtained-to-completed step. */
    completeQuestWithRecipes(id: QuestId): QuestCompletion {
      return track(
        "manual",
        () => {
          const previousState = state.progress.questStates[id] ?? "none";
          state.progress.questStates[id] = nextQuestState(previousState);

          if (previousState !== "obtained") return { newlyAdded: [], previousState };

          const candidates = findRecipesForQuest(id);
          const newlyAdded: RecipeId[] = [];
          for (const recipeId of candidates) {
            if (!state.progress.almanacRecipes.has(recipeId)) {
              state.progress.almanacRecipes.add(recipeId);
              newlyAdded.push(recipeId);
            }
          }
          return { newlyAdded, previousState };
        },
        [factKey("questStates", id)],
      );
    },
    ...syncLaneOperations(writeLocal),
    dismissPersistenceWarning() {
      if (persistenceBlocked) {
        _persistenceFailureGeneration++;
      } else {
        _persistenceFailureGeneration = 0;
      }
    },
    /**
     * The backup of this device's progress, never its `local` section. While a newer build's data
     * blocks writes, that is the stored blob itself, otherwise verbatim: memory holds only defaults
     * or stale progress then, and a backup of those would overwrite the real progress wherever it
     * was restored.
     */
    exportBackup(): string {
      if (newerDataBlocked) {
        const stored = tryGetItem(PROGRESS_STORAGE_KEY);
        const value = stored.ok ? stored.value : lastKnownStoredValue;
        if (value !== null) return withoutDeviceLocal(value);
      }
      return serializeProgress(snapshot());
    },
    /** The backup kept from the last farm switch, if there is one to offer. */
    get farmSwitchBackup(): FarmSwitchBackup | undefined {
      return readFarmSwitchBackup(local);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
    },
    /** Remembers “keep mine” for a fact against the save value the player declined. */
    keepMine(key: string, saveValue: JsonValue) {
      history.resolutions[key] = { saveValue };
    },
    /** The playtime of the last applied save, if any. */
    get lastSavePlaytime(): number | undefined {
      return history.lastSavePlaytime;
    },
    loadFromStorage() {
      const storedResult = tryGetItem(PROGRESS_STORAGE_KEY);
      const preferencesResult = tryGetItem(PREFERENCES_STORAGE_KEY);
      if (preferencesResult.ok) {
        applyPreferencesValue(preferencesResult.value);
        _preferencesReady = true;
      }

      if (!storedResult.ok) {
        _persistenceReady = false;
        persistenceBlocked = true;
        quarantineAvailable = false;
        reportStorageUnavailable();
        return;
      }

      // A blob quarantined on an earlier visit stays retrievable after the tracker moves on.
      const quarantined = tryGetItem(QUARANTINE_STORAGE_KEY);
      if (quarantined.ok) _unreadableData = quarantined.value;

      const stored = storedResult.value;
      lastKnownStoredValue = stored;
      if (stored === null) {
        resumePersistence();
      } else {
        adoptStoredValue(stored);
      }
    },
    markDefaultUnlocksComplete() {
      track("inferred", () => {
        addDefaultUnlocks(state.progress);
      });
    },
    /**
     * Applies a native save additively. The farm decision, lane guard, & write all use the latest
     * stored value, so another tab cannot start sync or change farms behind the import.
     */
    async mergeFromSave(
      imported: Partial<ProgressState>,
      options: ManualImport["options"] = {},
    ): Promise<ManualImportOutcome> {
      if (local.syncLane) return { kind: "sync-active" };
      if (pendingManualProgress) return { kind: "busy" };
      pendingManualProgress = state.progress;
      try {
        const settled: { outcome: ManualImportOutcome } = { outcome: { kind: "write-failed" } };
        await requestProgressWrite({
          base: pendingExplicitJson ?? lastKnownStoredValue,
          before: serialize(),
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
    get persistenceFailed(): boolean {
      return _persistenceFailureGeneration > 0;
    },
    get persistenceFailureGeneration(): number {
      return _persistenceFailureGeneration;
    },
    get persistenceFailureKind(): PersistenceFailureKind {
      return _persistenceFailureKind;
    },
    /** What category projections read, so every page counts, dims, & filters rows alike. */
    get progressContext(): ProgressContext {
      return progressContext;
    },
    get progressionState(): UserProgressionState {
      return progressionState;
    },
    /** Where a fact came from, if it has been recorded; see `factKey`. */
    provenanceOf(key: string): DeepReadonly<FactProvenance> | undefined {
      return history.provenance[key];
    },
    /**
     * Runs `mutations` recording every fact they change as `inferred`, as “Record prerequisites”
     * does for the conditions it satisfies.
     */
    recordInferred(mutations: () => void) {
      track("inferred", mutations);
    },
    /** Restores every field to its default, this device's preferences & `local` section included. */
    resetAll() {
      state = createDefaultState();
      retained = emptyRetainedProgress();
      history = emptyProgressHistory();
      local = {};
      enablePersistenceAfterExplicitReplace();
      writeExplicitProgress(false);
    },
    /**
     * Clears progress & world state; this device's preferences & `local` section are kept, so a
     * syncing lane stays a syncing lane. Only the sync receipt goes, so the latest save file
     * applies again.
     */
    resetProgress() {
      replaceProgress(emptyLoadedProgress());
      enablePersistenceAfterExplicitReplace();
      const { syncReceipt: _receipt, ...kept } = local;
      local = kept;
      // The write keeps the stored section, which another tab may have added to since this one read.
      writeExplicitProgress(true, true);
    },
    /** The player's “keep mine” for a fact, if any; see `resolutionHolds`. */
    resolutionOf(key: string): Readonly<Resolution> | undefined {
      return history.resolutions[key];
    },
    /**
     * Replaces progress & world state from a backup under the strict policy; this device's
     * preferences & `local` section are kept, and a backup never brings one in. A backup from a
     * newer build is refused, never partly read.
     */
    restoreBackup: restoreBackupJson,
    /**
     * Restores the farm-switch backup like any backup; it stays in place, so restoring it again
     * still works until the next farm switch replaces it.
     */
    restoreFarmSwitchBackup(): BackupRestoreResult {
      const kept = readFarmSwitchBackup(local);
      if (!kept) return { error: "invalid-fields", ok: false };
      return restoreBackupJson(JSON.stringify(kept.backup));
    },
    setBreakUpsDisabled(value: boolean) {
      manual("breakUpsDisabled", () => {
        state.progress.breakUpsDisabled = value;
        applyEngagementCascade(state.progress.villagerRelationships, value);
      });
    },
    setChildChoice(choice: ChildChoice) {
      manual("childChoice", () => {
        state.progress.childChoice = choice;
      });
    },
    setEverythingGrouping(grouping: "category" | "source") {
      state.everythingGrouping = grouping;
    },
    setHasUpperFloor(value: boolean) {
      manual("hasUpperFloor", () => {
        state.progress.hasUpperFloor = value;
      });
    },
    setHeartLevel(id: VillagerId, level: number) {
      manual(factKey("heartLevels", id), () => {
        state.progress.heartLevels[id] = clampLevel(level, MAX_HEART_LEVEL);
      });
    },
    setMineFloor(floor: number) {
      manual("mineFloor", () => {
        state.progress.mineFloor = clampMineFloor(floor);
      });
    },
    setQuestState(id: QuestId, questState: QuestState) {
      manual(factKey("questStates", id), () => {
        state.progress.questStates[id] = questState;
      });
    },
    setReachedSeason(season: Season) {
      manual("reachedSeason", () => {
        if (seasonOrdinal(season) > seasonOrdinal(state.progress.reachedSeason)) {
          state.progress.reachedSeason = season;
        }
      });
    },
    setRenown(level: number) {
      manual("renown", () => {
        state.progress.renown = clampRenownLevel(level);
      });
    },
    setSeason(season: Season) {
      state.worldState.season = season;
      if (!isWeatherInSeason(state.worldState.weather, season)) {
        state.worldState.weather = "calm";
      }
    },
    setSkillLevel(id: SkillId, level: number) {
      manual(factKey("skillLevels", id), () => {
        state.progress.skillLevels[id] = clampLevel(level, MAX_SKILL_LEVEL);
      });
    },
    /** Sets one relationship; the engagement cascade & child-choice reset it causes are `inferred`. */
    setVillagerRelationship(villagerId: VillagerId, relationship: VillagerRelationship) {
      manual(factKey("villagerRelationships", villagerId), () => {
        const oldMarried = getSpouseId(state.progress.villagerRelationships);
        if (relationship === "undecided") {
          const { [villagerId]: _, ...rest } = state.progress.villagerRelationships;
          state.progress.villagerRelationships = rest;
        } else {
          state.progress.villagerRelationships[villagerId] = relationship;
        }
        applyEngagementCascade(
          state.progress.villagerRelationships,
          state.progress.breakUpsDisabled,
        );
        const newMarried = getSpouseId(state.progress.villagerRelationships);
        if (oldMarried !== newMarried) {
          state.progress.childChoice = "undeclared";
        }
      });
    },
    setWeather(weather: Weather) {
      if (!isWeatherInSeason(weather, state.worldState.season)) return;
      state.worldState.weather = weather;
    },
    /**
     * Starts a syncing lane: erases progress & history, applies the lane's first save, & records
     * the lane, all in one write, so a setup that never gets this far leaves nothing behind. Any old
     * receipt & lane go, replaced by `stamp`'s; the farm-switch backup & pending retires stay.
     * Resolves with whether the write landed.
     */
    startSyncLane(
      lane: SyncLane,
      save: SyncedSave,
      stillWanted: () => boolean = () => true,
      stamp?: SyncApplyStamp,
    ): Promise<boolean> {
      // Built aside from live state, which stays untouched until the write lands, so a lane start
      // that's cancelled or can't be stored never erases anything, even in a later save.
      const staged = emptyLoadedProgress();
      stageSyncSave(
        staged,
        { ...save, metadata: $state.snapshot(save.metadata) },
        $state.snapshot(state.worldState),
      );
      enablePersistenceAfterExplicitReplace();
      return requestProgressWrite({
        guard: stillWanted,
        kind: "staged",
        lane: $state.snapshot(lane),
        ...(stamp ? { stamp } : {}),
        staged,
      });
    },
    get state(): DeepReadonly<UserState> {
      return state;
    },
    /**
     * True while stored progress can't be written (quarantined, from a newer build, or not loaded),
     * so no syncing lane may start.
     */
    get syncBlocked(): boolean {
      return !_persistenceReady;
    },
    /** When the last save came & the gaps learned between saves, while syncing. */
    get syncFreshness(): DeepReadonly<SyncFreshness> | undefined {
      return local.syncFreshness;
    },
    /** This device's sync lane, or `undefined` while it tracks by hand. */
    get syncLane(): DeepReadonly<SyncLane> | undefined {
      return local.syncLane;
    },
    /** Codes this device stopped sharing that the relay hasn't confirmed retired yet. */
    get syncPendingRetires(): readonly DeepReadonly<PendingRetire>[] {
      return local.syncPendingRetires ?? [];
    },
    /** What this device last applied, which only {@link applySyncedSave} & a lane start advance. */
    get syncReceipt(): DeepReadonly<SyncReceipt> | undefined {
      return local.syncReceipt;
    },
    toggleAlmanacItem(id: ItemId) {
      toggleFact("almanac", state.progress.almanac, id);
    },
    toggleAlmanacRecipe(id: RecipeId) {
      toggleFact("almanacRecipes", state.progress.almanacRecipes, id);
    },
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      manual(factKey("animalCosmetics", animalId, cosmeticId), () => {
        const set = getOrCreate(
          state.progress.animalCosmetics,
          animalId,
          () => new SvelteSet<CosmeticId>(),
        );
        toggleInSet(set, cosmeticId);
      });
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
      manual(factKey("animals", animalId, variantId), () => {
        const set = getOrCreate(
          state.progress.animals,
          animalId,
          () => new SvelteSet<AnimalVariantId>(),
        );
        toggleInSet(set, variantId);
      });
    },
    toggleCosmetic(id: CosmeticId) {
      toggleFact("cosmetics", state.progress.cosmetics, id);
    },
    toggleMountAppearance(id: MountAppearanceId) {
      toggleFact("mountAppearances", state.progress.mountAppearances, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleFact("museum", state.progress.museum, id);
    },
    togglePerk(id: PerkId) {
      toggleFact("unlockedPerks", state.progress.unlockedPerks, id);
    },
    togglePetCosmetic(id: PetCosmeticSetId) {
      toggleFact("petCosmetics", state.progress.petCosmetics, id);
    },
    togglePetSkin(id: PetSkinId) {
      toggleFact("petSkins", state.progress.petSkins, id);
    },
    toggleShowSpoilers() {
      state.showSpoilers = !state.showSpoilers;
    },
    toggleSpell(id: SpellId) {
      toggleFact("spells", state.progress.spells, id);
    },
    /**
     * Restores the quest's prior state and removes only recipes added by that transition. The quest
     * records `manual`; the recipes it takes back record `inferred`, as their completion did.
     */
    undoQuestWithRecipes(id: QuestId, { newlyAdded, previousState }: QuestCompletion) {
      track(
        "manual",
        () => {
          state.progress.questStates[id] = previousState;
          for (const recipeId of newlyAdded) {
            state.progress.almanacRecipes.delete(recipeId);
          }
        },
        [factKey("questStates", id)],
      );
    },
    /** Stored progress that couldn't be read, kept so the player can download it; null if none. */
    get unreadableData(): null | string {
      return _unreadableData;
    },
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

function serializePreferences(state: UserState): string {
  const preferences: SerializedPreferences = {
    everythingGrouping: state.everythingGrouping,
    showSpoilers: state.showSpoilers,
  };
  return JSON.stringify(preferences);
}

function toggleInSet<T>(set: Set<T>, item: T): void {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
}

export const userState = createUserState();
