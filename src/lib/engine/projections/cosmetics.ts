import { trackerData } from "#lib/data/index.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { recordEntries } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
  ChecklistRow,
} from "#lib/engine/projections/category-projection.js";
import type { CosmeticId } from "#lib/types/tracker-data.js";

export interface CosmeticRow extends ChecklistRow {
  id: CosmeticId;
}

export interface CosmeticsProjection extends CategoryProjection {
  rows: CosmeticRow[];
}

/** Every cosmetic is one step. */
export function projectCosmetics(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): CosmeticsProjection {
  const rows = recordEntries(trackerData.cosmetics).map(([id, cosmetic]): CosmeticRow => ({
    ...shelfFacts(cosmetic, ctx.progress.cosmetics.has(id), ctx, options.showsSource),
    id,
    spoilered: isSpoilered(cosmetic.visibility, options.progressionState),
  }));
  return { rows, totals: countShelfRows(rows) };
}
