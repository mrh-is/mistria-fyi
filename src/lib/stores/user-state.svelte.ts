import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "#lib/data/index.js";
import {
  emptyMergeCounts,
  nextQuestState,
  questStateRank,
  seasonOrdinal,
} from "#lib/engine/domain-primitives.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "#lib/engine/progress.js";
import { findRecipesForQuest } from "#lib/engine/quest-rewards.js";
import { applyMarriageCascade, getSpouseId, mergeHousehold } from "#lib/engine/relationships.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";
import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";
import { unionInto } from "#lib/utils/set.js";

import {
  backfillAnimalMaps,
  emptyRetainedProgress,
  readProgressBlob,
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

import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
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
  MergeCounts,
  MergeResult,
  ProgressState,
  QuestState,
} from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { DeviceLocalState, LoadedProgress, RetainedProgress } from "./progress-storage.js";

/** How a write treats a value another tab stored since this one last read it. */
type WriteIntent =
  | {
      /** Serialized at confirmation, so later storage events cannot change the requested write. */
      json: string;
      keepLocal: boolean;
      kind: "merge" | "replace";
      progress: ProgressState;
      sequence: number;
    }
  | { generation: number; kind: "auto-save" };

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
  availabilityWindows: AvailabilityWindow[];
  progress: ProgressState;
  showCompleted: boolean;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

/** Per-device display preferences, stored apart from progress so a backup restore keeps them. */
export interface SerializedPreferences {
  availabilityWindows: AvailabilityWindow[];
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

function createDefaultProgress(): ProgressState {
  const animals: Record<string, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const animalId of recordKeys(trackerData.animals)) {
    animals[animalId] = new SvelteSet<AnimalVariantId>();
    animalCosmetics[animalId] = new SvelteSet<CosmeticId>();
  }

