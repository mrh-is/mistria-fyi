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
import { progressFingerprint } from "#lib/engine/tracking-reminders.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";
import { stageSyncSave, syncLaneOperations } from "#lib/sync/lane-operations.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

import { createDefaultPreferences, createProgressRepository } from "./progress-repository.js";
import {
  createDefaultWorldState,
  emptyProgressHistory,
  emptyRetainedProgress,
  readFarmSwitchBackup,
  readProgressBlob,
  serializeProgress,
  withoutDeviceLocal,
} from "./progress-storage.js";

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
  TrackingLane,
  TrackingReminders,
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

import type { PersistenceFailureKind, PersistenceStatus } from "./progress-repository.js";
import type { FarmSwitchBackup, LoadedProgress, RetainedProgress } from "./progress-storage.js";

export type {
  SyncApplyOutcome,
  SyncApplyQuestion,
  SyncedSave,
  TrackingLane,
  TrackingReminders,
} from "#lib/sync/lane-state.js";

export { PERSIST_DEBOUNCE_MS } from "./progress-repository.js";
export type { PersistenceFailureKind, SerializedPreferences } from "./progress-repository.js";

// ─── Types ──────────────────────────────────────────────────────────

/** The outcome of restoring a backup with `restoreBackup`, which replaces all progress. */
export type BackupRestoreResult = { error: BackupRestoreErrorKind; ok: false } | { ok: true };
/** `newer-version`: a newer build wrote the backup, so this one can't read it. */
export type BackupRestoreErrorKind = "invalid-fields" | "malformed-json" | "newer-version";

/** The outcome of one `completeQuestWithRecipes` call, enough to undo exactly that call. */
export interface QuestCompletion {
  newlyAdded: RecipeId[];
  previousState: QuestState;
}

interface StarterItemsNotice {
  count: number;
  dismiss: () => void;
  undo: () => void;
}

export interface UserState {
  everythingGrouping: "category" | "source";
  lastImport: null | SaveImportMetadata;
  progress: ProgressState;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

function addDefaultUnlocks(progress: ProgressState): { key: string; remove: () => void }[] {
  const added: { key: string; remove: () => void }[] = [];

  function add<T extends string>(key: string, set: Set<T>, id: T): void {
    if (set.has(id)) return;
    set.add(id);
    added.push({ key, remove: () => set.delete(id) });
  }

  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.sources.some((s) => s.type === "default")) {
      add(factKey("cosmetics", id), progress.cosmetics, id);
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
          add(factKey("animals", animalId, variantId), variantSet, variantId);
        }
      }
    }
  }

  for (const [id, recipe] of recordEntries(trackerData.recipes)) {
    if (recipe.sources.some((s) => s.type === "default")) {
      add(factKey("almanacRecipes", id), progress.almanacRecipes, id);
    }
  }
  return added;
}

const ANIMAL_IDS = recordKeys(trackerData.animals);

// ─── Store ──────────────────────────────────────────────────────────

