import { SvelteSet } from "svelte/reactivity";

import { trackerData } from "$lib/data/index.js";

import type { ImportResult } from "$lib/engine/import-save.js";
import type {
  AnimalId,
  CosmeticId,
  ItemId,
  NpcId,
  QuestId,
  Season,
  SkillId,
  SpellId,
  VariantId,
  Weather,
} from "$lib/types/tracker-data.js";

// ─── Types ──────────────────────────────────────────────────────────

export type AvailabilityMode = "available" | "everything" | "timely";

export interface CompletedState {
  almanac: Set<ItemId>;
  animalCosmetics: Record<string, Set<CosmeticId>>;
  animals: Record<string, Set<VariantId>>;
  cosmetics: Set<CosmeticId>;
  mines: { floor: number; spells: Set<SpellId> };
  museum: Set<ItemId>;
  npcs: Set<NpcId>;
  quests: Set<QuestId>;
  renown: number;
  skills: Set<SkillId>;
}

export interface UserState {
  availabilityMode: AvailabilityMode;
  completed: CompletedState;
  showCompleted: boolean;
  worldState: { season: Season; weather: Weather };
}

// ─── Serialization ──────────────────────────────────────────────────

interface SerializedState {
  availabilityMode: AvailabilityMode;
  completed: {
    almanac: string[];
    animalCosmetics: Record<string, string[]>;
    animals: Record<string, string[]>;
    cosmetics: string[];
    mines: { floor: number; spells: string[] };
    museum: string[];
    npcs: string[];
    quests: string[];
    renown: number;
    skills: string[];
  };
  version: string;
  worldState: { season: Season; weather: Weather };
}

const STORAGE_KEY = "harvest-helper-v1";

function createDefaultCompleted(): CompletedState {
  // Pre-populate default-unlocked cosmetics
  const defaultCosmetics = new SvelteSet<CosmeticId>();
  for (const [id, cosmetic] of Object.entries(trackerData.cosmetics)) {
    if (cosmetic.defaultUnlocked) {
      defaultCosmetics.add(id as CosmeticId);
    }
  }

  // Pre-populate default-unlocked animal variants + empty cosmetic sets
  const animals: Record<string, Set<VariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const variants = new SvelteSet<VariantId>();
    for (const [variantId, variant] of Object.entries(animal.variants)) {
      if (variant.defaultUnlocked) {
        variants.add(variantId as VariantId);
      }
    }
    animals[animalId] = variants;
    animalCosmetics[animalId] = new SvelteSet<CosmeticId>();
  }

  return {
    almanac: new SvelteSet<ItemId>(),
    animalCosmetics,
    animals,
    cosmetics: defaultCosmetics,
    mines: { floor: 0, spells: new SvelteSet<SpellId>() },
    museum: new SvelteSet<ItemId>(),
    npcs: new SvelteSet<NpcId>(),
    quests: new SvelteSet<QuestId>(),
    renown: 0,
    skills: new SvelteSet<SkillId>(),
  };
}

