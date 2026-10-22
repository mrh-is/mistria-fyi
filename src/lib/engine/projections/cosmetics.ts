import { trackerData } from "#lib/data/index.js";
import { countChecklist, isSpoilered } from "#lib/engine/projections/category-projection.js";
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

/** Every cosmetic is one step, in scope until collected. */
export function projectCosmetics(
  ctx: ProgressContext,
  options: CategoryProjectionOptions = {},
): CosmeticsProjection {
  const rows = recordEntries(trackerData.cosmetics).map(([id, cosmetic]): CosmeticRow => ({
    completed: ctx.progress.cosmetics.has(id),
    id,
    inScope: true,
    spoilered: isSpoilered(cosmetic.visibility, options.progressionState),
  }));
  return { rows, totals: countChecklist(rows) };
}
