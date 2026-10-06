import { canonicalAlmanacId, trackerData } from "#lib/data/index.js";
import { SEASON_ORDER, seasonFromOrdinal } from "#lib/engine/domain-primitives.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
  normalizeLevel,
} from "#lib/engine/progress.js";
import { recordKeys, recordValues } from "#lib/utils/record.js";

import { isSaveSection } from "./save-bundle.js";

import type { LevelIssue } from "#lib/engine/progress.js";
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
} from "#lib/types/tracker-data.js";
import type { CompletedState, MergeResult, QuestState } from "#lib/types/user-progress.js";

import type { SaveBundle, SaveSection } from "./save-bundle.js";

// ─── Import result ──────────────────────────────────────────────────

/** What a native save import changed, skipped as a conflict, or warned about. */
export interface SaveImportReport extends MergeResult {
  warnings: SaveImportWarning[];
}

/** Why no extracted save file could be used. */
export type SaveFilesError =
  | { code: "no-save-files" }
  | { code: "no-valid-files"; problems: SaveImportWarning[] };

/**
 * A problem with part of a save that the import skipped, localized by the UI. `path` names the
 * save field (e.g. `player.cosmetic_unlocks`) and `file` a save section or file name; both are
 * save-format identifiers, not UI text.
 *
 * - `unknown-id`: an ID the tracker doesn't know.
 * - `not-a-list` / `not-an-object`: a field of the wrong shape.
 * - `unreadable-entries`: list entries of the wrong shape.
 * - `level`: a numeric fact out of its domain; see {@link normalizeLevel}.
 * - `unrecognized-player`: a player section with no recognized progress fields.
 * - `invalid-json` / `not-json-object`: an extracted save file that isn't a JSON object.
 */
export type SaveImportWarning =
  | { code: "invalid-json"; file: string }
  | { code: "level"; issue: LevelIssue; key: string; max: number; value: string }
  | { code: "not-a-list"; path: string }
  | { code: "not-an-object"; path: string }
  | { code: "not-json-object"; file: string }
  | { code: "unknown-id"; id: string; path: string }
  | { code: "unreadable-entries"; count: number; path: string }
  | { code: "unrecognized-player"; file: string };

/** Typed access to one save section; see createSectionReader. */
interface SectionReader {
  /** An object field, or `undefined` when missing or malformed. */
  record: (key: string) => SaveSection | undefined;
  /** A list of strings; non-string entries are dropped. */
  stringList: (key: string) => string[];
  /** An object whose values are lists of strings, e.g. unlocks keyed by animal. */
  stringListRecord: (key: string) => Record<string, string[]>;
  /** A raw field for callers that normalize it themselves. */
  value: (key: string) => unknown;
}

/**
 * Maps a save bundle to the progress it records, plus warnings for the parts it skipped. What the
 * import changes is counted later, by the store's merge.
 */
