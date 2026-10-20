import { updateHolds } from "#lib/pwa/update-holds.js";

import type { UpdateHolds } from "#lib/pwa/update-holds.js";

/** Modal UI the player is in the middle of: dialogs, alert dialogs, & the app's panel overlays. */
const OPEN_DIALOG = 'dialog[open], [role="dialog"], [role="alertdialog"]';
/**
 * Markup that keeps a matching element from being shown. `inert` & `aria-hidden` don't count: a
 * modal marks the rest of the page that way, and a dialog under another one is still open.
 */
const NOT_SHOWN = '[hidden], [data-state="closed"]';

/** Input types that hold no typed text, so focusing one isn't an edit in progress. */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** How often a page waiting to reload re-checks for dialogs that have since closed. */
export const SAFE_RELOAD_POLL_MS = 1000;

/** Whether `element` is a field the player may be typing into. */
export function isEditing(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLElement && element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !NON_TEXT_INPUT_TYPES.has((element.getAttribute("type") ?? "text").toLowerCase());
}

/** Whether `root` shows a dialog or panel the player has open. */
export function hasOpenDialog(root: ParentNode): boolean {
  return [...root.querySelectorAll(OPEN_DIALOG)].some(
    (element) => element.closest(NOT_SHOWN) === null,
  );
}

/**
 * Whether reloading now would interrupt the player: a task holds updates off, a dialog or panel is
 * open, or a text field has focus.
 */
export function isPageBusy(doc: Document, holds: Pick<UpdateHolds, "held"> = updateHolds): boolean {
  return holds.held || hasOpenDialog(doc) || isEditing(doc.activeElement);
}

interface SafeReloadOptions {
  doc?: Document;
  holds?: UpdateHolds;
  pollMs?: number;
  reload?: () => void;
}

export interface SafeReload {
  /**
   * Called for a client-side navigation: whether to load it in full instead, picking up the update
   * on the way. True once an update waits and no task holds it off; leaving the page leaves its
   * dialogs & fields behind, so only holds count here. A true answer hands the reload to the
   * caller, so the page never reloads twice.
   */
  claimNavigation: () => boolean;
  /** Whether a requested reload is still waiting for a safe moment. */
  readonly pending: boolean;
  /** An update is ready: reload now if the page isn't busy, or at its first safe moment. */
  request: () => void;
  stop: () => void;
}

/**
 * Reloads the page onto a newer version at its own safe moment, never mid-task. Until then, it
 * re-checks whenever a hold is released, focus leaves a field, the page's visibility changes, and
 * every {@link SAFE_RELOAD_POLL_MS}, which catches dialogs closing.
 */
export function createSafeReload({
  doc = document,
  holds = updateHolds,
  pollMs = SAFE_RELOAD_POLL_MS,
  reload = () => {
    location.reload();
  },
}: SafeReloadOptions = {}): SafeReload {
  let pending = false;
  let reloading = false;
  const watchers = new AbortController();
  let stopHoldWatch: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;

  function stopWatching(): void {
    watchers.abort();
    stopHoldWatch?.();
    clearInterval(poll);
  }

  function attempt(): void {
    if (!pending || reloading || isPageBusy(doc, holds)) return;
    reloading = true;
    stopWatching();
    reload();
  }

  // Deferred a task, so focus has settled and a released hold's component has finished its work.
  function attemptSoon(): void {
    setTimeout(attempt, 0);
  }

  function request(): void {
    if (pending || watchers.signal.aborted) return;
    pending = true;
    attempt();
    if (reloading) return;
    stopHoldWatch = holds.onRelease(attemptSoon);
    doc.addEventListener("focusout", attemptSoon, { signal: watchers.signal });
    doc.addEventListener("visibilitychange", attempt, { signal: watchers.signal });
    poll = setInterval(attempt, pollMs);
  }

  function claimNavigation(): boolean {
    if (!pending || reloading || holds.held) return false;
    reloading = true;
    stopWatching();
    return true;
  }

  return {
    claimNavigation,
    get pending() {
      return pending && !reloading;
    },
    request,
    stop: stopWatching,
  };
}
