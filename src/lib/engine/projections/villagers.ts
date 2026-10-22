import { trackerData } from "#lib/data/index.js";
import {
  isRelationshipSettled,
  isVillagerComplete,
  MAX_HEART_LEVEL,
} from "#lib/engine/progress.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { VillagerId } from "#lib/types/tracker-data.js";

export interface VillagerRow {
  completed: boolean;
  dateable: boolean;
  /** Heart level, capped at `MAX_HEART_LEVEL`. */
  hearts: number;
  id: VillagerId;
  settled: boolean;
  spoilered: boolean;
}

export interface VillagersProjection extends CategoryProjection {
  rows: VillagerRow[];
}

/**
 * Each Villager contributes their heart levels; a dateable Villager also contributes one step for
 * a settled relationship, so the category reaches 100% exactly when every Villager is complete.
 */
export function projectVillagers(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): VillagersProjection {
  const rows = recordEntries(trackerData.villagers).map(([id, villager]): VillagerRow => ({
    completed: isVillagerComplete(id, ctx.progress),
    dateable: villager.dateable === true,
    hearts: Math.min(ctx.progress.heartLevels[id] ?? 0, MAX_HEART_LEVEL),
    id,
    settled: isRelationshipSettled(id, ctx.progress),
    spoilered: isSpoilered(villager.visibility, options.progressionState),
  }));
  let total = 0;
  let completed = 0;
  for (const row of rows) {
    total += MAX_HEART_LEVEL;
    completed += row.hearts;
    if (!row.dateable) continue;
    total++;
    if (row.settled) completed++;
  }
  const totals: CategoryProgress = { completed, remainingInScope: total - completed, total };
  return { rows, totals };
}