function createDefaultState(): UserState {
  return {
    availabilityMode: "available",
    completed: createDefaultCompleted(),
    showCompleted: false,
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
    /** Merge player.json save data into current progress (union, never removes) */
    mergeFromSave(imported: Partial<CompletedState>): ImportResult["counts"] {
      const counts: ImportResult["counts"] = {
        almanac: 0,
        animalCosmetics: 0,
        animals: 0,
        cosmetics: 0,
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
        for (const [animalId, variants] of Object.entries(imported.animals)) {
          const existing = (state.completed.animals[animalId] ??=
            new SvelteSet<VariantId>());
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
        for (const [animalId, cosmetics] of Object.entries(
          imported.animalCosmetics,
        )) {
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

      // Spells
      if (imported.mines?.spells) {
        for (const id of imported.mines.spells) {
          if (!state.completed.mines.spells.has(id)) {
            state.completed.mines.spells.add(id);
            counts.spells++;
          }
        }
      }

      return counts;
    },
    resetAll() {
      state = createDefaultState();
    },
    setAvailabilityMode(mode: AvailabilityMode) {
      state.availabilityMode = mode;
    },
    setMineFloor(floor: number) {
      state.completed.mines.floor = Math.max(0, Math.min(floor, trackerData.mines.maxFloors));
    },
    setRenown(level: number) {
      const max = trackerData.renown.levelsPerRank * trackerData.renown.ranks.length;
      state.completed.renown = Math.max(0, Math.min(level, max));
    },
    setSeason(season: Season) {
      state.worldState.season = season;
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
    toggleAnimalCosmetic(animalId: AnimalId, cosmeticId: CosmeticId) {
      const set = (state.completed.animalCosmetics[animalId] ??= new SvelteSet<CosmeticId>());
      toggleInSet(set, cosmeticId);
    },
    toggleAnimalVariant(animalId: AnimalId, variantId: VariantId) {
      const set = (state.completed.animals[animalId] ??= new SvelteSet<VariantId>());
      toggleInSet(set, variantId);
    },
    toggleCosmetic(id: CosmeticId) {
      toggleInSet(state.completed.cosmetics, id);
    },
    toggleMuseumItem(id: ItemId) {
      toggleInSet(state.completed.museum, id);
    },
    toggleNpc(id: NpcId) {
      toggleInSet(state.completed.npcs, id);
    },
    toggleQuest(id: QuestId) {
      toggleInSet(state.completed.quests, id);
    },
    toggleShowCompleted() {
      state.showCompleted = !state.showCompleted;
    },
    toggleSkill(id: SkillId) {
      toggleInSet(state.completed.skills, id);
    },
    toggleSpell(id: SpellId) {
      toggleInSet(state.completed.mines.spells, id);
    },
  };
}

function deserialize(json: string): null | UserState {
  try {
    const s = JSON.parse(json) as SerializedState;
    if (s.version !== "1") return null;

    // Branded ID types require casting through unknown at the serialization boundary
    const brandedSet = <T>(arr: string[]) => new SvelteSet(arr) as unknown as Set<T>;

    return {
      availabilityMode: s.availabilityMode,
      completed: {
        almanac: brandedSet<ItemId>(s.completed.almanac),
        animalCosmetics: Object.fromEntries(
          Object.entries(s.completed.animalCosmetics).map(([k, v]) => [
            k,
            brandedSet<CosmeticId>(v),
          ]),
        ),
        animals: Object.fromEntries(
          Object.entries(s.completed.animals).map(([k, v]) => [k, brandedSet<VariantId>(v)]),
        ),
        cosmetics: brandedSet<CosmeticId>(s.completed.cosmetics),
        mines: {
          floor: s.completed.mines.floor,
          spells: brandedSet<SpellId>(s.completed.mines.spells),
        },
        museum: brandedSet<ItemId>(s.completed.museum),
        npcs: brandedSet<NpcId>(s.completed.npcs),
        quests: brandedSet<QuestId>(s.completed.quests),
        renown: s.completed.renown,
        skills: brandedSet<SkillId>(s.completed.skills),
      },
      showCompleted: false,
      worldState: s.worldState,
    };
  } catch {
    return null;
  }
}

// ─── Serialization helpers ───────────────────────────────────────────

function serialize(state: UserState): string {
  const s: SerializedState = {
    availabilityMode: state.availabilityMode,
    completed: {
      almanac: [...state.completed.almanac].sort(),
      animalCosmetics: Object.fromEntries(
        Object.entries(state.completed.animalCosmetics).map(([k, v]) => [k, [...v].sort()]),
      ),
      animals: Object.fromEntries(
        Object.entries(state.completed.animals).map(([k, v]) => [k, [...v].sort()]),
      ),
      cosmetics: [...state.completed.cosmetics].sort(),
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].sort(),
      },
      museum: [...state.completed.museum].sort(),
      npcs: [...state.completed.npcs].sort(),
      quests: [...state.completed.quests].sort(),
      renown: state.completed.renown,
      skills: [...state.completed.skills].sort(),
    },
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
