import { canonicalAlmanacId, trackerData } from "$lib/data/index.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  type LevelIssue,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
  normalizeLevel,
} from "$lib/engine/progress.js";
import { recordKeys, recordValues } from "$lib/utils.js";

import type { CompletedState, MergeCounts, QuestState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  ItemId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  RecipeId,
  Season,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "$lib/types/tracker-data.js";

// ─── Import result ──────────────────────────────────────────────────

export interface ImportResult {
  /** Per-category counts of items imported */
  counts: MergeCounts;
  /** Human-readable warnings (e.g. unknown IDs) */
  warnings: string[];
}

// ─── Save file shapes ───────────────────────────────────────────────

/** All parsed save files bundled together */
export interface SaveBundle {
  gamedata?: GamedataSave;
  player?: PlayerSave;
  quests?: QuestsSave;
}

interface GamedataSave {
  date?: number;
  maximum_mines_level?: number;
  museum_progress?: string[];
  t2_world_facts?: Record<string, unknown>;
}

interface PlayerSave {
  animal_cosmetic_unlocks?: Record<string, string[]>;
  animal_variant_unlocks?: Record<string, string[]>;
  cosmetic_unlocks?: string[];
  items_acquired?: string[];
  items_sold?: Record<string, unknown>;
  perks?: string[];
  pet_cosmetic_sets_unlocked?: string[];
  pet_skin_unlocks?: string[];
  recipe_unlocks?: string[];
  recipes_created?: string[];
  skill_xp?: Record<string, number>;
  spells_learned?: string[];
  upper_floor?: boolean;
}

interface QuestsSave {
  active_quests?: { quest_name?: string }[];
  completed_quests?: string[];
}

export function buildImportState(bundle: SaveBundle): {
  completed: Partial<CompletedState>;
  result: ImportResult;
} {
  const warnings: string[] = [];
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

  const save = bundle.player;

  // ── Almanac: union of items_acquired + items_sold keys + recipes_created ──
  const almanacIds = new Set<ItemId>();

  const allPlayerItems = new Set<string>([
    ...(save?.items_acquired ?? []),
    ...Object.keys(save?.items_sold ?? {}),
    ...(save?.recipes_created ?? []),
  ]);

  for (const id of allPlayerItems) {
    const canonical = canonicalAlmanacId.get(id as ItemId);
    if (canonical) {
      almanacIds.add(canonical);
    }
  }
  counts.almanac = almanacIds.size;

  // ── Recipe unlocks ──
  const almanacRecipes = new Set<RecipeId>();
  const validRecipes = new Set(Object.keys(trackerData.recipes));

  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources.some((source) => source.type === "default")) {
      almanacRecipes.add(id as RecipeId);
    }
  }

  for (const id of save?.recipe_unlocks ?? []) {
    if (validRecipes.has(id)) {
      almanacRecipes.add(id as RecipeId);
    } else if (id in trackerData.items) {
      const recipeId = trackerData.items[id as ItemId].sources.find(
        (source) => source.type === "recipe",
      )?.recipeId;
      if (recipeId) {
        almanacRecipes.add(recipeId);
      }
    }
  }
  counts.almanacRecipes = almanacRecipes.size;

  // ── Cosmetics ──
  const cosmeticIds = new Set<CosmeticId>();
  const validCosmetics = new Set(Object.keys(trackerData.cosmetics));

  for (const id of save?.cosmetic_unlocks ?? []) {
    if (validCosmetics.has(id)) {
      cosmeticIds.add(id as CosmeticId);
    } else {
      warnings.push(`Unknown cosmetic: ${id}`);
    }
  }
  counts.cosmetics = cosmeticIds.size;

  // ── Animal variants ──
  const animalVariants: Record<string, Set<AnimalVariantId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validVariants = new Set(animal.variantTiers.flatMap((tier) => Object.keys(tier)));
    const playerVariants = save?.animal_variant_unlocks?.[animalId] ?? [];
    const matched = new Set<AnimalVariantId>();

    for (const v of playerVariants) {
      if (validVariants.has(v)) {
        matched.add(v as AnimalVariantId);
      } else {
        warnings.push(`Unknown ${animalId} variant: ${v}`);
      }
    }
    animalVariants[animalId] = matched;
    counts.animals += matched.size;
  }

  // ── Animal cosmetics ──
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validAnimalCosmetics = new Set(Object.keys(animal.cosmetics));
    const playerCosmetics = save?.animal_cosmetic_unlocks?.[animalId] ?? [];
    const matched = new Set<CosmeticId>();

    for (const c of playerCosmetics) {
      if (validAnimalCosmetics.has(c)) {
        matched.add(c as CosmeticId);
      } else {
        warnings.push(`Unknown ${animalId} cosmetic: ${c}`);
      }
    }
    animalCosmetics[animalId] = matched;
    counts.animalCosmetics += matched.size;
  }

  // ── Pet cosmetic sets ──
  const petCosmetics = new Set<PetCosmeticSetId>();
  const validPetCosmetics = new Set(Object.keys(trackerData.pets.cosmetics));

  for (const id of save?.pet_cosmetic_sets_unlocked ?? []) {
    if (validPetCosmetics.has(id)) {
      petCosmetics.add(id as PetCosmeticSetId);
    } else {
      warnings.push(`Unknown pet cosmetic set: ${id}`);
    }
  }
  counts.petCosmetics = petCosmetics.size;

  // ── Pet skins ──
  const petSkins = new Set<PetSkinId>();
  const validPetSkins = new Set(Object.keys(trackerData.pets.skins));

  for (const id of save?.pet_skin_unlocks ?? []) {
    if (validPetSkins.has(id)) {
      petSkins.add(id as PetSkinId);
    } else {
      warnings.push(`Unknown pet skin: ${id}`);
    }
  }
  counts.petSkins = petSkins.size;

  // ── Spells ──
  const spells = new Set<SpellId>();
  const validSpells = new Set(Object.keys(trackerData.mines.spells));

  for (const id of save?.spells_learned ?? []) {
    if (validSpells.has(id)) {
      spells.add(id as SpellId);
    } else {
      warnings.push(`Unknown spell: ${id}`);
    }
  }
  counts.spells = spells.size;

  // ── Perks ──
  const perkIds = new Set<PerkId>();
  const validPerks = new Set(
    recordValues(trackerData.skills).flatMap((skill) =>
      skill.perkTiers.flatMap((tier) => recordKeys(tier)),
    ) as string[],
  );

  for (const id of save?.perks ?? []) {
    if (validPerks.has(id)) {
      perkIds.add(id as PerkId);
    } else {
      warnings.push(`Unknown perk: ${id}`);
    }
  }
  counts.perks = perkIds.size;

  // ── Museum donations (from gamedata.json → museum_progress) ──
  const museumIds = new Set<ItemId>();
  if (bundle.gamedata?.museum_progress) {
    const validMuseum = new Set<string>(
      recordValues(trackerData.museum).flatMap(({ sets }) =>
        recordValues(sets).flatMap(({ items }) => items),
      ),
    );
    for (const id of bundle.gamedata.museum_progress) {
      if (validMuseum.has(id)) {
        museumIds.add(id as ItemId);
      }
    }
    counts.museum = museumIds.size;
  }

  // ── Numeric levels: mine floor, villager hearts, skill levels, renown ──
  // Each fact is normalized into its finite domain (see normalizeLevel). Above-maximum values
  // are clamped and warned about; nonnumeric or negative values are dropped with a warning; a
  // missing fact is silently treated as unset. Import stays additive, so a warned fact never
  // blocks the rest of the save.
  const extractLevel = (key: string, raw: unknown, max: number): number => {
    if (raw === undefined) return 0;
    const { issue, value } = normalizeLevel(raw, max);
    if (issue) warnings.push(describeLevelIssue(key, raw, issue, max));
    return value;
  };

  // Mine floor (from gamedata.json → maximum_mines_level)
  const mineFloor = extractLevel(
    "maximum_mines_level",
    bundle.gamedata?.maximum_mines_level,
    getMaxMineFloor(),
  );
  counts.mineFloor = mineFloor;

  // Villager levels, skill levels, renown (from gamedata.json → t2_world_facts)
  const villagerLevels: Record<string, number> = {};
  const skillLevels: Record<string, number> = {};
  let renown = 0;

  const facts = bundle.gamedata?.t2_world_facts;
  if (facts) {
    // Villager heart levels: "{villager}_heart_level" keys in t2_world_facts
    for (const villagerId of recordKeys(trackerData.villagers)) {
      const key = `${villagerId}_heart_level`;
      const level = extractLevel(key, facts[key], MAX_VILLAGER_LEVEL);
      if (level > 0) {
        villagerLevels[villagerId] = level;
        counts.villagerLevels++;
      }
    }

    // Skill levels: "{skill}_level" keys in t2_world_facts
    for (const skillId of recordKeys(trackerData.skills)) {
      const key = `${skillId}_level`;
      const level = extractLevel(key, facts[key], MAX_SKILL_LEVEL);
      if (level > 0) {
        skillLevels[skillId] = level;
        counts.skillLevels++;
      }
    }

    // Renown level
    renown = extractLevel("renown", facts.renown, getMaxRenownLevel());
    counts.renown = renown;
  }

  // ── Has upper floor (from player.json → upper_floor) ──
  const hasUpperFloor = save?.upper_floor === true;
  if (hasUpperFloor) counts.hasUpperFloor = 1;

  // ── Villager relationships (from gamedata.json → t2_world_facts → {villager}_is_dating) ──
  const villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};
  if (facts) {
    const dateableVillagers = Object.entries(trackerData.villagers)
      .filter(([, villager]) => villager.dateable === true)
      .map(([id]) => id);
    for (const villagerId of dateableVillagers) {
      const val = facts[`${villagerId}_is_dating`];
      if (val === true || val === 1) {
        villagerRelationships[villagerId as VillagerId] = "romantic";
        counts.villagerRelationships++;
      }
    }
  }

  // ── Reached season (from gamedata.json → date timestamp) ──
  const reachedSeason = deriveReachedSeason(bundle.gamedata?.date);
  if (reachedSeason !== "spring") counts.reachedSeason = 1;

  // ── Quest completion (from quests.json) ──
  const questStates: Record<string, QuestState> = {};
  if (bundle.quests) {
    const validQuests = new Set<string>();
    for (const category of Object.values(trackerData.quests)) {
      for (const questId of Object.keys(category)) {
        validQuests.add(questId);
      }
    }

    // Completed quests
    for (const id of bundle.quests.completed_quests ?? []) {
      if (validQuests.has(id)) {
        questStates[id] = "completed";
        counts.quests++;
      }
    }

    // Active quests → "obtained"
    for (const quest of bundle.quests.active_quests ?? []) {
      const id = quest.quest_name;
      if (id && validQuests.has(id)) {
        questStates[id] = "obtained";
        counts.quests++;
      }
    }
  }

  return {
    completed: {
      almanac: almanacIds,
      almanacRecipes,
      animalCosmetics,
      animals: animalVariants,
      cosmetics: cosmeticIds,
      hasUpperFloor,
      mines: { floor: mineFloor, spells },
      museum: museumIds,
      petCosmetics,
      petSkins,
      questStates,
      reachedSeason,
      renown,
      skillLevels,
      unlockedPerks: perkIds,
      villagerLevels,
      villagerRelationships,
    },
    result: {
      counts,
      warnings,
    },
  };
}

