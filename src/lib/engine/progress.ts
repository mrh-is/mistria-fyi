import { trackerData } from "$lib/data/index.js";
import { filterAvailableItems } from "$lib/engine/availability.js";

import type { CategoryKey } from "$lib/data/categories.js";
import type { AvailabilityMode, CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  ItemId,
  RecipeId,
  Season,
  Source,
  VariantId,
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

export function getAlmanacProgress(ctx: ProgressContext): CategoryProgress {
  const allIds: ItemId[] = [];
  for (const cat of trackerData.almanac) {
    allIds.push(...(Object.keys(cat.items) as ItemId[]));
  }
  return itemProgress(allIds, ctx.completed.almanac, trackerData.sources, ctx);
}

export function getAnimalsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  let filtered = 0;
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const cosmeticCount = Object.keys(animal.cosmetics).length;
    total += cosmeticCount;
    completed += ctx.completed.animalCosmetics[animalId].size;
    filtered += cosmeticCount - ctx.completed.animalCosmetics[animalId].size;

    for (const [vid, variant] of Object.entries(animal.variants)) {
      total++;
      if (ctx.completed.animals[animalId].has(vid as VariantId)) {
        completed++;
        continue;
      }
      // Apply seasonal filtering for incomplete variants
      if (ctx.availabilityMode === "timely") {
        if (variant.bornIn && variant.bornIn === ctx.worldState.season) {
          filtered++;
        }
        // timely: non-seasonal variants are not shown
      } else if (ctx.availabilityMode === "available") {
        if (variant.bornIn && variant.bornIn !== ctx.worldState.season) {
          // out-of-season variant hidden
        } else {
          filtered++;
        }
      } else {
        filtered++;
      }
    }
  }
  return { completed, filtered, total };
}

export function getCosmeticsProgress(ctx: ProgressContext): CategoryProgress {
  const total = Object.keys(trackerData.cosmetics).length;
  const completed = ctx.completed.cosmetics.size;
  return { completed, filtered: total - completed, total };
}

export function getMinesProgress(ctx: ProgressContext): CategoryProgress {
  const totalFloors = trackerData.mines.maxFloors;
  const totalSpells = Object.keys(trackerData.mines.spells).length;
  const total = totalFloors + totalSpells;
  const completed = ctx.completed.mines.floor + ctx.completed.mines.spells.size;
  return { completed, filtered: total - completed, total };
}

export function getMuseumProgress(ctx: ProgressContext): CategoryProgress {
  const allIds: ItemId[] = [];
  for (const wing of trackerData.museum) {
    for (const set of wing.sets) {
      allIds.push(...set.items);
    }
  }
  return itemProgress(allIds, ctx.completed.museum, trackerData.sources, ctx);
}

export function getNpcsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of Object.keys(trackerData.npcs)) {
    total += MAX_NPC_LEVEL;
    completed += Math.min(ctx.completed.npcLevels[id] ?? 0, MAX_NPC_LEVEL);
  }
  return { completed, filtered: total - completed, total };
}

export function getQuestsProgress(ctx: ProgressContext): CategoryProgress {
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

export function getRecipesProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = Object.keys(trackerData.recipes) as RecipeId[];
  const completed = allIds.filter((id) => ctx.completed.almanacRecipes.has(id)).length;
  return { completed, filtered: allIds.length - completed, total: allIds.length };
}

export function getRenownProgress(ctx: ProgressContext): CategoryProgress {
  const total = trackerData.renown.levelsPerRank * trackerData.renown.ranks.length;
  const completed = ctx.completed.renown;
  return { completed, filtered: total - completed, total };
}

// ─── All categories ─────────────────────────────────────────────────

export function getSkillsProgress(ctx: ProgressContext): CategoryProgress {
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
  sourcesMap: Partial<Record<ItemId, Source[]>>,
  ctx: ProgressContext,
): CategoryProgress {
  const incompleteIds = allIds.filter((id) => !completedSet.has(id));
  const filtered = filterAvailableItems(
    incompleteIds,
    sourcesMap,
    ctx.worldState,
    ctx.availabilityMode,
  );
  return {
    completed: allIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: allIds.length,
  };
}
