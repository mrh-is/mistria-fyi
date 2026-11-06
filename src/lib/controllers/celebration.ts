import { trackingReminders } from "#lib/controllers/tracking-reminders.svelte.js";
import { celebrate, celebrateCategory } from "#lib/effects/celebrate.js";
import { isCategoryComplete } from "#lib/engine/categories.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { CategoryKey } from "#lib/engine/categories.js";

/**
 * Runs a progress action & celebrates only what it finished: the category if it wasn’t complete
 * before, or else any section that wasn’t. A finished category gets the bigger burst alone, so the
 * two never overlap. Undo callbacks call the store directly, so undoing an untick stays quiet.
 * Returns the action's result.
 */
export function celebrateProgress<Result>(
  category: CategoryKey,
  action: () => Result,
  sections: readonly (() => boolean)[] = [],
): Result {
  const categoryWasComplete = isCategoryComplete(category, userState.progressContext);
  const sectionsWereComplete = sections.map((isComplete) => isComplete());
  const result = action();
  if (!categoryWasComplete && isCategoryComplete(category, userState.progressContext)) {
    celebrateCategory();
    void trackingReminders.checkInstall("milestone");
  } else if (sections.some((isComplete, index) => !sectionsWereComplete[index] && isComplete())) {
    celebrate();
    void trackingReminders.checkInstall("milestone");
  }
  return result;
}
