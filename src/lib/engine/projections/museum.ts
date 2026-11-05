import { trackerData } from "#lib/data/index.js";
import { isItemObtainable } from "#lib/engine/applicability.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type { ItemId, MuseumWingId, MuseumWingSetId } from "#lib/types/tracker-data.js";

export interface MuseumRow extends ShelfRow {
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
        const facts = shelfFacts(item, ctx.progress.museum.has(id), ctx, options.showsSource);
        const obtainable = isItemObtainable(id, ctx.progress);
        rows.push({
          ...facts,
          doable: facts.doable && obtainable,
          doableAnywhere: facts.doableAnywhere && obtainable,
          id,
          obtainable,
          setId,
          spoilered: isSpoilered(item.visibility, options.progressionState),
          wingId,
        });
      }
    }
  }
  const totals = countShelfRows(rows.filter((row) => row.obtainable));
  return { rows, totals };
}
