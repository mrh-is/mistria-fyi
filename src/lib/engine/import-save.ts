import { trackerData, trackerIndex } from "#lib/data/index.js";
import { SEASON_ORDER, seasonFromOrdinal } from "#lib/engine/domain-primitives.js";
import {
  getMaxMineFloor,
  getMaxRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
  normalizeLevel,
} from "#lib/engine/progress.js";
import { getSpouseId } from "#lib/engine/relationships.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

import { trackedPerkIds } from "./perk-ids.js";
import { hasProgressSection, isSaveSection } from "./save-bundle.js";
import { isKnownItemId } from "./untracked-save-ids.js";

import type { LevelIssue } from "#lib/engine/progress.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  MountAppearanceId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  RecipeId,
  Season,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "#lib/types/tracker-data.js";
import type {
  ChildChoice,
  MergeResult,
  ProgressState,
  QuestState,
} from "#lib/types/user-progress.js";

import type { SaveBundle, SaveSection, SaveSectionName } from "./save-bundle.js";

/** `obj_horse_statue.gml` plays this scene as it grants the Mistmare, its default appearance. */
const MISTMARE_REVEAL_CUTSCENE = "reveal_mistmare";
const MISTMARE_APPEARANCE = "mistmare" as MountAppearanceId;

function isMountAppearance(id: string): id is MountAppearanceId {
  return Object.hasOwn(trackerData.mount.appearances, id);
}

/** Each `{villager}_is_{suffix}` status flag & its relationship, the spouse first. */
const RELATIONSHIP_FACTS: readonly (readonly [string, VillagerRelationship])[] = [
  ["spouse", "married"],
  ["fiance", "proposed"],
  ["dating", "romantic"],
  ["best_friend", "platonic"],
];

// ─── Import result ──────────────────────────────────────────────────

/** What a native save import changed, skipped as a conflict, or warned about. */
export interface SaveImportReport extends MergeResult {
  warnings: SaveImportWarning[];
}

/** Why no extracted save file could be used. */
export type ExtractedSaveFilesError =
  | { code: "no-save-files" }
  | { code: "no-valid-files"; problems: SaveImportWarning[] };

/**
 * A problem with part of a save that the import skipped, localized by the UI. `path` names the
 * save field (e.g. `player.cosmetic_unlocks`) and `file` a save section or file name; both are
 * save-format identifiers, not UI text.
 *
 * - `unknown-id`: an ID neither the tracker nor its list of untracked game IDs recognizes.
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

// ─── Extraction contract ────────────────────────────────────────────

/**
 * Whether a field's value is the save's whole record of that fact (`complete`), or only what could
 * be read (`unknown`). Only a complete field can say something is *not* done; an unknown one can
 * only add progress.
 */
export type FieldCompleteness = "complete" | "unknown";

/**
 * Why a field is `unknown`, or what extraction adjusted. Every diagnostic makes its field
 * `unknown` except a `level` clamped from above its maximum, whose value is still known to be at
 * least the maximum.
 *
 * - `absent`: the field, its key, or its whole section isn't in the save.
 * - `invalid-value`: a scalar of the wrong type or domain that the import reads without a
 *   user-facing warning (renown, the upper floor, the calendar date, & identity facts).
 * - Every {@link SaveImportWarning} code, which the import also shows the player.
 */
export type SaveDiagnostic =
  | SaveImportWarning
  | { code: "absent"; path: string }
  | { code: "invalid-value"; path: string };

/** One fact extracted from a save. */
export interface ExtractedField<T> {
  completeness: FieldCompleteness;
  /** The diagnostics that concern this field, in extraction order. */
  diagnostics: SaveDiagnostic[];
  /** Game IDs the save lists that the tracker deliberately doesn't track; never a problem. */
  untracked: string[];
  /** What the save records, or `undefined` when nothing could be read: never an invented empty. */
  value: T | undefined;
}

/** The progress facts a save holds. */
export type ExtractedProgressKey = keyof ProgressState;
export type SaveFields = { [K in ExtractedProgressKey]: ExtractedField<ProgressState[K]> };

/** A game version as `info` records it (`{ major, minor, patch, pre }`). */
export interface GameVersion {
  major: number;
  minor: number;
  patch: number;
  pre: null | string;
}

/** Facts that identify a save across imports, from its `info` & `header` sections. */
export interface SaveIdentity {
  /** `info.creation_version`: the game version that created the save, fixed for its lifetime. */
  creationVersion: ExtractedField<GameVersion>;
  /** `header.playtime`, in seconds; it only grows as the save is played. */
  playtime: ExtractedField<number>;
}

export interface SaveExtraction {
  /** Every diagnostic in extraction order, including section-level ones no field owns. */
  diagnostics: SaveDiagnostic[];
  fields: SaveFields;
  identity: SaveIdentity;
}

