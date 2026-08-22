import { trackerData } from "$lib/data/index.js";
import { isEntityNameVisible, satisfyCondition } from "$lib/engine/visibility.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { VisibilityCondition } from "$lib/types/visibility.js";

export const SPOILER_NAME = "Spoilered item";

export function createSpoilerGuard() {
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
      if (condition) satisfyCondition(condition, userState.state.completed, trackerData);
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

/**
 * Resolves a display name for toasts and accessible labels: the real name once `visibility` is
 * satisfied by current progression, otherwise a spoiler-safe placeholder. Evaluated at call time
 * (not reactively) since callers use it right after a state mutation to reflect the fresh state.
 */
export function resolveName(name: string, visibility: VisibilityCondition): string {
  return isEntityNameVisible(visibility, userState.progressionState) ? name : SPOILER_NAME;
}