export function buildImportState(bundle: SaveBundle): {
  completed: Partial<CompletedState>;
  warnings: SaveImportWarning[];
} {
  const warnings: SaveImportWarning[] = [];

  // parseSaveFiles rejects an unrecognizable player.json outright; a .sav entry reaches here.
  let playerSection = bundle.player;
  if (playerSection && !validatePlayerSave(playerSection)) {
    warnings.push({ code: "unrecognized-player", file: "player" });
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

  // ── Cosmetics ──
  const cosmeticIds = new Set<CosmeticId>();
  const validCosmetics = new Set(Object.keys(trackerData.cosmetics));

  for (const id of player.stringList("cosmetic_unlocks")) {
    if (validCosmetics.has(id)) {
      cosmeticIds.add(id as CosmeticId);
    } else {
      warnings.push({ code: "unknown-id", id, path: "player.cosmetic_unlocks" });
    }
  }

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
        warnings.push({
          code: "unknown-id",
          id: v,
          path: `player.animal_variant_unlocks.${animalId}`,
        });
      }
    }
    animalVariants[animalId] = matched;
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
        warnings.push({
          code: "unknown-id",
          id: c,
          path: `player.animal_cosmetic_unlocks.${animalId}`,
        });
      }
    }
    animalCosmetics[animalId] = matched;
  }

  // ── Pet cosmetic sets ──
  const petCosmetics = new Set<PetCosmeticSetId>();
  const validPetCosmetics = new Set(Object.keys(trackerData.pets.cosmetics));

  for (const id of player.stringList("pet_cosmetic_sets_unlocked")) {
    if (validPetCosmetics.has(id)) {
      petCosmetics.add(id as PetCosmeticSetId);
    } else {
      warnings.push({ code: "unknown-id", id, path: "player.pet_cosmetic_sets_unlocked" });
    }
  }

  // ── Pet skins ──
  const petSkins = new Set<PetSkinId>();
  const validPetSkins = new Set(Object.keys(trackerData.pets.skins));

  for (const id of player.stringList("pet_skin_unlocks")) {
    if (validPetSkins.has(id)) {
      petSkins.add(id as PetSkinId);
    } else {
      warnings.push({ code: "unknown-id", id, path: "player.pet_skin_unlocks" });
    }
  }

  // ── Spells ──
  const spells = new Set<SpellId>();
  const validSpells = new Set(Object.keys(trackerData.mines.spells));

  for (const id of player.stringList("spells_learned")) {
    if (validSpells.has(id)) {
      spells.add(id as SpellId);
    } else {
      warnings.push({ code: "unknown-id", id, path: "player.spells_learned" });
    }
  }

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
      warnings.push({ code: "unknown-id", id, path: "player.perks" });
    }
  }

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

  // ── Numeric levels: mine floor, villager hearts, skill levels, renown ──
  // Each fact is normalized into its finite domain (see normalizeLevel). Above-maximum values
  // are clamped and warned about; nonnumeric or negative values are dropped with a warning; a
  // missing fact is silently treated as unset. Import stays additive, so a warned fact never
  // blocks the rest of the save. Renown is the exception and clamps silently (see below).
  const extractLevel = (key: string, raw: unknown, max: number): number => {
    if (raw === undefined) return 0;
    const { issue, value } = normalizeLevel(raw, max);
    if (issue) {
      // Numbers show as written (NaN, Infinity); anything else as JSON, so "12" reads as text.
      const shown = typeof raw === "number" ? String(raw) : JSON.stringify(raw);
      warnings.push({ code: "level", issue, key, max, value: shown });
    }
    return value;
  };

  // Mine floor (from gamedata.json → maximum_mines_level)
  const mineFloor = extractLevel(
    "maximum_mines_level",
    gamedata.value("maximum_mines_level"),
    getMaxMineFloor(),
  );

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
      }
    }

    // Skill levels: "{skill}_level" keys in t2_world_facts
    for (const skillId of recordKeys(trackerData.skills)) {
      const key = `${skillId}_level`;
      const level = extractLevel(key, facts[key], MAX_SKILL_LEVEL);
      if (level > 0) {
        skillLevels[skillId] = level;
      }
    }

    // Renown level: clamped silently, matching backup restore. Nothing in ordinary play produces
    // an out-of-domain value, so a warning would only be noise.
    renown = normalizeLevel(facts.renown, getMaxRenownLevel()).value;
  }

  // ── Has upper floor (from player.json → upper_floor) ──
  const hasUpperFloor = player.value("upper_floor") === true;

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
      }
    }
  }

  // ── Reached season (from gamedata.json → date timestamp) ──
  const reachedSeason = deriveReachedSeason(gamedata.value("date"));

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
  const importQuest = (id: string, path: string, questState: QuestState) => {
    if (!validQuests.has(id)) {
      warnings.push({ code: "unknown-id", id, path });
    } else if (questStates[id] !== "completed") {
      questStates[id] = questState;
    }
  };

  for (const id of quests.stringList("completed_quests")) {
    importQuest(id, "quests.completed_quests", "completed");
  }
  for (const id of readActiveQuestNames(quests.value("active_quests"), warnings)) {
    importQuest(id, "quests.active_quests", "obtained");
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
    warnings,
  };
}

