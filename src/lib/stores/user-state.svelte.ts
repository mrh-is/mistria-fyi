import { SvelteSet } from "svelte/reactivity";

import { canonicalAlmanacId, trackerData } from "$lib/data/index.js";
import { clampRenownLevel, MAX_NPC_LEVEL } from "$lib/engine/progress.js";
import { findRecipesForQuest } from "$lib/engine/quest-rewards.js";
import { getMarriedNpc, normalizeRelationships } from "$lib/engine/relationships.js";
import { deriveProgressionState, type UserProgressionState } from "$lib/engine/visibility.js";
import { recordEntries, recordKeys } from "$lib/utils";
import { safeLocalStorage, trySetItem } from "$lib/utils/local-storage.js";

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
  NpcId,
  NpcRelationship,
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
export type ChildChoice = "no" | "undeclared" | "yes";
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
  npcLevels: Record<NpcId, number>;
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>;
  petCosmetics: Set<PetCosmeticSetId>;
  petSkins: Set<PetSkinId>;
  questStates: Record<QuestId, QuestState>;
  reachedSeason: Season;
  renown: number;
  skillLevels: Record<SkillId, number>;
  unlockedPerks: Set<PerkId>;
}
export type ImportErrorKind = "invalid-fields" | "malformed-json" | "unsupported-version";

export type ImportResult = { error: ImportErrorKind; ok: false } | { ok: true };

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
  npcLevels: number;
  npcRelationships: number;
  perks: number;
  petCosmetics: number;
  petSkins: number;
  quests: number;
  reachedSeason: number;
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
    childChoice?: ChildChoice;
    cosmetics: string[];
    dates?: string[];
    hasUpperFloor?: boolean;
    marriedNpc?: null | string;
    mines: { floor: number; spells: string[] };
    museum: string[];
    npcLevels?: Record<string, number>;
    npcRelationships?: Record<string, NpcRelationship>;
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

const STORAGE_KEY = "mistria-fyi-v1";

const VALID_CHILD_CHOICES = new Set<string>(["no", "undeclared", "yes"]);
const VALID_AVAILABILITY_MODES = new Set<string>(["available", "everything", "timely"]);
const VALID_RELATIONSHIPS = new Set<string>([
  "married",
  "platonic",
  "proposed",
  "romantic",
  "undecided",
]);
const VALID_QUEST_STATES = new Set<string>(["completed", "none", "obtained"]);
const VALID_SEASONS = new Set<string>(["fall", "spring", "summer", "winter"]);
const VALID_WEATHER = new Set<string>(["calm", "heavy_inclement", "inclement", "special"]);

type DeserializeResult = { error: ImportErrorKind; ok: false } | { ok: true; state: UserState };

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
    npcLevels: {},
    npcRelationships: {},
    petCosmetics: new SvelteSet<PetCosmeticSetId>(),
    petSkins: new SvelteSet<PetSkinId>(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new SvelteSet<PerkId>(),
  };
}

// ─── Store ──────────────────────────────────────────────────────────

function createDefaultState(): UserState {
  return {
    availabilityMode: "available",
    completed: createDefaultCompleted(),
    showCompleted: false,
    showSpoilers: false,
    worldState: { season: "spring", weather: "calm" },
  };
}

