import { trackerData, trackerIndex } from "$lib/data/index.js";
import { isVariantInScope } from "$lib/engine/animal-availability.js";
import { isItemApplicable, isItemApplicableForAlmanac } from "$lib/engine/applicability.js";
import { filterAvailableItems, isItemAvailable } from "$lib/engine/availability.js";
import { getMarriedVillager } from "$lib/engine/relationships.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils";

import type { CategoryKey } from "$lib/data/categories.js";
import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { AvailabilitySelection } from "$lib/types/availability.js";
import type { ItemId, QuestId, Season, VillagerId, Weather } from "$lib/types/tracker-data.js";

export const MAX_VILLAGER_LEVEL = 12;
export const MAX_SKILL_LEVEL = 60;

export type AllProgress = Record<CategoryKey, CategoryProgress>;

// ─── Types ──────────────────────────────────────────────────────────

export interface CategoryProgress {
  completed: number;
  filtered: number;
  total: number;
}

/** Why `normalizeLevel` changed or rejected its input; absent when the value was already valid. */
export type LevelIssue = "above-max" | "negative" | "not-a-number";

// ─── Helpers ────────────────────────────────────────────────────────

export interface NormalizedLevel {
  issue?: LevelIssue;
  value: number;
}

interface ProgressContext {
  availabilityWindows: AvailabilitySelection;
  completed: CompletedState;
  worldState: { season: Season; weather: Weather };
}

/**
 * Clamp a level into `[0, max]` after flooring. Nonfinite input collapses to 0. Every state
 * ingress that installs a level (setters, additive merge, native save extraction) routes through
 * this so the canonical state never holds a value the normal controls could not produce.
 */
export function clampLevel(level: number, max: number): number {
  return normalizeLevel(level, max).value;
}

export function clampMineFloor(floor: number): number {
  return clampLevel(floor, getMaxMineFloor());
}

export function clampRenownLevel(level: number): number {
  return clampLevel(level, getMaxRenownLevel());
}

export function getAllProgress(ctx: ProgressContext): AllProgress {
  return {
    almanac: getAlmanacProgress(ctx),
    animals: getAnimalsProgress(ctx),
    cosmetics: getCosmeticsProgress(ctx),
    mines: getMinesProgress(ctx),
    museum: getMuseumProgress(ctx),
    quests: getQuestsProgress(ctx),
    recipes: getRecipesProgress(ctx),
    renown: getRenownProgress(ctx),
    skills: getSkillsProgress(ctx),
    villagers: getVillagersProgress(ctx),
  };
}

export function getCategoryProgress(category: CategoryKey, ctx: ProgressContext): CategoryProgress {
  switch (category) {
    case "almanac":
      return getAlmanacProgress(ctx);
    case "animals":
      return getAnimalsProgress(ctx);
    case "cosmetics":
      return getCosmeticsProgress(ctx);
    case "mines":
      return getMinesProgress(ctx);
    case "museum":
      return getMuseumProgress(ctx);
    case "quests":
      return getQuestsProgress(ctx);
    case "recipes":
      return getRecipesProgress(ctx);
    case "renown":
      return getRenownProgress(ctx);
    case "skills":
      return getSkillsProgress(ctx);
    case "villagers":
      return getVillagersProgress(ctx);
  }
}

export function getMaxMineFloor(): number {
  const biomes = trackerData.mines.biomes;
  return biomes[biomes.length - 1].floors.end;
}

export function getMaxRenownLevel(): number {
  return trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;
}

// ─── Per-category progress ──────────────────────────────────────────

/** Sums every category's progress into one overall total (home page, `/all`). */
export function getOverallProgress(allProgress: AllProgress): CategoryProgress {
  let completed = 0;
  let filtered = 0;
  let total = 0;
  for (const p of Object.values(allProgress)) {
    completed += p.completed;
    filtered += p.filtered;
    total += p.total;
  }
  return { completed, filtered, total };
}

