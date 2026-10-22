import { trackerData } from "#lib/data/index.js";
import { getMaxMineFloor } from "#lib/engine/progress.js";
import { recordKeys } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { CategoryProjection } from "#lib/engine/projections/category-projection.js";
import type { SpellId } from "#lib/types/tracker-data.js";

export interface SpellRow {
  completed: boolean;
  id: SpellId;
}

export interface MinesProjection extends CategoryProjection {
  /** The deepest floor reached; each floor up to `maxFloor` is one step. */
  floor: number;
  maxFloor: number;
  spells: SpellRow[];
}

/** Each mine floor & each spell is one step. */
export function projectMines(ctx: ProgressContext): MinesProjection {
  const maxFloor = getMaxMineFloor();
  const spells = recordKeys(trackerData.mines.spells).map((id): SpellRow => ({
    completed: ctx.progress.spells.has(id),
    id,
  }));
  const total = maxFloor + spells.length;
  const completed = ctx.progress.mineFloor + spells.filter((spell) => spell.completed).length;
  return {
    floor: ctx.progress.mineFloor,
    maxFloor,
    spells,
    totals: { completed, remainingInScope: total - completed, total },
  };
}
