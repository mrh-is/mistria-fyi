import { trackerData } from "#lib/data/index.js";
import { planConditionMutations } from "#lib/engine/visibility.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { VisibilityCondition } from "#lib/types/visibility.js";

export interface SpoilerGuard {
  cancel: () => void;
  complete: () => void;
  completeAndUpdate: () => void;
  readonly condition: null | VisibilityCondition;
  guard: (forCondition: undefined | VisibilityCondition, action: () => void) => void;
  open: boolean;
}

export function createSpoilerGuard(): SpoilerGuard {
  let open = $state(false);
  let condition = $state<null | VisibilityCondition>(null);
  let pendingAction: (() => void) | null = null;

  return {
    cancel(): void {
      open = false;
      condition = null;
      pendingAction = null;
    },
    complete(): void {
      pendingAction?.();
      open = false;
      condition = null;
      pendingAction = null;
    },
    completeAndUpdate(): void {
      if (condition) {
        for (const mutation of planConditionMutations(
          condition,
          userState.state.completed,
          trackerData,
        )) {
          switch (mutation.type) {
            case "hasUpperFloor":
              userState.setHasUpperFloor(true);
              break;
            case "heartLevel":
              userState.setVillagerLevel(mutation.villagerId, mutation.level);
              break;
            case "married":
              userState.setVillagerRelationship(mutation.villagerId, "married");
              break;
            case "minesLevel":
              userState.setMineFloor(mutation.floor);
              break;
            case "perkUnlocked":
              if (!userState.state.completed.unlockedPerks.has(mutation.perkId)) {
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
      }
      pendingAction?.();
      open = false;
      condition = null;
      pendingAction = null;
    },
    get condition(): null | VisibilityCondition {
      return condition;
    },
    guard(forCondition: undefined | VisibilityCondition, action: () => void): void {
      condition = forCondition ?? null;
      pendingAction = action;
      open = true;
    },
    get open(): boolean {
      return open;
    },
    set open(value: boolean) {
      open = value;
    },
  };
}
