import { isConditionVisible } from "#lib/engine/visibility.js";

import type { ShowsSource } from "#lib/engine/availability.js";
import type { CategoryProgress } from "#lib/engine/progress.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
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
  /** A page's source type filters; omitted, every source shows. */
  showsSource?: ShowsSource;
}

/** A row tracked as one completion step. */
export interface ChecklistRow extends ShelfRow {
  spoilered: boolean;
}

/** Whether an entity's visibility condition hides it from the given progression. */
export function isSpoilered(
  visibility: undefined | VisibilityCondition,
  progressionState: undefined | UserProgressionState,
): boolean {
  return progressionState !== undefined && !isConditionVisible(visibility, progressionState);
}
