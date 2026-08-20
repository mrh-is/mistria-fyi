import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "$lib/data/index.js";
import { clampRenownLevel } from "$lib/engine/progress.js";
import { findRecipesForQuest } from "$lib/engine/quest-rewards.js";
import { deriveProgressionState, type UserProgressionState } from "$lib/engine/visibility.js";
import { recordToArray } from "$lib/utils";

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  SpellId,
  Weather,
} from "$lib/types/tracker-data.js";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilityMode = "available" | "everything" | "timely";

export interface CompletedState {
  almanac: Set<ItemId>;
  almanacRecipes: Set<RecipeId>;
  animalCosmetics: Record<AnimalId, Set<CosmeticId>>;
  animals: Record<AnimalId, Set<AnimalVariantId>>;
  cosmetics: Set<CosmeticId>;
  marriedNpc: NpcId | null;
  mines: { floor: number; spells: Set<SpellId> };
  museum: Set<ItemId>;
  npcLevels: Record<NpcId, number>;
  questStates: Record<QuestId, QuestState>;
  renown: number;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}

export interface MergeCounts {
  almanac: number;
  almanacRecipes: number;
  animalCosmetics: number;
  animals: number;
  cosmetics: number;
  mineFloor: number;
  museum: number;
  npcLevels: number;
  perks: number;
  quests: number;
  renown: number;
  skillLevels: number;
  spells: number;
}

export type QuestState = "completed" | "none" | "obtained";

export interface UserState {
  availabilityMode: AvailabilityMode;
  completed: CompletedState;
  showCompleted: boolean;
  showSpoilers: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

interface SerializedState {
  availabilityMode: AvailabilityMode;
  completed: {
    almanac: string[];
    almanacRecipes?: string[];
    animalCosmetics: Record<string, string[]>;
    animals: Record<string, string[]>;
    cosmetics: string[];
    marriedNpc?: null | string;
    mines: { floor: number; spells: string[] };
    museum: string[];
    npcLevels?: Record<string, number>;
    npcs?: string[];
    quests?: string[];
    questStates?: Record<string, QuestState>;
    renown: number;
    skillLevels?: Record<string, number>;
    skills?: string[];
    unlockedPerks?: string[];
  };
  showSpoilers?: boolean;
  version: string;
  worldState: { season: Season; weather: Weather };
}

const STORAGE_KEY = "harvest-helper-v1";
export const WELCOME_DISMISSED_KEY = "harvest-helper-welcomed";

function createDefaultCompleted(): CompletedState {
  // Pre-populate default-unlocked cosmetics
  const defaultCosmetics = new SvelteSet<CosmeticId>();
  for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
    if (cosmetic.sources?.some((s) => s.type === "default")) {
      defaultCosmetics.add(id as CosmeticId);
    }
  }

  // Initialize sets for each animal type, pre-populating default-unlocked variants
  const animals: Record<string, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const variantSet = new SvelteSet<AnimalVariantId>();
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of Object.entries(tier)) {
        if (variant.source.type === "default") {
          variantSet.add(variantId as AnimalVariantId);
        }
      }
    }
    animals[animalId] = variantSet;
    animalCosmetics[animalId] = new SvelteSet<CosmeticId>();
  }

  const defaultRecipes = new SvelteSet<RecipeId>();
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources?.some((s) => s.type === "default")) {
      defaultRecipes.add(id as RecipeId);
    }
  }

  return {
    almanac: new SvelteSet<ItemId>(),
    almanacRecipes: defaultRecipes,
    animalCosmetics,
    animals,
    cosmetics: defaultCosmetics,
    marriedNpc: null,
    mines: { floor: 0, spells: new SvelteSet<SpellId>() },
    museum: new SvelteSet<ItemId>(),
    npcLevels: {},
    questStates: {},
    renown: 0,
    skillLevels: {},
    unlockedPerks: new SvelteSet<PerkId>(),
  };
}

function createDefaultState(): UserState {
  return {
    availabilityMode: "available",
    completed: createDefaultCompleted(),
    showCompleted: false,
    showSpoilers: false,
    worldState: { season: "spring", weather: "calm" },
  };
}

// ─── Store ──────────────────────────────────────────────────────────

