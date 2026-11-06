import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "#lib/data/index.js";
import { nextQuestState, questStateRank, seasonOrdinal } from "#lib/engine/domain-primitives.js";
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
  holdsGuess,
  obtainedSourceOf,
  progressFacts,
} from "#lib/engine/provenance.js";
import { findRecipesForQuest } from "#lib/engine/quest-rewards.js";
import { applyEngagementCascade, getPartnerId, getSpouseId } from "#lib/engine/relationships.js";
import { compareFarms, mergeFarmIdentity } from "#lib/engine/save-identity.js";
import { applyAdditiveSave, mergeProgress } from "#lib/engine/save-progress.js";
import { applySync, receiptCovers } from "#lib/engine/sync-apply.js";
import { nextFreshness } from "#lib/engine/sync-freshness.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

import {
  emptyProgressHistory,
  emptyRetainedProgress,
  readFarmSwitchBackup,
  readProgressBlob,
  serializeFarmSwitch,
  serializeProgress,
  serializeStoredProgress,
  withoutDeviceLocal,
} from "./progress-storage.js";
import {
  PREFERENCES_STORAGE_KEY,
  PROGRESS_STORAGE_KEY,
  PROGRESS_WRITE_LOCK,
  QUARANTINE_STORAGE_KEY,
} from "./storage-keys.js";

import type { SaveExtraction } from "#lib/engine/import-save.js";
import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  FactProvenance,
  ProgressHistory,
  ProvenanceSource,
  Resolution,
} from "#lib/engine/provenance.js";
import type { SyncAnswers, SyncQuestion, SyncReceipt, SyncResult } from "#lib/engine/sync-apply.js";
import type { GameDate, SyncFreshness } from "#lib/engine/sync-freshness.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { FarmIdentity, SaveImportMetadata } from "#lib/types/save-identity.js";
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
import type {
  ChildChoice,
  MergeResult,
  ProgressState,
  QuestState,
} from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type {
  DeviceLocalState,
  FarmSwitchBackup,
  LoadedProgress,
  ProgressSnapshot,
  RetainedProgress,
  SyncLane,
} from "./progress-storage.js";