type FieldKey = ExtractedProgressKey | keyof SaveIdentity;

/**
 * Fields whose readable source can still leave the choice unknown:
 *
 * - **Child choice:** only wanting children leaves evidence (a child, a pending child or visit, or the
 *   spouse's pregnancy quest); choosing none looks the same as not choosing yet. A positive
 *   choice is definitive; the undeclared value remains partial.
 */
const PARTIAL_FIELDS: ReadonlySet<FieldKey> = new Set<FieldKey>(["childChoice"]);

function makesUnknown(diagnostic: SaveDiagnostic): boolean {
  return !(diagnostic.code === "level" && diagnostic.issue === "above-max");
}

/** Whether a diagnostic is one the import shows the player. */
export function isSaveImportWarning(diagnostic: SaveDiagnostic): diagnostic is SaveImportWarning {
  return diagnostic.code !== "absent" && diagnostic.code !== "invalid-value";
}

interface FieldRecord {
  diagnostics: SaveDiagnostic[];
  untracked: string[];
}

function createCollector() {
  const diagnostics: SaveDiagnostic[] = [];
  const records: Partial<Record<FieldKey, FieldRecord>> = {};
  const recordFor = (field: FieldKey) =>
    getOrCreate(records, field, (): FieldRecord => ({ diagnostics: [], untracked: [] }));

  return {
    diagnostics,
    finish<T>(field: FieldKey, value: T | undefined): ExtractedField<T> {
      const { diagnostics: fieldDiagnostics, untracked } = recordFor(field);
      const complete =
        value !== undefined &&
        (!PARTIAL_FIELDS.has(field) || (field === "childChoice" && value === "yes")) &&
        !fieldDiagnostics.some((diagnostic) => makesUnknown(diagnostic));
      return {
        completeness: complete ? "complete" : "unknown",
        diagnostics: fieldDiagnostics,
        untracked,
        value,
      };
    },
    /** Records a diagnostic once, against every field it concerns. */
    report(diagnostic: SaveDiagnostic, fields: readonly FieldKey[]): void {
      diagnostics.push(diagnostic);
      for (const field of fields) recordFor(field).diagnostics.push(diagnostic);
    },
    untracked(id: string, fields: readonly FieldKey[]): void {
      for (const field of fields) recordFor(field).untracked.push(id);
    },
  };
}

type Collector = ReturnType<typeof createCollector>;

/** Typed access to one save section; see createSectionReader. */
interface SectionReader {
  /** An object field, or `undefined` when absent or malformed. */
  record: (key: string, fields: readonly FieldKey[]) => SaveSection | undefined;
  /** A list of strings, or `undefined` when absent or not a list; other entries are dropped. */
  stringList: (key: string, fields: readonly FieldKey[]) => string[] | undefined;
  /** An object of string lists, e.g. unlocks keyed by animal; malformed lists are left out. */
  stringListRecord: (
    key: string,
    fields: readonly FieldKey[],
  ) => Record<string, string[]> | undefined;
  /** A raw field for callers that normalize it themselves. */
  value: (key: string) => unknown;
}

// ─── Extraction ─────────────────────────────────────────────────────

/**
 * Maps a save bundle to the progress it records & its `playtime` (when readable), plus warnings for
 * the parts it skipped. What the import changes is counted later, by the store's merge, which stays
 * additive: an `unknown` field still adds what could be read.
 */
export function extractSaveProgress(bundle: SaveBundle): {
  completed: Partial<ProgressState>;
  playtime: number | undefined;
  warnings: SaveImportWarning[];
} {
  return progressOfExtraction(extractSave(bundle));
}

/** What {@link extractSaveProgress} returns, for a save that's already extracted. */
export function progressOfExtraction(extraction: SaveExtraction): {
  completed: Partial<ProgressState>;
  playtime: number | undefined;
  warnings: SaveImportWarning[];
} {
  const completed: Partial<Record<ExtractedProgressKey, unknown>> = {};
  for (const [key, field] of Object.entries(extraction.fields)) {
    if (field.value !== undefined) completed[key as ExtractedProgressKey] = field.value;
  }
  return {
    completed: completed as Partial<ProgressState>,
    playtime: extraction.identity.playtime.value,
    warnings: extraction.diagnostics.filter(isSaveImportWarning),
  };
}

/**
 * Reads every fact a save bundle holds, field by field: its value, whether the save records it
 * completely, & what got in the way. An absent or malformed field is `unknown` with no value,
 * never empty or zero. An ID the game defines but the tracker doesn't track is listed as
 * `untracked`; any other unrecognized ID or unreadable entry makes its field `unknown`.
 */
