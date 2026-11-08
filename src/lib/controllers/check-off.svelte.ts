import { celebrateProgress } from "#lib/controllers/celebration.js";
import { createLeavingSet } from "#lib/controllers/leaving-set.svelte.js";
import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import { showUndoToast } from "#lib/effects/undo-toast.js";

import type { LeavingSet } from "#lib/controllers/leaving-set.svelte.js";
import type { SectionGrouping } from "#lib/controllers/section-grouping.svelte.js";
import type { SpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import type { CategoryKey } from "#lib/engine/categories.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

/** What a tracker row hands the check-off controller when the player toggles it. */
export interface CheckOffRequest<Id, SectionKey> {
  id: Id;
  /** The row’s display name, for the undo toast and the spoiler dialog. */
  name: string;
  /** Sections to celebrate if this check-off finishes them. */
  sectionChecks?: readonly (() => boolean)[];
  /** The section that stays open while the row leaves its shelf. */
  sectionKey: SectionKey;
  /** Whether the row is still behind a spoiler cover. */
  spoilered: boolean;
  visibility: undefined | VisibilityCondition;
}

export interface CheckOff<Id, SectionKey> {
  readonly guard: SpoilerGuard;
  readonly leaving: LeavingSet<Id>;
  /** Handle a row's toggle: guard it if spoilered, else toggle, celebrate, offer undo, & leave. */
  onToggle: (request: CheckOffRequest<Id, SectionKey>, covered: boolean) => void;
}

interface CheckOffOptions<Id, SectionKey> {
  category: CategoryKey;
  grouping: Pick<SectionGrouping<SectionKey>, "hold">;
  isCompleted: (id: Id) => boolean;
  toggle: (id: Id) => void;
}

/**
 * Owns the wiring every tracker-row page repeats: the spoiler guard, the leaving animation, & the
 * check-off sequence (hold the section, celebrate, toast with undo). Call it during component setup.
 */
export function createCheckOff<Id, SectionKey>(
  options: CheckOffOptions<Id, SectionKey>,
): CheckOff<Id, SectionKey> {
  const guard = createSpoilerGuard();
  const leaving = createLeavingSet<Id>();

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
    if (completed) leaving.markLeaving(id);
  }

  return {
    guard,
    leaving,
    onToggle(request, covered): void {
      if (!request.spoilered || options.isCompleted(request.id)) {
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
  };
}