function createDefaultState(): UserState {
  return {
    ...createDefaultPreferences(),
    lastImport: null,
    progress: createDefaultProgress(SvelteSet, ANIMAL_IDS),
    worldState: createDefaultWorldState(),
  };
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
  let retained = $state.raw<RetainedProgress>(emptyRetainedProgress());
  /** This device's own section of the stored blob; never exported, kept across a restore. */
  let local = $state.raw<DeviceLocalState>({});
  /** Provenance & resolutions stay reactive until the feature facades are extracted. */
  let history = $state<ProgressHistory>(emptyProgressHistory());
  let trackingSource: ProvenanceSource | undefined;
  let starterItems = $state.raw<StarterItemsNotice>();
  /** A hand edit held back until the player chooses a tracking lane; see {@link handEdit}. */
  let pendingHandEdit = $state.raw<(() => void) | undefined>(undefined);
  let choosingSync = $state(false);

  function snapshot(): Omit<LoadedProgress, "local"> {
    return {
      history,
      lastImport: state.lastImport,
      progress: state.progress,
      retained,
      worldState: state.worldState,
    };
  }

  const persistence = $state<PersistenceStatus>({
    failureGeneration: 0,
    failureKind: "unavailable",
    preferencesReady: false,
    ready: false,
    unreadableData: null,
  });
  const repository = createProgressRepository(
    {
      emptyProgress: emptyLoadedProgress,
      // Widen before Svelte maps the recursive JsonValue in resolutions; the result stays history.
      historySnapshot: () => $state.snapshot<object>(history) as ProgressHistory,
      get local() {
        return local;
      },
      set local(value) {
        local = value;
      },
      get preferences() {
        return { everythingGrouping: state.everythingGrouping, showSpoilers: state.showSpoilers };
      },
      set preferences(value) {
        state.everythingGrouping = value.everythingGrouping;
        state.showSpoilers = value.showSpoilers;
      },
      snapshot,
    },
    {
      events: "window" in globalThis ? globalThis.window : undefined,
      locks: () => {
        const { navigator } = globalThis as { navigator?: { locks?: LockManager } };
        return navigator?.locks;
      },
      ownsStorage: (storage) => storage === globalThis.localStorage,
      read: tryGetItem,
      write: trySetItem,
    },
    (value) => {
      Object.assign(persistence, value);
    },
  );
  repository.onExternalChange(replaceProgress);

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

  /**
   * Swaps in loaded progress, world state, retained unknown entries, & history, leaving this
   * device's preferences & `local` section untouched.
   */
  function replaceProgress(loaded: Omit<LoadedProgress, "local">): void {
    starterItems = undefined;
    state.lastImport = loaded.lastImport;
    state.progress = loaded.progress;
    state.worldState = loaded.worldState;
    retained = loaded.retained;
    history = loaded.history;
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

  // Effects observe runes; the repository owns debounce, storage, & event handling.
  if ("window" in globalThis) {
    $effect.root(() => {
      $effect(() => {
        if (persistence.ready) repository.schedule(repository.serialize());
      });
      $effect(() => {
        if (persistence.preferencesReady) repository.savePreferences();
      });
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

  // Provenance includes unticks, so undoing the starter items still counts as having started.
  const canStartTrackingByHand = $derived(
    !local.syncLane &&
      !state.lastImport &&
      !hasAnyProgress &&
      Object.keys(history.provenance).length === 0,
  );

  function applyStarterItems(): void {
    const added = track("inferred", () => addDefaultUnlocks(state.progress));
    if (added.length === 0) return;

    const batch = added.map((fact) => ({ ...fact, provenance: history.provenance[fact.key] }));
    const notice: StarterItemsNotice = {
      count: batch.length,
      dismiss() {
        if (starterItems === notice) starterItems = undefined;
      },
      undo() {
        if (starterItems !== notice) return;
        track("inferred", () => {
          for (const { key, provenance, remove } of batch) {
            if (history.provenance[key] === provenance) remove();
          }
        });
        notice.dismiss();
      },
    };
    starterItems = notice;
  }

  function trackHandEdit<T>(
    source: "inferred" | "manual",
    edit: () => T,
    primary: readonly string[] = [],
  ): T {
    const starting = trackingSource === undefined && canStartTrackingByHand;
    const result = track(source, edit, primary);
    if (starting && hasAnyProgress) applyStarterItems();
    return result;
  }

  /**
   * The device's tracking lane. A sync lane always means syncing; a stored `sync` without one can
   * only be left over, and progress left behind is tracked by hand.
   */
  const trackingLane = $derived.by((): TrackingLane | undefined => {
    if (local.syncLane) return "sync";
    return local.trackingLane === undefined ? undefined : "manual";
  });

  const facts = $derived(progressFacts(state.progress));

  /**
   * Runs a player's edit, unless nothing may be recorded yet: a device that stores progress
   * records nothing by hand until it has a tracking lane. The edit then waits for the player's
   * choice; {@link startTrackingByHand} runs it & {@link cancelLaneChoice} drops it. Edits nested in
   * another tracked change run as part of it. Returns the edit's result, or `undefined` if it waits.
   */
  function handEdit<T>(run: () => T): T | undefined {
    if (trackingSource === undefined && persistence.ready && trackingLane === undefined) {
      choosingSync = false;
      pendingHandEdit = () => {
        run();
      };
      return undefined;
    }
    return run();
  }

  /** Runs a player's edit of one fact, recording it as `manual`; see {@link track}. */
  function manual(key: string, edit: () => void): void {
    handEdit(() => {
      trackHandEdit("manual", edit, [key]);
    });
  }

  /** Ticks or unticks one listed fact by hand. */
  function toggleFact<T extends string>(field: string, getSet: () => Set<T>, id: T): void {
    const wanted = !getSet().has(id);
    manual(factKey(field, id), () => {
      const set = getSet();
      if (set.has(id) !== wanted) toggleInSet(set, id);
    });
  }

  /** {@link restoreBackup}'s body, so the farm-switch backup restores the same way. */
  function restoreBackupJson(json: string): BackupRestoreResult {
    const result = readProgressBlob(json, "strict");
    if (result.kind === "newer") return { error: "newer-version", ok: false };
    if (result.kind === "unreadable") return { error: result.error, ok: false };
    replaceProgress(result.loaded);
    repository.enableAfterReplace();
    local = { ...local, trackingLane: local.syncLane ? "sync" : "manual" };
    repository.replace({ chooseManual: true });
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
      await repository.write({
        kind: "sync",
        request,
        settle: (outcome) => {
          settled.outcome = outcome;
        },
      });
      return settled.outcome;
    },
    /** Drops the hand edit waiting for a tracking lane, so nothing is recorded. */
    cancelLaneChoice() {
      pendingHandEdit = undefined;
      choosingSync = false;
    },
    /** Whether this guide still needs a choice between hand tracking & sync. */
    get canStartTrackingByHand(): boolean {
      return canStartTrackingByHand;
    },
    /** Keep the first check-off while sync setup obtains the save that chooses its lane. */
    chooseSyncTracking() {
      choosingSync = true;
    },
    /**
     * Cycles the quest's state, completing its recipe rewards on the obtained-to-completed step.
     * Returns `undefined` while the edit waits for a tracking lane; see {@link handEdit}.
     */
    completeQuestWithRecipes(id: QuestId): QuestCompletion | undefined {
      return handEdit(() =>
        trackHandEdit(
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
        ),
      );
    },
    ...syncLaneOperations(repository.writeLocal),
    dismissPersistenceWarning: repository.dismissWarning,
    /**
     * The backup of this device's progress, never its `local` section. While a newer build's data
     * blocks writes, that is the stored blob itself, otherwise verbatim: memory holds only defaults
     * or stale progress then, and a backup of those would overwrite the real progress wherever it
     * was restored.
     */
    exportBackup(): string {
      if (repository.newerDataBlocked) {
        const value = repository.readStored();
        if (value !== null) return withoutDeviceLocal(value);
      }
      return serializeProgress(snapshot());
    },
    /** How many progress facts this device holds; see `progressFacts`. */
    get factCount(): number {
      return facts.size;
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
    loadFromStorage: repository.read,
    markDefaultUnlocksComplete() {
      if (canStartTrackingByHand) applyStarterItems();
    },
    /**
     * Applies a native save additively. The farm decision, lane guard, & write all use the latest
     * stored value, so another tab cannot start sync or change farms behind the import.
     */
    mergeFromSave: repository.merge,
    get persistenceFailed(): boolean {
      return persistence.failureGeneration > 0;
    },
    get persistenceFailureGeneration(): number {
      return persistence.failureGeneration;
    },
    get persistenceFailureKind(): PersistenceFailureKind {
      return persistence.failureKind;
    },
    /** What category projections read, so every page counts, dims, & filters rows alike. */
    get progressContext(): ProgressContext {
      return progressContext;
    },
    /** A digest of progress facts, which changes whenever progress does. */
    get progressFingerprint(): string {
      return progressFingerprint(facts);
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
      handEdit(() => {
        trackHandEdit("inferred", mutations);
      });
    },
    /** The data-loss reminders this device has shown; see `tracking-reminders.ts`. */
    get reminders(): DeepReadonly<TrackingReminders> | undefined {
      return local.reminders;
    },
    /** Restores every field to its default, this device's preferences & `local` section included. */
    resetAll() {
      starterItems = undefined;
      pendingHandEdit = undefined;
      choosingSync = false;
      state = createDefaultState();
      retained = emptyRetainedProgress();
      history = emptyProgressHistory();
      local = {};
      repository.enableAfterReplace();
      repository.replace({ keepLocal: false });
    },
    /**
     * Clears progress & world state; this device's preferences & `local` section are kept, so a
     * syncing lane stays a syncing lane. Only the sync receipt goes, so the latest save file
     * applies again.
     */
    resetProgress() {
      pendingHandEdit = undefined;
      choosingSync = false;
      replaceProgress(emptyLoadedProgress());
      repository.enableAfterReplace();
      const { syncReceipt: _receipt, ...kept } = local;
      local = kept;
      // The write keeps the stored section, which another tab may have added to since this one read.
      repository.replace({ dropReceipt: true });
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
    /** The current starter-item batch, for the one-time notice and its Undo action. */
    get starterItems(): Readonly<StarterItemsNotice> | undefined {
      return starterItems;
    },
    /**
     * Starts a syncing lane: erases progress & history, applies the lane's first save, & records
     * the lane, all in one write, so a setup that never gets this far leaves nothing behind. Any old
     * receipt & lane go, replaced by `stamp`'s; the farm-switch backup & pending retires stay.
     * Resolves with whether the write landed.
     */
    async startSyncLane(
      lane: SyncLane,
      save: SyncedSave,
      stillWanted: () => boolean = () => true,
      stamp?: SyncApplyStamp,
    ): Promise<boolean> {
      // Built aside from live state, which stays untouched until the write lands, so a lane start
      // that's cancelled or can't be stored never erases anything, even in a later save.
      const staged = emptyLoadedProgress();
      staged.worldState = $state.snapshot(state.worldState);
      stageSyncSave(staged, { ...save, metadata: $state.snapshot(save.metadata) });
      repository.enableAfterReplace();
      const written = await repository.write({
        clockBase: repository.clockBase,
        day: { ...save.day },
        guard: stillWanted,
        kind: "staged",
        lane: $state.snapshot(lane),
        ...(stamp ? { stamp } : {}),
        staged,
      });
      if (written) {
        const pending = pendingHandEdit;
        pendingHandEdit = undefined;
        choosingSync = false;
        pending?.();
      } else {
        pendingHandEdit = undefined;
        choosingSync = false;
      }
      return written;
    },
    /**
     * Puts this device on the manual tracking lane, then runs the hand edit that was waiting for
     * it. Storage that can't keep the lane keeps nothing, so the edit is dropped; while persistence
     * is off, nothing is stored either way & the edit just runs. Resolves with whether the device
     * may now record by hand.
     */
    async startTrackingByHand(): Promise<boolean> {
      const pending = pendingHandEdit;
      pendingHandEdit = undefined;
      choosingSync = false;
      if (persistence.ready) {
        const written = await repository.writeLocal((stored) => ({
          ...(structuredClone(stored) as DeviceLocalState),
          trackingLane: stored.syncLane ? "sync" : "manual",
        }));
        if (!written) return false;
      }
      pending?.();
      return true;
    },
    get state(): DeepReadonly<UserState> {
      return state;
    },
    /**
     * True while stored progress can't be written (quarantined, from a newer build, or not loaded),
     * so no syncing lane may start.
     */
    get syncBlocked(): boolean {
      return !persistence.ready;
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
      toggleFact("almanac", () => state.progress.almanac, id);
    },
    toggleAlmanacRecipe(id: RecipeId) {
      toggleFact("almanacRecipes", () => state.progress.almanacRecipes, id);
    },
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      const wanted = !state.progress.animalCosmetics[animalId]?.has(cosmeticId);
      manual(factKey("animalCosmetics", animalId, cosmeticId), () => {
        const set = getOrCreate(
          state.progress.animalCosmetics,
          animalId,
          () => new SvelteSet<CosmeticId>(),
        );
        if (set.has(cosmeticId) !== wanted) toggleInSet(set, cosmeticId);
      });
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
      const wanted = !state.progress.animals[animalId]?.has(variantId);
      manual(factKey("animals", animalId, variantId), () => {
        const set = getOrCreate(
          state.progress.animals,
          animalId,
          () => new SvelteSet<AnimalVariantId>(),
        );
        if (set.has(variantId) !== wanted) toggleInSet(set, variantId);
      });
    },
    toggleCosmetic(id: CosmeticId) {
      toggleFact("cosmetics", () => state.progress.cosmetics, id);
    },
    toggleMountAppearance(id: MountAppearanceId) {
      toggleFact("mountAppearances", () => state.progress.mountAppearances, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleFact("museum", () => state.progress.museum, id);
    },
    togglePerk(id: PerkId) {
      toggleFact("unlockedPerks", () => state.progress.unlockedPerks, id);
    },
    togglePetCosmetic(id: PetCosmeticSetId) {
      toggleFact("petCosmetics", () => state.progress.petCosmetics, id);
    },
    togglePetSkin(id: PetSkinId) {
      toggleFact("petSkins", () => state.progress.petSkins, id);
    },
    toggleShowSpoilers() {
      state.showSpoilers = !state.showSpoilers;
    },
    toggleSpell(id: SpellId) {
      toggleFact("spells", () => state.progress.spells, id);
    },
    /** How this device tracks, or `undefined` until it chooses; see {@link handEdit}. */
    get trackingLane(): TrackingLane | undefined {
      return trackingLane;
    },
    /** Whether a hand edit is waiting for the player to choose a tracking lane. */
    get trackingLaneNeeded(): boolean {
      return pendingHandEdit !== undefined && !choosingSync;
    },
    /**
     * Restores the quest's prior state and removes only recipes added by that transition. The quest
     * records `manual`; the recipes it takes back record `inferred`, as their completion did.
     */
    undoQuestWithRecipes(id: QuestId, { newlyAdded, previousState }: QuestCompletion) {
      handEdit(() => {
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
      });
    },
    /** Stored progress that couldn't be read, kept so the player can download it; null if none. */
    get unreadableData(): null | string {
      return persistence.unreadableData;
    },
    /**
     * Records a reminder the player saw or answered, as a patch to the stored `local` section.
     * Resolves with whether it was stored.
     */
    updateReminders(
      change: (current: DeepReadonly<TrackingReminders> | undefined) => TrackingReminders,
    ): Promise<boolean> {
      return repository.writeLocal((stored) => ({
        ...(structuredClone(stored) as DeviceLocalState),
        reminders: change(stored.reminders),
      }));
    },
  };
}

function toggleInSet<T>(set: Set<T>, item: T): void {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
}

export const userState = createUserState();
