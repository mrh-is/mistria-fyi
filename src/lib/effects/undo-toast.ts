import { tick } from "svelte";
import { toast } from "svelte-sonner";

import { recipeDisplayNames } from "#lib/engine/quest-rewards.js";
import plural from "#lib/i18n/catalogs/plural.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";
import { userState } from "#lib/stores/user-state.svelte.js";

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
const meterEdits = new Map<string, { after: number; before: number; time: number }>();
const METER_UNDO_WINDOW_MS = 1500;

/** The toast copy for a quest toggle that landed on `state`, unlocking `newlyAdded` recipes. */
export function questToastMessage(
  name: string,
  state: QuestState,
  newlyAdded: readonly RecipeId[],
  locale: LocaleCode,
  covered = false,
): string {
  return inLocale(locale, () => formatQuestToast(name, state, newlyAdded, locale, covered));
}

function formatQuestToast(
  name: string,
  state: QuestState,
  newlyAdded: readonly RecipeId[],
  locale: LocaleCode,
  covered: boolean,
): string {
  // A covered row's name & rewards stay hidden, so its toast names neither.
  if (covered) {
    if (state === "obtained") return "Started a spoilered quest";
    if (state === "none") return "Reset a spoilered quest";
    return "Checked off a spoilered quest";
  }
  if (state === "obtained") return `Started “${name}”`;
  if (state === "none") return `Reset “${name}”`;
  if (newlyAdded.length === 1) {
    const [recipe] = recipeDisplayNames([...newlyAdded], locale);
    return `Checked off “${name}” and unlocked “${recipe}”`;
  }
  if (newlyAdded.length > 1) {
    return plural(newlyAdded.length, [
      `Checked off “${name}” and unlocked ${newlyAdded.length} recipe`,
      `Checked off “${name}” and unlocked ${newlyAdded.length} recipes`,
    ]);
  }
  return `Checked off “${name}”`;
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
  covered = false,
  focus = captureUndoFocus(),
): void {
  inLocale(locale, () => {
    showStackedUndoToast(
      `quest:${name}`,
      formatQuestToast(name, state, newlyAdded, locale, covered),
      onUndo,
      focus,
    );
  });
}

/**
 * Show a toast with an "Undo" action for check-off state changes. Toasts for different items
 * stack; a second toast for the same item replaces its first.
 */
export function showUndoToast(
  itemName: string,
  completed: boolean,
  onUndo: () => void,
  /** The row's name is still behind its spoiler cover, so the toast mustn't reveal it. */
  covered = false,
  focus = captureUndoFocus(),
): void {
  showStackedUndoToast(
    `item:${itemName}`,
    undoMessage(itemName, completed, covered),
    onUndo,
    focus,
  );
}

function undoMessage(itemName: string, completed: boolean, covered: boolean): string {
  if (covered) return completed ? "Checked off a spoilered item" : "Unchecked a spoilered item";
  return completed ? `Checked off “${itemName}”` : `Unchecked “${itemName}”`;
}

/** Combine successive changes to one meter into the shell's existing undo surface. */
export function showMeterUndo(
  {
    after,
    before,
    formatMessage,
    id,
    locale,
    name,
    undo,
  }: {
    after: number;
    before: number;
    formatMessage?: (before: number, after: number) => string;
    id: string;
    locale: LocaleCode;
    name: string;
    undo: (value: number) => void;
  },
  focus = captureUndoFocus(),
): void {
  const key = `meter:${id}`;
  const time = Date.now();
  const previous = meterEdits.get(key);
  const first =
    undoToasts.has(key) &&
    previous?.after === before &&
    time - previous.time <= METER_UNDO_WINDOW_MS
      ? previous.before
      : before;
  if (first === after) {
    const toastId = undoToasts.get(key);
    if (toastId !== undefined) toast.dismiss(toastId);
    undoToasts.delete(key);
    meterEdits.delete(key);
    return;
  }
  const edit = { after, before: first, time };
  meterEdits.set(key, edit);
  inLocale(locale, () => {
    showStackedUndoToast(
      key,
      formatMessage?.(first, after) ?? `${name}: ${first} → ${after}`,
      () => {
        undo(first);
      },
      focus,
      () => {
        if (meterEdits.get(key) === edit) meterEdits.delete(key);
      },
    );
  });
}

/** The starter batch keeps its own Undo while the player continues checking things off. */
export function showStarterItemsToast(
  count: number,
  undo: () => void,
  dismiss: () => void,
): () => void {
  const id = toast(`We checked off your starter items (${count})`, {
    cancel: { label: "Undo starter checks", onClick: undo },
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
  meterEdits.clear();
}

interface UndoFocus {
  element: HTMLElement;
  fact?: string;
  /** The place or section holding the row, since a fact can appear under several places. */
  section?: Element;
}

/** Capture before a spoiler prompt takes focus away from the row. */
export function captureUndoFocus(): undefined | UndoFocus {
  const element = typeof document === "undefined" ? null : document.activeElement;
  if (!(element && element instanceof HTMLElement) || element === document.body) return undefined;
  return {
    element,
    fact: element.closest<HTMLElement>("[data-ledger-fact]")?.dataset.ledgerFact,
    section: element.closest("section") ?? undefined,
  };
}

function visibleCheckbox(scope: ParentNode, fact: string): HTMLElement | undefined {
  return [
    ...scope.querySelectorAll<HTMLElement>(
      `[data-ledger-fact="${CSS.escape(fact)}"] .tracker-checkbox`,
    ),
  ].find((candidate) => candidate.checkVisibility());
}

async function focusAfterUndo(
  { element, fact, section }: UndoFocus,
  action: Element,
): Promise<void> {
  await tick();
  if (document.activeElement !== action && document.activeElement !== document.body) return;
  if (element.isConnected && element.checkVisibility()) {
    element.focus({ preventScroll: true });
    return;
  }
  if (!fact) return;
  // Prefer the copy in the reader's place. Another place's copy may be off-screen, so scroll to it.
  const checkbox =
    (section?.isConnected ? visibleCheckbox(section, fact) : undefined) ??
    visibleCheckbox(document, fact);
  checkbox?.focus();
}

function showStackedUndoToast(
  key: string,
  message: string,
  onUndo: () => void,
  focus: undefined | UndoFocus,
  onClose?: () => void,
): void {
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
    meterEdits.delete(oldestKey);
  }
  const forget = (): void => {
    if (undoToasts.get(key) === id) undoToasts.delete(key);
    onClose?.();
  };
  const id = toast(message, {
    cancel: {
      label: "Undo",
      onClick: () => {
        const action = typeof document === "undefined" ? null : document.activeElement;
        forget();
        onUndo();
        if (focus && action?.closest("[data-sonner-toast]")) {
          void focusAfterUndo(focus, action);
        }
      },
    },
    duration: 30_000,
    onAutoClose: forget,
    onDismiss: forget,
  });
  undoToasts.set(key, id);
}
