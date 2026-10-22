import { getMaxRenownLevel } from "#lib/engine/progress.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { CategoryProjection } from "#lib/engine/projections/category-projection.js";

export interface RenownProjection extends CategoryProjection {
  /** Renown level, clamped to `[0, maxLevel]`. */
  level: number;
  maxLevel: number;
}

/** Each renown level is one step. */
export function projectRenown(ctx: ProgressContext): RenownProjection {
  const maxLevel = getMaxRenownLevel();
  const level = Math.max(0, Math.min(ctx.progress.renown, maxLevel));
  return {
    level,
    maxLevel,
    totals: { completed: level, remainingInScope: maxLevel - level, total: maxLevel },
  };
}
