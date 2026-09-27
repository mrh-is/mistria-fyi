import { SvelteSet } from "svelte/reactivity";

import { canonicalAlmanacId, trackerData } from "$lib/data/index.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  getMaxMineFloor,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
} from "$lib/engine/progress.js";
import { findRecipesForQuest } from "$lib/engine/quest-rewards.js";
import {
  getMarriedVillager,
  normalizeRelationships,
  relationshipBranch,
  relationshipRank,
} from "$lib/engine/relationships.js";
import { deriveProgressionState, type UserProgressionState } from "$lib/engine/visibility.js";
import {
  AVAILABILITY_WINDOWS,
  DEFAULT_AVAILABILITY_WINDOWS,
  LEGACY_AVAILABILITY_MODES,
  legacyAvailabilityWindows,
} from "$lib/types/availability.js";
import { SEASONS, VILLAGER_RELATIONSHIPS, WEATHERS } from "$lib/types/tracker-data.js";
import { recordEntries, recordKeys } from "$lib/utils";
import { tryGetItem, trySetItem } from "$lib/utils/local-storage.js";

import type { AvailabilityWindow, LegacyAvailabilityMode } from "$lib/types/availability.js";
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
} from "$lib/types/tracker-data.js";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilityMode = LegacyAvailabilityMode;
export const CHILD_CHOICES = ["no", "undeclared", "yes"] as const;
export const QUEST_STATES = ["completed", "none", "obtained"] as const;
export type ChildChoice = (typeof CHILD_CHOICES)[number];
export interface CompletedState {
  almanac: Set<ItemId>;
  almanacRecipes: Set<RecipeId>;
  animalCosmetics: Record<AnimalId, Set<CosmeticId>>;
  animals: Record<AnimalId, Set<AnimalVariantId>>;
  childChoice: ChildChoice;
  cosmetics: Set<CosmeticId>;
  dates: Set<DateId>;
  hasUpperFloor: boolean;
  mines: { floor: number; spells: Set<SpellId> };
  museum: Set<ItemId>;
  petCosmetics: Set<PetCosmeticSetId>;
  petSkins: Set<PetSkinId>;
  questStates: Record<QuestId, QuestState>;
  reachedSeason: Season;
  renown: number;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
  villagerLevels: Record<VillagerId, number>;
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>;
}
export type ImportErrorKind = "invalid-fields" | "malformed-json" | "unsupported-version";

export type ImportResult = { error: ImportErrorKind; ok: false } | { ok: true };

/**
 * A household fact (spouse identity or child choice) that a merge could not apply because it
 * conflicts with locally recorded progress. The merge keeps the local value and reports the
 * conflict rather than guessing; see docs on `mergeFromSave` for the policy.
 */
export type MergeConflict =
  | {
      incomingChildChoice: Exclude<ChildChoice, "undeclared">;
      kind: "childChoice";
      localChildChoice: Exclude<ChildChoice, "undeclared">;
      villagerId: VillagerId;
    }
  | {
      incomingRelationship: VillagerRelationship;
      kind: "relationship";
      localRelationship: VillagerRelationship;
      villagerId: VillagerId;
    }
  | {
      incomingVillagerId: VillagerId;
      kind: "spouse";
      localVillagerId: VillagerId;
    };

export interface MergeCounts {
  almanac: number;
  almanacRecipes: number;
  animalCosmetics: number;
  animals: number;
  childChoice: number;
  cosmetics: number;
  dates: number;
  hasUpperFloor: number;
  mineFloor: number;
  museum: number;
  perks: number;
  petCosmetics: number;
  petSkins: number;
  quests: number;
  reachedSeason: number;
  renown: number;
  skillLevels: number;
  spells: number;
  villagerLevels: number;
  villagerRelationships: number;
}

/** What {@link mergeFromSave} applied and what it skipped rather than guessing. */
export interface MergeResult {
  conflicts: MergeConflict[];
  counts: MergeCounts;
}

export type QuestState = (typeof QUEST_STATES)[number];

