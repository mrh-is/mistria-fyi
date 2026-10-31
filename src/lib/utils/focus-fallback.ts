import { tick } from "svelte";

function isRendered(element: HTMLElement): boolean {
  return element.isConnected && element.closest("[hidden]") === null;
}

/**
 * Call before focused content may leave the page. The returned function, called once it may have
 * left, waits for the page to settle, then restores focus to that element if it's still on the page. Otherwise it moves focus to the
 * nearest section trigger still on the page: the next one, or else the closest one before it.
 */
export function captureFocusFallback(): () => Promise<void> {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || focused === document.body) {
    return () => Promise.resolve();
  }
  const following: HTMLElement[] = [];
  const preceding: HTMLElement[] = [];
  for (const trigger of document.querySelectorAll<HTMLElement>("button[data-section-trigger]")) {
    if (trigger.contains(focused)) continue;
    const isFollowing = focused.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (isFollowing) following.push(trigger);
    else preceding.unshift(trigger);
  }
  return async () => {
    // A category hides only after its last section reports, so wait for the page to settle.
    await tick();
    const current = document.activeElement;
    // Someone else moved focus already, or the focused element stayed.
    if (current !== focused && current !== null && current !== document.body) return;
    if (isRendered(focused)) {
      // Moving a node blurs whatever it contains, so an element that moved takes focus back.
      if (current !== focused) focused.focus({ preventScroll: true });
      return;
    }
    [...following, ...preceding].find((trigger) => isRendered(trigger))?.focus();
  };
}
