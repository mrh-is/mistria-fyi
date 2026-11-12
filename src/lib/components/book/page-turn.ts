import { prefersReducedMotion } from "svelte/motion";

import type { onNavigate } from "$app/navigation";

type OnNavigate = Parameters<Parameters<typeof onNavigate>[0]>[0];

/** On `<html>` while a page turns, so the turn's view-transition styles touch no other transition. */
export const TURNING_CLASS = "book-turning";

let latestTurn = 0;

/**
 * Turns the page for a client-side navigation: the old page slides off the desk while the next one
 * comes in under it, ending in a settle of at most 2px, so the desk is never bare (round four of
 * #477). Only the page moves; the cover, the wire, the rail, & the toolbar swap in place above it.
 *
 * Returns the promise `onNavigate` waits on before it updates the DOM, or nothing for a plain cut: a
 * full load, reduced motion, a browser without view transitions, or a query or hash change on the
 * same page.
 */
export function turnPage(
  navigation: Pick<OnNavigate, "complete" | "from" | "to">,
): Promise<void> | undefined {
  if (prefersReducedMotion.current || typeof document.startViewTransition !== "function") return;
  if (navigation.from?.url.pathname === navigation.to?.url.pathname) return;

  const root = document.documentElement;
  const turn = ++latestTurn;
  const scrollBefore = globalThis.scrollY;
  let shift = 0;
  root.classList.add(TURNING_CLASS);

  return new Promise<void>((resolve) => {
    const transition = document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
      // The document scrolls, so the new page can land at another scroll position (Back restores
      // one). The old page's snapshot moves with it; the shift puts it back where it was on screen.
      shift = globalThis.scrollY - scrollBefore;
    });
    void animateWhenReady(transition, root, () => shift);
    void finishTurn(transition, root, turn);
  });
}

async function animateWhenReady(
  transition: ViewTransition,
  root: HTMLElement,
  shift: () => number,
): Promise<void> {
  try {
    await transition.ready;
  } catch {
    // A turn skipped by a newer one, or by a failed navigation, has no snapshots to animate.
    return;
  }
  animateTurn(root, shift());
}

async function finishTurn(
  transition: ViewTransition,
  root: HTMLElement,
  turn: number,
): Promise<void> {
  try {
    await transition.finished;
  } catch {
    // A navigation that fails reports itself; the turn only needs its styles gone.
  }
  // A newer turn has started, and its styles must outlast this one.
  if (turn === latestTurn) root.classList.remove(TURNING_CLASS);
}

function animateTurn(root: HTMLElement, shift: number): void {
  root.animate(
    [
      { transform: `translateY(${shift}px)` },
      { transform: `translate(-104%, ${shift}px) rotate(-0.6deg)` },
    ],
    {
      duration: 420,
      easing: "cubic-bezier(0.55, 0, 0.75, 0.3)",
      fill: "both",
      pseudoElement: "::view-transition-old(book-page)",
    },
  );
  root.animate(
    [
      { transform: "translateX(32px)" },
      { offset: 0.72, transform: "translateX(-2px)" },
      { transform: "none" },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(0.45, 0.05, 0.25, 1)",
      fill: "both",
      pseudoElement: "::view-transition-new(book-page)",
    },
  );
}
