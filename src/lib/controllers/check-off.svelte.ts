import { celebrateProgress } from "#lib/controllers/celebration.js";
import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import { showUndoToast } from "#lib/effects/undo-toast.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { trackerRowDisplay } from "#lib/utils/row-display.js";

import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
import type { SpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import type { CategoryKey } from "#lib/engine/categories.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";
import type { TrackerRowDisplay } from "#lib/utils/row-display.js";

/** What a tracker row hands the check-off controller when the player toggles it. */
export interface CheckOffRequest<Id, SectionKey> {
  id: Id;
  /** The row’s display name, for the undo toast and the spoiler dialog. */
  name: string;
  /** Sections to celebrate if this check-off finishes them. */
  sectionChecks?: readonly (() => boolean)[];
  /** The section that stays open while the row leaves its shelf. */
  sectionKey: SectionKey;
  /** What reveals the row. The controller derives whether it’s still spoilered from this. */
  visibility: undefined | VisibilityCondition;
}

export interface CheckOff<Id, SectionKey> {
  readonly guard: SpoilerGuard;
  /** Whether `id` just completed & is still playing its leave animation. */
  isLeaving: (id: Id) => boolean;
  /** Handle a row's toggle: guard it if spoilered, else toggle, celebrate, offer undo, & leave. */
  onToggle: (request: CheckOffRequest<Id, SectionKey>, covered: boolean) => void;
  /** How the row for `id` presents itself, given what reveals it. */
  rowDisplay: (id: Id, visibility: undefined | VisibilityCondition) => TrackerRowDisplay;
}

interface CheckOffOptions<Id, SectionKey> {
  /**
   * Play the leave animation when a check-off completes a row. Defaults to true; a page whose rows
   * don’t animate out of their shelf turns it off.
   */
  animateLeaving?: boolean;
  category: CategoryKey;
  grouping: Pick<SectionGrouping<SectionKey>, "hold">;
  /** A guard the page also uses for other prompts, such as mines’ floor seals. */
  guard?: SpoilerGuard;
  isCompleted: (id: Id) => boolean;
  toggle: (id: Id) => void;
}

function isSpoilered(visibility: undefined | VisibilityCondition): boolean {
  return !isConditionVisible(visibility, userState.progressionState);
}

/**
 * Owns the wiring every tracker-row page repeats: the spoiler guard, the leaving animation, & the
 * check-off sequence (hold the section, celebrate, toast with undo). Call it during component setup.
 */
export function createCheckOff<Id, SectionKey>(
  options: CheckOffOptions<Id, SectionKey>,
): CheckOff<Id, SectionKey> {
  const guard = options.guard ?? createSpoilerGuard();
  const leaving = createLeavingSet<Id>();
  const animateLeaving = options.animateLeaving ?? true;

  function checkOff({
    id,
    name,
    sectionChecks,
    sectionKey,
  }: CheckOffRequest<Id, SectionKey>): void {
    options.grouping.hold(sectionKey);
    celebrateProgress(
      options.category,
      () => {
        options.toggle(id);
      },
      sectionChecks,
    );
    const completed = options.isCompleted(id);
    showUndoToast(name, completed, () => {
      options.toggle(id);
    });
    if (completed && animateLeaving) leaving.markLeaving(id);
  }

  return {
    guard,
    isLeaving: (id) => leaving.has(id),
    onToggle(request, covered): void {
      if (!isSpoilered(request.visibility) || options.isCompleted(request.id)) {
        checkOff(request);
      } else {
        guard.requestGuardedAction(
          request.visibility,
          () => {
            checkOff(request);
          },
          covered ? undefined : { name: request.name },
        );
      }
    },
    rowDisplay: (id, visibility) =>
      trackerRowDisplay({
        completed: options.isCompleted(id),
        leaving: leaving.has(id),
        spoilered: isSpoilered(visibility),
      }),
  };
}