/** How a write treats a value another tab stored since this one last read it. */
type WriteIntent =
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
  | {
      base: null | string;
      before: string;
      imported: Partial<ProgressState>;
      kind: "merge";
      options: ManualImportOptions;
      progress: ProgressState;
      sequence: number;
      settle: (outcome: ManualImportOutcome) => void;
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

/** A save file read for sync: the progress it records, its farm, & its playtime. */
export interface SyncedSave {
  completed: Partial<ProgressState>;
  metadata: SaveImportMetadata;
  playtime: number | undefined;
}

interface ManualImportOptions {
  confirmedFarm?: string;
  metadata?: SaveImportMetadata;
  playtime?: number;
}

export type ManualImportOutcome =
  | { farm: string; kind: "ask" }
  | { kind: "applied"; result: MergeResult }
  | { kind: "busy" | "newer-data" | "sync-active" | "write-failed" };

/** What an applied save leaves in `local`: its receipt & when it came. */
export interface SyncApplyStamp {
  gameDate: GameDate | undefined;
  modified: number;
  receipt: SyncReceipt;
}

/** A save to apply through the single write path, with the answers given so far. */
export interface SyncApplyRequest extends SyncApplyStamp {
  answers: SyncAnswers;
  extraction: SaveExtraction;
  metadata: SaveImportMetadata;
  /** The lane this save belongs to. Any other stored lane (stopped, or another code) refuses it. */
  wantsLane: (lane: DeepReadonly<SyncLane> | undefined) => boolean;
}

/** {@link SyncQuestion}s, & the one question the write itself asks before it replaces a backup. */
export type SyncApplyQuestion =
  | Exclude<SyncQuestion, { kind: "farm" }>
  | { farmName: null | string; id: string; kind: "farm" }
  | { farmName: null | string; id: string; kind: "replace-backup"; savedAt: number };

/**
 * What a sync apply did. Only `applied` wrote anything:
 *
 * - `ask`: nothing changes until these are answered.
 * - `blocked`: the store is quarantined or holds a newer build's data.
 * - `skipped`: the receipt already covers this save.
 * - `stale`: the stored lane no longer wants this save.
 * - `switch-failed`: another farm's save, whose backup couldn't be written, so no switch happened.
 * - `write-failed`: storage refused the write.
 */
export type SyncApplyOutcome =
  | { kind: "applied"; result: SyncResult }
  | { kind: "ask"; questions: SyncApplyQuestion[] }
  | { kind: "blocked" | "skipped" | "stale" | "switch-failed" | "write-failed" };

/** The code a computer lane shares: its key & the write token only that device holds. */
export type SharedCode = NonNullable<Extract<SyncLane, { kind: "computer" }>["code"]>;

/** A code waiting for the relay to confirm it's retired. */
export type PendingRetire = NonNullable<DeviceLocalState["syncPendingRetires"]>[number];

function emptyLoadedProgress(): Omit<LoadedProgress, "local"> {
  return {
    history: emptyProgressHistory(),
    lastImport: null,
    progress: createDefaultProgress(SvelteSet, ANIMAL_IDS),
    retained: emptyRetainedProgress(),
    worldState: createDefaultWorldState(),
  };
}

/** The `local` slots an applied save advances, which only an applying write may set. */
function stampedLocal(
  previous: DeviceLocalState["syncFreshness"],
  { gameDate, modified, receipt }: SyncApplyStamp,
): Pick<DeviceLocalState, "syncFreshness" | "syncReceipt"> {
  return {
    syncFreshness: nextFreshness(previous, modified, gameDate),
    syncReceipt: { ...receipt },
  };
}

function withRetire(
  pending: readonly PendingRetire[] | undefined,
  retire: PendingRetire | undefined,
): PendingRetire[] | undefined {
  if (retire === undefined) return pending === undefined ? undefined : [...pending];
  const others = (pending ?? []).filter((entry) => entry.mailboxId !== retire.mailboxId);
  return [...others, { ...retire }];
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
  let backupReplacementQuestion: undefined | { id: string; snapshot: string };
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
    const read = stored === null ? undefined : readProgressBlob(stored, "repair");
    if (
      intent.kind === "merge" &&
      (local.syncLane || (read?.kind === "ok" && read.loaded.local.syncLane))
    ) {
      intent.settle({ kind: "sync-active" });
      return false;
    }
    if (stored !== null && stored !== lastKnownStoredValue) {
      if (read?.kind === "newer" || intent.kind === "auto-save") {
        applyStorageValue(stored);
        if (intent.kind === "merge") intent.settle({ kind: "newer-data" });
        return false;
      }
      if (read?.kind === "unreadable") {
        // A sync apply never takes manual import's way past unreadable data.
        if (intent.kind === "sync" || !trySetItem(QUARANTINE_STORAGE_KEY, stored)) {
          quarantine(stored);
          return false;
        }
        _unreadableData = stored;
      }
    }

    if (intent.kind === "local") return writeLocalPatch(intent.update, stored, read);
    if (intent.kind === "staged") return writeStaged(intent, stored, read);
    if (intent.kind === "sync") return writeSyncApply(intent, stored);

    if (intent.kind === "merge") return writeManualMerge(intent, stored, read);

    let json: string;
    if (intent.kind === "auto-save") {
      json = serialize();
    } else {
      const captured = readProgressBlob(intent.json, "repair");
      if (captured.kind !== "ok") throw new Error("Invalid captured progress write");
      const { loaded } = captured;
      if (intent.keepLocal && read?.kind === "ok") loaded.local = read.loaded.local;
      if (intent.dropReceipt) {
        const { syncReceipt: _receipt, ...kept } = loaded.local;
        loaded.local = kept;
      }
      json = serializeStoredProgress(loaded, loaded.local);
      if (intent.sequence === explicitSequence) {
        if (
          state.progress !== intent.progress ||
          (state.progress !== pendingManualProgress && serialize() === intent.json)
        ) {
          replaceProgress(loaded);
        }
        local = loaded.local;
      }
    }
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      return false;
    }
    lastKnownStoredValue = json;
    if (intent.kind === "replace" && intent.sequence === explicitSequence) {
      pendingExplicitJson = undefined;
    }
    _persistenceFailureGeneration = 0;
    return true;
  }

  /** Checks both farms under the write lock before applying or exposing any imported progress. */
  function writeManualMerge(
    intent: Extract<WriteIntent, { kind: "merge" }>,
    stored: null | string,
    read: ReturnType<typeof readProgressBlob> | undefined,
  ): boolean {
    const captured = readProgressBlob(intent.before, "repair");
    if (captured.kind !== "ok") throw new Error("Invalid captured progress write");
    const { confirmedFarm, metadata, playtime } = intent.options;
    const current = read?.kind === "ok" ? read.loaded : undefined;
    const capturedFarm = captured.loaded.lastImport?.identity ?? null;
    const storedFarm = current?.lastImport?.identity ?? null;
    const incomingFarm = metadata?.identity ?? null;
    const farm = manualFarmQuestion(capturedFarm, storedFarm, incomingFarm);
    if (farm !== undefined && farm !== confirmedFarm) {
      intent.settle({ farm, kind: "ask" });
      return false;
    }

    const preview = captured.loaded;
    const result = applyAdditiveSave(preview.progress, preview.history, intent.imported, playtime);
    if (metadata) preview.lastImport = importMetadata(storedFarm ?? capturedFarm, metadata);
    const loaded = current
      ? mergeCapturedImport(current, preview, storedHistory(intent.base), metadata !== undefined)
      : preview;
    const json = serializeStoredProgress(loaded, loaded.local);
    let live: LoadedProgress | undefined;
    if (intent.sequence === explicitSequence) {
      live = loaded;
      if (state.progress === intent.progress && serialize() !== intent.before) {
        // Edits after confirmation are saved after the import, and keep their intended effects.
        const rebased = readProgressBlob(json, "repair");
        const original = readProgressBlob(intent.before, "repair");
        if (rebased.kind !== "ok" || original.kind !== "ok") {
          throw new Error("Invalid merged progress write");
        }
        live = rebased.loaded;
        rebaseProgressEdits(live.progress, original.loaded.progress, state.progress);
        const currentHistory = $state.snapshot<unknown>(history) as ProgressHistory;
        const laterEdits = changedFacts(
          progressFacts(original.loaded.progress),
          progressFacts(state.progress),
        );
        rebaseImportEdits(
          live.history,
          original.loaded.history,
          currentHistory,
          laterEdits,
          editPlaytime(preview.history),
        );
        live.worldState = state.worldState;
      }
    }
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      return false;
    }
    if (live) {
      clearPendingSave();
      replaceProgress(live);
      local = loaded.local;
    }
    enablePersistenceAfterExplicitReplace();
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
    intent.settle({ kind: "applied", result });
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
    read: ReturnType<typeof readProgressBlob> | undefined,
  ): boolean {
    // An unreadable stored value has no `local` section to patch.
    if (stored !== null && read?.kind !== "ok") return false;
    const base = read?.kind === "ok" ? read.loaded : { ...snapshot(), local };
    const next = update(base.local);
    if (next === undefined) return false;
    const json = serializeStoredProgress(base, next);
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      return false;
    }
    // Another tab's newer progress is adopted, as an auto-save adopts it, so no later save here
    // writes over it.
    if (read?.kind === "ok" && stored !== lastKnownStoredValue) {
      clearPendingSave();
      pendingExplicitJson = undefined;
      replaceProgress(read.loaded);
    }
    local = next;
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
    return true;
  }

  /**
   * The body of a lane start, inside the lock: checks it's still wanted, stores the staged progress
   * with the lane added to the stored `local` section (its farm-switch backup & pending retires
   * kept; any old receipt & lane gone), & only then makes it live, discarding this tab's unsaved
   * edits, which the erase replaces.
   */
  function writeStaged(
    intent: Extract<WriteIntent, { kind: "staged" }>,
    stored: null | string,
    read: ReturnType<typeof readProgressBlob> | undefined,
  ): boolean {
    if (!intent.guard()) return false;
    const storedLocal = read?.kind === "ok" ? read.loaded.local : local;
    const {
      syncFreshness: _freshness,
      syncLane: _lane,
      syncReceipt: _receipt,
      ...kept
    } = storedLocal;
    const nextLocal: DeviceLocalState = {
      ...kept,
      ...(intent.stamp && stampedLocal(undefined, intent.stamp)),
      syncLane: intent.lane,
    };
    const json = serializeStoredProgress(intent.staged, nextLocal);
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      return false;
    }
    clearPendingSave();
    pendingExplicitJson = undefined;
    replaceProgress(intent.staged);
    local = nextLocal;
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
    return true;
  }

  /**
   * The body of a sync apply, inside the lock: settles the save against the progress as it stands
   * now, so a question whose effect changed while it waited comes back with a new ID, & writes the
   * result, the receipt, & any farm-switch backup in one write. Nothing here unblocks persistence:
   * {@link writeProgress} has already refused a quarantined store or a newer build's data.
   */
  function writeSyncApply(
    { request, settle }: Extract<WriteIntent, { kind: "sync" }>,
    stored: null | string,
  ): boolean {
    // Another tab's value is adopted first, as an auto-save adopts it; otherwise this tab's own
    // unsaved edits are part of what the save is settled against.
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
    if (receiptCovers(local.syncReceipt, request.receipt)) {
      settle({ kind: "skipped" });
      return false;
    }

    const base = current.loaded;
    const empty = emptyLoadedProgress();
    const outcome = applySync(
      { farm: base.lastImport?.identity ?? null, history: base.history, progress: base.progress },
      { extraction: request.extraction, farm: request.metadata.identity },
      {
        answers: request.answers,
        fresh: { farm: null, history: empty.history, progress: empty.progress },
      },
    );
    if (outcome.kind === "ask") {
      // The farm question names the save's farm, which only the request knows.
      const { farmName } = request.metadata;
      const questions = outcome.questions.map((question) =>
        question.kind === "farm" ? { ...question, farmName } : question,
      );
      settle({ kind: "ask", questions });
      return false;
    }

    const { result } = outcome;
    const replaced = result.farmSwitch ? readFarmSwitchBackup(local) : undefined;
    if (replaced) {
      const backupSnapshot = JSON.stringify([request.metadata.identity, replaced]);
      if (backupReplacementQuestion?.snapshot !== backupSnapshot) {
        // Compare the complete snapshot inside the lock, but keep the ID sent between tabs small.
        backupReplacementQuestion = {
          id: `replace-backup:${crypto.randomUUID()}`,
          snapshot: backupSnapshot,
        };
      }
      const { id } = backupReplacementQuestion;
      if (request.answers[id] !== "accept") {
        const { farmName, savedAt } = replaced;
        settle({ kind: "ask", questions: [{ farmName, id, kind: "replace-backup", savedAt }] });
        return false;
      }
    }

    const next: ProgressSnapshot = {
      history: result.state.history,
      // Keeping current progress applies nothing from the older save, its names included.
      lastImport:
        result.rollback === "declined"
          ? base.lastImport
          : { ...request.metadata, identity: result.state.farm ?? request.metadata.identity },
      progress: result.state.progress,
      retained: result.farmSwitch ? empty.retained : base.retained,
      worldState: result.farmSwitch ? empty.worldState : base.worldState,
    };
    const nextLocal: DeviceLocalState = { ...local, ...stampedLocal(local.syncFreshness, request) };
    const built = result.farmSwitch
      ? serializeFarmSwitch(next, base, nextLocal)
      : serializeStoredProgress(next, nextLocal);
    const failure = result.farmSwitch ? "switch-failed" : "write-failed";
    const written = built === null ? undefined : readProgressBlob(built, "repair");
    if (written?.kind !== "ok") {
      settle({ kind: failure });
      return false;
    }
    // Written as memory will serialize it, so the auto-save finds nothing left to write.
    const json = serializeStoredProgress(written.loaded, written.loaded.local);
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      settle({ kind: failure });
      return false;
    }
    clearPendingSave();
    pendingExplicitJson = undefined;
    replaceProgress(written.loaded);
    local = written.loaded.local;
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
    settle({ kind: "applied", result });
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
    /** Forgets the retires the relay has confirmed. */
    confirmRetired(confirmed: readonly PendingRetire[]): Promise<boolean> {
      return writeLocal((stored) => {
        const pending = stored.syncPendingRetires ?? [];
        const left = pending.filter(
          (retire) => !confirmed.some((done) => done.mailboxId === retire.mailboxId),
        );
        if (left.length === pending.length) return undefined;
        const { syncPendingRetires: _pending, ...kept } = $state.snapshot(
          stored,
        ) as DeviceLocalState;
        return left.length > 0 ? { ...kept, syncPendingRetires: [...left] } : kept;
      });
    },
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
      options: ManualImportOptions = {},
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
    /**
     * Records the code the computer lane now shares. A code it replaces joins the pending retires
     * in the same write, so the old code is retired only once the new one is stored. Resolves
     * with whether that write landed.
     */
    setSharedCode(
      code: SharedCode,
      replaced?: { code: SharedCode; retire: PendingRetire },
    ): Promise<boolean> {
      return writeLocal((stored) => {
        // Only the code this change replaces may be replaced: a code another tab stored meanwhile
        // would otherwise stay live with nothing left to retire it.
        const lane = stored.syncLane;
        if (lane?.kind !== "computer" || lane.code?.key !== replaced?.code.key) return undefined;
        const current = $state.snapshot(stored) as DeviceLocalState;
        return {
          ...current,
          syncLane: { code: { ...code }, kind: "computer" },
          syncPendingRetires: withRetire(current.syncPendingRetires, replaced?.retire),
        };
      });
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
      staged.lastImport = $state.snapshot(save.metadata);
      applyAdditiveSave(staged.progress, staged.history, save.completed, save.playtime);
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
     * Returns the device to tracking by hand, keeping progress & history: only the receipt, the
     * lane, & its key go. A code the computer shared joins the pending retires in the same write,
     * so it's retired only once leaving has landed. Resolves with whether that write landed.
     */
    stopSyncing(stopped?: { code: SharedCode; retire: PendingRetire }): Promise<boolean> {
      return writeLocal((stored) => {
        const lane = stored.syncLane;
        const storedCode = lane?.kind === "computer" ? lane.code?.key : undefined;
        if (storedCode !== stopped?.code.key) return undefined;
        const current = $state.snapshot(stored) as DeviceLocalState;
        const {
          syncFreshness: _freshness,
          syncLane: _lane,
          syncReceipt: _receipt,
          ...kept
        } = current;
        return {
          ...kept,
          syncPendingRetires: withRetire(kept.syncPendingRetires, stopped?.retire),
        };
      });
    },
    /** Follows another code without leaving the lane; the next save applies with the usual rules. */
    switchFollowKey(key: string, stillWanted: () => boolean = () => true): Promise<boolean> {
      return writeLocal((stored) => {
        if (!stillWanted() || stored.syncLane?.kind !== "following") return undefined;
        const current = $state.snapshot(stored) as DeviceLocalState;
        const { syncReceipt: _receipt, ...kept } = current;
        return { ...kept, syncLane: { key, kind: "following" } };
      });
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

/**
 * A confirmation is valid only for the farms compared in this write. The captured progress can
 * also conflict with the stored farm when another tab changed farms without a storage event.
 */
function manualFarmQuestion(
  captured: FarmIdentity | null,
  stored: FarmIdentity | null,
  incoming: FarmIdentity | null,
): string | undefined {
  if (
    (stored && compareFarms(captured, stored) === "different") ||
    (incoming &&
      (compareFarms(captured, incoming) === "different" ||
        compareFarms(stored, incoming) === "different"))
  ) {
    return JSON.stringify(
      [captured, stored, incoming].map((identity) => {
        if (!identity) return null;
        const { creationVersion: version, saveNumber } = identity;
        return [saveNumber, version && [version.major, version.minor, version.patch, version.pre]];
      }),
    );
  }
  return undefined;
}

function importMetadata(
  tracked: FarmIdentity | null,
  metadata: SaveImportMetadata,
): SaveImportMetadata {
  const { identity } = metadata;
  if (identity.saveNumber === null && tracked?.saveNumber) {
    return { ...metadata, identity: tracked };
  }
  return {
    ...metadata,
    identity:
      compareFarms(tracked, identity) === "same" ? mergeFarmIdentity(tracked, identity) : identity,
  };
}

/** Reconciles the captured preview, including unsaved edits, with what another tab stored. */
function mergeCapturedImport(
  stored: LoadedProgress,
  captured: LoadedProgress,
  baseHistory: ProgressHistory,
  importedSave: boolean,
): LoadedProgress {
  const storedFacts = progressFacts(stored.progress);
  mergeProgress(stored.progress, captured.progress);
  mergeRetainedProgress(stored.retained, captured.retained);
  stored.worldState = captured.worldState;
  if (importedSave) stored.lastImport = captured.lastImport;
  const mergedFacts = progressFacts(stored.progress);
  const capturedFacts = progressFacts(captured.progress);
  const storedProvenance = stored.history.provenance;
  // A save agreeing with a fact already stored leaves its provenance alone, unless the save
  // confirms a guess for the value the merge kept.
  rebaseHistory(
    stored.history,
    baseHistory,
    captured.history,
    (key, { source }) =>
      (source === "save" || source === "unknown") &&
      !(
        source === "save" &&
        Object.hasOwn(storedProvenance, key) &&
        holdsGuess(storedProvenance[key]) &&
        capturedFacts.get(key) === mergedFacts.get(key)
      ) &&
      storedFacts.has(key) &&
      storedFacts.get(key) === mergedFacts.get(key),
    importedSave,
  );
  return stored;
}

/** Retain unknown IDs from both sides of an additive import; opaque relationship conflicts keep storage. */
function mergeRetainedProgress(target: RetainedProgress, imported: RetainedProgress): void {
  for (const field of ["animalCosmetics", "animals", "lists"] as const) {
    const entries: Record<string, string[] | undefined> = target[field];
    for (const [id, values] of recordEntries(imported[field])) {
      entries[id] = [...new Set([...(entries[id] ?? []), ...values])];
    }
  }
  for (const field of ["heartLevels", "skillLevels"] as const) {
    for (const [id, value] of recordEntries(imported[field])) {
      target[field][id] = Math.max(target[field][id] ?? 0, value);
    }
  }
  for (const [id, value] of recordEntries(imported.questStates)) {
    if (questStateRank(value) > questStateRank(target.questStates[id] ?? "none")) {
      target.questStates[id] = value;
    }
  }
  target.villagerRelationships = {
    ...imported.villagerRelationships,
    ...target.villagerRelationships,
  };
}

/** Rebase only edits made after confirmation; unchanged fields retain concurrent stored progress. */
function rebaseProgressEdits(
  target: ProgressState,
  before: ProgressState,
  after: ProgressState,
): void {
  rebaseFields(
    target as unknown as Record<string, unknown>,
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );
  const beforeSpouse = getSpouseId(before.villagerRelationships);
  const afterSpouse = getSpouseId(after.villagerRelationships);
  if (
    beforeSpouse !== afterSpouse ||
    getPartnerId(before.villagerRelationships) !== getPartnerId(after.villagerRelationships) ||
    (before.childChoice !== after.childChoice &&
      getSpouseId(target.villagerRelationships) !== afterSpouse)
  ) {
    // A later change of partners keeps that household together. A child choice must also stay
    // with the spouse it was made for.
    target.villagerRelationships = { ...after.villagerRelationships };
    target.breakUpsDisabled = after.breakUpsDisabled;
    target.childChoice = after.childChoice;
  } else {
    applyEngagementCascade(target.villagerRelationships, target.breakUpsDisabled);
  }
}

/**
 * Rebases history as {@link rebaseProgressEdits} rebases progress: each entry `after` added,
 * changed, or removed since `before` applies to `target`, and every other entry keeps `target`'s.
 * Entries are whole, so a fact's source & playtime always come from the same recording. The last
 * save's baseline is whole too, and `appliedSave` says `after` applied a save.
 */
function rebaseHistory(
  target: ProgressHistory,
  before: Readonly<ProgressHistory>,
  after: Readonly<ProgressHistory>,
  keepTarget?: (key: string, entry: FactProvenance) => boolean,
  appliedSave = false,
): void {
  rebaseEntries(target.provenance, before.provenance, after.provenance, keepTarget);
  rebaseEntries(target.resolutions, before.resolutions, after.resolutions);
  // The baseline's two fields describe one save, so they move together. A save `after` applied
  // replaces it even when the save left it as it was.
  if (
    appliedSave ||
    before.lastSavePlaytime !== after.lastSavePlaytime ||
    before.lastSaveUnordered !== after.lastSaveUnordered
  ) {
    if (after.lastSavePlaytime === undefined) delete target.lastSavePlaytime;
    else target.lastSavePlaytime = after.lastSavePlaytime;
    if (after.lastSaveUnordered === undefined) delete target.lastSaveUnordered;
    else target.lastSaveUnordered = after.lastSaveUnordered;
  }
}

/** Edits made after import confirmation carry the accepted save's playtime once it lands. */
function rebaseImportEdits(
  target: ProgressHistory,
  before: ProgressHistory,
  after: ProgressHistory,
  changed: string[],
  playtime: number | undefined,
): void {
  rebaseHistory(target, before, after);
  const previous = editPlaytime(before);
  for (const key of changed) {
    const record = Object.hasOwn(after.provenance, key) ? after.provenance[key] : undefined;
    if (record?.source === "manual" || record?.source === "inferred") {
      const rebased = { ...record };
      if (record.playtime === previous) {
        if (playtime === undefined) delete rebased.playtime;
        else rebased.playtime = playtime;
      }
      target.provenance[key] = rebased;
    }
  }
}

/** As {@link rebaseHistory}, entry by entry; `keepTarget` keeps `target`'s for a changed entry. */
function rebaseEntries<V>(
  target: Record<string, V>,
  before: Readonly<Record<string, V>>,
  after: Readonly<Record<string, V>>,
  keepTarget?: (key: string, entry: V) => boolean,
): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (Object.hasOwn(after, key) && keepTarget?.(key, after[key])) continue;
    if (Object.hasOwn(after, key)) target[key] = after[key];
    else Reflect.deleteProperty(target, key);
  }
}

/** The history a stored value holds; none for an absent or unreadable one. */
function storedHistory(json: null | string): ProgressHistory {
  const read = json === null ? undefined : readProgressBlob(json, "repair");
  return read?.kind === "ok" ? read.loaded.history : emptyProgressHistory();
}

function rebaseFields(
  target: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): void {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = before[key];
    const current = after[key];
    const destination = target[key];
    if (previous instanceof Set && current instanceof Set && destination instanceof Set) {
      for (const value of previous) if (!current.has(value)) destination.delete(value);
      for (const value of current) if (!previous.has(value)) destination.add(value);
    } else if (isRecord(previous) && isRecord(current) && isRecord(destination)) {
      rebaseFields(destination, previous, current);
    } else if (previous !== current) {
      if (Object.hasOwn(after, key)) target[key] = current;
      else Reflect.deleteProperty(target, key);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