  return {
    almanac: new SvelteSet<ItemId>(),
    almanacRecipes: new SvelteSet<RecipeId>(),
    animalCosmetics,
    animals,
    childChoice: "undeclared",
    cosmetics: new SvelteSet<CosmeticId>(),
    dates: new SvelteSet<DateId>(),
    hasUpperFloor: false,
    heartLevels: {},
    mineFloor: 0,
    mountAppearances: new SvelteSet<MountAppearanceId>(),
    museum: new SvelteSet<ItemId>(),
    petCosmetics: new SvelteSet<PetCosmeticSetId>(),
    petSkins: new SvelteSet<PetSkinId>(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    spells: new SvelteSet<SpellId>(),
    unlockedPerks: new SvelteSet<PerkId>(),
    villagerRelationships: {},
  };
}

// ─── Store ──────────────────────────────────────────────────────────

function createDefaultPreferences(): SerializedPreferences {
  return { availabilityWindows: [...DEFAULT_AVAILABILITY_WINDOWS], showSpoilers: false };
}

function createDefaultState(): UserState {
  return {
    ...createDefaultPreferences(),
    progress: createDefaultProgress(),
    showCompleted: false,
    worldState: createDefaultWorldState(),
  };
}

function createDefaultWorldState(): UserState["worldState"] {
  return { season: "spring", weather: "calm" };
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
  let lastKnownPreferencesValue: null | string = null;
  let lastKnownStoredValue: null | string = null;
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;
  let saveGeneration = 0;
  let explicitSequence = 0;

  function clearPendingSave(): void {
    saveGeneration++;
    if (saveTimeout !== undefined) clearTimeout(saveTimeout);
    saveTimeout = undefined;
  }

  function reportStorageUnavailable(): void {
    _persistenceFailureKind = "unavailable";
    _persistenceFailureGeneration++;
  }

  /** The stored form of the current state, `local` section included. */
  function serialize(): string {
    return serializeStoredProgress(state, retained, local);
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
   */
  function writeProgress(intent: WriteIntent): void {
    if (intent.kind === "auto-save" && intent.generation !== saveGeneration) return;
    if (!_persistenceReady) return;
    const storedResult = tryGetItem(PROGRESS_STORAGE_KEY);
    if (!storedResult.ok) {
      reportStorageUnavailable();
      return;
    }

    const stored = storedResult.value;
    const read = stored === null ? undefined : readProgressBlob(stored, "repair");
    if (stored !== null && stored !== lastKnownStoredValue) {
      if (read?.kind === "newer" || intent.kind === "auto-save") {
        applyStorageValue(stored);
        return;
      }
      if (read?.kind === "unreadable") {
        if (!trySetItem(QUARANTINE_STORAGE_KEY, stored)) {
          quarantine(stored);
          return;
        }
        _unreadableData = stored;
      }
    }

    let json = serialize();
    if (intent.kind !== "auto-save") {
      const snapshot = readProgressBlob(intent.json, "repair");
      if (snapshot.kind !== "ok") throw new Error("Invalid captured progress write");
      let loaded = snapshot.loaded;
      if (intent.keepLocal && read?.kind === "ok") loaded.local = read.loaded.local;
      if (intent.kind === "merge" && read?.kind === "ok") {
        loaded = read.loaded;
        // The captured preview includes unsaved local edits as well as the imported progress.
        mergeProgress(loaded.progress, snapshot.loaded.progress);
        mergeRetainedProgress(loaded.retained, snapshot.loaded.retained);
        loaded.worldState = snapshot.loaded.worldState;
      }
      json = serializeStoredProgress(loaded, loaded.retained, loaded.local);
      if (intent.sequence === explicitSequence) {
        if (state.progress !== intent.progress || serialize() === intent.json) {
          replaceProgress(loaded);
        } else if (intent.kind === "merge") {
          // The captured merge is persisted first; later local edits remain for the next auto-save.
          const rebased = readProgressBlob(json, "repair");
          if (rebased.kind !== "ok") throw new Error("Invalid merged progress write");
          rebaseProgressEdits(rebased.loaded.progress, snapshot.loaded.progress, state.progress);
          rebased.loaded.worldState = state.worldState;
          replaceProgress(rebased.loaded);
        }
        local = loaded.local;
      }
    }
    if (json !== stored && !trySetItem(PROGRESS_STORAGE_KEY, json)) {
      reportStorageUnavailable();
      return;
    }
    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
  }

  /**
   * Runs {@link writeProgress} under the progress Web Lock, so no other tab writes between its
   * re-read & its write. Without Web Locks it runs at once: the read & write are synchronous, so
   * only another tab running in parallel in that same instant could slip between them.
   */
  function requestProgressWrite(intent: WriteIntent): void {
    const locks = progressLockManager();
    if (!locks) {
      writeProgress(intent);
      return;
    }
    void writeUnderLock(locks, intent);
  }

  async function writeUnderLock(locks: LockManager, intent: WriteIntent): Promise<void> {
    try {
      await locks.request(PROGRESS_WRITE_LOCK, () => {
        writeProgress(intent);
      });
    } catch {
      // The lock couldn't be taken (e.g. a sandboxed frame); write as a browser without locks does.
      writeProgress(intent);
    }
  }

  /** Captures an explicit write now, rather than after the auto-save debounce. */
  function writeExplicitProgress(kind: "merge" | "replace" = "replace", keepLocal = true): void {
    clearPendingSave();
    requestProgressWrite({
      json: serialize(),
      keepLocal,
      kind,
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
   * Swaps in loaded progress, world state, & retained unknown entries, leaving this device's
   * preferences & `local` section untouched.
   */
  function replaceProgress(loaded: Omit<LoadedProgress, "local">): void {
    state.progress = loaded.progress;
    state.worldState = loaded.worldState;
    retained = loaded.retained;
  }

  /**
   * Adopts stored preferences. They're per-device conveniences, so a missing or unreadable value
   * falls back to defaults field by field instead of blocking anything.
   */
  function applyPreferencesValue(value: null | string): void {
    lastKnownPreferencesValue = value;
    const preferences = deserializePreferences(value);
    state.availabilityWindows = preferences.availabilityWindows;
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
          requestProgressWrite({ generation: saveGeneration, kind: "auto-save" });
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
      state.progress.dates.size > 0 ||
      state.progress.reachedSeason !== "spring" ||
      Object.keys(state.progress.villagerRelationships).length > 0 ||
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

  return {
    /** Cycles the quest's state, completing its recipe rewards on the obtained-to-completed step. */
    completeQuestWithRecipes(id: QuestId): QuestCompletion {
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
      return serializeProgress(state, retained);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
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
      addDefaultUnlocks(state.progress);
    },
    /**
     * Merges a native save into current progress: sets union, levels take the max, and the
     * household follows {@link mergeHousehold}'s conflict policy. Never removes progress.
     */
    mergeFromSave(imported: Partial<ProgressState>): MergeResult {
      const result = mergeProgress(state.progress, imported);

      // Re-importing a save is how a player rebuilds progress after a quarantine, so it unblocks
      // persistence like a reset or restore (only once the unreadable blob is safely stored).
      enablePersistenceAfterExplicitReplace();
      writeExplicitProgress("merge");

      return result;
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
    get progressionState(): UserProgressionState {
      return progressionState;
    },
    /** Restores every field to its default, this device's preferences & `local` section included. */
    resetAll() {
      state = createDefaultState();
      retained = emptyRetainedProgress();
      local = {};
      enablePersistenceAfterExplicitReplace();
      writeExplicitProgress("replace", false);
    },
    /** Clears progress & world state; this device's preferences & `local` section are kept. */
    resetProgress() {
      replaceProgress({
        progress: createDefaultProgress(),
        retained: emptyRetainedProgress(),
        worldState: createDefaultWorldState(),
      });
      enablePersistenceAfterExplicitReplace();
      writeExplicitProgress();
    },
    /**
     * Replaces progress & world state from a backup under the strict policy; this device's
     * preferences & `local` section are kept, and a backup never brings one in. A backup from a
     * newer build is refused, never partly read.
     */
    restoreBackup(json: string): BackupRestoreResult {
      const result = readProgressBlob(json, "strict");
      if (result.kind === "newer") return { error: "newer-version", ok: false };
      if (result.kind === "unreadable") return { error: result.error, ok: false };
      replaceProgress(result.loaded);
      enablePersistenceAfterExplicitReplace();
      writeExplicitProgress();
      return { ok: true };
    },
    setAvailabilityWindows(windows: readonly AvailabilityWindow[]) {
      state.availabilityWindows = AVAILABILITY_WINDOWS.filter((window) => windows.includes(window));
    },
    setChildChoice(choice: ChildChoice) {
      state.progress.childChoice = choice;
    },
    setHasUpperFloor(value: boolean) {
      state.progress.hasUpperFloor = value;
    },
    setHeartLevel(id: VillagerId, level: number) {
      state.progress.heartLevels[id] = clampLevel(level, MAX_HEART_LEVEL);
    },
    setMineFloor(floor: number) {
      state.progress.mineFloor = clampMineFloor(floor);
    },
    setQuestState(id: QuestId, questState: QuestState) {
      state.progress.questStates[id] = questState;
    },
    setReachedSeason(season: Season) {
      if (seasonOrdinal(season) > seasonOrdinal(state.progress.reachedSeason)) {
        state.progress.reachedSeason = season;
      }
    },
    setRenown(level: number) {
      state.progress.renown = clampRenownLevel(level);
    },
    setSeason(season: Season) {
      state.worldState.season = season;
      if (!isWeatherInSeason(state.worldState.weather, season)) {
        state.worldState.weather = "calm";
      }
    },
    setSkillLevel(id: SkillId, level: number) {
      state.progress.skillLevels[id] = clampLevel(level, MAX_SKILL_LEVEL);
    },
    setVillagerRelationship(villagerId: VillagerId, relationship: VillagerRelationship) {
      const oldMarried = getSpouseId(state.progress.villagerRelationships);
      if (relationship === "undecided") {
        const { [villagerId]: _, ...rest } = state.progress.villagerRelationships;
        state.progress.villagerRelationships = rest;
      } else {
        state.progress.villagerRelationships[villagerId] = relationship;
      }
      applyMarriageCascade(state.progress.villagerRelationships);
      const newMarried = getSpouseId(state.progress.villagerRelationships);
      if (oldMarried !== newMarried) {
        state.progress.childChoice = "undeclared";
      }
    },
    setWeather(weather: Weather) {
      if (!isWeatherInSeason(weather, state.worldState.season)) return;
      state.worldState.weather = weather;
    },
    get state(): DeepReadonly<UserState> {
      return state;
    },
    toggleAlmanacItem(id: ItemId) {
      toggleInSet(state.progress.almanac, id);
    },
    toggleAlmanacRecipe(id: RecipeId) {
      toggleInSet(state.progress.almanacRecipes, id);
    },
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      const set = getOrCreate(
        state.progress.animalCosmetics,
        animalId,
        () => new SvelteSet<CosmeticId>(),
      );
      toggleInSet(set, cosmeticId);
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
      const set = getOrCreate(
        state.progress.animals,
        animalId,
        () => new SvelteSet<AnimalVariantId>(),
      );
      toggleInSet(set, variantId);
    },
    toggleAvailabilityWindow(window: AvailabilityWindow) {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- A scratch copy; only the filtered array is stored.
      const selected = new Set(state.availabilityWindows);
      if (selected.has(window)) {
        if (selected.size === 1) return;
        selected.delete(window);
      } else {
        selected.add(window);
      }
      state.availabilityWindows = AVAILABILITY_WINDOWS.filter((candidate) =>
        selected.has(candidate),
      );
    },
    toggleCosmetic(id: CosmeticId) {
      toggleInSet(state.progress.cosmetics, id);
    },
    toggleDate(id: DateId) {
      toggleInSet(state.progress.dates, id);
    },
    toggleMountAppearance(id: MountAppearanceId) {
      toggleInSet(state.progress.mountAppearances, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleInSet(state.progress.museum, id);
    },
    togglePerk(id: PerkId) {
      toggleInSet(state.progress.unlockedPerks, id);
    },
    togglePetCosmetic(id: PetCosmeticSetId) {
      toggleInSet(state.progress.petCosmetics, id);
    },
    togglePetSkin(id: PetSkinId) {
      toggleInSet(state.progress.petSkins, id);
    },
    toggleShowCompleted() {
      state.showCompleted = !state.showCompleted;
    },
    toggleShowSpoilers() {
      state.showSpoilers = !state.showSpoilers;
    },
    toggleSpell(id: SpellId) {
      toggleInSet(state.progress.spells, id);
    },
    /** Restores the quest's prior state and removes only recipes added by that transition. */
    undoQuestWithRecipes(id: QuestId, { newlyAdded, previousState }: QuestCompletion) {
      state.progress.questStates[id] = previousState;
      for (const recipeId of newlyAdded) {
        state.progress.almanacRecipes.delete(recipeId);
      }
    },
    /** Stored progress that couldn't be read, kept so the player can download it; null if none. */
    get unreadableData(): null | string {
      return _unreadableData;
    },
  };
}

/** Applies the additive import policy to an explicit target, including a locked storage snapshot. */
function mergeProgress(progress: ProgressState, imported: Partial<ProgressState>): MergeResult {
  const counts: MergeCounts = emptyMergeCounts();

  counts.almanac = unionInto(progress.almanac, imported.almanac ?? []);
  counts.almanacRecipes = unionInto(progress.almanacRecipes, imported.almanacRecipes ?? []);
  counts.cosmetics = unionInto(progress.cosmetics, imported.cosmetics ?? []);
  counts.dates = unionInto(progress.dates, imported.dates ?? []);
  counts.mountAppearances = unionInto(progress.mountAppearances, imported.mountAppearances ?? []);
  counts.museum = unionInto(progress.museum, imported.museum ?? []);
  counts.perks = unionInto(progress.unlockedPerks, imported.unlockedPerks ?? []);
  counts.petCosmetics = unionInto(progress.petCosmetics, imported.petCosmetics ?? []);
  counts.petSkins = unionInto(progress.petSkins, imported.petSkins ?? []);
  counts.spells = unionInto(progress.spells, imported.spells ?? []);
  for (const [animalId, variants] of recordEntries(imported.animals ?? {})) {
    const existing = getOrCreate(
      progress.animals,
      animalId,
      () => new SvelteSet<AnimalVariantId>(),
    );
    counts.animals += unionInto(existing, variants);
  }
  for (const [animalId, cosmetics] of recordEntries(imported.animalCosmetics ?? {})) {
    const existing = getOrCreate(
      progress.animalCosmetics,
      animalId,
      () => new SvelteSet<CosmeticId>(),
    );
    counts.animalCosmetics += unionInto(existing, cosmetics);
  }

  // Levels are clamped again here so the canonical state stays inside its domains even if a
  // caller bypasses extractSaveProgress's normalization. Scalars report how far they rose.
  if (imported.mineFloor !== undefined) {
    const mineFloor = clampMineFloor(imported.mineFloor);
    if (mineFloor > progress.mineFloor) {
      counts.mineFloor = mineFloor - progress.mineFloor;
      progress.mineFloor = mineFloor;
    }
  }
  if (imported.renown !== undefined) {
    const renown = clampRenownLevel(imported.renown);
    if (renown > progress.renown) {
      counts.renown = renown - progress.renown;
      progress.renown = renown;
    }
  }
  counts.heartLevels = raiseLevels(progress.heartLevels, imported.heartLevels, MAX_HEART_LEVEL);
  counts.skillLevels = raiseLevels(progress.skillLevels, imported.skillLevels, MAX_SKILL_LEVEL);

  // Quest states take the more advanced state: none < obtained < completed.
  for (const [id, importedState] of recordEntries(imported.questStates ?? {})) {
    if (questStateRank(importedState) > questStateRank(progress.questStates[id] ?? "none")) {
      progress.questStates[id] = importedState;
      counts.quests++;
    }
  }

  if (
    imported.reachedSeason !== undefined &&
    seasonOrdinal(imported.reachedSeason) > seasonOrdinal(progress.reachedSeason)
  ) {
    progress.reachedSeason = imported.reachedSeason;
    counts.reachedSeason = 1;
  }
  if (imported.hasUpperFloor && !progress.hasUpperFloor) {
    progress.hasUpperFloor = true;
    counts.hasUpperFloor = 1;
  }

  const household = mergeHousehold(progress, imported);
  progress.villagerRelationships = household.villagerRelationships;
  progress.childChoice = household.childChoice;
  counts.villagerRelationships = household.counts.villagerRelationships;
  counts.childChoice = household.counts.childChoice;

  // Backfill animal maps for any animals added since the imported state was created
  backfillAnimalMaps(progress);
  return { conflicts: household.conflicts, counts };
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
  const relationships = new Set([
    ...recordKeys(before.villagerRelationships),
    ...recordKeys(after.villagerRelationships),
  ]);
  if (
    before.childChoice !== after.childChoice ||
    [...relationships].some(
      (id) => before.villagerRelationships[id] !== after.villagerRelationships[id],
    )
  ) {
    // A later explicit household edit replaces the household as a unit, preserving its cascade.
    target.villagerRelationships = { ...after.villagerRelationships };
    target.childChoice = after.childChoice;
  }
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

/**
 * Raises each level in `target` to its clamped imported value when that is higher, and returns how
 * many levels rose.
 */
function raiseLevels(
  target: Partial<Record<string, number>>,
  imported: Partial<Record<string, number>> | undefined,
  max: number,
): number {
  let raised = 0;
  for (const [id, rawLevel] of recordEntries(imported ?? {})) {
    const level = clampLevel(rawLevel, max);
    if (level > (target[id] ?? 0)) {
      target[id] = level;
      raised++;
    }
  }
  return raised;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
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

  const stored = isStringArray(parsed.availabilityWindows) ? parsed.availabilityWindows : [];
  const windows = AVAILABILITY_WINDOWS.filter((window) => stored.includes(window));
  return {
    availabilityWindows: windows.length > 0 ? windows : defaults.availabilityWindows,
    showSpoilers:
      typeof parsed.showSpoilers === "boolean" ? parsed.showSpoilers : defaults.showSpoilers,
  };
}

function serializePreferences(state: UserState): string {
  const preferences: SerializedPreferences = {
    availabilityWindows: [...state.availabilityWindows],
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
