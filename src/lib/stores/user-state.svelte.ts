import { progressFingerprint } from "#lib/engine/tracking-reminders.js";
import { applySaveDay, isWeatherInSeason } from "#lib/engine/world-state.js";
import { createBackupFacade } from "#lib/progress/backup.js";
import { createImportFacade } from "#lib/progress/import.js";
import { createSyncFacade } from "#lib/progress/sync.svelte.js";

import { createHandEdits } from "./progress-hand-edits.svelte.js";
import { createProgressShell } from "./progress-shell.svelte.js";

import type { FactProvenance, Resolution } from "#lib/engine/provenance.js";
import type { DeviceLocalState, TrackingReminders } from "#lib/sync/lane-state.js";
import type { JsonValue, Season, Weather } from "#lib/types/tracker-data.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

import type { PersistenceFailureKind } from "./progress-repository.js";
import type { UserState } from "./progress-shell.svelte.js";
import type { LoadedProgress } from "./progress-storage.js";

export type { QuestCompletion } from "#lib/engine/progress-edits.js";
export type { BackupRestoreErrorKind, BackupRestoreResult } from "#lib/progress/backup.js";
export type {
  SyncApplyOutcome,
  SyncApplyQuestion,
  SyncedSave,
  TrackingLane,
  TrackingReminders,
} from "#lib/sync/lane-state.js";

export { PERSIST_DEBOUNCE_MS } from "./progress-repository.js";
export type { PersistenceFailureKind, SerializedPreferences } from "./progress-repository.js";
export type { UserState } from "./progress-shell.svelte.js";

const shell = createProgressShell();
const { persistence, repository } = shell;
const hand = createHandEdits(shell);

function replaceProgress(loaded: Omit<LoadedProgress, "local">): void {
  hand.clearStarterItems();
  shell.replaceProgress(loaded);
}

repository.onExternalChange(replaceProgress);

export const progressBackup = createBackupFacade(repository, {
  clearLaneChoice: hand.takePendingHandEdit,
  emptyProgress: shell.emptyProgress,
  get local() {
    return shell.local;
  },
  set local(value) {
    shell.local = value;
  },
  replaceProgress,
  resetState() {
    hand.clearStarterItems();
    shell.resetState();
  },
  snapshot: shell.snapshot,
  get unreadableData() {
    return persistence.unreadableData;
  },
});

export const progressImport = createImportFacade(repository, {
  get lastImport() {
    return shell.state.lastImport;
  },
});

export const progressSync = createSyncFacade(repository, {
  get canStartTrackingByHand() {
    return hand.canStartTrackingByHand;
  },
  chooseSync: hand.chooseSync,
  emptyProgress: shell.emptyProgress,
  get laneChoiceNeeded() {
    return hand.laneChoiceNeeded;
  },
  get local() {
    return shell.local;
  },
  get ready() {
    return persistence.ready;
  },
  takePendingHandEdit: hand.takePendingHandEdit,
  get worldState() {
    return shell.state.worldState;
  },
});

const core = {
  dismissPersistenceWarning: repository.dismissWarning,
  /** How many progress facts this device holds; see `progressFacts`. */
  get factCount(): number {
    return shell.facts.size;
  },
  get hasAnyProgress(): boolean {
    return shell.facts.size > 0;
  },
  /** Remembers “keep mine” for a fact against the save value the player declined. */
  keepMine(key: string, saveValue: JsonValue) {
    shell.history.resolutions[key] = { saveValue };
  },
  /** The playtime of the last applied save, if any. */
  get lastSavePlaytime(): number | undefined {
    return shell.history.lastSavePlaytime;
  },
  loadFromStorage: repository.read,
  mergeFromSave: progressImport.mergeFromSave,
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
  get progressContext() {
    return shell.progressContext;
  },
  /** A digest of progress facts, which changes whenever progress does. */
  get progressFingerprint(): string {
    return progressFingerprint(shell.facts);
  },
  get progressionState() {
    return shell.progressionState;
  },
  /** Where a fact came from, if it has been recorded; see `factKey`. */
  provenanceOf(key: string): DeepReadonly<FactProvenance> | undefined {
    return shell.history.provenance[key];
  },
  /** The data-loss reminders this device has shown; see `tracking-reminders.ts`. */
  get reminders(): DeepReadonly<TrackingReminders> | undefined {
    return shell.local.reminders;
  },
  /** The player's “keep mine” for a fact, if any; see `resolutionHolds`. */
  resolutionOf(key: string): Readonly<Resolution> | undefined {
    return shell.history.resolutions[key];
  },
  setEverythingGrouping(grouping: "category" | "source") {
    shell.state.everythingGrouping = grouping;
  },
  setSeason(season: Season) {
    const { worldState } = shell.state;
    Object.assign(worldState, applySaveDay(worldState, { season, weather: undefined }));
  },
  setWeather(weather: Weather) {
    if (isWeatherInSeason(weather, shell.state.worldState.season)) {
      shell.state.worldState.weather = weather;
    }
  },
  get state(): DeepReadonly<UserState> {
    return shell.state;
  },
  toggleShowSpoilers() {
    shell.state.showSpoilers = !shell.state.showSpoilers;
  },
  /** Records a reminder as a patch to the stored `local` section. */
  updateReminders(
    change: (current: DeepReadonly<TrackingReminders> | undefined) => TrackingReminders,
  ): Promise<boolean> {
    return repository.writeLocal((stored) => ({
      ...(structuredClone(stored) as DeviceLocalState),
      reminders: change(stored.reminders),
    }));
  },
};

// Copy descriptors so the compatibility API's getters keep reading live state.
export const userState = Object.defineProperties(core, {
  ...Object.getOwnPropertyDescriptors(hand.actions),
  ...Object.getOwnPropertyDescriptors(progressBackup),
  ...Object.getOwnPropertyDescriptors(progressSync),
}) as typeof core & typeof hand.actions & typeof progressBackup & typeof progressSync;
