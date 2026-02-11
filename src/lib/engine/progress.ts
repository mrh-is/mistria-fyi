import { trackerData } from "$lib/data/index.js";
import { filterAvailableItems } from "$lib/engine/availability.js";

import type { AvailabilityMode, CompletedState } from "$lib/stores/user-state.svelte.js";
import type { ItemId, Season, Source, Weather } from "$lib/types/tracker-data.js";

export const MAX_NPC_LEVEL = 8;

// ─── Types ──────────────────────────────────────────────────────────

export interface AllProgress {
  almanac: CategoryProgress;
  animals: CategoryProgress;
  cosmetics: CategoryProgress;
  mines: CategoryProgress;
  museum: CategoryProgress;
  npcs: CategoryProgress;
  quests: CategoryProgress;
  renown: CategoryProgress;
  skills: CategoryProgress;
}

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
    renown: getRenownProgress(ctx),
    skills: getSkillsProgress(ctx),
  };
}

export function getAlmanacProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = Object.keys(trackerData.items) as ItemId[];
  return itemProgress(allIds, ctx.completed.almanac, trackerData.sources, ctx);
}

export function getAnimalsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const [animalId, animal] of Object.entries(trackerData.animals)) {
    const variantCount = Object.keys(animal.variants).length;
    const cosmeticCount = Object.keys(animal.cosmetics).length;
    total += variantCount + cosmeticCount;
    completed += ctx.completed.animals[animalId].size;
    completed += ctx.completed.animalCosmetics[animalId].size;
  }
  // Animals don't have world-state availability filtering
  return { completed, filtered: total - completed, total };
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
  for (const wing of Object.values(trackerData.museum)) {
    for (const set of Object.values(wing.sets)) {
      allIds.push(...set.items);
    }
  }
  return itemProgress(allIds, ctx.completed.museum, trackerData.sources, ctx);
}

export function getNpcsProgress(ctx: ProgressContext): CategoryProgress {
  const total = Object.keys(trackerData.npcs).length;
  let completed = 0;
  for (const [id, _npc] of Object.entries(trackerData.npcs)) {
    if ((ctx.completed.npcLevels[id] ?? 0) >= MAX_NPC_LEVEL) completed++;
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

export function getRenownProgress(ctx: ProgressContext): CategoryProgress {
  const total = trackerData.renown.levelsPerRank * trackerData.renown.ranks.length;
  const completed = ctx.completed.renown;
  return { completed, filtered: total - completed, total };
}

// ─── All categories ─────────────────────────────────────────────────

export function getSkillsProgress(ctx: ProgressContext): CategoryProgress {
  const total = Object.keys(trackerData.skills).length;
  let completed = 0;
  for (const id of Object.keys(trackerData.skills)) {
    if ((ctx.completed.skillLevels[id] ?? 0) >= 60) completed++;
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
