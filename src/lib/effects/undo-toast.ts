import { toast } from "svelte-sonner";

import * as m from "#lib/paraglide/messages.js";

/** The visible undo toast, if any; only one shows at a time. */
let currentToastId: number | string | undefined;

/**
 * Show a toast with an "Undo" action for check-off state changes.
 * Only one toast is visible at a time; subsequent calls replace the current toast.
 */
export function showUndoToast(itemName: string, completed: boolean, onUndo: () => void): void {
  if (currentToastId !== undefined) {
    toast.dismiss(currentToastId);
  }

  const message = completed
    ? m.undo_marked_complete({ name: itemName })
    : m.undo_unmarked({ name: itemName });

  currentToastId = toast(message, {
    cancel: {
      label: m.action_undo(),
      onClick: onUndo,
    },
    duration: 30_000,
  });
}