export function extractSave(bundle: SaveBundle): SaveExtraction {
  const collector = createCollector();
  const classify = (
    id: string,
    path: string,
    fields: readonly FieldKey[],
    isKnown: (id: string) => boolean,
  ): void => {
    if (isKnown(id)) collector.untracked(id, fields);
    else collector.report({ code: "unknown-id", id, path }, fields);
  };

  // parseExtractedSaveFiles rejects an unrecognizable player.json outright; a .sav entry reaches here.
  let playerSection = bundle.player;
  if (playerSection && !isPlayerSaveSection(playerSection)) {
    collector.report({ code: "unrecognized-player", file: "player" }, []);
    playerSection = undefined;
  }
  const player = createSectionReader("player", playerSection, collector);
  const gamedata = createSectionReader("gamedata", bundle.gamedata, collector);
  const quests = createSectionReader("quests", bundle.quests, collector);

  // ── Almanac: items_acquired only, as the game's almanac counts it ──
  // items_sold holds a zero for every item, and recipes_created can name items never acquired.
  const itemsAcquired = player.stringList("items_acquired", ["almanac", "almanacRecipes"]);
  let almanac: Set<ItemId> | undefined;
  if (itemsAcquired) {
    almanac = new Set();
    for (const id of itemsAcquired) {
      const canonical = trackerIndex.memberToCanonicalAlmanacId.get(id as ItemId);
      if (canonical) {
        almanac.add(canonical);
      } else if (isKnownItemId(id)) {
        collector.untracked(id, ["almanac"]);
      } else {
        collector.report({ code: "unknown-id", id, path: "player.items_acquired" }, [
          "almanac",
          "almanacRecipes",
        ]);
      }
    }
  }

  // ── Recipe unlocks ──
  // Default recipes are known without the save, so they're always in the value.
  const almanacRecipes = new Set<RecipeId>();
  for (const [id, recipe] of Object.entries(trackerData.recipes)) {
    if (recipe.sources.some((source) => source.type === "default")) {
      almanacRecipes.add(id as RecipeId);
    }
  }
  for (const id of player.stringList("recipe_unlocks", ["almanacRecipes"]) ?? []) {
    if (Object.hasOwn(trackerData.recipes, id)) {
      almanacRecipes.add(id as RecipeId);
    } else if (Object.hasOwn(trackerData.items, id)) {
      const recipeId = trackerData.items[id as ItemId].sources.find(
        (source) => source.type === "recipe",
      )?.recipeId;
      if (recipeId) almanacRecipes.add(recipeId);
      else collector.untracked(id, ["almanacRecipes"]);
    } else {
      classify(id, "player.recipe_unlocks", ["almanacRecipes"], isKnownItemId);
    }
  }

  // Fixed scrolls can grant recipes absent from recipe_unlocks (notably the Engagement Ring).
  // Their pipeline mapping follows set_unlock tags; generic scrolls have a runtime target instead.
  for (const id of itemsAcquired ?? []) {
    if (!Object.hasOwn(trackerData.items, id)) continue;
    for (const recipeId of trackerData.items[id as ItemId].recipeUnlocks ?? []) {
      almanacRecipes.add(recipeId);
    }
  }

  // ── Cosmetics ──
  // Starting cosmetics can be missing from cosmetic_unlocks, so every cosmetic with a default
  // source is credited, like default recipes. Defaults alone never make the field complete: an
  // absent or malformed list still leaves it `unknown`.
  const cosmetics = new Set<CosmeticId>([
    ...recordKeys(trackerData.cosmetics).filter((id) =>
      trackerData.cosmetics[id].sources.some((source) => source.type === "default"),
    ),
    ...(knownIdSet<CosmeticId>(
      player.stringList("cosmetic_unlocks", ["cosmetics"]),
      "player.cosmetic_unlocks",
      "cosmetics",
      (id) => Object.hasOwn(trackerData.cosmetics, id),
      collector,
    ) ?? []),
  ]);

  // ── Mount appearances ──
  const facts = gamedata.record("t2_world_facts", [
    "heartLevels",
    "renown",
    "questStates",
    "skillLevels",
    "villagerRelationships",
    "mountAppearances",
  ]);
  // The game files the mount's appearances under the horse's variant unlocks, beside the breeds.
  // Unlike absence from an uncatalogued scene list, the explicit 0/1 fact establishes a removal.
  const revealed = readScalar(
    facts?.cutscene_seen_reveal_mistmare,
    "gamedata.t2_world_facts.cutscene_seen_reveal_mistmare",
    "mountAppearances",
    (value): value is boolean | number =>
      value === true || value === false || value === 0 || value === 1,
    collector,
  );
  const sceneHistory =
    revealed === undefined ? gamedata.stringList("scene_history", ["mountAppearances"]) : undefined;
  const mountAppearances = new Set<MountAppearanceId>();
  if (revealed === true || revealed === 1 || sceneHistory?.includes(MISTMARE_REVEAL_CUTSCENE)) {
    mountAppearances.add(MISTMARE_APPEARANCE);
  }

  // ── Animal variants ──
  // Mount appearances share these lists (the horse's, in practice), so anything that leaves a list
  // unread (an absent list, an unrecognized animal key, or an unrecognized ID) concerns both fields.
  // NewGame seeds each animal's default variants even before the player owns one of that breed, so
  // they're credited whether or not the save's lists are readable. They never make the field
  // complete on their own: an unread list still leaves it `unknown`.
  const variantFields = ["animals", "mountAppearances"] as const;
  const playerVariantsByAnimal = player.stringListRecord("animal_variant_unlocks", variantFields);
  const animals: ProgressState["animals"] = {};
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const path = `player.animal_variant_unlocks.${animalId}`;
    const validVariants = new Set(animal.variantTiers.flatMap((tier) => Object.keys(tier)));
    const matched = new Set<AnimalVariantId>(
      animal.variantTiers.flatMap((tier) =>
        recordKeys(tier).filter((id) => tier[id].source.type === "default"),
      ),
    );
    if (playerVariantsByAnimal && !Object.hasOwn(playerVariantsByAnimal, animalId)) {
      collector.report({ code: "absent", path }, variantFields);
    }
    for (const variant of playerVariantsByAnimal?.[animalId] ?? []) {
      if (validVariants.has(variant)) {
        matched.add(variant as AnimalVariantId);
      } else if (isMountAppearance(variant)) {
        mountAppearances.add(variant);
      } else {
        collector.report({ code: "unknown-id", id: variant, path }, variantFields);
      }
    }
    animals[animalId as AnimalId] = matched;
  }
  if (playerVariantsByAnimal) {
    reportUnknownAnimals(
      playerVariantsByAnimal,
      "player.animal_variant_unlocks",
      collector,
      variantFields,
    );
  }

  // ── Animal cosmetics ──
  const playerCosmeticsByAnimal = player.stringListRecord("animal_cosmetic_unlocks", [
    "animalCosmetics",
  ]);
  let animalCosmetics: ProgressState["animalCosmetics"] | undefined;
  if (playerCosmeticsByAnimal) {
    animalCosmetics = {};
    for (const [animalId, animal] of Object.entries(trackerData.animals)) {
      const path = `player.animal_cosmetic_unlocks.${animalId}`;
      if (!Object.hasOwn(playerCosmeticsByAnimal, animalId)) {
        collector.report({ code: "absent", path }, ["animalCosmetics"]);
      }
      animalCosmetics[animalId as AnimalId] =
        knownIdSet<CosmeticId>(
          playerCosmeticsByAnimal[animalId] ?? [],
          path,
          "animalCosmetics",
          (id) => Object.hasOwn(animal.cosmetics, id),
          collector,
        ) ?? new Set();
    }
    reportUnknownAnimals(playerCosmeticsByAnimal, "player.animal_cosmetic_unlocks", collector, [
      "animalCosmetics",
    ]);
  }

  // ── Pet cosmetic sets, pet skins, spells, & perks ──
  const petCosmetics = knownIdSet<PetCosmeticSetId>(
    player.stringList("pet_cosmetic_sets_unlocked", ["petCosmetics"]),
    "player.pet_cosmetic_sets_unlocked",
    "petCosmetics",
    (id) => Object.hasOwn(trackerData.pets.cosmetics, id),
    collector,
  );
  const petSkins = knownIdSet<PetSkinId>(
    player.stringList("pet_skin_unlocks", ["petSkins"]),
    "player.pet_skin_unlocks",
    "petSkins",
    (id) => Object.hasOwn(trackerData.pets.skins, id),
    collector,
  );
  const spells = knownIdSet<SpellId>(
    player.stringList("spells_learned", ["spells"]),
    "player.spells_learned",
    "spells",
    (id) => Object.hasOwn(trackerData.mines.spells, id),
    collector,
  );
  const validPerks = new Set<string>(trackedPerkIds(trackerData));
  const unlockedPerks = knownIdSet<PerkId>(
    player.stringList("perks", ["unlockedPerks"]),
    "player.perks",
    "unlockedPerks",
    (id) => validPerks.has(id),
    collector,
  );

  // ── Museum donations (from gamedata.json → museum_progress) ──
  const validMuseum = new Set<string>(
    recordValues(trackerData.museum).flatMap(({ sets }) =>
      recordValues(sets).flatMap(({ items }) => items),
    ),
  );
  const museum = knownIdSet<ItemId>(
    gamedata.stringList("museum_progress", ["museum"]),
    "gamedata.museum_progress",
    "museum",
    (id) => validMuseum.has(id),
    collector,
    isKnownItemId,
  );

  // ── Numeric levels: mine floor, heart levels, skill levels, renown ──
  // Each fact is normalized into its finite domain (see normalizeLevel). Above-maximum values are
  // clamped and warned about; nonnumeric or negative values are left unknown with a warning; a
  // missing fact is unknown. Import stays additive, so a warned fact never blocks the rest of the
  // save. Renown is the exception and is never warned about (see below).
  const extractLevel = (
    path: string,
    key: string,
    raw: unknown,
    max: number,
    field: FieldKey,
  ): number | undefined => {
    if (raw === undefined) {
      collector.report({ code: "absent", path }, [field]);
      return undefined;
    }
    const { issue, value } = normalizeLevel(raw, max);
    if (!issue) return value;
    // Numbers show as written (NaN, Infinity); anything else as JSON, so "12" reads as text.
    const shown = typeof raw === "number" ? String(raw) : JSON.stringify(raw);
    collector.report({ code: "level", issue, key, max, value: shown }, [field]);
    return issue === "above-max" ? value : undefined;
  };

  // Mine floor (from gamedata.json → maximum_mines_level). The elevator adds one to this zero-based
  // index, including an untouched new game's zero. DungeonRunner only takes max(previous,
  // current_floor), so first entry still stores zero. Normalize the stored domain before adding the
  // offset; a missing or invalid index stays unknown.
  const mineIndex = extractLevel(
    "gamedata.maximum_mines_level",
    "maximum_mines_level",
    gamedata.value("maximum_mines_level"),
    getMaxMineFloor() - 1,
    "mineFloor",
  );
  const mineFloor = mineIndex === undefined ? undefined : mineIndex + 1;

  // Heart levels, skill levels, renown, & dating (from gamedata.json → t2_world_facts)
  let heartLevels: Record<string, number> | undefined;
  let skillLevels: Record<string, number> | undefined;
  let renown: number | undefined;
  if (facts) {
    const factLevels = (ids: string[], suffix: string, max: number, field: FieldKey) => {
      const levels: Record<string, number> = {};
      for (const id of ids) {
        const key = `${id}${suffix}`;
        const level = extractLevel(`gamedata.t2_world_facts.${key}`, key, facts[key], max, field);
        if (level !== undefined && level > 0) levels[id] = level;
      }
      return levels;
    };
    // "{villager}_heart_level" & "{skill}_level" keys
    heartLevels = factLevels(
      recordKeys(trackerData.villagers),
      "_heart_level",
      MAX_HEART_LEVEL,
      "heartLevels",
    );
    skillLevels = factLevels(
      recordKeys(trackerData.skills),
      "_level",
      MAX_SKILL_LEVEL,
      "skillLevels",
    );

    // Renown: clamped silently above its maximum, matching backup restore. Nothing in ordinary
    // play produces an out-of-domain value, so a warning would only be noise; a value that isn't a
    // level is still recorded as a diagnostic.
    const renownPath = "gamedata.t2_world_facts.renown";
    if (facts.renown === undefined) {
      collector.report({ code: "absent", path: renownPath }, ["renown", "questStates"]);
    } else {
      const normalized = normalizeLevel(facts.renown, getMaxRenownLevel());
      if (normalized.issue && normalized.issue !== "above-max") {
        collector.report({ code: "invalid-value", path: renownPath }, ["renown", "questStates"]);
      } else {
        renown = normalized.value;
      }
    }
  }

  // ── Has upper floor (from player.json → upper_floor) ──
  const hasUpperFloor = readScalar(
    player.value("upper_floor"),
    "player.upper_floor",
    "hasUpperFloor",
    (raw): raw is boolean => typeof raw === "boolean",
    collector,
  );

  // ── Reached season (from gamedata.json → date timestamp) ──
  const date = readScalar(
    gamedata.value("date"),
    "gamedata.date",
    "reachedSeason",
    (raw): raw is number => typeof raw === "number" && Number.isFinite(raw) && raw >= 0,
    collector,
  );
  const reachedSeason = date === undefined ? undefined : deriveReachedSeason(date);

  // ── Quest completion (from quests.json) ──
  // Completed quests import as "completed" and active quests as "obtained". A quest listed in
  // both keeps "completed", matching mergeFromSave's rule that a merge never lowers a quest.
  const validQuests = new Set<string>(
    Object.values(trackerData.quests).flatMap((category) => Object.keys(category)),
  );
  const foundQuests: Record<string, QuestState> = {};
  const importQuests = (ids: string[] | undefined, path: string, questState: QuestState) => {
    for (const id of ids ?? []) {
      if (!validQuests.has(id)) {
        collector.report({ code: "unknown-id", id, path }, ["questStates"]);
      } else if (foundQuests[id] !== "completed") {
        foundQuests[id] = questState;
      }
    }
    return ids !== undefined;
  };
  const readCompleted = importQuests(
    quests.stringList("completed_quests", ["questStates"]),
    "quests.completed_quests",
    "completed",
  );
  const readActive = importQuests(
    readActiveQuestNames(quests.value("active_quests"), collector),
    "quests.active_quests",
    "obtained",
  );
  // Rank quests arrived after older saves had already passed their targets. Their native stage
  // thresholds recover those completions; explicit journal/fact evidence stays additive.
  let readRankCompletion = renown !== undefined;
  for (const [questId, quest] of recordEntries(trackerData.quests.story)) {
    if (quest.townRankLevel === undefined) continue;
    const key = `quest_${questId}_complete`;
    const completedFact = facts?.[key];
    if (
      (renown !== undefined && renown >= quest.townRankLevel) ||
      completedFact === true ||
      completedFact === 1
    ) {
      foundQuests[questId] = "completed";
      readRankCompletion = true;
    }
    if (
      completedFact !== undefined &&
      completedFact !== true &&
      completedFact !== false &&
      completedFact !== 0 &&
      completedFact !== 1
    ) {
      collector.report({ code: "invalid-value", path: `gamedata.t2_world_facts.${key}` }, [
        "questStates",
      ]);
    }
  }
  const questStates = readCompleted || readActive || readRankCompletion ? foundQuests : undefined;

  // ── Villager relationships (from gamedata.json → t2_world_facts → {villager}_status) ──
  // Explicit statuses include null for undecided. Legacy flags still add partial evidence, with
  // a spouse beating dating. A pregnancy quest can name the spouse only without an explicit status.
  const pregnancyVillagerId = recordEntries(trackerData.pregnancyQuestByVillager).find(
    ([, questId]) => Object.hasOwn(foundQuests, questId),
  )?.[0];
  let villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> | undefined;
  if (facts || pregnancyVillagerId) {
    villagerRelationships = {};
    for (const [villagerId, villager] of recordEntries(trackerData.villagers)) {
      if (villager.dateable !== true || !facts) continue;
      const key = `${villagerId}_status`;
      const raw = facts[key];
      const explicit = RELATIONSHIP_FACTS.find(([suffix]) => suffix === raw);
      if (raw === null || explicit) {
        if (explicit) villagerRelationships[villagerId] = explicit[1];
        continue;
      }
      collector.report(
        {
          code: raw === undefined ? "absent" : "invalid-value",
          path: `gamedata.t2_world_facts.${key}`,
        },
        ["villagerRelationships"],
      );
      const status = RELATIONSHIP_FACTS.find(([suffix]) => {
        const val = facts[`${villagerId}_is_${suffix}`];
        return val === true || val === 1;
      });
      if (status) villagerRelationships[villagerId] = status[1];
    }
    if (pregnancyVillagerId) {
      const key = `${pregnancyVillagerId}_status`;
      const raw = facts?.[key];
      const explicit = raw === null || RELATIONSHIP_FACTS.some(([suffix]) => suffix === raw);
      if (explicit && raw !== "spouse") {
        collector.report({ code: "invalid-value", path: `gamedata.t2_world_facts.${key}` }, [
          "villagerRelationships",
        ]);
      } else if (!explicit && getSpouseId(villagerRelationships) === null) {
        villagerRelationships[pregnancyVillagerId] = "married";
      }
    }
  }

  const breakUpsDisabled = readScalar(
    player.value("disable_break_ups"),
    "player.disable_break_ups",
    "breakUpsDisabled",
    (value): value is boolean => typeof value === "boolean",
    collector,
  );

  // ── Child choice (children, a pending child or stork visit, or a pregnancy quest) ──
  // Only wanting children leaves evidence; a household that chose none reads as undeclared.
  let childChoice: ChildChoice | undefined;
  const pendingStorkVisit = facts?.pending_stork_visit === 1 || facts?.pending_stork_visit === true;
  if (playerSection || pregnancyVillagerId || pendingStorkVisit) {
    const children = player.value("children");
    const pending = player.value("pending_child");
    const validPending =
      isSaveSection(pending) &&
      typeof pending.due_date === "number" &&
      Number.isFinite(pending.due_date) &&
      pending.due_date >= 0 &&
      (pending.utero === "ari" || pending.utero === "spouse" || pending.utero === "stork");
    const hasChild =
      validPending ||
      (Array.isArray(children) &&
        children.some((child: unknown) => isSaveSection(child) && typeof child.name === "string"));
    if (hasChild || pregnancyVillagerId || pendingStorkVisit) {
      childChoice = "yes";
    } else if (pending === null && Array.isArray(children) && children.length === 0) {
      childChoice = "undeclared";
    }
    for (const [key, valid] of [
      ["pending_child", pending === null || validPending],
      [
        "children",
        Array.isArray(children) &&
          children.every(
            (child: unknown) => isSaveSection(child) && typeof child.name === "string",
          ),
      ],
    ] as const) {
      if (!valid && !pregnancyVillagerId && !pendingStorkVisit) {
        collector.report(
          {
            code: player.value(key) === undefined ? "absent" : "invalid-value",
            path: `player.${key}`,
          },
          ["childChoice"],
        );
      }
    }
  }

  // ── Identity (from info.json & header.json) ──
  const creationVersion = readScalar(
    bundle.info && Object.hasOwn(bundle.info, "creation_version")
      ? bundle.info.creation_version
      : undefined,
    "info.creation_version",
    "creationVersion",
    isGameVersion,
    collector,
  );
  const playtime = readScalar(
    bundle.header && Object.hasOwn(bundle.header, "playtime") ? bundle.header.playtime : undefined,
    "header.playtime",
    "playtime",
    (raw): raw is number => typeof raw === "number" && Number.isFinite(raw) && raw >= 0,
    collector,
  );

  const fields: SaveFields = {
    almanac: collector.finish("almanac", almanac),
    almanacRecipes: collector.finish("almanacRecipes", almanacRecipes),
    animalCosmetics: collector.finish("animalCosmetics", animalCosmetics),
    animals: collector.finish("animals", animals),
    breakUpsDisabled: collector.finish("breakUpsDisabled", breakUpsDisabled),
    childChoice: collector.finish("childChoice", childChoice),
    cosmetics: collector.finish("cosmetics", cosmetics),
    hasUpperFloor: collector.finish("hasUpperFloor", hasUpperFloor),
    heartLevels: collector.finish("heartLevels", heartLevels),
    mineFloor: collector.finish("mineFloor", mineFloor),
    mountAppearances: collector.finish(
      "mountAppearances",
      revealed !== undefined || sceneHistory || playerVariantsByAnimal
        ? mountAppearances
        : undefined,
    ),
    museum: collector.finish("museum", museum),
    petCosmetics: collector.finish("petCosmetics", petCosmetics),
    petSkins: collector.finish("petSkins", petSkins),
    questStates: collector.finish("questStates", questStates),
    reachedSeason: collector.finish("reachedSeason", reachedSeason),
    renown: collector.finish("renown", renown),
    skillLevels: collector.finish("skillLevels", skillLevels),
    spells: collector.finish("spells", spells),
    unlockedPerks: collector.finish("unlockedPerks", unlockedPerks),
    villagerRelationships: collector.finish("villagerRelationships", villagerRelationships),
  };
  return {
    diagnostics: collector.diagnostics,
    fields,
    identity: {
      creationVersion: collector.finish("creationVersion", creationVersion),
      playtime: collector.finish("playtime", playtime),
    },
  };
}

