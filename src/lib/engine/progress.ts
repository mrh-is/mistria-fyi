import { trackerData } from "$lib/data/index.js";
import { isItemApplicable, isItemApplicableForAlmanac } from "$lib/engine/applicability.js";
import { filterAvailableItems, isItemAvailable } from "$lib/engine/availability.js";
import { getMarriedNpc } from "$lib/engine/relationships.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils";

import type { CategoryKey } from "$lib/data/categories.js";
import type { AvailabilityMode, CompletedState } from "$lib/stores/user-state.svelte.js";
import type { Source } from "$lib/types/acquisition.js";
import type { ItemId, NpcId, QuestId, Season, Weather } from "$lib/types/tracker-data.js";

export const MAX_NPC_LEVEL = 10;
export const MAX_SKILL_LEVEL = 60;

export type AllProgress = Record<CategoryKey, CategoryProgress>;

// ─── Types ──────────────────────────────────────────────────────────

export interface CategoryProgress {
  completed: number;
  filtered: number;
  total: number;
}

interface ProgressContext {
  availabilityMode: AvailabilityMode;
  completed: CompletedState;
  worldState: { season: Season; weather: Weather };
}

// ─── Helpers ────────────────────────────────────────────────────────

export function clampRenownLevel(level: number): number {
  const maxLevel = trackerData.townRanks[trackerData.townRanks.length - 1].levels.end;
  return Math.max(0, Math.min(level, maxLevel));
}

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

// ─── Per-category progress ──────────────────────────────────────────

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

export function isNpcComplete(npcId: NpcId, completed: CompletedState): boolean {
  const npc = trackerData.npcs[npcId];
  const level = completed.npcLevels[npcId] ?? 0;
  if (level < MAX_NPC_LEVEL) return false;

  if (!npc.dateable) return true;

  const relationship = completed.npcRelationships[npcId] ?? "undecided";
  if (relationship === "platonic") return true;
  if (relationship === "married") return completed.childChoice !== "undeclared";

  return false;
}

function aggregateEntrySources(canonicalId: ItemId): Source[] {
  const almanacEntry = recordValues(trackerData.almanac)
    .flatMap(({ items }) => items)
    .find((entry) => entry.itemIds[0] === canonicalId);
  if (!almanacEntry) return trackerData.items[canonicalId].sources;
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const id of almanacEntry.itemIds) {
    const item = trackerData.items[id];
    for (const source of item.sources) {
      const key = JSON.stringify(source);
      if (!seen.has(key)) {
        seen.add(key);
        sources.push(source);
      }
    }
  }
  return sources;
}

function almanacEntryProgress(
  canonicalIds: ItemId[],
  completedSet: Set<ItemId>,
  ctx: ProgressContext,
): CategoryProgress {
  const applicableIds = canonicalIds.filter((id) => {
    if (completedSet.has(id)) return true;
    const entry = recordValues(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find((e) => e.itemIds[0] === id);
    if (!entry) return isItemApplicable(id, ctx.completed);
    return isItemApplicableForAlmanac(entry.itemIds, ctx.completed);
  });

  const incompleteIds = applicableIds.filter((id) => !completedSet.has(id));
  const filtered =
    ctx.availabilityMode === "everything"
      ? incompleteIds
      : incompleteIds.filter((id) =>
          isItemAvailable(aggregateEntrySources(id), ctx.worldState, ctx.availabilityMode),
        );
  return {
    completed: applicableIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: applicableIds.length,
  };
}

function getAlmanacProgress(ctx: ProgressContext): CategoryProgress {
  const allCanonicalIds = recordValues(trackerData.almanac).flatMap(({ items }) =>
    items.map((entry) => entry.itemIds[0]),
  );
  return almanacEntryProgress(allCanonicalIds, ctx.completed.almanac, ctx);
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
  marriedNpc: NpcId | null,
  isWife: boolean,
  activePregnancyQuestId: QuestId | undefined,
  ctx: ProgressContext,
): { completed: number; total: number } {
  if (!marriedNpc) {
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

function getNpcsProgress(ctx: ProgressContext): CategoryProgress {
  let total = 0;
  let completed = 0;
  for (const id of recordKeys(trackerData.npcs)) {
    total += MAX_NPC_LEVEL;
    completed += Math.min(ctx.completed.npcLevels[id] ?? 0, MAX_NPC_LEVEL);
  }
  const dateCount = recordKeys(trackerData.dates).length;
  total += dateCount;
  completed += ctx.completed.dates.size;
  return { completed, filtered: total - completed, total };
}

function getQuestsProgress(ctx: ProgressContext): CategoryProgress {
  const pregnancyQuestIds = new Set(
    Object.values(trackerData.pregnancyQuestByNpc).filter((id): id is QuestId => id !== undefined),
  );
  const marriedNpc = getMarriedNpc(ctx.completed.npcRelationships);
  const isWife = marriedNpc ? marriedNpc in trackerData.pregnancyQuestByNpc : false;
  const activePregnancyQuestId = marriedNpc
    ? trackerData.pregnancyQuestByNpc[marriedNpc]
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

  const cravingCount = getCravingQuestCount(marriedNpc, isWife, activePregnancyQuestId, ctx);
  total += cravingCount.total;
  completed += cravingCount.completed;

  return { completed, filtered: total - completed, total };
}

// ─── All categories ─────────────────────────────────────────────────

function getRecipesProgress(ctx: ProgressContext): CategoryProgress {
  const allIds = recordKeys(trackerData.recipes);
  const completed = allIds.filter((id) => ctx.completed.almanacRecipes.has(id)).length;
  return { completed, filtered: allIds.length - completed, total: allIds.length };
}

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
    ctx.availabilityMode,
  );
  return {
    completed: applicableIds.length - incompleteIds.length,
    filtered: filtered.length,
    total: applicableIds.length,
  };
}
