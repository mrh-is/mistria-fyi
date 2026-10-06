import { toast } from "svelte-sonner";

import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
import * as m from "#lib/paraglide/messages.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { RecipeId } from "#lib/types/tracker-data.js";
import type { QuestState } from "#lib/types/user-progress.js";

/** The visible undo toast, if any; only one shows at a time. */
let currentToastId: number | string | undefined;

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
  showSingleUndoToast(questToastMessage(name, state, newlyAdded, locale), onUndo);
}

/**
 * Show a toast with an "Undo" action for check-off state changes.
 * Only one toast is visible at a time; subsequent calls replace the current toast.
 */
export function showUndoToast(itemName: string, completed: boolean, onUndo: () => void): void {
  const message = completed
    ? m.undo_marked_complete({ name: itemName })
    : m.undo_unmarked({ name: itemName });
  showSingleUndoToast(message, onUndo);
}

function showSingleUndoToast(message: string, onUndo: () => void): void {
  if (currentToastId !== undefined) {
    toast.dismiss(currentToastId);
  }
  currentToastId = toast(message, {
    cancel: {
      label: m.action_undo(),
      onClick: onUndo,
    },
    duration: 30_000,
  });
}