// ─── .sav file unpacking (client-side) ──────────────────────────────

export { parseSavFile as unpackSavFile } from "./parse-sav";

// ─── Season derivation ─────────────────────────────────────────────

const GAME_DAY = 259200;
const GAME_SEASON = 28 * GAME_DAY;
const SEASON_ORDER: Season[] = ["spring", "summer", "fall", "winter"];

function deriveReachedSeason(date: number | undefined): Season {
  if (typeof date !== "number" || date < 0) return "spring";
  const seasonIndex = Math.floor(date / GAME_SEASON) % 4;
  if (date >= 4 * GAME_SEASON) return "winter";
  return SEASON_ORDER[seasonIndex];
}

// ─── Parse save files ----------------───────────────────────────────

const SAVE_FILES = new Set(["gamedata.json", "player.json", "quests.json"]);

export async function parseSaveFiles(files: File[]): Promise<{
  bundle?: SaveBundle;
  error?: string;
}> {
  const bundle: SaveBundle = {};
  const errors: string[] = [];

  for (const file of files) {
    if (!SAVE_FILES.has(file.name)) continue;

    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      if (typeof data !== "object" || data === null) {
        errors.push(`${file.name}: not a valid JSON object`);
        continue;
      }

      switch (file.name) {
        case "gamedata.json":
          bundle.gamedata = data;
          break;
        case "player.json":
          if (validatePlayerSave(data)) {
            bundle.player = data;
          } else {
            errors.push("player.json: missing expected fields");
          }
          break;
        case "quests.json":
          bundle.quests = data;
          break;
      }
    } catch {
      errors.push(`${file.name}: invalid JSON`);
    }
  }

  if (!bundle.player && !bundle.gamedata && !bundle.quests) {
    return {
      error:
        errors.length > 0
          ? errors.join(". ")
          : "No recognized save files found. Select player.json, gamedata.json, and/or quests.json from your extracted save.",
    };
  }

  return { bundle };
}

// ─── Validation ─────────────────────────────────────────────────────

export function validatePlayerSave(data: unknown): data is PlayerSave {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    Array.isArray(obj.items_acquired) ||
    Array.isArray(obj.recipe_unlocks) ||
    Array.isArray(obj.cosmetic_unlocks) ||
    typeof obj.animal_variant_unlocks === "object" ||
    typeof obj.items_sold === "object" ||
    Array.isArray(obj.spells_learned) ||
    Array.isArray(obj.perks) ||
    Array.isArray(obj.pet_cosmetic_sets_unlocked) ||
    Array.isArray(obj.pet_skin_unlocks)
  );
}

function describeLevelIssue(key: string, raw: unknown, issue: LevelIssue, max: number): string {
  const shown = typeof raw === "string" ? JSON.stringify(raw) : String(raw);
  switch (issue) {
    case "above-max":
      return `${key} ${shown} exceeds the maximum of ${max}; clamped to ${max}`;
    case "negative":
      return `${key} ${shown} is negative; ignored`;
    case "not-a-number":
      return `${key} ${shown} is not a number; ignored`;
  }
}
