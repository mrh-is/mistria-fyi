import { trackerData } from "#lib/data/index.js";
import { getMaxMineFloor } from "#lib/engine/progress.js";
import { addProgress, countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { isNonEmptyArray, recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type { SpellId } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

export interface SpellRow extends ShelfRow {
  id: SpellId;
}

export interface MinesProjection extends CategoryProjection {
  /** The deepest floor reached; each floor up to `maxFloor` is one step. */
  floor: number;
  maxFloor: number;
  spells: SpellRow[];
}

/**
 * Floors up to the next seal are doable, and those past it wait for its quest. A seal above the
 * player's floor counts as broken whatever its quest says, because they got past it. A seal on the
 * player's floor still stops them, since the seal room is the floor itself.
 */
export function mineFloorProgress({
  mineFloor,
  questStates,
}: ProgressContext["progress"]): CategoryProgress {
  const maxFloor = getMaxMineFloor();
  const seal = trackerData.mines.seals.find(
    ({ floor, questId }) => floor >= mineFloor && questStates[questId] !== "completed",
  );
  const reachable = seal?.floor ?? maxFloor;
  return {
    completed: mineFloor,
    completedShown: mineFloor,
    todo: reachable - mineFloor,
    total: maxFloor,
    waiting: maxFloor - reachable,
  };
}

/**
 * What a player would have to do first to record `target`: finish the quest of every unbroken seal
 * between their floor & it. A seal on `target` itself is reachable, since it stops them only there.
 */
export function sealsBefore(
  { mineFloor, questStates }: ProgressContext["progress"],
  target: number,
): undefined | VisibilityCondition {
  const conditions = trackerData.mines.seals
    .filter(
      ({ floor, questId }) =>
        floor >= mineFloor && floor < target && questStates[questId] !== "completed",
    )
    .map(({ questId }): VisibilityCondition => ({ type: "questCompleted", questId }));
  if (!isNonEmptyArray(conditions)) return undefined;
  return conditions.length === 1 ? conditions[0] : { type: "and", conditions };
}

/** Each mine floor & each spell is one step. */
export function projectMines(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): MinesProjection {
  const maxFloor = getMaxMineFloor();
  const spells = recordEntries(trackerData.mines.spells).map(([id, spell]): SpellRow => ({
    ...shelfFacts(spell, ctx.progress.spells.has(id), ctx, options.showsSource),
    id,
  }));
  return {
    floor: ctx.progress.mineFloor,
    maxFloor,
    spells,
    totals: addProgress([mineFloorProgress(ctx.progress), countShelfRows(spells)]),
  };
}