export interface UserState {
  availabilityWindows: AvailabilityWindow[];
  completed: CompletedState;
  showCompleted: boolean;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

interface SerializedState {
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

const STORAGE_KEY = "mistria-fyi-v1";
const QUARANTINE_KEY = `${STORAGE_KEY}-quarantine`;

const VALID_CHILD_CHOICES = new Set<string>(CHILD_CHOICES);
const VALID_AVAILABILITY_MODES = new Set<string>(LEGACY_AVAILABILITY_MODES);
const VALID_AVAILABILITY_WINDOWS = new Set<string>(AVAILABILITY_WINDOWS);
const VALID_RELATIONSHIPS = new Set<string>(VILLAGER_RELATIONSHIPS);
const VALID_QUEST_STATES = new Set<string>(QUEST_STATES);
const VALID_SEASONS = new Set<string>(SEASONS);
const VALID_WEATHER = new Set<string>(WEATHERS);

type DeserializeResult = { error: ImportErrorKind; ok: false } | { ok: true; state: UserState };
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

function addStartingItems(completed: CompletedState): void {
  for (const [id, cosmetic] of recordEntries(trackerData.cosmetics)) {
    if (cosmetic.sources.some((s) => s.type === "default")) {
      completed.cosmetics.add(id);
    }
  }

  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const variantSet = (completed.animals[animalId] ??= new SvelteSet<AnimalVariantId>());
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
function backfillAnimalMaps(completed: CompletedState): void {
  for (const animalId of recordKeys(trackerData.animals)) {
    completed.animals[animalId] ??= new SvelteSet<AnimalVariantId>();
    completed.animalCosmetics[animalId] ??= new SvelteSet<CosmeticId>();
  }
}

function createDefaultCompleted(): CompletedState {
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
    completed: createDefaultCompleted(),
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
  if (typeof window !== "undefined") {
    let timeout: ReturnType<typeof setTimeout>;
    $effect.root(() => {
      $effect(() => {
        if (!_persistenceReady) return;

        const json = serialize(state);
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          const ok = trySetItem(STORAGE_KEY, json);
          if (!ok) {
            _persistenceFailureGeneration++;
          } else {
            _persistenceFailureGeneration = 0;
          }
        }, 300);
      });
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
      Object.values(state.completed.villagerLevels).some((v) => v > 0) ||
      Object.values(state.completed.skillLevels).some((v) => v > 0) ||
      Object.values(state.completed.questStates).some((v) => v !== "none") ||
      Object.values(state.completed.animals).some((s) => s.size > 0) ||
      Object.values(state.completed.animalCosmetics).some((s) => s.size > 0),
  );

  return {
    applyStartingItems() {
      addStartingItems(state.completed);
    },
    completeQuestWithRecipes(id: QuestId): RecipeId[] {
      const current = state.completed.questStates[id] ?? "none";
      state.completed.questStates[id] =
        current === "none" ? "obtained" : current === "obtained" ? "completed" : "none";

      if (current !== "obtained") return [];

      const candidates = findRecipesForQuest(id);
      const newlyAdded: RecipeId[] = [];
      for (const recipeId of candidates) {
        if (!state.completed.almanacRecipes.has(recipeId)) {
          state.completed.almanacRecipes.add(recipeId);
          newlyAdded.push(recipeId);
        }
      }
      return newlyAdded;
    },
    cycleQuestState(id: QuestId) {
      const current = state.completed.questStates[id] ?? "none";
      const next: QuestState =
        current === "none" ? "obtained" : current === "obtained" ? "completed" : "none";
      state.completed.questStates[id] = next;
    },
    dismissPersistenceWarning() {
      if (persistenceBlocked) {
        _persistenceFailureGeneration++;
      } else {
        _persistenceFailureGeneration = 0;
      }
    },
    exportState(): string {
      return serialize(state);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
    },
    /** Import/export user state JSON (full replace) */
    importState(json: string): ImportResult {
      const result = deserialize(json, "strict");
      if (!result.ok) return result;
      state = result.state;
      enablePersistenceAfterExplicitReplace();
      return { ok: true };
    },
    /** Merge imported data into current progress (union, never removes) */
    mergeFromSave(imported: Partial<CompletedState>): MergeResult {
      const conflicts: MergeConflict[] = [];
      const counts: MergeCounts = {
        almanac: 0,
        almanacRecipes: 0,
        animalCosmetics: 0,
        animals: 0,
        childChoice: 0,
        cosmetics: 0,
        dates: 0,
        hasUpperFloor: 0,
        mineFloor: 0,
        museum: 0,
        perks: 0,
        petCosmetics: 0,
        petSkins: 0,
        quests: 0,
        reachedSeason: 0,
        renown: 0,
        skillLevels: 0,
        spells: 0,
        villagerLevels: 0,
        villagerRelationships: 0,
      };

      // Almanac
      if (imported.almanac) {
        for (const id of imported.almanac) {
          if (!state.completed.almanac.has(id)) {
            state.completed.almanac.add(id);
            counts.almanac++;
          }
        }
      }

      // Almanac recipes
      if (imported.almanacRecipes) {
        for (const id of imported.almanacRecipes) {
          if (!state.completed.almanacRecipes.has(id)) {
            state.completed.almanacRecipes.add(id);
            counts.almanacRecipes++;
          }
        }
      }

      // Cosmetics
      if (imported.cosmetics) {
        for (const id of imported.cosmetics) {
          if (!state.completed.cosmetics.has(id)) {
            state.completed.cosmetics.add(id);
            counts.cosmetics++;
          }
        }
      }

      // Dates
      if (imported.dates) {
        for (const id of imported.dates) {
          if (!state.completed.dates.has(id)) {
            state.completed.dates.add(id);
            counts.dates++;
          }
        }
      }

      // Animal variants
      if (imported.animals) {
        for (const [animalId, variants] of recordEntries(imported.animals)) {
          const existing = (state.completed.animals[animalId] ??= new SvelteSet<AnimalVariantId>());
          for (const v of variants) {
            if (!existing.has(v)) {
              existing.add(v);
              counts.animals++;
            }
          }
        }
      }

      // Animal cosmetics
      if (imported.animalCosmetics) {
        for (const [animalId, cosmetics] of recordEntries(imported.animalCosmetics)) {
          const existing = (state.completed.animalCosmetics[animalId] ??=
            new SvelteSet<CosmeticId>());
          for (const c of cosmetics) {
            if (!existing.has(c)) {
              existing.add(c);
              counts.animalCosmetics++;
            }
          }
        }
      }

      // Pet cosmetics
      if (imported.petCosmetics) {
        for (const id of imported.petCosmetics) {
          if (!state.completed.petCosmetics.has(id)) {
            state.completed.petCosmetics.add(id);
            counts.petCosmetics++;
          }
        }
      }

      // Pet skins
      if (imported.petSkins) {
        for (const id of imported.petSkins) {
          if (!state.completed.petSkins.has(id)) {
            state.completed.petSkins.add(id);
            counts.petSkins++;
          }
        }
      }

      // Museum
      if (imported.museum) {
        for (const id of imported.museum) {
          if (!state.completed.museum.has(id)) {
            state.completed.museum.add(id);
            counts.museum++;
          }
        }
      }

      // Spells
      if (imported.mines?.spells) {
        for (const id of imported.mines.spells) {
          if (!state.completed.mines.spells.has(id)) {
            state.completed.mines.spells.add(id);
            counts.spells++;
          }
        }
      }

      // Levels are clamped again here so the canonical state stays inside its domains even if a
      // caller bypasses buildImportState's normalization.

      // Mine floor (take max)
      if (imported.mines) {
        const floor = clampMineFloor(imported.mines.floor);
        if (floor > state.completed.mines.floor) {
          counts.mineFloor = floor - state.completed.mines.floor;
          state.completed.mines.floor = floor;
        }
      }

      // Renown (take max)
      if (imported.renown !== undefined) {
        const renown = clampRenownLevel(imported.renown);
        if (renown > state.completed.renown) {
          counts.renown = renown - state.completed.renown;
          state.completed.renown = renown;
        }
      }

      // Villager levels (take max per villager)
      if (imported.villagerLevels) {
        for (const [id, rawLevel] of recordEntries(imported.villagerLevels)) {
          const level = clampLevel(rawLevel, MAX_VILLAGER_LEVEL);
          const current = state.completed.villagerLevels[id] ?? 0;
          if (level > current) {
            state.completed.villagerLevels[id] = level;
            counts.villagerLevels++;
          }
        }
      }

      // Skill levels (take max per skill)
      if (imported.skillLevels) {
        for (const [id, rawLevel] of recordEntries(imported.skillLevels)) {
          const level = clampLevel(rawLevel, MAX_SKILL_LEVEL);
          const current = state.completed.skillLevels[id] ?? 0;
          if (level > current) {
            state.completed.skillLevels[id] = level;
            counts.skillLevels++;
          }
        }
      }

      // Perks (union)
      if (imported.unlockedPerks) {
        for (const id of imported.unlockedPerks) {
          if (!state.completed.unlockedPerks.has(id)) {
            state.completed.unlockedPerks.add(id);
            counts.perks++;
          }
        }
      }

      // Quest states (take more advanced state: none < obtained < completed)
      if (imported.questStates) {
        const rank: Record<QuestState, number> = { completed: 2, none: 0, obtained: 1 };
        for (const [id, importedState] of recordEntries(imported.questStates)) {
          const current = state.completed.questStates[id] ?? "none";
          if (rank[importedState] > rank[current]) {
            state.completed.questStates[id] = importedState;
            counts.quests++;
          }
        }
      }

      // Reached season (take later season)
      if (imported.reachedSeason !== undefined) {
        const seasonOrd: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };
        if (seasonOrd[imported.reachedSeason] > seasonOrd[state.completed.reachedSeason]) {
          state.completed.reachedSeason = imported.reachedSeason;
          counts.reachedSeason = 1;
        }
      }

      // Has upper floor (logical OR)
      if (imported.hasUpperFloor && !state.completed.hasUpperFloor) {
        state.completed.hasUpperFloor = true;
        counts.hasUpperFloor = 1;
      }

      // Villager relationships & child choice (one coherent household merge; see docs on
      // mergeFromSave for the conflict policy this implements).
      {
        const localMarried = getMarriedVillager(state.completed.villagerRelationships);
        const importedRelationships = imported.villagerRelationships ?? {};
        const importedMarried = imported.villagerRelationships
          ? getMarriedVillager(importedRelationships)
          : null;

        // Villagers whose relationship the general per-villager loop below must not touch,
        // because they are (or were) a spouse and are handled explicitly above.
        const skipVillagerIds = new SvelteSet<VillagerId>();
        // Whether a household exists (locally or newly created by this merge) that the
        // incoming child choice may be applied against.
        let householdVillagerId: null | VillagerId = localMarried;
        // A new marriage forces every other dateable villager to platonic via
        // normalizeRelationships regardless of what the incoming data says about them, so the
        // general per-villager loop below must not evaluate them for conflicts at all.
        let skipGeneralLoop = false;

        if (imported.villagerRelationships) {
          if (localMarried === null && importedMarried !== null) {
            // No local spouse: the incoming marriage applies silently, cascading every other
            // villager to platonic via normalizeRelationships. This is the one allowed downgrade.
            state.completed.villagerRelationships[importedMarried] = "married";
            counts.villagerRelationships++;
            skipVillagerIds.add(importedMarried);
            householdVillagerId = importedMarried;
            skipGeneralLoop = true;
          } else if (
            localMarried !== null &&
            importedMarried !== null &&
            importedMarried !== localMarried
          ) {
            // Different spouses: one household conflict, never two independent ones. The incoming
            // marriage and its child choice are both skipped entirely; other villagers still merge
            // normally.
            conflicts.push({
              incomingVillagerId: importedMarried,
              kind: "spouse",
              localVillagerId: localMarried,
            });
            skipVillagerIds.add(localMarried);
            skipVillagerIds.add(importedMarried);
            householdVillagerId = null;
          } else if (localMarried !== null) {
            // Same spouse (or incoming doesn't mention a spouse at all): check whether the
            // incoming data downgrades the local marriage.
            const importedLocalSpouseRel = importedRelationships[localMarried];
            if (importedLocalSpouseRel && importedLocalSpouseRel !== "married") {
              conflicts.push({
                incomingRelationship: importedLocalSpouseRel,
                kind: "relationship",
                localRelationship: "married",
                villagerId: localMarried,
              });
              // The marriage itself is disputed, so the household it would apply a child choice
              // to is not a settled fact this merge can act on.
              householdVillagerId = null;
            }
            skipVillagerIds.add(localMarried);
          }

          // General per-villager merge for everyone else: silent for a forward move within a
          // branch (undecided → anything, romantic → proposed), a conflict for a move between
          // branches or backward. An incoming "undecided" or an omitted villager is always a no-op.
          if (!skipGeneralLoop) {
            for (const [villagerIdStr, importedRel] of Object.entries(importedRelationships)) {
              const villagerId = villagerIdStr as VillagerId;
              if (!importedRel || importedRel === "undecided" || skipVillagerIds.has(villagerId)) {
                continue;
              }

              const localRel = state.completed.villagerRelationships[villagerId] ?? "undecided";
              if (localRel === importedRel) continue;

              if (localRel === "undecided") {
                state.completed.villagerRelationships[villagerId] = importedRel;
                counts.villagerRelationships++;
              } else if (relationshipBranch(localRel) !== relationshipBranch(importedRel)) {
                conflicts.push({
                  incomingRelationship: importedRel,
                  kind: "relationship",
                  localRelationship: localRel,
                  villagerId,
                });
              } else if (relationshipRank(importedRel) > relationshipRank(localRel)) {
                state.completed.villagerRelationships[villagerId] = importedRel;
                counts.villagerRelationships++;
              } else {
                conflicts.push({
                  incomingRelationship: importedRel,
                  kind: "relationship",
                  localRelationship: localRel,
                  villagerId,
                });
              }
            }
          }

          normalizeRelationships(state.completed.villagerRelationships);
        }

        // Child choice merge: meaningless without a household, and never carried across a
        // household conflict (a different spouse, or a disputed downgrade of the local spouse).
        if (
          householdVillagerId !== null &&
          imported.childChoice !== undefined &&
          imported.childChoice !== "undeclared"
        ) {
          if (state.completed.childChoice === "undeclared") {
            state.completed.childChoice = imported.childChoice;
            counts.childChoice = 1;
          } else if (state.completed.childChoice !== imported.childChoice) {
            conflicts.push({
              incomingChildChoice: imported.childChoice,
              kind: "childChoice",
              localChildChoice: state.completed.childChoice,
              villagerId: householdVillagerId,
            });
          }
        }
      }

      // Backfill animal maps for any animals added since the imported state was created
      backfillAnimalMaps(state.completed);

      return { conflicts, counts };
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
      enablePersistenceAfterExplicitReplace();
    },
    restorePersistedState() {
      const storedResult = tryGetItem(STORAGE_KEY);
      if (!storedResult.ok) {
        _persistenceReady = false;
        persistenceBlocked = true;
        quarantineAvailable = false;
        _persistenceFailureGeneration++;
        return;
      }

      const stored = storedResult.value;
      if (stored === null) {
        persistenceBlocked = false;
        quarantineAvailable = false;
        _persistenceReady = true;
        return;
      }

      const result = deserialize(stored, "local");
      if (result.ok) {
        state = result.state;
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
    setAvailabilityMode(mode: AvailabilityMode) {
      state.availabilityWindows = legacyAvailabilityWindows(mode);
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
    setReachedSeason(season: Season) {
      const seasonOrd: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };
      if (seasonOrd[season] > seasonOrd[state.completed.reachedSeason]) {
        state.completed.reachedSeason = season;
      }
    },
    setRenown(level: number) {
      state.completed.renown = clampRenownLevel(level);
    },
    setSeason(season: Season) {
      state.worldState.season = season;
    },
    setSkillLevel(id: SkillId, level: number) {
      state.completed.skillLevels[id] = clampLevel(level, MAX_SKILL_LEVEL);
    },
    setVillagerLevel(id: VillagerId, level: number) {
      state.completed.villagerLevels[id] = clampLevel(level, MAX_VILLAGER_LEVEL);
    },
    setVillagerRelationship(villagerId: VillagerId, relationship: VillagerRelationship) {
      const oldMarried = getMarriedVillager(state.completed.villagerRelationships);
      if (relationship === "undecided") {
        const { [villagerId]: _, ...rest } = state.completed.villagerRelationships;
        state.completed.villagerRelationships = rest;
      } else {
        state.completed.villagerRelationships[villagerId] = relationship;
      }
      normalizeRelationships(state.completed.villagerRelationships);
      const newMarried = getMarriedVillager(state.completed.villagerRelationships);
      if (oldMarried !== newMarried) {
        state.completed.childChoice = "undeclared";
      }
    },
    setWeather(weather: Weather) {
      state.worldState.weather = weather;
    },
    get state(): UserState {
      return state;
    },
    toggleAlmanacItem(id: ItemId) {
      toggleInSet(state.completed.almanac, id);
    },
    toggleAlmanacRecipe(id: RecipeId) {
      toggleInSet(state.completed.almanacRecipes, id);
    },
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      const set = (state.completed.animalCosmetics[animalId] ??= new SvelteSet<CosmeticId>());
      toggleInSet(set, cosmeticId);
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: AnimalVariantId) {
      const set = (state.completed.animals[animalId] ??= new SvelteSet<AnimalVariantId>());
      toggleInSet(set, variantId);
    },
    toggleAvailabilityWindow(window: AvailabilityWindow) {
      const selected = new SvelteSet(state.availabilityWindows);
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
    undoQuestWithRecipes(id: QuestId, newlyAdded: RecipeId[]) {
      this.cycleQuestState(id);
      this.cycleQuestState(id);
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

  if (raw.version !== "1") {
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
      for (const id of s.completed.villagers) rawVillagerLevels[id] = 10;
    }
    const villagerLevels = normalizeLevelRecord<VillagerId>(
      rawVillagerLevels,
      trackerData.villagers,
      MAX_VILLAGER_LEVEL,
    );

    const rawSkillLevels: Record<string, unknown> = { ...s.completed.skillLevels };
    if (!s.completed.skillLevels && s.completed.skills) {
      for (const id of s.completed.skills) rawSkillLevels[id] = MAX_SKILL_LEVEL;
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
    let villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};
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
    normalizeRelationships(villagerRelationships);

    const childChoice: ChildChoice =
      s.completed.childChoice && VALID_CHILD_CHOICES.has(s.completed.childChoice)
        ? s.completed.childChoice
        : "undeclared";

    const completed: CompletedState = {
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
  record: Record<string, V>,
  predicate: (v: V) => boolean,
): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => predicate(v)));
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

// ─── Serialization helpers ───────────────────────────────────────────

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return isRecord(value) && Object.values(value).every(isStringArray);
}

function knownBrandedSet<T>(
  ids: readonly string[],
  knownIds: object | ReadonlySet<string>,
): Set<T> {
  return new SvelteSet(ids.filter((id) => hasKnownId(knownIds, id))) as unknown as Set<T>;
}

function normalizeAlmanacIds(ids: string[]): Set<ItemId> {
  const result = new SvelteSet<ItemId>();
  for (const id of ids) {
    const canonical = canonicalAlmanacId.get(id as ItemId);
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

function serialize(state: UserState): string {
  const s: SerializedState = {
    availabilityWindows: [...state.availabilityWindows],
    completed: {
      almanac: [...state.completed.almanac].sort(),
      almanacRecipes: [...state.completed.almanacRecipes].sort(),
      animalCosmetics: Object.fromEntries(
        Object.entries(state.completed.animalCosmetics).map(([k, v]) => [k, [...v].sort()]),
      ),
      animals: Object.fromEntries(
        Object.entries(state.completed.animals).map(([k, v]) => [k, [...v].sort()]),
      ),
      childChoice: state.completed.childChoice,
      cosmetics: [...state.completed.cosmetics].sort(),
      dates: [...state.completed.dates].sort(),
      hasUpperFloor: state.completed.hasUpperFloor,
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].sort(),
      },
      museum: [...state.completed.museum].sort(),
      petCosmetics: [...state.completed.petCosmetics].sort(),
      petSkins: [...state.completed.petSkins].sort(),
      questStates: filterRecord(state.completed.questStates, (v) => v !== "none"),
      reachedSeason: state.completed.reachedSeason,
      renown: state.completed.renown,
      skillLevels: filterRecord(state.completed.skillLevels, (v) => v > 0),
      unlockedPerks: [...state.completed.unlockedPerks].sort(),
      villagerLevels: filterRecord(state.completed.villagerLevels, (v) => v > 0),
      villagerRelationships: filterRecord(
        state.completed.villagerRelationships as Record<string, VillagerRelationship>,
        (v) => v !== "undecided",
      ),
    },
    showSpoilers: state.showSpoilers,
    version: "1",
    worldState: state.worldState,
  };
  return JSON.stringify(s);
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
