import { toast } from "svelte-sonner";

import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import * as m from "#lib/ui-messages/messages.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { RecipeId } from "#lib/types/tracker-data.js";
import type { QuestState } from "#lib/types/user-progress.js";

/** How many toasts the toaster shows at once; Sonner hides any beyond it until one closes. */
export const VISIBLE_TOASTS = 3;

/**
 * The visible undo toasts, oldest first, keyed by the name they undo. An undo replays a toggle or
 * restores a snapshot, so an older toast for the same thing would undo the wrong change: a new toast
 * for a name replaces that name's toast instead of stacking beside it.
 */
const undoToasts = new Map<string, number | string>();

/** The toast copy for a quest toggle that landed on `state`, unlocking `newlyAdded` recipes. */
export function questToastMessage(
  name: string,
  state: QuestState,
  newlyAdded: readonly RecipeId[],
  locale: LocaleCode,
): string {
  if (state === "obtained") return m.quest_marked_obtained({ name }, { locale });
  if (state === "none") return m.quest_reset({ name }, { locale });
  if (newlyAdded.length === 1) {
    const [recipe] = recipeDisplayNames([...newlyAdded], locale);
    return m.quest_marked_completed_with_recipe({ name, recipe }, { locale });
  }
  if (newlyAdded.length > 1) {
    return m.quest_marked_completed_with_recipes({ count: newlyAdded.length, name }, { locale });
  }
  return m.quest_marked_completed({ name }, { locale });
}

/**
 * Show the undo toast for a quest toggle. It shares the check-off toast's slot, so it replaces
 * whichever undo toast is visible.
 */
export function showQuestToast(
  name: string,
  state: QuestState,
  newlyAdded: readonly RecipeId[],
  locale: LocaleCode,
  onUndo: () => void,
): void {
  showStackedUndoToast(`quest:${name}`, questToastMessage(name, state, newlyAdded, locale), onUndo);
}

/**
 * Show a toast with an "Undo" action for check-off state changes. Toasts for different items
 * stack; a second toast for the same item replaces its first.
 */
export function showUndoToast(itemName: string, completed: boolean, onUndo: () => void): void {
  const message = completed
    ? m.undo_marked_complete({ name: itemName })
    : m.undo_unmarked({ name: itemName });
  showStackedUndoToast(`item:${itemName}`, message, onUndo);
}

/** The starter batch keeps its own Undo while the player continues checking things off. */
export function showStarterItemsToast(
  count: number,
  undo: () => void,
  dismiss: () => void,
): () => void {
  const id = toast(m.onboarding_starter_items({ count }), {
    cancel: { label: m.onboarding_undo_starter_items(), onClick: undo },
    duration: 30_000,
    onAutoClose: dismiss,
    onDismiss: dismiss,
  });
  return () => toast.dismiss(id);
}

/** Dismiss every undo toast and forget them, as a fresh page would. */
export function clearUndoToasts(): void {
  for (const id of undoToasts.values()) toast.dismiss(id);
  undoToasts.clear();
}

function showStackedUndoToast(key: string, message: string, onUndo: () => void): void {
  // An edit waiting for a tracking lane hasn't happened, so there's nothing to undo yet.
  if (userState.trackingLaneNeeded) return;
  const previous = undoToasts.get(key);
  if (previous !== undefined) {
    toast.dismiss(previous);
    undoToasts.delete(key);
  }
  // Undo toasts take only the slots other toasts leave free, dropping their oldest to make room,
  // so a stack of undos never hides an error or the starter batch's undo. One always shows.
  const undoIds = new Set(undoToasts.values());
  const others = toast.getActiveToasts().filter((active) => !undoIds.has(active.id)).length;
  const room = Math.max(1, VISIBLE_TOASTS - others);
  for (const [oldestKey, oldestId] of undoToasts) {
    if (undoToasts.size < room) break;
    toast.dismiss(oldestId);
    undoToasts.delete(oldestKey);
  }
  const forget = (): void => {
    if (undoToasts.get(key) === id) undoToasts.delete(key);
  };
  const id = toast(message, {
    cancel: {
      label: m.action_undo(),
      onClick: () => {
        forget();
        onUndo();
      },
    },
    duration: 30_000,
    onAutoClose: forget,
    onDismiss: forget,
  });
  undoToasts.set(key, id);
}
