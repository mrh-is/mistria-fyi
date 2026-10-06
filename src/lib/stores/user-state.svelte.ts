import { SvelteSet } from "svelte/reactivity";

import { trackerData, trackerIndex } from "#lib/data/index.js";
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
  getMaxMineFloor,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
} from "#lib/engine/progress.js";
import { findRecipesForQuest } from "#lib/engine/quest-rewards.js";
import { applyMarriageCascade, getSpouseId, mergeHousehold } from "#lib/engine/relationships.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { isWeatherInSeason } from "#lib/engine/world-state.js";
import {
  AVAILABILITY_WINDOWS,
  DEFAULT_AVAILABILITY_WINDOWS,
  LEGACY_AVAILABILITY_MODES,
  legacyAvailabilityWindows,
} from "#lib/types/availability.js";
import { SEASONS, VILLAGER_RELATIONSHIPS, WEATHERS } from "#lib/types/tracker-data.js";
import {
  CHILD_CHOICES,
  CURRENT_SERIALIZATION_VERSION,
  QUEST_STATES,
} from "#lib/types/user-progress.js";
import { tryGetItem, trySetItem } from "#lib/utils/local-storage.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";
import { unionInto } from "#lib/utils/set.js";

import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { AvailabilityWindow, LegacyAvailabilityMode } from "#lib/types/availability.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
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

// ─── Types ──────────────────────────────────────────────────────────

/** The outcome of restoring a backup with `restoreBackup`, which replaces all progress. */
export type BackupRestoreResult = { error: BackupRestoreErrorKind; ok: false } | { ok: true };
export type BackupRestoreErrorKind = "invalid-fields" | "malformed-json" | "unsupported-version";

/** The outcome of one `completeQuestWithRecipes` call, enough to undo exactly that call. */
export interface QuestCompletion {
  newlyAdded: RecipeId[];
  previousState: QuestState;
}

export interface UserState {
  availabilityWindows: AvailabilityWindow[];
  completed: ProgressState;
  showCompleted: boolean;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

export interface SerializedState {
  availabilityMode?: LegacyAvailabilityMode;
  availabilityWindows?: AvailabilityWindow[];
  completed: {
    almanac: string[];
    almanacRecipes?: string[];
    animalCosmetics: Record<string, string[]>;
    animals: Record<string, string[]>;
    childChoice?: ChildChoice;
    cosmetics: string[];
    dates?: string[];
    hasUpperFloor?: boolean;
    marriedVillager?: null | string;
    mines: { floor: number; spells: string[] };
    museum: string[];
    petCosmetics?: string[];
    petSkins?: string[];
    quests?: string[];
    questStates?: Record<string, QuestState>;
    reachedSeason?: Season;
    renown: number;
    romanticVillagers?: string[];
    skillLevels?: Record<string, number>;
    skills?: string[];
    unlockedPerks?: string[];
    villagerLevels?: Record<string, number>;
    villagerRelationships?: Record<string, VillagerRelationship>;
    villagers?: string[];
  };
  showSpoilers?: boolean;
  version: string;
  worldState: { season: Season; weather: Weather };
}

/** Quiet period after the last change before progress is written to localStorage. */
export const PERSIST_DEBOUNCE_MS = 300;
const STORAGE_KEY = "mistria-fyi-v1";
const QUARANTINE_KEY = `${STORAGE_KEY}-quarantine`;
/**
 * Legacy states stored completed villagers and skills as bare ID lists. A completed villager
 * migrates to the maximum standard heart level (romance unlocks the hearts above it); a completed
 * skill migrates to the maximum skill level.
 */
const LEGACY_COMPLETED_VILLAGER_LEVEL = 10;
const LEGACY_COMPLETED_SKILL_LEVEL = MAX_SKILL_LEVEL;
const SUPPORTED_SERIALIZATION_VERSIONS = new Set(["1", CURRENT_SERIALIZATION_VERSION]);

const VALID_CHILD_CHOICES = new Set<string>(CHILD_CHOICES);
const VALID_AVAILABILITY_MODES = new Set<string>(LEGACY_AVAILABILITY_MODES);
const VALID_AVAILABILITY_WINDOWS = new Set<string>(AVAILABILITY_WINDOWS);
const VALID_RELATIONSHIPS = new Set<string>(VILLAGER_RELATIONSHIPS);
const VALID_QUEST_STATES = new Set<string>(QUEST_STATES);
const VALID_SEASONS = new Set<string>(SEASONS);
const VALID_WEATHER = new Set<string>(WEATHERS);

type DeserializeResult =
  | { error: BackupRestoreErrorKind; ok: false }
  | { ok: true; source: Record<string, unknown>; state: UserState };
type ValidationMode = "local" | "strict";

const QUEST_IDS = new Set(
  Object.values(trackerData.quests).flatMap((quests) => Object.keys(quests)),
);
const MUSEUM_ITEM_IDS = new Set(
  Object.values(trackerData.museum).flatMap((wing) =>
    Object.values(wing.sets).flatMap((set) => set.items),
  ),
);
const PERK_IDS = new Set(
  Object.values(trackerData.skills).flatMap((skill) =>
    skill.perkTiers.flatMap((tier) => Object.keys(tier)),
  ),
);

function addDefaultUnlocks(completed: ProgressState): void {
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.sources.some((s) => s.type === "default")) {
      completed.cosmetics.add(id);
    }
  }

  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const variantSet = getOrCreate(
      completed.animals,
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
      completed.almanacRecipes.add(id);
    }
  }
}