// ─── Field readers ──────────────────────────────────────────────────
// Each reader returns a well-typed value, or `undefined` with a diagnostic when the field is absent
// or malformed, so one malformed field never blocks the rest of the import.

function createSectionReader(
  name: SaveSectionName,
  section: SaveSection | undefined,
  collector: Collector,
): SectionReader {
  const value = (key: string): unknown =>
    section && Object.hasOwn(section, key) ? section[key] : undefined;

  const readStrings = (
    path: string,
    raw: unknown,
    fields: readonly FieldKey[],
  ): string[] | undefined => {
    if (raw === undefined) {
      collector.report({ code: "absent", path }, fields);
      return undefined;
    }
    if (!Array.isArray(raw)) {
      collector.report({ code: "not-a-list", path }, fields);
      return undefined;
    }
    const strings = raw.filter((entry): entry is string => typeof entry === "string");
    const dropped = raw.length - strings.length;
    if (dropped > 0) collector.report({ code: "unreadable-entries", count: dropped, path }, fields);
    return strings;
  };

  const record = (key: string, fields: readonly FieldKey[]): SaveSection | undefined => {
    const path = `${name}.${key}`;
    const raw = value(key);
    if (raw === undefined) {
      collector.report({ code: "absent", path }, fields);
      return undefined;
    }
    if (!isSaveSection(raw)) {
      collector.report({ code: "not-an-object", path }, fields);
      return undefined;
    }
    return raw;
  };

  return {
    record,
    stringList: (key, fields) => readStrings(`${name}.${key}`, value(key), fields),
    stringListRecord: (key, fields) => {
      const raw = record(key, fields);
      if (!raw) return undefined;
      const result: Record<string, string[]> = {};
      for (const [entryKey, entry] of Object.entries(raw)) {
        const list = readStrings(`${name}.${key}.${entryKey}`, entry, fields);
        if (list) result[entryKey] = list;
      }
      return result;
    },
    value,
  };
}

