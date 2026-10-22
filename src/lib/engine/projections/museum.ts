import { trackerData } from "#lib/data/index.js";
import { isItemObtainable } from "#lib/engine/applicability.js";
import { isItemAvailable } from "#lib/engine/availability.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { ItemId, MuseumWingId, MuseumWingSetId } from "#lib/types/tracker-data.js";

export interface MuseumRow {
  /** Whether the item is obtainable in the context's availability windows. */
  available: boolean;
  completed: boolean;
  id: ItemId;
  /** Unobtainable items, such as a declined spouse's gifts, don't count; donated ones always do. */
  obtainable: boolean;
  setId: MuseumWingSetId;
  spoilered: boolean;
  wingId: MuseumWingId;
}

export interface MuseumProjection extends CategoryProjection {
  /** One row per set membership, in wing & set order. */
  rows: MuseumRow[];
}

/** Museum rows use raw item IDs; their completion is the museum's own, independent of the almanac. */
export function projectMuseum(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): MuseumProjection {
  const rows: MuseumRow[] = [];
  for (const [wingId, wing] of recordEntries(trackerData.museum)) {
    for (const [setId, set] of recordEntries(wing.sets)) {
      for (const id of set.items) {
        const item = trackerData.items[id];
        rows.push({
          available: isItemAvailable(item.sources, ctx.worldState, ctx.availabilityWindows),
          completed: ctx.progress.museum.has(id),
          id,
          obtainable: isItemObtainable(id, ctx.progress),
          setId,
          spoilered: isSpoilered(item.visibility, options.progressionState),
          wingId,
        });
      }
    }
  }
  const totals: CategoryProgress = { completed: 0, remainingInScope: 0, total: 0 };
  for (const row of rows) {
    if (!row.obtainable) continue;
    totals.total++;
    if (row.completed) totals.completed++;
    else if (row.available) totals.remainingInScope++;
  }
  return { rows, totals };
}