function createUserState() {
  // Load from localStorage or use defaults
  let initial = createDefaultState();
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      initial = deserialize(stored) ?? initial;
    }
  }

  let state = $state<UserState>(initial);

  const progressionState = $derived(
    deriveProgressionState(state.completed, trackerData, state.showSpoilers),
  );

  // Auto-save to localStorage (debounced)
  if (typeof window !== "undefined") {
    let timeout: ReturnType<typeof setTimeout>;
    $effect.root(() => {
      $effect(() => {
        const json = serialize(state);
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          localStorage.setItem(STORAGE_KEY, json);
        }, 300);
      });
    });
  }

  return {
    /**
     * Transitions a quest from `obtained` → `completed` and idempotently adds
     * any recipe rewards. Returns the recipe IDs that were **newly** added by
     * this call (already-complete recipes are excluded). Call this instead of
     * `cycleQuestState` when the transition should include recipe auto-complete.
     *
     * If the quest is not in `obtained` state, it is cycled normally with no
     * recipe side-effects (covers none→obtained and completed→none).
     */
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
    exportState(): string {
      return serialize(state);
    },
    /** Import/export user state JSON (full replace) */
    importState(json: string): boolean {
      const imported = deserialize(json);
      if (!imported) return false;
      state = imported;
      return true;
    },
    /** Merge imported data into current progress (union, never removes) */
    mergeFromSave(imported: Partial<CompletedState>): MergeCounts {
      const counts: MergeCounts = {
        almanac: 0,
        almanacRecipes: 0,
        animalCosmetics: 0,
        animals: 0,
        cosmetics: 0,
        mineFloor: 0,
        museum: 0,
        npcLevels: 0,
        perks: 0,
        quests: 0,
        renown: 0,
        skillLevels: 0,
        spells: 0,
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

      // Animal variants
      if (imported.animals) {
        for (const [animalId, variants] of recordToArray(imported.animals)) {
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
        for (const [animalId, cosmetics] of recordToArray(imported.animalCosmetics)) {
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

      // Mine floor (take max)
      if (imported.mines && imported.mines.floor > state.completed.mines.floor) {
        counts.mineFloor = imported.mines.floor - state.completed.mines.floor;
        state.completed.mines.floor = imported.mines.floor;
      }

      // Renown (take max)
      if (imported.renown !== undefined && imported.renown > state.completed.renown) {
        counts.renown = imported.renown - state.completed.renown;
        state.completed.renown = imported.renown;
      }

      // NPC levels (take max per NPC)
      if (imported.npcLevels) {
        for (const [id, level] of recordToArray(imported.npcLevels)) {
          const current = state.completed.npcLevels[id] ?? 0;
          if (level > current) {
            state.completed.npcLevels[id] = level;
            counts.npcLevels++;
          }
        }
      }

      // Skill levels (take max per skill)
      if (imported.skillLevels) {
        for (const [id, level] of recordToArray(imported.skillLevels)) {
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
        for (const [id, importedState] of recordToArray(imported.questStates)) {
          const current = state.completed.questStates[id] ?? "none";
          if (rank[importedState] > rank[current]) {
            state.completed.questStates[id] = importedState;
            counts.quests++;
          }
        }
      }

      return counts;
    },
    get progressionState(): UserProgressionState {
      return progressionState;
    },
    resetAll() {
      state = createDefaultState();
      if (typeof window !== "undefined") {
        localStorage.removeItem(WELCOME_DISMISSED_KEY);
      }
    },
    setAvailabilityMode(mode: AvailabilityMode) {
      state.availabilityMode = mode;
    },
    setMarriedNpc(npcId: NpcId | null) {
      state.completed.marriedNpc = npcId;
    },
    setMineFloor(floor: number) {
      const biomes = trackerData.mines.biomes;
      const maxFloor = biomes[biomes.length - 1].floors.end;
      state.completed.mines.floor = Math.max(0, Math.min(floor, maxFloor));
    },
    setNpcLevel(id: NpcId, level: number) {
      const max = trackerData.npcs[id].dateable ? 12 : 10;
      state.completed.npcLevels[id] = Math.max(0, Math.min(level, max));
    },
    setRenown(level: number) {
      state.completed.renown = clampRenownLevel(level);
    },
    setSeason(season: Season) {
      state.worldState.season = season;
    },
    setSkillLevel(id: SkillId, level: number) {
      state.completed.skillLevels[id] = Math.max(0, Math.min(level, 60));
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
    toggleCosmetic(id: CosmeticId) {
      toggleInSet(state.completed.cosmetics, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleInSet(state.completed.museum, id);
    },
    togglePerk(id: PerkId) {
      toggleInSet(state.completed.unlockedPerks, id);
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

function deserialize(json: string): null | UserState {
  try {
    const s = JSON.parse(json) as SerializedState;
    if (s.version !== "1") return null;

    // Branded ID types require casting through unknown at the serialization boundary
    const brandedSet = <T>(arr: string[]) => new SvelteSet(arr) as unknown as Set<T>;

    // Migrate legacy Set-based data → level/state Records
    // Old format: npcs/skills/quests as string[]; New format: npcLevels/skillLevels/questStates as Records
    const npcLevels: Record<string, number> = s.completed.npcLevels ?? {};
    if (!s.completed.npcLevels && s.completed.npcs) {
      for (const id of s.completed.npcs) npcLevels[id] = 10; // legacy "completed" → max standard level
    }

    const skillLevels: Record<string, number> = s.completed.skillLevels ?? {};
    if (!s.completed.skillLevels && s.completed.skills) {
      for (const id of s.completed.skills) skillLevels[id] = 60; // legacy "completed" → max level
    }

    const questStates: Record<string, QuestState> = s.completed.questStates ?? {};
    if (!s.completed.questStates && s.completed.quests) {
      for (const id of s.completed.quests) questStates[id] = "completed";
    }

    return {
      availabilityMode: s.availabilityMode,
      completed: {
        almanac: brandedSet<ItemId>(s.completed.almanac),
        almanacRecipes: brandedSet<RecipeId>(s.completed.almanacRecipes ?? []),
        animalCosmetics: Object.fromEntries(
          Object.entries(s.completed.animalCosmetics).map(([k, v]) => [
            k,
            brandedSet<CosmeticId>(v),
          ]),
        ),
        animals: Object.fromEntries(
          Object.entries(s.completed.animals).map(([k, v]) => [k, brandedSet<AnimalVariantId>(v)]),
        ),
        cosmetics: brandedSet<CosmeticId>(s.completed.cosmetics),
        marriedNpc: (s.completed.marriedNpc as NpcId | null | undefined) ?? null,
        mines: {
          floor: s.completed.mines.floor,
          spells: brandedSet<SpellId>(s.completed.mines.spells),
        },
        museum: brandedSet<ItemId>(s.completed.museum),
        npcLevels,
        questStates,
        renown: clampRenownLevel(s.completed.renown),
        skillLevels,
        unlockedPerks: brandedSet<PerkId>(s.completed.unlockedPerks ?? []),
      },
      showCompleted: false,
      showSpoilers: s.showSpoilers ?? false,
      worldState: s.worldState,
    };
  } catch {
    return null;
  }
}

// ─── Serialization helpers ───────────────────────────────────────────

function filterRecord<V>(
  record: Record<string, V>,
  predicate: (v: V) => boolean,
): Record<string, V> {
  return Object.fromEntries(Object.entries(record).filter(([, v]) => predicate(v)));
}

function serialize(state: UserState): string {
  const s: SerializedState = {
    availabilityMode: state.availabilityMode,
    completed: {
      almanac: [...state.completed.almanac].sort(),
      almanacRecipes: [...state.completed.almanacRecipes].sort(),
      animalCosmetics: Object.fromEntries(
        Object.entries(state.completed.animalCosmetics).map(([k, v]) => [k, [...v].sort()]),
      ),
      animals: Object.fromEntries(
        Object.entries(state.completed.animals).map(([k, v]) => [k, [...v].sort()]),
      ),
      cosmetics: [...state.completed.cosmetics].sort(),
      marriedNpc: state.completed.marriedNpc,
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].sort(),
      },
      museum: [...state.completed.museum].sort(),
      npcLevels: filterRecord(state.completed.npcLevels, (v) => v > 0),
      questStates: filterRecord(state.completed.questStates, (v) => v !== "none"),
      renown: state.completed.renown,
      skillLevels: filterRecord(state.completed.skillLevels, (v) => v > 0),
      unlockedPerks: [...state.completed.unlockedPerks].sort(),
    },
    showSpoilers: state.showSpoilers,
    version: "1",
    worldState: state.worldState,
  };
  return JSON.stringify(s);
}

function toggleInSet<T>(set: Set<T>, item: T): void {
  if (set.has(item)) {
    set.delete(item);
  } else {
    set.add(item);
  }
}

export const userState = createUserState();