export function isVillagerComplete(villagerId: VillagerId, completed: CompletedState): boolean {
  const villager = trackerData.villagers[villagerId];
  const level = completed.villagerLevels[villagerId] ?? 0;
  if (level < MAX_VILLAGER_LEVEL) return false;

  if (!villager.dateable) return true;

  const relationship = completed.villagerRelationships[villagerId] ?? "undecided";
  if (relationship === "platonic") return true;
  if (relationship === "married") return completed.childChoice !== "undeclared";

  return false;
}

/**
 * Normalize an untrusted level into its finite domain `[0, max]`:
 *
 * - wrong type or nonfinite → `0`, issue `"not-a-number"`
 * - fractional → floored silently (the game stores whole levels; a fraction is harmless drift)
 * - negative (after flooring) → `0`, issue `"negative"`
 * - above `max` → `max`, issue `"above-max"`
 *
 * Callers decide whether an issue is a warning (native save import, which accepts usable facts)
 * or a rejection (backup restore, which requires the whole document to be valid).
 */
export function normalizeLevel(level: unknown, max: number): NormalizedLevel {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return { issue: "not-a-number", value: 0 };
  }
  const floored = Math.floor(level);
  if (floored < 0) return { issue: "negative", value: 0 };
  if (floored > max) return { issue: "above-max", value: max };
  return { value: floored };
}

function almanacEntryProgress(
  canonicalIds: ItemId[],
  completedSet: Set<ItemId>,
  ctx: ProgressContext,
): CategoryProgress {
  const applicableIds = canonicalIds.filter((id) => {
    if (completedSet.has(id)) return true;
    const entry = trackerIndex.almanacEntryByCanonicalId.get(id);
    if (!entry) return isItemApplicable(id, ctx.completed);
    return isItemApplicableForAlmanac(entry.itemIds, ctx.completed);
  });

  const incompleteIds = applicableIds.filter((id) => !completedSet.has(id));
  const filtered = incompleteIds.filter((id) =>
    isItemAvailable(
      trackerIndex.getAggregatedAlmanacSources(id),
      ctx.worldState,
      ctx.availabilityWindows,
    ),
  );
  return {
    completed: applicableIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: applicableIds.length,
  };
}

function getAlmanacProgress(ctx: ProgressContext): CategoryProgress {
  const entries = almanacEntryProgress(
    trackerIndex.almanacCanonicalIds,
    ctx.completed.almanac,
    ctx,
  );
  return {
    completed: entries.completed + ctx.completed.dates.size,
    filtered: entries.filtered + trackerIndex.almanacDateCount - ctx.completed.dates.size,
    total: entries.total + trackerIndex.almanacDateCount,
  };
}

function getAnimalsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  let filtered = 0;
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    const cosmeticCount = recordKeys(animal.cosmetics).length;
    total += cosmeticCount;
    completed += ctx.completed.animalCosmetics[animalId].size;
    filtered += cosmeticCount - ctx.completed.animalCosmetics[animalId].size;

    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        total++;
        if (ctx.completed.animals[animalId].has(variantId)) {
          completed++;
          continue;
        }
        if (isVariantInScope(variant, ctx.worldState.season, ctx.availabilityWindows)) {
          filtered++;
        }
      }
    }
  }

  const petCosmeticIds = recordKeys(trackerData.pets.cosmetics);
  total += petCosmeticIds.length;
  for (const id of petCosmeticIds) {
    if (ctx.completed.petCosmetics.has(id)) {
      completed++;
    } else {
      filtered++;
    }
  }

  const petSkinIds = recordKeys(trackerData.pets.skins);
  total += petSkinIds.length;
  for (const id of petSkinIds) {
    if (ctx.completed.petSkins.has(id)) {
      completed++;
    } else {
      filtered++;
    }
  }

  return { completed, filtered, total };
}

function getCosmeticsProgress(ctx: ProgressContext): CategoryProgress {
  const total = recordKeys(trackerData.cosmetics).length;
  const completed = ctx.completed.cosmetics.size;
  return { completed, filtered: total - completed, total };
}

