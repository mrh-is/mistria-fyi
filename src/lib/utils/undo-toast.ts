import { toast } from "svelte-sonner";

/**
 * Show a toast with an "Undo" action for check-off state changes.
 * Only one toast is visible at a time — subsequent calls replace the current toast.
 */
let currentToastId: number | string | undefined;

export function showUndoToast(itemName: string, completed: boolean, onUndo: () => void): void {
  if (currentToastId !== undefined) {
    toast.dismiss(currentToastId);
  }

  const message = completed ? `Marked "${itemName}" complete` : `Unmarked "${itemName}"`;

  currentToastId = toast(message, {
    cancel: {
      label: "Undo",
      onClick: onUndo,
    },
    duration: Number.POSITIVE_INFINITY,
  });
}