function createUserState() {
  let state = $state<UserState>(createDefaultState());
  let _persistenceFailureGeneration = $state(0);

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
      Object.keys(state.completed.npcRelationships).length > 0 ||
      state.completed.childChoice !== "undeclared" ||
      state.completed.mines.floor > 0 ||
      state.completed.mines.spells.size > 0 ||
      state.completed.renown > 0 ||
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
    dismissPersistenceWarning() {
      _persistenceFailureGeneration = 0;
    },
    exportState(): string {
      return serialize(state);
    },
    get hasAnyProgress(): boolean {
      return hasAnyProgress;
    },
    /** Import/export user state JSON (full replace) */
    importState(json: string): ImportResult {
      const result = deserialize(json);
      if (!result.ok) return result;
      state = result.state;
      return { ok: true };
    },
    /** Merge imported data into current progress (union, never removes) */
    mergeFromSave(imported: Partial<CompletedState>): MergeCounts {
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
        npcLevels: 0,
        npcRelationships: 0,
        perks: 0,
        petCosmetics: 0,
        petSkins: 0,
        quests: 0,
        reachedSeason: 0,
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

      // NPC relationships (per-NPC merge)
      if (imported.npcRelationships) {
        const romanticRank: Record<string, number> = {
          married: 4,
          platonic: 1,
          proposed: 3,
          romantic: 2,
          undecided: 0,
        };

        const localMarried = getMarriedNpc(state.completed.npcRelationships);
        const importedMarried = getMarriedNpc(imported.npcRelationships);

        for (const [npcIdStr, importedRel] of Object.entries(imported.npcRelationships)) {
          if (!importedRel) continue;
          const npcId = npcIdStr as NpcId;
          const localRel = state.completed.npcRelationships[npcId] ?? "undecided";
          if (localRel === importedRel) continue;

          if (localRel === "undecided") {
            state.completed.npcRelationships[npcId] = importedRel;
            counts.npcRelationships++;
          } else if (importedRel !== "undecided") {
            const localRk = romanticRank[localRel];
            const importedRk = romanticRank[importedRel];
            if (importedRk > localRk) {
              state.completed.npcRelationships[npcId] = importedRel;
              counts.npcRelationships++;
            } else if (importedRk === localRk && localRel !== importedRel) {
              state.completed.npcRelationships[npcId] = importedRel;
              counts.npcRelationships++;
            }
          }
        }

        if (importedMarried && localMarried && importedMarried !== localMarried) {
          state.completed.npcRelationships[localMarried] = "proposed";
          counts.npcRelationships++;
        }

        normalizeRelationships(state.completed.npcRelationships);
      }

      // Child choice merge
      if (imported.childChoice !== undefined && imported.childChoice !== "undeclared") {
        if (
          state.completed.childChoice === "undeclared" ||
          state.completed.childChoice !== imported.childChoice
        ) {
          state.completed.childChoice = imported.childChoice;
          counts.childChoice = 1;
        }
      }

      // Backfill animal maps for any animals added since the imported state was created
      backfillAnimalMaps(state.completed);

      return counts;
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
    },
    restorePersistedState() {
      const stored = safeLocalStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const result = deserialize(stored);
      if (result.ok) {
        state = result.state;
      }
    },
    setAvailabilityMode(mode: AvailabilityMode) {
      state.availabilityMode = mode;
    },
    setChildChoice(choice: ChildChoice) {
      state.completed.childChoice = choice;
    },
    setHasUpperFloor(value: boolean) {
      state.completed.hasUpperFloor = value;
    },
    setMineFloor(floor: number) {
      const biomes = trackerData.mines.biomes;
      const maxFloor = biomes[biomes.length - 1].floors.end;
      state.completed.mines.floor = Math.max(0, Math.min(floor, maxFloor));
    },
    setNpcLevel(id: NpcId, level: number) {
      state.completed.npcLevels[id] = Math.max(0, Math.min(level, MAX_NPC_LEVEL));
    },
    setNpcRelationship(npcId: NpcId, relationship: NpcRelationship) {
      const oldMarried = getMarriedNpc(state.completed.npcRelationships);
      if (relationship === "undecided") {
        const { [npcId]: _, ...rest } = state.completed.npcRelationships;
        state.completed.npcRelationships = rest;
      } else {
        state.completed.npcRelationships[npcId] = relationship;
      }
      normalizeRelationships(state.completed.npcRelationships);
      const newMarried = getMarriedNpc(state.completed.npcRelationships);
      if (oldMarried !== newMarried) {
        state.completed.childChoice = "undeclared";
      }
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

function deserialize(json: string): DeserializeResult {
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

  if (!isSerializedState(raw)) {
    return { error: "invalid-fields", ok: false };
  }

  try {
    const s = raw;

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

    // Migrate npcRelationships from legacy romanticNpcs/marriedNpc
    let npcRelationships: Partial<Record<NpcId, NpcRelationship>> = {};
    if (s.completed.npcRelationships) {
      for (const [id, rel] of Object.entries(s.completed.npcRelationships)) {
        if (VALID_RELATIONSHIPS.has(rel) && rel !== "undecided") {
          npcRelationships[id as NpcId] = rel;
        }
      }
    } else {
      if (s.completed.romanticNpcs) {
        for (const id of s.completed.romanticNpcs) {
          npcRelationships[id as NpcId] = "romantic";
        }
      }
      if (s.completed.marriedNpc) {
        npcRelationships[s.completed.marriedNpc as NpcId] = "married";
      }
    }
    normalizeRelationships(npcRelationships);

    const childChoice: ChildChoice =
      s.completed.childChoice && VALID_CHILD_CHOICES.has(s.completed.childChoice)
        ? s.completed.childChoice
        : "undeclared";

    const completed: CompletedState = {
      almanac: normalizeAlmanacIds(s.completed.almanac),
      almanacRecipes: brandedSet<RecipeId>(s.completed.almanacRecipes ?? []),
      animalCosmetics: Object.fromEntries(
        Object.entries(s.completed.animalCosmetics).map(([k, v]) => [k, brandedSet<CosmeticId>(v)]),
      ),
      animals: Object.fromEntries(
        Object.entries(s.completed.animals).map(([k, v]) => [k, brandedSet<AnimalVariantId>(v)]),
      ),
      childChoice,
      cosmetics: brandedSet<CosmeticId>(s.completed.cosmetics),
      dates: brandedSet<DateId>(s.completed.dates ?? []),
      hasUpperFloor: s.completed.hasUpperFloor ?? false,
      mines: {
        floor: s.completed.mines.floor,
        spells: brandedSet<SpellId>(s.completed.mines.spells),
      },
      museum: brandedSet<ItemId>(s.completed.museum),
      npcLevels,
      npcRelationships,
      petCosmetics: brandedSet<PetCosmeticSetId>(s.completed.petCosmetics ?? []),
      petSkins: brandedSet<PetSkinId>(s.completed.petSkins ?? []),
      questStates,
      reachedSeason: s.completed.reachedSeason ?? "spring",
      renown: clampRenownLevel(s.completed.renown),
      skillLevels,
      unlockedPerks: brandedSet<PerkId>(s.completed.unlockedPerks ?? []),
    };

    backfillAnimalMaps(completed);

    return {
      ok: true,
      state: {
        availabilityMode: s.availabilityMode,
        completed,
        showCompleted: false,
        showSpoilers: s.showSpoilers ?? false,
        worldState: s.worldState,
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

function isOptionalNumberRecord(value: unknown): boolean {
  return value === undefined || (isRecord(value) && Object.values(value).every(isFiniteNumber));
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSerializedState(value: unknown): value is SerializedState {
  if (!isRecord(value)) return false;
  const completed = value.completed;
  const worldState = value.worldState;
  if (!isRecord(completed) || !isRecord(worldState)) return false;

  if (!isEnumValue(value.availabilityMode, VALID_AVAILABILITY_MODES)) return false;
  if (
    !isEnumValue(worldState.season, VALID_SEASONS) ||
    !isEnumValue(worldState.weather, VALID_WEATHER)
  ) {
    return false;
  }
  if (value.showSpoilers !== undefined && typeof value.showSpoilers !== "boolean") return false;

  if (!isStringArray(completed.almanac)) return false;
  if (!isStringArrayRecord(completed.animalCosmetics)) return false;
  if (!isStringArrayRecord(completed.animals)) return false;
  if (!isStringArray(completed.cosmetics)) return false;
  if (!isRecord(completed.mines)) return false;
  if (!isFiniteNumber(completed.mines.floor) || !isStringArray(completed.mines.spells)) {
    return false;
  }
  if (!isStringArray(completed.museum)) return false;
  if (!isFiniteNumber(completed.renown)) return false;

  return (
    isOptionalStringArray(completed.almanacRecipes) &&
    (completed.childChoice === undefined ||
      isEnumValue(completed.childChoice, VALID_CHILD_CHOICES)) &&
    isOptionalStringArray(completed.dates) &&
    (completed.hasUpperFloor === undefined || typeof completed.hasUpperFloor === "boolean") &&
    (completed.marriedNpc === undefined ||
      completed.marriedNpc === null ||
      typeof completed.marriedNpc === "string") &&
    isOptionalNumberRecord(completed.npcLevels) &&
    isOptionalEnumRecord(completed.npcRelationships, VALID_RELATIONSHIPS) &&
    isOptionalStringArray(completed.npcs) &&
    isOptionalStringArray(completed.petCosmetics) &&
    isOptionalStringArray(completed.petSkins) &&
    isOptionalStringArray(completed.quests) &&
    isOptionalEnumRecord(completed.questStates, VALID_QUEST_STATES) &&
    (completed.reachedSeason === undefined ||
      isEnumValue(completed.reachedSeason, VALID_SEASONS)) &&
    isOptionalStringArray(completed.romanticNpcs) &&
    isOptionalNumberRecord(completed.skillLevels) &&
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
      childChoice: state.completed.childChoice,
      cosmetics: [...state.completed.cosmetics].sort(),
      dates: [...state.completed.dates].sort(),
      hasUpperFloor: state.completed.hasUpperFloor,
      mines: {
        floor: state.completed.mines.floor,
        spells: [...state.completed.mines.spells].sort(),
      },
      museum: [...state.completed.museum].sort(),
      npcLevels: filterRecord(state.completed.npcLevels, (v) => v > 0),
      npcRelationships: filterRecord(
        state.completed.npcRelationships as Record<string, NpcRelationship>,
        (v) => v !== "undecided",
      ),
      petCosmetics: [...state.completed.petCosmetics].sort(),
      petSkins: [...state.completed.petSkins].sort(),
      questStates: filterRecord(state.completed.questStates, (v) => v !== "none"),
      reachedSeason: state.completed.reachedSeason,
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
