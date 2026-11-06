import { trackerData } from "#lib/data/index.js";
import {
  isRelationshipSettled,
  isVillagerComplete,
  MAX_HEART_LEVEL,
} from "#lib/engine/progress.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { addProgress, alwaysToDo } from "#lib/engine/shelves.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
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
  /** The player hasn't met this Villager yet, whatever "Show spoilers" reveals. */
  locked: boolean;
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
    locked: !isConditionVisible(villager.visibility, ctx.progressionState),
    settled: isRelationshipSettled(id, ctx.progress),
    spoilered: isSpoilered(villager.visibility, options.progressionState),
  }));
  const totals = addProgress(
    rows.map((row) => {
      const total = MAX_HEART_LEVEL + (row.dateable ? 1 : 0);
      const completed = row.hearts + (row.dateable && row.settled ? 1 : 0);
      const steps = alwaysToDo(completed, total);
      // Nobody can raise hearts with a Villager they haven't met.
      return row.locked ? { ...steps, todo: 0, waiting: steps.todo } : steps;
    }),
  );
  return { rows, totals };
}
