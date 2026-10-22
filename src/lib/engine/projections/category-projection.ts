import { isConditionVisible } from "#lib/engine/visibility.js";

import type { CategoryProgress } from "#lib/engine/progress.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

/**
 * What every category projection returns: its rows in a category-specific shape, plus the progress
 * totals those rows add up to. Progress, search, & pages read the same projection, so they can't
 * disagree about which rows exist or count.
 */
export interface CategoryProjection {
  totals: CategoryProgress;
}

/** Options every projection accepts. Categories may accept more, such as the almanac's filters. */
export interface CategoryProjectionOptions {
  /** Flags rows whose visibility condition is unmet; omitted, no row is spoilered. */
  progressionState?: UserProgressionState;
}

/** A row tracked as one completion step. */
export interface ChecklistRow {
  completed: boolean;
  /** Whether an incomplete row is obtainable in the context's availability windows. */
  inScope: boolean;
  spoilered: boolean;
}

/** Each row is one step; an incomplete row is remaining in scope when its `inScope` holds. */
export function countChecklist(rows: readonly ChecklistRow[]): CategoryProgress {
  let completed = 0;
  let remainingInScope = 0;
  for (const row of rows) {
    if (row.completed) completed++;
    else if (row.inScope) remainingInScope++;
  }
  return { completed, remainingInScope, total: rows.length };
}

/** Whether an entity's visibility condition hides it from the given progression. */
export function isSpoilered(
  visibility: undefined | VisibilityCondition,
  progressionState: undefined | UserProgressionState,
): boolean {
  return progressionState !== undefined && !isConditionVisible(visibility, progressionState);
}
