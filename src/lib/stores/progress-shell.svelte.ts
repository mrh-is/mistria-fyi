import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "#lib/data/index.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { progressFacts } from "#lib/engine/provenance.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import { recordKeys } from "#lib/utils/record.js";

import { createDefaultPreferences, createProgressRepository } from "./progress-repository.js";
import {
  createDefaultWorldState,
  emptyProgressHistory,
  emptyRetainedProgress,
} from "./progress-storage.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { ProgressHistory } from "#lib/engine/provenance.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { DeviceLocalState } from "#lib/sync/lane-state.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type { ProgressState } from "#lib/types/user-progress.js";

import type {
  PersistenceStatus,
  ProgressRepository,
  SerializedPreferences,
} from "./progress-repository.js";
import type { LoadedProgress, RetainedProgress, WorldState } from "./progress-storage.js";

export interface UserState extends SerializedPreferences {
  lastImport: null | SaveImportMetadata;
  progress: ProgressState;
  worldState: WorldState;
}

export interface ProgressShell {
  emptyProgress: () => Omit<LoadedProgress, "local">;
  readonly facts: ReadonlyMap<string, string>;
  readonly history: ProgressHistory;
  local: DeviceLocalState;
  readonly persistence: Readonly<PersistenceStatus>;
  readonly progressContext: ProgressContext;
  readonly progressionState: UserProgressionState;
  replaceProgress: (loaded: Omit<LoadedProgress, "local">) => void;
  readonly repository: ProgressRepository;
  resetState: () => void;
  snapshot: () => Omit<LoadedProgress, "local">;
  readonly state: UserState;
}

const ANIMAL_IDS = recordKeys(trackerData.animals);

function emptyProgress(): Omit<LoadedProgress, "local"> {
  return {
    history: emptyProgressHistory(),
    lastImport: null,
    progress: createDefaultProgress(SvelteSet, ANIMAL_IDS),
    retained: emptyRetainedProgress(),
    worldState: createDefaultWorldState(),
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

export function createProgressShell(): ProgressShell {
  let state = $state<UserState>(createDefaultState());
  let retained = $state.raw<RetainedProgress>(emptyRetainedProgress());
  let local = $state.raw<DeviceLocalState>({});
  let history = $state<ProgressHistory>(emptyProgressHistory());

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
      emptyProgress,
      // Widen before Svelte maps the recursive JsonValue in resolutions.
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

  const progressionState = $derived(
    deriveProgressionState(state.progress, trackerData, state.showSpoilers),
  );
  // Spoilers change what the UI reveals, never what's doable today.
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
  const facts = $derived(progressFacts(state.progress));

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

  return {
    emptyProgress,
    get facts() {
      return facts;
    },
    get history() {
      return history;
    },
    get local() {
      return local;
    },
    set local(value) {
      local = value;
    },
    persistence,
    get progressContext() {
      return progressContext;
    },
    get progressionState() {
      return progressionState;
    },
    // Replacing the progress object identifies a new base to the repository.
    replaceProgress(loaded: Omit<LoadedProgress, "local">) {
      state.lastImport = loaded.lastImport;
      state.progress = loaded.progress;
      state.worldState = loaded.worldState;
      retained = loaded.retained;
      history = loaded.history;
    },
    repository,
    resetState() {
      state = createDefaultState();
      retained = emptyRetainedProgress();
      history = emptyProgressHistory();
      local = {};
    },
    snapshot,
    get state() {
      return state;
    },
  };
}
