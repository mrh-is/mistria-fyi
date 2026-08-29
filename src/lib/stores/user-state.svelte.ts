import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "$lib/data/index.js";
import { clampRenownLevel } from "$lib/engine/progress.js";
import { findRecipesForQuest } from "$lib/engine/quest-rewards.js";
import { deriveProgressionState, type UserProgressionState } from "$lib/engine/visibility.js";
import { recordEntries, recordKeys } from "$lib/utils";
import { safeLocalStorage } from "$lib/utils/local-storage.js";

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
  NpcId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
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
  dates: Set<DateId>;
  hasUpperFloor: boolean;
  marriedNpc: NpcId | null;
  mines: { floor: number; spells: Set<SpellId> };
  museum: Set<ItemId>;
  npcLevels: Record<NpcId, number>;
  petCosmetics: Set<PetCosmeticSetId>;
  petSkins: Set<PetSkinId>;
  questStates: Record<QuestId, QuestState>;
  reachedSeason: Season;
  renown: number;
  romanticNpcs: Set<NpcId>;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}

export interface MergeCounts {
  almanac: number;
  almanacRecipes: number;
  animalCosmetics: number;
  animals: number;
  cosmetics: number;
  dates: number;
  hasUpperFloor: number;
  mineFloor: number;
  museum: number;
  npcLevels: number;
  perks: number;
  petCosmetics: number;
  petSkins: number;
  quests: number;
  reachedSeason: number;
  renown: number;
  romanticNpcs: number;
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
    dates?: string[];
    hasUpperFloor?: boolean;
    marriedNpc?: null | string;
    mines: { floor: number; spells: string[] };
    museum: string[];
    npcLevels?: Record<string, number>;
    npcs?: string[];
    petCosmetics?: string[];
    petSkins?: string[];
    quests?: string[];
    questStates?: Record<string, QuestState>;
    reachedSeason?: Season;
    renown: number;
    romanticNpcs?: string[];
    skillLevels?: Record<string, number>;
    skills?: string[];
    unlockedPerks?: string[];
  };
  showSpoilers?: boolean;
  version: string;
  worldState: { season: Season; weather: Weather };
}

const STORAGE_KEY = "harvest-helper-v1";

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
    cosmetics: new SvelteSet<CosmeticId>(),
    dates: new SvelteSet<DateId>(),
    hasUpperFloor: false,
    marriedNpc: null,
    mines: { floor: 0, spells: new SvelteSet<SpellId>() },
    museum: new SvelteSet<ItemId>(),
    npcLevels: {},
    petCosmetics: new SvelteSet<PetCosmeticSetId>(),
    petSkins: new SvelteSet<PetSkinId>(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    romanticNpcs: new SvelteSet<NpcId>(),
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
  let state = $state<UserState>(createDefaultState());

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
          safeLocalStorage.setItem(STORAGE_KEY, json);
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
      state.completed.romanticNpcs.size > 0 ||
      state.completed.mines.floor > 0 ||
      state.completed.mines.spells.size > 0 ||
      state.completed.renown > 0 ||
      state.completed.marriedNpc !== null ||
      state.completed.petCosmetics.size > 0 ||
      state.completed.petSkins.size > 0 ||
      state.completed.unlockedPerks.size > 0 ||
      Object.values(state.completed.npcLevels).some((v) => v > 0) ||
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
    exportState(): string {
      return serialize(state);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
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
        dates: 0,
        hasUpperFloor: 0,
        mineFloor: 0,
        museum: 0,
        npcLevels: 0,
        perks: 0,
        petCosmetics: 0,
        petSkins: 0,
        quests: 0,
        reachedSeason: 0,
        renown: 0,
        romanticNpcs: 0,
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
        for (const [id, level] of recordEntries(imported.npcLevels)) {
          const current = state.completed.npcLevels[id] ?? 0;
          if (level > current) {
            state.completed.npcLevels[id] = level;
            counts.npcLevels++;
          }
        }
      }

      // Skill levels (take max per skill)
      if (imported.skillLevels) {
        for (const [id, level] of recordEntries(imported.skillLevels)) {
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

      // Romantic NPCs (union)
      if (imported.romanticNpcs) {
        for (const id of imported.romanticNpcs) {
          if (!state.completed.romanticNpcs.has(id)) {
            state.completed.romanticNpcs.add(id);
            counts.romanticNpcs++;
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
    },
    restorePersistedState() {
      const stored = safeLocalStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      state = deserialize(stored) ?? state;
    },
    setAvailabilityMode(mode: AvailabilityMode) {
      state.availabilityMode = mode;
    },
    setHasUpperFloor(value: boolean) {
      state.completed.hasUpperFloor = value;
    },
    setMarriedNpc(npcId: NpcId | null) {
      state.completed.marriedNpc = npcId;
      if (npcId !== null) {
        state.completed.romanticNpcs.clear();
      }
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
      const seasonOrd: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };
      if (seasonOrd[season] > seasonOrd[state.completed.reachedSeason]) {
        state.completed.reachedSeason = season;
      }
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
    toggleRomanticNpc(npcId: NpcId) {
      if (state.completed.romanticNpcs.has(npcId)) {
        state.completed.romanticNpcs.delete(npcId);
      } else {
        state.completed.romanticNpcs.add(npcId);
      }
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
        dates: brandedSet<DateId>(s.completed.dates ?? []),
        hasUpperFloor: s.completed.hasUpperFloor ?? false,
        marriedNpc: (s.completed.marriedNpc as NpcId | null | undefined) ?? null,
        mines: {
          floor: s.completed.mines.floor,
          spells: brandedSet<SpellId>(s.completed.mines.spells),
        },
        museum: brandedSet<ItemId>(s.completed.museum),
        npcLevels,
        petCosmetics: brandedSet<PetCosmeticSetId>(s.completed.petCosmetics ?? []),
        petSkins: brandedSet<PetSkinId>(s.completed.petSkins ?? []),
        questStates,
        reachedSeason: s.completed.reachedSeason ?? "spring",
        renown: clampRenownLevel(s.completed.renown),
        romanticNpcs: brandedSet<NpcId>(s.completed.romanticNpcs ?? []),
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
      dates: [...state.completed.dates].sort(),
      hasUpperFloor: state.completed.hasUpperFloor,
      marriedNpc: state.completed.marriedNpc,
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].sort(),
      },
      museum: [...state.completed.museum].sort(),
      npcLevels: filterRecord(state.completed.npcLevels, (v) => v > 0),
      petCosmetics: [...state.completed.petCosmetics].sort(),
      petSkins: [...state.completed.petSkins].sort(),
      questStates: filterRecord(state.completed.questStates, (v) => v !== "none"),
      reachedSeason: state.completed.reachedSeason,
      renown: state.completed.renown,
      romanticNpcs: [...state.completed.romanticNpcs].sort(),
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
