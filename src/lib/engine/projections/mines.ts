import { trackerData } from "#lib/data/index.js";
import { getMaxMineFloor } from "#lib/engine/progress.js";
import { addProgress, countShelfRows, emptyProgress, shelfFacts } from "#lib/engine/shelves.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type { SpellId } from "#lib/types/tracker-data.js";

export interface SpellRow extends ShelfRow {
  id: SpellId;
}

export interface MinesProjection extends CategoryProjection {
  /** The deepest floor reached; each floor up to `maxFloor` is one step. */
  floor: number;
  maxFloor: number;
  spells: SpellRow[];
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
  const floor = ctx.progress.mineFloor;
  // Every unreached floor is doable until #503 says where a seal stops the player.
  const floors = {
    ...emptyProgress(),
    completed: floor,
    completedShown: floor,
    todo: maxFloor - floor,
    total: maxFloor,
  };
  return { floor, maxFloor, spells, totals: addProgress([floors, countShelfRows(spells)]) };
}