/**
 * The tracked IDs in `ids`, or `undefined` when the list couldn't be read. Every other ID is
 * untracked when `isUntracked` knows it, and otherwise reported as unrecognized.
 */
function knownIdSet<T extends string>(
  ids: string[] | undefined,
  path: string,
  field: FieldKey,
  isTracked: (id: string) => boolean,
  collector: Collector,
  isUntracked: (id: string) => boolean = () => false,
): Set<T> | undefined {
  if (!ids) return undefined;
  const result = new Set<T>();
  for (const id of ids) {
    if (isTracked(id)) result.add(id as T);
    else if (isUntracked(id)) collector.untracked(id, [field]);
    else collector.report({ code: "unknown-id", id, path }, [field]);
  }
  return result;
}

/** Reports each animal a per-animal record names that the tracker doesn't know. */
function reportUnknownAnimals(
  byAnimal: Record<string, string[]>,
  path: string,
  collector: Collector,
  fields: readonly FieldKey[],
): void {
  for (const animalId of Object.keys(byAnimal)) {
    if (!Object.hasOwn(trackerData.animals, animalId)) {
      collector.report({ code: "unknown-id", id: animalId, path }, fields);
    }
  }
}

/** A scalar fact, or `undefined` with an `absent` or `invalid-value` diagnostic. */
function readScalar<T>(
  raw: unknown,
  path: string,
  field: FieldKey,
  isValid: (raw: unknown) => raw is T,
  collector: Collector,
): T | undefined {
  if (raw === undefined) {
    collector.report({ code: "absent", path }, [field]);
    return undefined;
  }
  if (!isValid(raw)) {
    collector.report({ code: "invalid-value", path }, [field]);
    return undefined;
  }
  return raw;
}