function getCravingQuestCount(
  marriedVillager: null | VillagerId,
  isWife: boolean,
  activePregnancyQuestId: QuestId | undefined,
  ctx: ProgressContext,
): { completed: number; total: number } {
  if (!marriedVillager) {
    return { completed: 0, total: 1 };
  }
  if (!isWife) {
    return { completed: 0, total: 0 };
  }
  if (ctx.completed.childChoice === "no") {
    return { completed: 0, total: 0 };
  }
  if (activePregnancyQuestId) {
    const isCompleted = ctx.completed.questStates[activePregnancyQuestId] === "completed";
    return { completed: isCompleted ? 1 : 0, total: 1 };
  }
  return { completed: 0, total: 1 };
}

function getMinesProgress(ctx: ProgressContext): CategoryProgress {
  const biomes = trackerData.mines.biomes;
  const maxFloor = biomes[biomes.length - 1].floors.end;
  const totalFloors = maxFloor;
  const totalSpells = recordKeys(trackerData.mines.spells).length;
  const total = totalFloors + totalSpells;
  const completed = ctx.completed.mines.floor + ctx.completed.mines.spells.size;
  return { completed, filtered: total - completed, total };
}

function getMuseumProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = recordValues(trackerData.museum).flatMap(({ sets }) =>
    recordValues(sets).flatMap(({ items }) => items),
  );
  return itemProgress(allIds, ctx.completed.museum, ctx);
}

function getQuestsProgress(ctx: ProgressContext): CategoryProgress {
  const pregnancyQuestIds = new Set(
    Object.values(trackerData.pregnancyQuestByVillager).filter(
      (id): id is QuestId => id !== undefined,
    ),
  );
  const marriedVillager = getMarriedVillager(ctx.completed.villagerRelationships);
  const isWife = marriedVillager ? marriedVillager in trackerData.pregnancyQuestByVillager : false;
  const activePregnancyQuestId = marriedVillager
    ? trackerData.pregnancyQuestByVillager[marriedVillager]
    : undefined;

  let total = 0;
  let completed = 0;
  for (const questType of recordValues(trackerData.quests)) {
    for (const id of recordKeys(questType)) {
      if (pregnancyQuestIds.has(id)) continue;
      total++;
      if (ctx.completed.questStates[id] === "completed") completed++;
    }
  }

  const cravingCount = getCravingQuestCount(marriedVillager, isWife, activePregnancyQuestId, ctx);
  total += cravingCount.total;
  completed += cravingCount.completed;

  return { completed, filtered: total - completed, total };
}

function getRecipesProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = recordKeys(trackerData.recipes);
  const completed = allIds.filter((id) => ctx.completed.almanacRecipes.has(id)).length;
  return { completed, filtered: allIds.length - completed, total: allIds.length };
}

// ─── All categories ─────────────────────────────────────────────────

function getRenownProgress(ctx: ProgressContext): CategoryProgress {
  const ranks = trackerData.townRanks;
  const total = ranks[ranks.length - 1].levels.end;
  const completed = Math.max(0, Math.min(ctx.completed.renown, total));
  return { completed, filtered: total - completed, total };
}

function getSkillsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of recordKeys(trackerData.skills)) {
    total += MAX_SKILL_LEVEL;
    completed += Math.min(ctx.completed.skillLevels[id] ?? 0, MAX_SKILL_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}

function getVillagersProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of recordKeys(trackerData.villagers)) {
    total += MAX_VILLAGER_LEVEL;
    completed += Math.min(ctx.completed.villagerLevels[id] ?? 0, MAX_VILLAGER_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}

function itemProgress(
  allIds: ItemId[],
  completedSet: Set<ItemId>,
  ctx: ProgressContext,
): CategoryProgress {
  const applicableIds = allIds.filter(
    (id) => completedSet.has(id) || isItemApplicable(id, ctx.completed),
  );
  const incompleteIds = applicableIds.filter((id) => !completedSet.has(id));
  const filtered = filterAvailableItems(
    incompleteIds,
    (id) => trackerData.items[id].sources,
    ctx.worldState,
    ctx.availabilityWindows,
  );
  return {
    completed: applicableIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: applicableIds.length,
  };
}
