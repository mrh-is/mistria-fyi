import { trackerData } from "#lib/data/index.js";
import { planConditionMutations } from "#lib/engine/visibility.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { VisibilityCondition } from "#lib/types/visibility.js";

/**
 * What the dialog is asking about: a revealed item by name, or a mine floor past an unbroken seal.
 * Absent means an item whose name is still behind its spoiler cover.
 */
export type GuardSubject = { floor: number } | { name: string };

export interface SpoilerGuard {
  cancel: () => void;
  readonly condition: null | VisibilityCondition;
  open: boolean;
  /** Run the pending action without changing progress. */
  proceed: () => void;
  /** Satisfy the pending condition in the user's progress, then run the pending action. */
  proceedAndRecordPrerequisites: () => void;
  /** Hold `action` and open the confirmation dialog for `forCondition`, about `subject`. */
  requestGuardedAction: (
    forCondition: undefined | VisibilityCondition,
    action: () => void,
    subject?: GuardSubject,
  ) => void;
  /** What the pending dialog asks about, or `undefined` for a covered item. */
  readonly subject: GuardSubject | undefined;
}

export function createSpoilerGuard(): SpoilerGuard {
  let open = $state(false);
  let condition = $state<null | VisibilityCondition>(null);
  // Kept after the dialog closes, so its wording doesn't change during the closing animation.
  let subject = $state<GuardSubject>();
  let pendingAction: (() => void) | null = null;

  return {
    cancel(): void {
      open = false;
      condition = null;
      pendingAction = null;
    },
    get condition(): null | VisibilityCondition {
      return condition;
    },
    get open(): boolean {
      return open;
    },
    set open(value: boolean) {
      open = value;
    },
    proceed(): void {
      pendingAction?.();
      open = false;
      condition = null;
      pendingAction = null;
    },
    proceedAndRecordPrerequisites(): void {
      if (condition) {
        const mutations = planConditionMutations(condition, userState.state.progress, trackerData);
        // The player asked for the prerequisites, not each fact, so every change is `inferred`.
        userState.recordInferred(() => {
          for (const mutation of mutations) {
            switch (mutation.type) {
              case "hasUpperFloor":
                userState.setHasUpperFloor(true);
                break;
              case "heartLevel":
                userState.setHeartLevel(mutation.villagerId, mutation.level);
                break;
              case "married":
                userState.setVillagerRelationship(mutation.villagerId, "married");
                break;
              case "mineFloor":
                userState.setMineFloor(mutation.floor);
                break;
              case "perkUnlocked":
                if (!userState.state.progress.unlockedPerks.has(mutation.perkId)) {
                  userState.togglePerk(mutation.perkId);
                }
                break;
              case "questCompleted":
                userState.setQuestState(mutation.questId, "completed");
                break;
              case "reachedSeason":
                userState.setReachedSeason(mutation.season);
                break;
              case "renownLevel":
                userState.setRenown(mutation.level);
                break;
              case "skillLevel":
                userState.setSkillLevel(mutation.skillId, mutation.level);
                break;
            }
          }
        });
      }
      pendingAction?.();
      open = false;
      condition = null;
      pendingAction = null;
    },
    requestGuardedAction(
      forCondition: undefined | VisibilityCondition,
      action: () => void,
      forSubject?: GuardSubject,
    ): void {
      condition = forCondition ?? null;
      subject = forSubject;
      pendingAction = action;
      open = true;
    },
    get subject(): GuardSubject | undefined {
      return subject;
    },
  };
}
