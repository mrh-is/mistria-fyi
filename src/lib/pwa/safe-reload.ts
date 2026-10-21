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

/** How long a page waits to probe again after finding its own URL unreachable. */
export const UNREACHABLE_RETRY_MS = 30_000;

/**
 * Whether reloading would load this page again: online, and its URL answers successfully. The
 * probe goes through the service worker, as the reload would, so a page only a cache holds still
 * counts while one no cache holds doesn't. A deploy mid-way (a 5xx) or a dropped connection keeps
 * the page as it is rather than swapping it for an error or the offline page.
 */
export async function pageIsReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const response = await fetch(location.href, { cache: "no-store", credentials: "same-origin" });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

interface SafeReloadOptions {
  doc?: Document;
  events?: Pick<Window, "addEventListener">;
  holds?: UpdateHolds;
  isReachable?: () => Promise<boolean>;
  now?: () => number;
  pollMs?: number;
  reload?: () => void;
}

export interface SafeReload {
  /**
   * Re-checks a pending update after a client-side navigation. The destination must be reachable
   * before reloading it; otherwise the navigation stays client-side and the update stays pending.
   */
  navigationCompleted: () => void;
  /** Whether a requested reload is still waiting for a safe moment. */
  readonly pending: boolean;
  /** An update is ready: reload now if the page isn't busy, or at its first safe moment. */
  request: () => void;
  stop: () => void;
}

/**
 * Reloads the page onto a newer version at its own safe moment, never mid-task, and only when the
 * reload would load the page ({@link pageIsReachable}). Until then, it re-checks whenever a hold is
 * released, focus leaves a field, the page's visibility changes, the browser comes back online,
 * and every {@link SAFE_RELOAD_POLL_MS}, which catches dialogs closing. After an unreachable probe,
 * it waits {@link UNREACHABLE_RETRY_MS} before probing again, unless the browser comes online.
 */
export function createSafeReload({
  doc = document,
  events = globalThis,
  holds = updateHolds,
  isReachable = pageIsReachable,
  now = Date.now,
  pollMs = SAFE_RELOAD_POLL_MS,
  reload = () => {
    location.reload();
  },
}: SafeReloadOptions = {}): SafeReload {
  let pending = false;
  let reloading = false;
  let probing = false;
  let lastUnreachable = -Infinity;
  let navigation = 0;
  const watchers = new AbortController();
  let stopHoldWatch: (() => void) | undefined;
  let poll: ReturnType<typeof setInterval> | undefined;

  function stopWatching(): void {
    watchers.abort();
    stopHoldWatch?.();
    clearInterval(poll);
  }

  function ready(): boolean {
    return pending && !watchers.signal.aborted && !reloading && !probing && !isPageBusy(doc, holds);
  }

  async function attempt(retryNow = false): Promise<void> {
    if (!ready()) return;
    if (!retryNow && now() - lastUnreachable < UNREACHABLE_RETRY_MS) return;
    const probedNavigation = navigation;
    const probedUrl = location.href;
    probing = true;
    let reachable = false;
    try {
      reachable = await isReachable();
    } catch {
      reachable = false;
    } finally {
      probing = false;
    }
    // A probe of the previous route says nothing about the destination of a later navigation.
    if (probedNavigation !== navigation || probedUrl !== location.href) {
      lastUnreachable = -Infinity;
      checkSoon();
      return;
    }
    if (!reachable) lastUnreachable = now();
    // The page may have become busy or stopped watching while the probe ran.
    if (!reachable || !ready()) return;
    reloading = true;
    stopWatching();
    reload();
  }

  function check(): void {
    void attempt();
  }

  // Deferred a task, so focus has settled and a released hold's component has finished its work.
  function checkSoon(): void {
    setTimeout(check, 0);
  }

  function request(): void {
    if (pending || watchers.signal.aborted) return;
    pending = true;
    stopHoldWatch = holds.onRelease(checkSoon);
    doc.addEventListener("focusout", checkSoon, { signal: watchers.signal });
    doc.addEventListener("visibilitychange", check, { signal: watchers.signal });
    events.addEventListener("online", () => void attempt(true), { signal: watchers.signal });
    poll = setInterval(check, pollMs);
    check();
  }

  function navigationCompleted(): void {
    navigation += 1;
    lastUnreachable = -Infinity;
    // Let the destination's focus & component effects settle before checking whether it is busy.
    checkSoon();
  }

  return {
    navigationCompleted,
    get pending() {
      return pending && !reloading;
    },
    request,
    stop: stopWatching,
  };
}