// ─── Field readers ──────────────────────────────────────────────────
// Each reader returns a well-typed value or an empty default. A present field of the wrong shape
// is dropped with a warning, so one malformed field never blocks the rest of the import.

function createSectionReader(
  name: string,
  section: SaveSection | undefined,
  warnings: SaveImportWarning[],
): SectionReader {
  const value = (key: string): unknown =>
    section && Object.hasOwn(section, key) ? section[key] : undefined;

  const readStrings = (path: string, raw: unknown): string[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) {
      warnings.push({ code: "not-a-list", path });
      return [];
    }
    const strings = raw.filter((entry): entry is string => typeof entry === "string");
    const dropped = raw.length - strings.length;
    if (dropped > 0) warnings.push({ code: "unreadable-entries", count: dropped, path });
    return strings;
  };

  const record = (key: string): SaveSection | undefined => {
    const raw = value(key);
    if (raw === undefined) return undefined;
    if (!isSaveSection(raw)) {
      warnings.push({ code: "not-an-object", path: `${name}.${key}` });
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
function readActiveQuestNames(raw: unknown, warnings: SaveImportWarning[]): string[] {
  const path = "quests.active_quests";
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warnings.push({ code: "not-a-list", path });
    return [];
  }
  const names: string[] = [];
  for (const entry of raw) {
    const name = isSaveSection(entry) ? entry.quest_name : undefined;
    if (typeof name === "string") names.push(name);
  }
  const dropped = raw.length - names.length;
  if (dropped > 0) warnings.push({ code: "unreadable-entries", count: dropped, path });
  return names;
}

// ─── .sav file unpacking (client-side) ──────────────────────────────

export {
  SaveFileError,
  type SaveFileErrorDetail,
  parseSavFile as unpackSavFile,
} from "./parse-sav.js";
export type { SaveBundle, SaveSection } from "./save-bundle.js";

// ─── Season derivation ─────────────────────────────────────────────

const GAME_DAY = 259_200;
const GAME_SEASON = 28 * GAME_DAY;

function deriveReachedSeason(date: unknown): Season {
  if (typeof date !== "number" || date < 0) return "spring";
  const seasonIndex = Math.floor(date / GAME_SEASON) % SEASON_ORDER.length;
  if (date >= SEASON_ORDER.length * GAME_SEASON) return "winter";
  return seasonFromOrdinal(seasonIndex);
}

// ─── Parse save files ----------------───────────────────────────────

const SAVE_FILES = new Set(["gamedata.json", "player.json", "quests.json"]);

/**
 * Parse extracted save files into a bundle. Files with other names are ignored. When at least one
 * file parses, the problems with the others are returned as warnings rather than failing the
 * import; when none does, they are returned with the error.
 */
export async function parseSaveFiles(files: File[]): Promise<{
  bundle?: SaveBundle;
  error?: SaveFilesError;
  warnings?: SaveImportWarning[];
}> {
  const bundle: SaveBundle = {};
  const errors: SaveImportWarning[] = [];

  const saveFiles = files.filter((file) => SAVE_FILES.has(file.name));
  const texts = await Promise.all(
    saveFiles.map(async (file) => {
      try {
        return await file.text();
      } catch {
        return undefined;
      }
    }),
  );

  for (const [index, file] of saveFiles.entries()) {
    const text = texts[index];
    if (text === undefined) {
      errors.push({ code: "invalid-json", file: file.name });
      continue;
    }

    try {
      const data: unknown = JSON.parse(text);
      if (!isSaveSection(data)) {
        errors.push({ code: "not-json-object", file: file.name });
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
            errors.push({ code: "unrecognized-player", file: file.name });
          }
          break;
        case "quests.json":
          bundle.quests = data;
          break;
      }
    } catch {
      errors.push({ code: "invalid-json", file: file.name });
    }
  }

  if (!bundle.player && !bundle.gamedata && !bundle.quests) {
    return {
      error:
        errors.length > 0
          ? { code: "no-valid-files", problems: errors }
          : { code: "no-save-files" },
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
