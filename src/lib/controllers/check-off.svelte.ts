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

interface RowCheckOffAction<Id, Result> {
  category: CategoryKey;
  covered: boolean;
  finish: (result: Result) => boolean;
  hold: () => readonly (() => boolean)[] | undefined;
  id: Id;
  name: string;
  needsGuard: boolean;
  toggle: () => Result;
  visibility: undefined | VisibilityCondition;
}

interface RowCheckOff<Id> {
  guard: SpoilerGuard;
  isLeaving: (id: Id) => boolean;
  run: <Result>(action: RowCheckOffAction<Id, Result>) => void;
}

/** Shared interaction for rows whose progress actions have different undo results. */
export function createRowCheckOff<Id>(
  guard = createSpoilerGuard(),
  animateLeaving = true,
): RowCheckOff<Id> {
  const leaving = createLeavingSet<Id>();
  return {
    guard,
    isLeaving: (id): boolean => leaving.has(id),
    run<Result>({
      category,
      covered,
      finish,
      hold,
      id,
      name,
      needsGuard,
      toggle,
      visibility,
    }: RowCheckOffAction<Id, Result>): void {
      const perform = () => {
        const sectionChecks = hold();
        const completed = finish(celebrateProgress(category, toggle, sectionChecks));
        if (completed && animateLeaving) leaving.markLeaving(id);
      };
      if (needsGuard) {
        guard.requestGuardedAction(visibility, perform, covered ? undefined : { name });
      } else {
        perform();
      }
    },
  };
}

export function createCheckOff<Id, SectionKey>(
  options: CheckOffOptions<Id, SectionKey>,
): CheckOff<Id, SectionKey> {
  const checkOff = createRowCheckOff<Id>(options.guard, options.animateLeaving);
  return {
    guard: checkOff.guard,
    isLeaving: checkOff.isLeaving,
    onToggle(request, covered): void {
      const { id, name, sectionChecks, sectionKey, visibility } = request;
      checkOff.run({
        category: options.category,
        covered,
        finish: () => {
          const completed = options.isCompleted(id);
          showUndoToast(name, completed, () => {
            options.toggle(id);
          });
          return completed;
        },
        hold: () => {
          options.grouping.hold(sectionKey);
          return sectionChecks;
        },
        id,
        name,
        needsGuard: isSpoilered(visibility) && !options.isCompleted(id),
        toggle: () => {
          options.toggle(id);
        },
        visibility,
      });
    },
    rowDisplay: (id, visibility) =>
      trackerRowDisplay({
        completed: options.isCompleted(id),
        leaving: checkOff.isLeaving(id),
        spoilered: isSpoilered(visibility),
      }),
  };
}