function isVersionPart(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isGameVersion(raw: unknown): raw is GameVersion {
  if (!isSaveSection(raw)) return false;
  return (
    isVersionPart(raw.major) &&
    isVersionPart(raw.minor) &&
    isVersionPart(raw.patch) &&
    (raw.pre === null || typeof raw.pre === "string")
  );
}

/** Quest IDs from `quests.active_quests`, a list of `{ quest_name }` objects. */
function readActiveQuestNames(raw: unknown, collector: Collector): string[] | undefined {
  const path = "quests.active_quests";
  if (raw === undefined) {
    collector.report({ code: "absent", path }, ["questStates"]);
    return undefined;
  }
  if (!Array.isArray(raw)) {
    collector.report({ code: "not-a-list", path }, ["questStates"]);
    return undefined;
  }
  const names: string[] = [];
  for (const entry of raw) {
    const name = isSaveSection(entry) ? entry.quest_name : undefined;
    if (typeof name === "string") names.push(name);
  }
  const dropped = raw.length - names.length;
  if (dropped > 0) {
    collector.report({ code: "unreadable-entries", count: dropped, path }, ["questStates"]);
  }
  return names;
}

// ─── .sav file unpacking (client-side) ──────────────────────────────

export { SavArchiveError, parseSavArchive as unpackSavFile } from "./parse-sav.js";
export type { SaveBundle, SaveSection } from "./save-bundle.js";

// ─── Season derivation ─────────────────────────────────────────────

/** One in-game day on the save's calendar (`gamedata.date`). */
export const GAME_DAY = 259_200;
const GAME_SEASON = 28 * GAME_DAY;

function deriveReachedSeason(date: unknown): Season {
  if (typeof date !== "number" || date < 0) return "spring";
  const seasonIndex = Math.floor(date / GAME_SEASON) % SEASON_ORDER.length;
  if (date >= SEASON_ORDER.length * GAME_SEASON) return "winter";
  return seasonFromOrdinal(seasonIndex);
}

// ─── Parse save files ----------------───────────────────────────────

const SAVE_FILES = new Set([
  "gamedata.json",
  "header.json",
  "info.json",
  "player.json",
  "quests.json",
]);

/**
 * Parse extracted save files into a bundle. Files with other names are ignored. When at least one
 * progress file parses, the problems with the others are returned as warnings rather than failing
 * the import; when none does, they are returned with the error. `header.json` & `info.json` only
 * identify the save, so they're optional & never enough on their own.
 */
export async function parseExtractedSaveFiles(files: File[]): Promise<{
  bundle?: SaveBundle;
  error?: ExtractedSaveFilesError;
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
        case "header.json":
          bundle.header = data;
          break;
        case "info.json":
          bundle.info = data;
          break;
        case "player.json":
          if (isPlayerSaveSection(data)) {
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

  if (!hasProgressSection(bundle)) {
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
 * expected shape. This recognizes the file; {@link extractSaveProgress} validates each field.
 */
export function isPlayerSaveSection(data: unknown): data is SaveSection {
  if (!isSaveSection(data)) return false;
  return (
    typeof data.disable_break_ups === "boolean" ||
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
