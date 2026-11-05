import { trackerData } from "#lib/data/index.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { recordKeys } from "#lib/utils/record.js";

import type { ProgressState } from "#lib/types/user-progress.js";

/**
 * An empty `ProgressState`, shaped like a fresh store's: every animal has its (empty) variant &
 * cosmetic sets. Pass overrides for the fields a test cares about.
 */
export function makeCompletedState(overrides: Partial<ProgressState> = {}): ProgressState {
  return { ...createDefaultProgress(Set, recordKeys(trackerData.animals)), ...overrides };
}
