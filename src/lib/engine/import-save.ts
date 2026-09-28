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

import { isSaveSection, type SaveBundle, type SaveSection } from "./save-bundle";

import type {
  CompletedState,
  MergeCounts,
  MergeResult,
  QuestState,
} from "$lib/stores/user-state.svelte.js";
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

export interface ImportResult extends MergeResult {
  /** Human-readable warnings (e.g. unknown IDs) */
  warnings: string[];
}

/** Typed access to one save section; see createSectionReader. */
interface SectionReader {
  /** An object field, or `undefined` when missing or malformed. */
  record(key: string): SaveSection | undefined;
  /** A list of strings; non-string entries are dropped. */
  stringList(key: string): string[];
  /** An object whose values are lists of strings, e.g. unlocks keyed by animal. */
  stringListRecord(key: string): Record<string, string[]>;
  /** A raw field for callers that normalize it themselves. */
  value(key: string): unknown;
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

  // parseSaveFiles rejects an unrecognizable player.json outright; a .sav entry reaches here.
  let playerSection = bundle.player;
  if (playerSection && !validatePlayerSave(playerSection)) {
    warnings.push("player has no recognized progress fields; ignored");
    playerSection = undefined;
  }
  const player = createSectionReader("player", playerSection, warnings);
  const gamedata = createSectionReader("gamedata", bundle.gamedata, warnings);
  const quests = createSectionReader("quests", bundle.quests, warnings);

  // ── Almanac: union of items_acquired + items_sold keys + recipes_created ──
  const almanacIds = new Set<ItemId>();