/**
 * Ensures every animal in trackerData has an entry in both the animals and
 * animalCosmetics records. Deserialized or merged state may predate newly added
 * animals; this backfills empty sets so downstream code can access maps without
 * guarding missing keys.
 */
function backfillAnimalMaps(completed: ProgressState): void {
  for (const animalId of recordKeys(trackerData.animals)) {
    completed.animals[animalId] ??= new SvelteSet<AnimalVariantId>();
    completed.animalCosmetics[animalId] ??= new SvelteSet<CosmeticId>();
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
    mines: { floor: 0, spells: new SvelteSet<SpellId>() },
    museum: new SvelteSet<ItemId>(),
    petCosmetics: new SvelteSet<PetCosmeticSetId>(),
    petSkins: new SvelteSet<PetSkinId>(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new SvelteSet<PerkId>(),
    villagerLevels: {},
    villagerRelationships: {},
  };
}

// ─── Store ──────────────────────────────────────────────────────────

function createDefaultState(): UserState {
  return {
    availabilityWindows: [...DEFAULT_AVAILABILITY_WINDOWS],
    completed: createDefaultProgress(),
    showCompleted: false,
    showSpoilers: false,
    worldState: { season: "spring", weather: "calm" },
  };
}

function createUserState() {
  let state = $state<UserState>(createDefaultState());
  let _persistenceFailureGeneration = $state(0);
  let _persistenceReady = $state(false);
  let persistenceBlocked = false;
  let quarantineAvailable = false;
  let serializedSource: Record<string, unknown> | undefined;
  let lastKnownStoredValue: null | string = null;
  let pendingSave: undefined | { expectedStoredValue: null | string; json: string };
  let saveTimeout: ReturnType<typeof setTimeout> | undefined;

  function clearPendingSave(): void {
    if (saveTimeout !== undefined) clearTimeout(saveTimeout);
    saveTimeout = undefined;
    pendingSave = undefined;
  }

  function persist(json: string, expectedStoredValue: null | string): void {
    const storedResult = tryGetItem(STORAGE_KEY);
    if (!storedResult.ok) {
      _persistenceFailureGeneration++;
      return;
    }

    // A different tab wrote after this save was scheduled. Adopt its value rather than writing the
    // stale snapshot back; its storage event may never arrive (e.g. while this page sat in the
    // back/forward cache), and waiting for it would leave every later save comparing against a
    // value that is no longer stored. Cleared storage has nothing to conflict with, so it's
    // written normally.
    if (storedResult.value !== expectedStoredValue && storedResult.value !== null) {
      applyStorageValue(storedResult.value);
      return;
    }

    if (!trySetItem(STORAGE_KEY, json)) {
      _persistenceFailureGeneration++;
      return;
    }

    lastKnownStoredValue = json;
    _persistenceFailureGeneration = 0;
  }

  function flushPendingSave(): void {
    const pending = pendingSave;
    clearPendingSave();
    if (pending) persist(pending.json, pending.expectedStoredValue);
  }

  function flushCurrentState(): void {
    if (!_persistenceReady) return;
    clearPendingSave();
    persist(serialize(state, serializedSource), lastKnownStoredValue);
  }

  function applyStorageValue(value: null | string): void {
    clearPendingSave();
    lastKnownStoredValue = value;
    if (value === null) return;

    const result = deserialize(value, "local");
    if (result.ok) {
      state = result.state;
      serializedSource = result.source;
      persistenceBlocked = false;
      quarantineAvailable = false;
      _persistenceFailureGeneration = 0;
      _persistenceReady = true;
      return;
    }

    _persistenceReady = false;
    persistenceBlocked = true;
    quarantineAvailable = trySetItem(QUARANTINE_KEY, value);
    _persistenceFailureGeneration++;
  }

  function resyncFromStorage(): void {
    const storedResult = tryGetItem(STORAGE_KEY);
    if (storedResult.ok && storedResult.value !== lastKnownStoredValue) {
      applyStorageValue(storedResult.value);
    }
  }

  function enablePersistenceAfterExplicitReplace(): void {
    if (!persistenceBlocked || !quarantineAvailable) return;

    persistenceBlocked = false;
    quarantineAvailable = false;
    _persistenceReady = true;
  }

  const progressionState = $derived(
    deriveProgressionState(state.completed, trackerData, state.showSpoilers),
  );

  // Auto-save to localStorage (debounced)
  if ("window" in globalThis) {
    $effect.root(() => {
      $effect(() => {
        if (!_persistenceReady) return;

        const json = serialize(state, serializedSource);
        clearPendingSave();
        if (json === lastKnownStoredValue) return;

        pendingSave = { expectedStoredValue: lastKnownStoredValue, json };
        saveTimeout = setTimeout(flushPendingSave, PERSIST_DEBOUNCE_MS);
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
      } else if (event.key === STORAGE_KEY) {
        applyStorageValue(event.newValue);
      }
    });
  }

  const hasAnyProgress = $derived(
    state.completed.almanac.size > 0 ||
      state.completed.almanacRecipes.size > 0 ||
      state.completed.cosmetics.size > 0 ||
      state.completed.hasUpperFloor ||
      state.completed.museum.size > 0 ||
      state.completed.dates.size > 0 ||
      state.completed.reachedSeason !== "spring" ||
      Object.keys(state.completed.villagerRelationships).length > 0 ||
      state.completed.childChoice !== "undeclared" ||
      state.completed.mines.floor > 0 ||
      state.completed.mines.spells.size > 0 ||
      state.completed.renown > 0 ||
      state.completed.petCosmetics.size > 0 ||
      state.completed.petSkins.size > 0 ||
      state.completed.unlockedPerks.size > 0 ||
      recordValues(state.completed.villagerLevels).some((v) => v > 0) ||
      recordValues(state.completed.skillLevels).some((v) => v > 0) ||
      recordValues(state.completed.questStates).some((v) => v !== "none") ||
      recordValues(state.completed.animals).some((s) => s.size > 0) ||
      recordValues(state.completed.animalCosmetics).some((s) => s.size > 0),
  );

  return {
    /** Cycles the quest's state, completing its recipe rewards on the obtained-to-completed step. */
    completeQuestWithRecipes(id: QuestId): QuestCompletion {
      const previousState = state.completed.questStates[id] ?? "none";
      state.completed.questStates[id] = nextQuestState(previousState);

      if (previousState !== "obtained") return { newlyAdded: [], previousState };

      const candidates = findRecipesForQuest(id);
      const newlyAdded: RecipeId[] = [];
      for (const recipeId of candidates) {
        if (!state.completed.almanacRecipes.has(recipeId)) {
          state.completed.almanacRecipes.add(recipeId);
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
    exportBackup(): string {
      return serialize(state, serializedSource);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
    },
    loadFromStorage() {
      const storedResult = tryGetItem(STORAGE_KEY);
      if (!storedResult.ok) {
        _persistenceReady = false;
        persistenceBlocked = true;
        quarantineAvailable = false;
        _persistenceFailureGeneration++;
        return;
      }

      const stored = storedResult.value;
      lastKnownStoredValue = stored;
      if (stored === null) {
        serializedSource = undefined;
        persistenceBlocked = false;
        quarantineAvailable = false;
        _persistenceReady = true;
        return;
      }

      const result = deserialize(stored, "local");
      if (result.ok) {
        state = result.state;
        serializedSource = result.source;
        persistenceBlocked = false;
        quarantineAvailable = false;
        _persistenceReady = true;
      } else {
        _persistenceReady = false;
        persistenceBlocked = true;
        quarantineAvailable = trySetItem(QUARANTINE_KEY, stored);
        _persistenceFailureGeneration++;
      }
    },
    markDefaultUnlocksComplete() {
      addDefaultUnlocks(state.completed);
    },
    /**
     * Merges a native save into current progress: sets union, levels take the max, and the
     * household follows {@link mergeHousehold}'s conflict policy. Never removes progress.
     */
    mergeFromSave(imported: Partial<ProgressState>): MergeResult {
      const completed = state.completed;
      const counts: MergeCounts = emptyMergeCounts();

      counts.almanac = unionInto(completed.almanac, imported.almanac ?? []);
      counts.almanacRecipes = unionInto(completed.almanacRecipes, imported.almanacRecipes ?? []);
      counts.cosmetics = unionInto(completed.cosmetics, imported.cosmetics ?? []);
      counts.dates = unionInto(completed.dates, imported.dates ?? []);
      counts.museum = unionInto(completed.museum, imported.museum ?? []);
      counts.perks = unionInto(completed.unlockedPerks, imported.unlockedPerks ?? []);
      counts.petCosmetics = unionInto(completed.petCosmetics, imported.petCosmetics ?? []);
      counts.petSkins = unionInto(completed.petSkins, imported.petSkins ?? []);
      counts.spells = unionInto(completed.mines.spells, imported.mines?.spells ?? []);
      for (const [animalId, variants] of recordEntries(imported.animals ?? {})) {
        const existing = getOrCreate(
          completed.animals,
          animalId,
          () => new SvelteSet<AnimalVariantId>(),
        );
        counts.animals += unionInto(existing, variants);
      }
      for (const [animalId, cosmetics] of recordEntries(imported.animalCosmetics ?? {})) {
        const existing = getOrCreate(
          completed.animalCosmetics,
          animalId,
          () => new SvelteSet<CosmeticId>(),
        );
        counts.animalCosmetics += unionInto(existing, cosmetics);
      }

      // Levels are clamped again here so the canonical state stays inside its domains even if a
      // caller bypasses extractSaveProgress's normalization. Scalars report how far they rose.
      if (imported.mines) {
        const floor = clampMineFloor(imported.mines.floor);
        if (floor > completed.mines.floor) {
          counts.mineFloor = floor - completed.mines.floor;
          completed.mines.floor = floor;
        }
      }
      if (imported.renown !== undefined) {
        const renown = clampRenownLevel(imported.renown);
        if (renown > completed.renown) {
          counts.renown = renown - completed.renown;
          completed.renown = renown;
        }
      }
      counts.villagerLevels = raiseLevels(
        completed.villagerLevels,
        imported.villagerLevels,
        MAX_VILLAGER_LEVEL,
      );
      counts.skillLevels = raiseLevels(
        completed.skillLevels,
        imported.skillLevels,
        MAX_SKILL_LEVEL,
      );

      // Quest states take the more advanced state: none < obtained < completed.
      for (const [id, importedState] of recordEntries(imported.questStates ?? {})) {
        if (questStateRank(importedState) > questStateRank(completed.questStates[id] ?? "none")) {
          completed.questStates[id] = importedState;
          counts.quests++;
        }
      }

      if (
        imported.reachedSeason !== undefined &&
        seasonOrdinal(imported.reachedSeason) > seasonOrdinal(completed.reachedSeason)
      ) {
        completed.reachedSeason = imported.reachedSeason;
        counts.reachedSeason = 1;
      }
      if (imported.hasUpperFloor && !completed.hasUpperFloor) {
        completed.hasUpperFloor = true;
        counts.hasUpperFloor = 1;
      }

      const household = mergeHousehold(completed, imported);
      completed.villagerRelationships = household.villagerRelationships;
      completed.childChoice = household.childChoice;
      counts.villagerRelationships = household.counts.villagerRelationships;
      counts.childChoice = household.counts.childChoice;

      // Backfill animal maps for any animals added since the imported state was created
      backfillAnimalMaps(completed);

      return { conflicts: household.conflicts, counts };
    },
    get persistenceFailed(): boolean {
      return _persistenceFailureGeneration > 0;
    },
    get persistenceFailureGeneration(): number {
      return _persistenceFailureGeneration;
    },
    get progressionState(): UserProgressionState {
      return progressionState;
    },
    resetAll() {
      state = createDefaultState();
      serializedSource = undefined;
      enablePersistenceAfterExplicitReplace();
    },
    /** Import/export user state JSON (full replace) */
    restoreBackup(json: string): BackupRestoreResult {
      const result = deserialize(json, "strict");
      if (!result.ok) return result;
      state = result.state;
      serializedSource = result.source;
      enablePersistenceAfterExplicitReplace();
      return { ok: true };
    },
    setAvailabilityWindows(windows: readonly AvailabilityWindow[]) {
      state.availabilityWindows = AVAILABILITY_WINDOWS.filter((window) => windows.includes(window));
    },
    setChildChoice(choice: ChildChoice) {
      state.completed.childChoice = choice;
    },
    setHasUpperFloor(value: boolean) {
      state.completed.hasUpperFloor = value;
    },
    setMineFloor(floor: number) {
      state.completed.mines.floor = clampMineFloor(floor);
    },
    setQuestState(id: QuestId, questState: QuestState) {
      state.completed.questStates[id] = questState;
    },
    setReachedSeason(season: Season) {
      if (seasonOrdinal(season) > seasonOrdinal(state.completed.reachedSeason)) {
        state.completed.reachedSeason = season;
      }
    },
    setRenown(level: number) {
      state.completed.renown = clampRenownLevel(level);
    },
    setSeason(season: Season) {
      state.worldState.season = season;
      if (!isWeatherInSeason(state.worldState.weather, season)) {
        state.worldState.weather = "calm";
      }
    },
    setSkillLevel(id: SkillId, level: number) {
      state.completed.skillLevels[id] = clampLevel(level, MAX_SKILL_LEVEL);
    },
    setVillagerLevel(id: VillagerId, level: number) {
      state.completed.villagerLevels[id] = clampLevel(level, MAX_VILLAGER_LEVEL);
    },
    setVillagerRelationship(villagerId: VillagerId, relationship: VillagerRelationship) {
      const oldMarried = getSpouseId(state.completed.villagerRelationships);
      if (relationship === "undecided") {
        const { [villagerId]: _, ...rest } = state.completed.villagerRelationships;
        state.completed.villagerRelationships = rest;
      } else {
        state.completed.villagerRelationships[villagerId] = relationship;
      }
      applyMarriageCascade(state.completed.villagerRelationships);
      const newMarried = getSpouseId(state.completed.villagerRelationships);
      if (oldMarried !== newMarried) {
        state.completed.childChoice = "undeclared";
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
      toggleInSet(state.completed.almanac, id);
    },
    toggleAlmanacRecipe(id: RecipeId) {
      toggleInSet(state.completed.almanacRecipes, id);
    },
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      const set = getOrCreate(
        state.completed.animalCosmetics,
        animalId,
        () => new SvelteSet<CosmeticId>(),
      );
      toggleInSet(set, cosmeticId);
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
      const set = getOrCreate(
        state.completed.animals,
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
      toggleInSet(state.completed.cosmetics, id);
    },
    toggleDate(id: DateId) {
      toggleInSet(state.completed.dates, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleInSet(state.completed.museum, id);
    },
    togglePerk(id: PerkId) {
      toggleInSet(state.completed.unlockedPerks, id);
    },
    togglePetCosmetic(id: PetCosmeticSetId) {
      toggleInSet(state.completed.petCosmetics, id);
    },
    togglePetSkin(id: PetSkinId) {
      toggleInSet(state.completed.petSkins, id);
    },
    toggleShowCompleted() {
      state.showCompleted = !state.showCompleted;
    },
    toggleShowSpoilers() {
      state.showSpoilers = !state.showSpoilers;
    },
    toggleSpell(id: SpellId) {
      toggleInSet(state.completed.mines.spells, id);
    },
    /** Restores the quest's prior state and removes only recipes added by that transition. */
    undoQuestWithRecipes(id: QuestId, { newlyAdded, previousState }: QuestCompletion) {
      state.completed.questStates[id] = previousState;
      for (const recipeId of newlyAdded) {
        state.completed.almanacRecipes.delete(recipeId);
      }
    },
  };
}

function deserialize(json: string, mode: ValidationMode): DeserializeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "malformed-json", ok: false };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { error: "malformed-json", ok: false };
  }

  const raw = parsed as Record<string, unknown>;

  if (!("version" in raw)) {
    return { error: "invalid-fields", ok: false };
  }

  if (typeof raw.version !== "string" || !SUPPORTED_SERIALIZATION_VERSIONS.has(raw.version)) {
    return { error: "unsupported-version", ok: false };
  }

  if (!isSerializedState(raw, mode)) {
    return { error: "invalid-fields", ok: false };
  }

  try {
    const s = raw;

    // Migrate legacy Set-based data → level/state Records
    // Old format: villagers/skills/quests as string[]; New format: villagerLevels/skillLevels/questStates as Records
    const rawVillagerLevels: Record<string, unknown> = { ...s.completed.villagerLevels };
    if (!s.completed.villagerLevels && s.completed.villagers) {
      for (const id of s.completed.villagers) {
        rawVillagerLevels[id] = LEGACY_COMPLETED_VILLAGER_LEVEL;
      }
    }
    const villagerLevels = normalizeLevelRecord<VillagerId>(
      rawVillagerLevels,
      trackerData.villagers,
      MAX_VILLAGER_LEVEL,
    );

    const rawSkillLevels: Record<string, unknown> = { ...s.completed.skillLevels };
    if (!s.completed.skillLevels && s.completed.skills) {
      for (const id of s.completed.skills) rawSkillLevels[id] = LEGACY_COMPLETED_SKILL_LEVEL;
    }
    const skillLevels = normalizeLevelRecord<SkillId>(
      rawSkillLevels,
      trackerData.skills,
      MAX_SKILL_LEVEL,
    );

    const rawQuestStates: Record<string, unknown> = { ...s.completed.questStates };
    if (!s.completed.questStates && s.completed.quests) {
      for (const id of s.completed.quests) rawQuestStates[id] = "completed";
    }
    const questStates = normalizeEnumRecord<QuestId, QuestState>(
      rawQuestStates,
      QUEST_IDS,
      VALID_QUEST_STATES,
    );

    // Migrate villagerRelationships from legacy romanticVillagers/marriedVillager
    const villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};
    if (s.completed.villagerRelationships) {
      for (const [id, rel] of Object.entries(s.completed.villagerRelationships)) {
        if (
          Object.hasOwn(trackerData.villagers, id) &&
          isEnumValue(rel, VALID_RELATIONSHIPS) &&
          rel !== "undecided"
        ) {
          villagerRelationships[id as VillagerId] = rel;
        }
      }
    } else {
      if (s.completed.romanticVillagers) {
        for (const id of s.completed.romanticVillagers) {
          if (Object.hasOwn(trackerData.villagers, id)) {
            villagerRelationships[id as VillagerId] = "romantic";
          }
        }
      }
      if (
        s.completed.marriedVillager &&
        Object.hasOwn(trackerData.villagers, s.completed.marriedVillager)
      ) {
        villagerRelationships[s.completed.marriedVillager as VillagerId] = "married";
      }
    }
    applyMarriageCascade(villagerRelationships);

    const childChoice: ChildChoice =
      s.completed.childChoice && VALID_CHILD_CHOICES.has(s.completed.childChoice)
        ? s.completed.childChoice
        : "undeclared";

    const completed: ProgressState = {
      almanac: normalizeAlmanacIds(s.completed.almanac),
      almanacRecipes: knownBrandedSet<RecipeId>(
        s.completed.almanacRecipes ?? [],
        trackerData.recipes,
      ),
      animalCosmetics: normalizeAnimalCosmetics(s.completed.animalCosmetics),
      animals: normalizeAnimalVariants(s.completed.animals),
      childChoice,
      cosmetics: knownBrandedSet<CosmeticId>(s.completed.cosmetics, trackerData.cosmetics),
      dates: knownBrandedSet<DateId>(s.completed.dates ?? [], trackerData.dates),
      hasUpperFloor:
        typeof s.completed.hasUpperFloor === "boolean" ? s.completed.hasUpperFloor : false,
      mines: {
        floor: isFiniteNumber(s.completed.mines.floor)
          ? clampMineFloor(s.completed.mines.floor)
          : 0,
        spells: knownBrandedSet<SpellId>(s.completed.mines.spells, trackerData.mines.spells),
      },
      museum: knownBrandedSet<ItemId>(s.completed.museum, MUSEUM_ITEM_IDS),
      petCosmetics: knownBrandedSet<PetCosmeticSetId>(
        s.completed.petCosmetics ?? [],
        trackerData.pets.cosmetics,
      ),
      petSkins: knownBrandedSet<PetSkinId>(s.completed.petSkins ?? [], trackerData.pets.skins),
      questStates,
      reachedSeason: isEnumValue(s.completed.reachedSeason, VALID_SEASONS)
        ? s.completed.reachedSeason
        : "spring",
      renown: isFiniteNumber(s.completed.renown) ? clampRenownLevel(s.completed.renown) : 0,
      skillLevels,
      unlockedPerks: knownBrandedSet<PerkId>(s.completed.unlockedPerks ?? [], PERK_IDS),
      villagerLevels,
      villagerRelationships,
    };

    backfillAnimalMaps(completed);

    return {
      ok: true,
      source: raw,
      state: {
        availabilityWindows: serializedAvailabilityWindows(s, mode),
        completed,
        showCompleted: false,
        showSpoilers: typeof s.showSpoilers === "boolean" ? s.showSpoilers : false,
        worldState: {
          season: isEnumValue(s.worldState.season, VALID_SEASONS) ? s.worldState.season : "spring",
          weather: isEnumValue(s.worldState.weather, VALID_WEATHER) ? s.worldState.weather : "calm",
        },
      },
    };
  } catch {
    return { error: "invalid-fields", ok: false };
  }
}

function filterRecord<V>(
  record: Partial<Record<string, V>>,
  predicate: (v: V) => boolean,
): Record<string, V> {
  return Object.fromEntries(recordEntries(record).filter(([, v]) => predicate(v)));
}

function hasKnownId(knownIds: object | ReadonlySet<string>, id: string): boolean {
  return knownIds instanceof Set ? knownIds.has(id) : Object.hasOwn(knownIds, id);
}

function isDomainInteger(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isEnumValue(value: unknown, validValues: Set<string>): value is string {
  return typeof value === "string" && validValues.has(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalEnumRecord(value: unknown, validValues: Set<string>): boolean {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => isEnumValue(entry, validValues)))
  );
}

function isOptionalIntegerRecord(value: unknown, max: number): boolean {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => isDomainInteger(entry, max)))
  );
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value);
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSerializedState(value: unknown, mode: ValidationMode): value is SerializedState {
  if (!isRecord(value)) return false;
  const completed = value.completed;
  const worldState = value.worldState;
  if (!isRecord(completed) || !isRecord(worldState)) return false;

  const availabilityWindows = isStringArray(value.availabilityWindows)
    ? value.availabilityWindows
    : undefined;
  const hasWindowsShape = availabilityWindows !== undefined && availabilityWindows.length > 0;
  const hasValidWindows =
    hasWindowsShape &&
    new Set(availabilityWindows).size === availabilityWindows.length &&
    availabilityWindows.every((window) => VALID_AVAILABILITY_WINDOWS.has(window));
  const hasLegacyModeShape = typeof value.availabilityMode === "string";
  const hasValidLegacyMode = isEnumValue(value.availabilityMode, VALID_AVAILABILITY_MODES);
  if (mode === "strict") {
    if (value.availabilityWindows !== undefined && !hasValidWindows) return false;
    if (value.availabilityMode !== undefined && !hasValidLegacyMode) return false;
    if (!hasValidWindows && !hasValidLegacyMode) return false;
    if (
      !isEnumValue(worldState.season, VALID_SEASONS) ||
      !isEnumValue(worldState.weather, VALID_WEATHER)
    ) {
      return false;
    }
    if (value.showSpoilers !== undefined && typeof value.showSpoilers !== "boolean") return false;
  } else if (!hasWindowsShape && !hasLegacyModeShape) {
    return false;
  }

  if (!isStringArray(completed.almanac)) return false;
  if (
    !(mode === "local"
      ? isRecord(completed.animalCosmetics)
      : isStringArrayRecord(completed.animalCosmetics))
  ) {
    return false;
  }
  if (!(mode === "local" ? isRecord(completed.animals) : isStringArrayRecord(completed.animals))) {
    return false;
  }
  if (!isStringArray(completed.cosmetics)) return false;
  if (!isRecord(completed.mines)) return false;
  if (
    (mode === "strict" && !isDomainInteger(completed.mines.floor, getMaxMineFloor())) ||
    !isStringArray(completed.mines.spells)
  ) {
    return false;
  }
  if (!isStringArray(completed.museum)) return false;
  // Strict backup imports require a numeric value; local recovery defaults malformed values and
  // clamps numeric drift so one scalar cannot discard otherwise valid persisted progress.
  if (mode === "strict" && !isFiniteNumber(completed.renown)) return false;

  return (
    isOptionalStringArray(completed.almanacRecipes) &&
    (mode === "local" ||
      completed.childChoice === undefined ||
      isEnumValue(completed.childChoice, VALID_CHILD_CHOICES)) &&
    isOptionalStringArray(completed.dates) &&
    (mode === "local" ||
      completed.hasUpperFloor === undefined ||
      typeof completed.hasUpperFloor === "boolean") &&
    (completed.marriedVillager === undefined ||
      completed.marriedVillager === null ||
      typeof completed.marriedVillager === "string") &&
    (mode === "local"
      ? isOptionalRecord(completed.villagerLevels)
      : isOptionalIntegerRecord(completed.villagerLevels, MAX_VILLAGER_LEVEL)) &&
    (mode === "local"
      ? isOptionalRecord(completed.villagerRelationships)
      : isOptionalEnumRecord(completed.villagerRelationships, VALID_RELATIONSHIPS)) &&
    isOptionalStringArray(completed.villagers) &&
    isOptionalStringArray(completed.petCosmetics) &&
    isOptionalStringArray(completed.petSkins) &&
    isOptionalStringArray(completed.quests) &&
    (mode === "local"
      ? isOptionalRecord(completed.questStates)
      : isOptionalEnumRecord(completed.questStates, VALID_QUEST_STATES)) &&
    (mode === "local" ||
      completed.reachedSeason === undefined ||
      isEnumValue(completed.reachedSeason, VALID_SEASONS)) &&
    isOptionalStringArray(completed.romanticVillagers) &&
    (mode === "local"
      ? isOptionalRecord(completed.skillLevels)
      : isOptionalIntegerRecord(completed.skillLevels, MAX_SKILL_LEVEL)) &&
    isOptionalStringArray(completed.skills) &&
    isOptionalStringArray(completed.unlockedPerks)
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return isRecord(value) && Object.values(value).every((entry) => isStringArray(entry));
}

// ─── Serialization helpers ───────────────────────────────────────────

function knownBrandedSet<T>(
  ids: readonly string[],
  knownIds: object | ReadonlySet<string>,
): Set<T> {
  return new SvelteSet(ids.filter((id) => hasKnownId(knownIds, id))) as unknown as Set<T>;
}

function normalizeAlmanacIds(ids: string[]): Set<ItemId> {
  const result = new SvelteSet<ItemId>();
  for (const id of ids) {
    const canonical = trackerIndex.memberToCanonicalAlmanacId.get(id as ItemId);
    if (canonical) {
      result.add(canonical);
    }
  }
  return result;
}

function normalizeAnimalCosmetics(
  record: Record<string, unknown>,
): Record<AnimalId, Set<CosmeticId>> {
  const result: Record<string, Set<CosmeticId>> = {};
  for (const [animalId, ids] of Object.entries(record)) {
    if (Object.hasOwn(trackerData.animals, animalId) && isStringArray(ids)) {
      const animal = trackerData.animals[animalId as AnimalId];
      result[animalId] = knownBrandedSet<CosmeticId>(ids, animal.cosmetics);
    }
  }
  return result;
}

function normalizeAnimalVariants(
  record: Record<string, unknown>,
): Record<AnimalId, Set<AnimalVariantId>> {
  const result: Record<string, Set<AnimalVariantId>> = {};
  for (const [animalId, ids] of Object.entries(record)) {
    if (Object.hasOwn(trackerData.animals, animalId) && isStringArray(ids)) {
      const animal = trackerData.animals[animalId as AnimalId];
      const variantIds = new Set(animal.variantTiers.flatMap((tier) => Object.keys(tier)));
      result[animalId] = knownBrandedSet<AnimalVariantId>(ids, variantIds);
    }
  }
  return result;
}

function normalizeEnumRecord<K extends string, V extends string>(
  record: Record<string, unknown>,
  knownIds: object | ReadonlySet<string>,
  validValues: ReadonlySet<string>,
): Record<K, V> {
  const result: Record<string, V> = {};
  for (const [id, value] of Object.entries(record)) {
    if (hasKnownId(knownIds, id) && typeof value === "string" && validValues.has(value)) {
      result[id] = value as V;
    }
  }
  return result;
}

function normalizeLevelRecord<K extends string>(
  record: Record<string, unknown>,
  knownIds: object | ReadonlySet<string>,
  max: number,
): Record<K, number> {
  const result: Record<string, number> = {};
  for (const [id, value] of Object.entries(record)) {
    if (hasKnownId(knownIds, id) && isFiniteNumber(value)) {
      const level = clampLevel(value, max);
      if (level > 0) result[id] = level;
    }
  }
  return result;
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

function serialize(state: UserState, source?: Record<string, unknown>): string {
  const s: SerializedState = {
    availabilityWindows: [...state.availabilityWindows],
    completed: {
      almanac: [...state.completed.almanac].toSorted(),
      almanacRecipes: [...state.completed.almanacRecipes].toSorted(),
      animalCosmetics: Object.fromEntries(
        recordEntries(state.completed.animalCosmetics).map(([k, v]) => [k, [...v].toSorted()]),
      ),
      animals: Object.fromEntries(
        recordEntries(state.completed.animals).map(([k, v]) => [k, [...v].toSorted()]),
      ),
      childChoice: state.completed.childChoice,
      cosmetics: [...state.completed.cosmetics].toSorted(),
      dates: [...state.completed.dates].toSorted(),
      hasUpperFloor: state.completed.hasUpperFloor,
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].toSorted(),
      },
      museum: [...state.completed.museum].toSorted(),
      petCosmetics: [...state.completed.petCosmetics].toSorted(),
      petSkins: [...state.completed.petSkins].toSorted(),
      questStates: filterRecord(state.completed.questStates, (v) => v !== "none"),
      reachedSeason: state.completed.reachedSeason,
      renown: state.completed.renown,
      skillLevels: filterRecord(state.completed.skillLevels, (v) => v > 0),
      unlockedPerks: [...state.completed.unlockedPerks].toSorted(),
      villagerLevels: filterRecord(state.completed.villagerLevels, (v) => v > 0),
      villagerRelationships: filterRecord(
        state.completed.villagerRelationships as Record<string, VillagerRelationship>,
        (v) => v !== "undecided",
      ),
    },
    showSpoilers: state.showSpoilers,
    version: CURRENT_SERIALIZATION_VERSION,
    worldState: state.worldState,
  };
  if (!source) return JSON.stringify(s);

  const sourceCompleted = isRecord(source.completed) ? source.completed : {};
  const sourceMines = isRecord(sourceCompleted.mines) ? sourceCompleted.mines : {};
  const sourceWorldState = isRecord(source.worldState) ? source.worldState : {};
  const merged: Record<string, unknown> = {
    ...source,
    ...s,
    completed: {
      ...sourceCompleted,
      ...s.completed,
      mines: { ...sourceMines, ...s.completed.mines },
    },
    worldState: { ...sourceWorldState, ...s.worldState },
  };

  // These are known legacy fields, not forward-compatible data. Keeping them would make a
  // migrated backup advertise two sources of truth for the same setting.
  delete merged.availabilityMode;
  delete merged.showCompleted;
  const mergedCompleted = merged.completed as Record<string, unknown>;
  delete mergedCompleted.marriedVillager;
  delete mergedCompleted.quests;
  delete mergedCompleted.romanticVillagers;
  delete mergedCompleted.skills;
  delete mergedCompleted.villagers;

  return JSON.stringify(merged);
}

function serializedAvailabilityWindows(
  state: SerializedState,
  mode: ValidationMode,
): AvailabilityWindow[] {
  if (state.availabilityWindows) {
    const validWindows = state.availabilityWindows.filter(
      (window, index, windows) =>
        VALID_AVAILABILITY_WINDOWS.has(window) && windows.indexOf(window) === index,
    );
    if (validWindows.length > 0) return validWindows;
  }
  if (isEnumValue(state.availabilityMode, VALID_AVAILABILITY_MODES)) {
    return legacyAvailabilityWindows(state.availabilityMode);
  }
  return mode === "local" ? [...DEFAULT_AVAILABILITY_WINDOWS] : [];
}

function toggleInSet<T>(set: Set<T>, item: T): void {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
}

export const userState = createUserState();
