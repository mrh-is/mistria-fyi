import { trackerData } from "$lib/data/index.js";
import { filterAvailableItems } from "$lib/engine/availability.js";
import { recordValues } from "$lib/utils";

import type { CategoryKey } from "$lib/data/categories.js";
import type { AvailabilityMode, CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  ItemId,
  RecipeId,
  Season,
  Weather,
} from "$lib/types/tracker-data.js";

export const MAX_NPC_LEVEL = 10;
export const MAX_SKILL_LEVEL = 60;

// ─── Types ──────────────────────────────────────────────────────────

export type AllProgress = Record<CategoryKey, CategoryProgress>;

export interface CategoryProgress {
  completed: number;
  filtered: number;
  total: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

interface ProgressContext {
  availabilityMode: AvailabilityMode;
  completed: CompletedState;
  worldState: { season: Season; weather: Weather };
}

export function clampRenownLevel(level: number): number {
  const maxLevel = trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;
  return Math.max(0, Math.min(level, maxLevel));
}

// ─── Per-category progress ──────────────────────────────────────────

export function getAllProgress(ctx: ProgressContext): AllProgress {
  return {
    almanac: getAlmanacProgress(ctx),
    animals: getAnimalsProgress(ctx),
    cosmetics: getCosmeticsProgress(ctx),
    mines: getMinesProgress(ctx),
    museum: getMuseumProgress(ctx),
    npcs: getNpcsProgress(ctx),
    quests: getQuestsProgress(ctx),
    recipes: getRecipesProgress(ctx),
    renown: getRenownProgress(ctx),
    skills: getSkillsProgress(ctx),
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
    case "npcs":
      return getNpcsProgress(ctx);
    case "quests":
      return getQuestsProgress(ctx);
    case "recipes":
      return getRecipesProgress(ctx);
    case "renown":
      return getRenownProgress(ctx);
    case "skills":
      return getSkillsProgress(ctx);
  }
}

function getAlmanacProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = recordValues(trackerData.almanac).flatMap(({ items }) => items);
  return itemProgress(allIds, ctx.completed.almanac, ctx);
}

function getAnimalsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  let filtered = 0;
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const cosmeticCount = Object.keys(animal.cosmetics).length;
    total += cosmeticCount;
    completed += ctx.completed.animalCosmetics[animalId].size;
    filtered += cosmeticCount - ctx.completed.animalCosmetics[animalId].size;

    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of Object.entries(tier)) {
        total++;
        if (ctx.completed.animals[animalId].has(variantId as AnimalVariantId)) {
          completed++;
          continue;
        }
        // Apply seasonal filtering for incomplete variants
        switch (ctx.availabilityMode) {
          case "available":
            if (
              variant.source.type === "default" ||
              (variant.source.availability?.type === "season" &&
                !variant.source.availability.seasons.includes(ctx.worldState.season))
            ) {
              filtered++;
            }
            break;
          case "everything":
            filtered++;
            break;
          case "timely":
            // timely: non-seasonal variants are not shown
            if (
              variant.source.type === "breed" &&
              variant.source.availability?.type === "season" &&
              !variant.source.availability.seasons.includes(ctx.worldState.season)
            ) {
              filtered++;
            }
            break;
        }
      }
    }
  }
  return { completed, filtered, total };
}

function getCosmeticsProgress(ctx: ProgressContext): CategoryProgress {
  const total = Object.keys(trackerData.cosmetics).length;
  const completed = ctx.completed.cosmetics.size;
  return { completed, filtered: total - completed, total };
}

function getMinesProgress(ctx: ProgressContext): CategoryProgress {
  const biomes = trackerData.mines.biomes;
  const maxFloor = biomes[biomes.length - 1].floors.end;
  const totalFloors = maxFloor;
  const totalSpells = Object.keys(trackerData.mines.spells).length;
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

function getNpcsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of Object.keys(trackerData.npcs)) {
    total += MAX_NPC_LEVEL;
    completed += Math.min(ctx.completed.npcLevels[id] ?? 0, MAX_NPC_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}

function getQuestsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const questType of Object.values(trackerData.quests)) {
    for (const id of Object.keys(questType)) {
      total++;
      if (ctx.completed.questStates[id] === "completed") completed++;
    }
  }
  return { completed, filtered: total - completed, total };
}

function getRecipesProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = Object.keys(trackerData.recipes) as RecipeId[];
  const completed = allIds.filter((id) => ctx.completed.almanacRecipes.has(id)).length;
  return { completed, filtered: allIds.length - completed, total: allIds.length };
}

function getRenownProgress(ctx: ProgressContext): CategoryProgress {
  const ranks = trackerData.townRanks;
  const total = ranks[ranks.length - 1].levels.end;
  const completed = Math.max(0, Math.min(ctx.completed.renown, total));
  return { completed, filtered: total - completed, total };
}

// ─── All categories ─────────────────────────────────────────────────

function getSkillsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of Object.keys(trackerData.skills)) {
    total += MAX_SKILL_LEVEL;
    completed += Math.min(ctx.completed.skillLevels[id] ?? 0, MAX_SKILL_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}

function itemProgress(
  allIds: ItemId[],
  completedSet: Set<ItemId>,
  ctx: ProgressContext,
): CategoryProgress {
  const incompleteIds = allIds.filter((id) => !completedSet.has(id));
  const filtered = filterAvailableItems(
    incompleteIds,
    (id) => trackerData.items[id].sources ?? [],
    ctx.worldState,
    ctx.availabilityMode,
  );
  return {
    completed: allIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: allIds.length,
  };
}