  const allPlayerItems = new Set<string>([
    ...player.stringList("items_acquired"),
    ...Object.keys(player.record("items_sold") ?? {}),
    ...player.stringList("recipes_created"),
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

  for (const id of player.stringList("recipe_unlocks")) {
    if (validRecipes.has(id)) {
      almanacRecipes.add(id as RecipeId);
    } else if (Object.hasOwn(trackerData.items, id)) {
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

  for (const id of player.stringList("cosmetic_unlocks")) {
    if (validCosmetics.has(id)) {
      cosmeticIds.add(id as CosmeticId);
    } else {
      warnings.push(`Unknown cosmetic: ${id}`);
    }
  }
  counts.cosmetics = cosmeticIds.size;

  // ── Animal variants ──
  const animalVariants: Record<string, Set<AnimalVariantId>> = {};
  const playerVariantsByAnimal = player.stringListRecord("animal_variant_unlocks");
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validVariants = new Set(animal.variantTiers.flatMap((tier) => Object.keys(tier)));
    const playerVariants = Object.hasOwn(playerVariantsByAnimal, animalId)
      ? playerVariantsByAnimal[animalId]
      : [];
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
  const playerCosmeticsByAnimal = player.stringListRecord("animal_cosmetic_unlocks");
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const validAnimalCosmetics = new Set(Object.keys(animal.cosmetics));
    const playerCosmetics = Object.hasOwn(playerCosmeticsByAnimal, animalId)
      ? playerCosmeticsByAnimal[animalId]
      : [];
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

  for (const id of player.stringList("pet_cosmetic_sets_unlocked")) {
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

  for (const id of player.stringList("pet_skin_unlocks")) {
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

  for (const id of player.stringList("spells_learned")) {
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

  for (const id of player.stringList("perks")) {
    if (validPerks.has(id)) {
      perkIds.add(id as PerkId);
    } else {
      warnings.push(`Unknown perk: ${id}`);
    }
  }
  counts.perks = perkIds.size;

  // ── Museum donations (from gamedata.json → museum_progress) ──
  const museumIds = new Set<ItemId>();
  const validMuseum = new Set<string>(
    recordValues(trackerData.museum).flatMap(({ sets }) =>
      recordValues(sets).flatMap(({ items }) => items),
    ),
  );
  for (const id of gamedata.stringList("museum_progress")) {
    if (validMuseum.has(id)) {
      museumIds.add(id as ItemId);
    }
  }
  counts.museum = museumIds.size;

  // ── Numeric levels: mine floor, villager hearts, skill levels, renown ──
  // Each fact is normalized into its finite domain (see normalizeLevel). Above-maximum values
  // are clamped and warned about; nonnumeric or negative values are dropped with a warning; a
  // missing fact is silently treated as unset. Import stays additive, so a warned fact never
  // blocks the rest of the save. Renown is the exception and clamps silently (see below).
  const extractLevel = (key: string, raw: unknown, max: number): number => {
    if (raw === undefined) return 0;
    const { issue, value } = normalizeLevel(raw, max);
    if (issue) warnings.push(describeLevelIssue(key, raw, issue, max));
    return value;
  };

  // Mine floor (from gamedata.json → maximum_mines_level)
  const mineFloor = extractLevel(
    "maximum_mines_level",
    gamedata.value("maximum_mines_level"),
    getMaxMineFloor(),
  );
  counts.mineFloor = mineFloor;

  // Villager levels, skill levels, renown (from gamedata.json → t2_world_facts)
  const villagerLevels: Record<string, number> = {};
  const skillLevels: Record<string, number> = {};
  let renown = 0;

  const facts = gamedata.record("t2_world_facts");
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

    // Renown level: clamped silently, matching backup restore. Nothing in ordinary play produces
    // an out-of-domain value, so a warning would only be noise.
    renown = normalizeLevel(facts.renown, getMaxRenownLevel()).value;
    counts.renown = renown;
  }

  // ── Has upper floor (from player.json → upper_floor) ──
  const hasUpperFloor = player.value("upper_floor") === true;
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
  const reachedSeason = deriveReachedSeason(gamedata.value("date"));
  if (reachedSeason !== "spring") counts.reachedSeason = 1;

  // ── Quest completion (from quests.json) ──
  // Completed quests import as "completed" and active quests as "obtained". A quest listed in
  // both keeps "completed", matching mergeFromSave's rule that a merge never lowers a quest.
  const questStates: Record<string, QuestState> = {};
  const validQuests = new Set<string>();
  for (const category of Object.values(trackerData.quests)) {
    for (const questId of Object.keys(category)) {
      validQuests.add(questId);
    }
  }
  const importQuest = (id: string, questState: QuestState) => {
    if (!validQuests.has(id)) {
      warnings.push(`Unknown quest: ${id}`);
    } else if (questStates[id] !== "completed") {
      questStates[id] = questState;
    }
  };

  for (const id of quests.stringList("completed_quests")) {
    importQuest(id, "completed");
  }
  for (const id of readActiveQuestNames(quests.value("active_quests"), warnings)) {
    importQuest(id, "obtained");
  }
  counts.quests = Object.keys(questStates).length;

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
      conflicts: [],
      counts,
      warnings,
    },
  };
}

// ─── Field readers ──────────────────────────────────────────────────
// Each reader returns a well-typed value or an empty default. A present field of the wrong shape
// is dropped with a warning, so one malformed field never blocks the rest of the import.

function createSectionReader(
  name: string,
  section: SaveSection | undefined,
  warnings: string[],
): SectionReader {
  const value = (key: string): unknown =>
    section && Object.hasOwn(section, key) ? section[key] : undefined;

  const readStrings = (path: string, raw: unknown): string[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      warnings.push(`${path} is not a list; ignored`);
      return [];
    }
    const strings = raw.filter((entry): entry is string => typeof entry === "string");
    const dropped = raw.length - strings.length;
    if (dropped > 0) warnings.push(`${path} has ${dropped} non-text entries; ignored`);
    return strings;
  };

  const record = (key: string): SaveSection | undefined => {
    const raw = value(key);
    if (raw === undefined) return undefined;
    if (!isSaveSection(raw)) {
      warnings.push(`${name}.${key} is not an object; ignored`);
      return undefined;
    }
    return raw;
  };

  return {
    record,
    stringList: (key) => readStrings(`${name}.${key}`, value(key)),
    stringListRecord: (key) => {
      const result: Record<string, string[]> = {};
      for (const [entryKey, raw] of Object.entries(record(key) ?? {})) {
        result[entryKey] = readStrings(`${name}.${key}.${entryKey}`, raw);
      }
      return result;
    },
    value,
  };
}

/** Quest IDs from `quests.active_quests`, a list of `{ quest_name }` objects. */
function readActiveQuestNames(raw: unknown, warnings: string[]): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push("quests.active_quests is not a list; ignored");
    return [];
  }
  const names: string[] = [];
  for (const entry of raw) {
    const name = isSaveSection(entry) ? entry.quest_name : undefined;
    if (typeof name === "string") names.push(name);
  }
  const dropped = raw.length - names.length;
  if (dropped > 0) {
    warnings.push(`quests.active_quests has ${dropped} entries without a quest name; ignored`);
  }
  return names;
}

// ─── .sav file unpacking (client-side) ──────────────────────────────

export { parseSavFile as unpackSavFile } from "./parse-sav";
export type { SaveBundle, SaveSection } from "./save-bundle";

// ─── Season derivation ─────────────────────────────────────────────

const GAME_DAY = 259200;
const GAME_SEASON = 28 * GAME_DAY;
const SEASON_ORDER: Season[] = ["spring", "summer", "fall", "winter"];

function deriveReachedSeason(date: unknown): Season {
  if (typeof date !== "number" || date < 0) return "spring";
  const seasonIndex = Math.floor(date / GAME_SEASON) % 4;
  if (date >= 4 * GAME_SEASON) return "winter";
  return SEASON_ORDER[seasonIndex];
}

// ─── Parse save files ----------------───────────────────────────────

const SAVE_FILES = new Set(["gamedata.json", "player.json", "quests.json"]);

/**
 * Parse extracted save files into a bundle. Files with other names are ignored. When at least one
 * file parses, the problems with the others are returned as warnings rather than failing the
 * import; when none does, they are joined into the error.
 */
export async function parseSaveFiles(files: File[]): Promise<{
  bundle?: SaveBundle;
  error?: string;
  warnings?: string[];
}> {
  const bundle: SaveBundle = {};
  const errors: string[] = [];

  for (const file of files) {
    if (!SAVE_FILES.has(file.name)) continue;

    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      if (!isSaveSection(data)) {
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

  return { bundle, warnings: errors };
}

// ─── Validation ─────────────────────────────────────────────────────

/**
 * Whether `data` looks like a player save: an object with at least one progress field of the
 * expected shape. This recognizes the file; {@link buildImportState} validates each field.
 */
export function validatePlayerSave(data: unknown): data is SaveSection {
  if (!isSaveSection(data)) return false;
  return (
    Array.isArray(data.items_acquired) ||
    Array.isArray(data.recipe_unlocks) ||
    Array.isArray(data.cosmetic_unlocks) ||
    isSaveSection(data.animal_variant_unlocks) ||
    isSaveSection(data.items_sold) ||
    Array.isArray(data.spells_learned) ||
    Array.isArray(data.perks) ||
    Array.isArray(data.pet_cosmetic_sets_unlocked) ||
    Array.isArray(data.pet_skin_unlocks)
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
