import { flushSync, untrack } from "svelte";

/**
 * Rows that the lists mounted or grown in one update render at once, shared between them.
 * Enough to fill a phone screen, so opening a section shows rows at once; a forced-open page of
 * sections (a search) spends it on the first sections & reveals the rest over frames.
 */
export const INITIAL_ROW_BUDGET = 30;

/** Rows a list reveals per step; a frame checks its time budget between steps. */
export const REVEAL_STEP = 6;

/** Rows that may reappear without waiting for a frame, such as an undone completion. */
export const RESTORE_SLACK = INITIAL_ROW_BUDGET;

/** Script time per animation frame spent revealing rows, leaving room for layout & paint. */
const FRAME_BUDGET_MS = 8;

/** Assumed height of a row before any list has measured one. */
const FALLBACK_ROW_HEIGHT_PX = 48;

export interface RowReveal {
  /** How many of the list's rows to render now. */
  readonly count: number;
  /** Record the rendered rows' total height, from which the reserved height is estimated. */
  measure: (renderedHeight: number) => void;
  /** Height to reserve for the rows not yet rendered, so the page does not grow as they arrive. */
  readonly reservedHeight: number;
}

interface PendingList {
  /** Reveal one more step; returns whether rows remain. */
  step: () => boolean;
}

// Lists waiting for rows, in mount order, so the first sections on the page fill first.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Scheduler bookkeeping, not rendered state.
const pending = new Set<PendingList>();
let frame: number | undefined;
let initialBudget = INITIAL_ROW_BUDGET;
let budgetResetQueued = false;
let lastRowHeight = FALLBACK_ROW_HEIGHT_PX;

function claimInitialRows(total: number): number {
  // The server has no frames to reveal rows in, so it renders every row.
  if (typeof document === "undefined") return total;
  // One update mounts all its lists in a single synchronous flush, so they share the budget.
  if (!budgetResetQueued) {
    budgetResetQueued = true;
    queueMicrotask(() => {
      budgetResetQueued = false;
      initialBudget = INITIAL_ROW_BUDGET;
    });
  }
  const claimed = Math.min(total, initialBudget);

  initialBudget -= claimed;
  return claimed;
}

function runFrame(): void {
  frame = undefined;
  const deadline = performance.now() + FRAME_BUDGET_MS;
  // Every frame makes progress, then continues while it has time left.
  do {
    const next = pending.values().next();
    if (next.done === true) break;
    if (!next.value.step()) pending.delete(next.value);
    flushSync();
  } while (performance.now() < deadline);
  if (pending.size > 0) frame = requestAnimationFrame(runFrame);
}

function enqueue(list: PendingList): void {
  pending.add(list);
  frame ??= requestAnimationFrame(runFrame);
}

function dequeue(list: PendingList): void {
  pending.delete(list);
  if (pending.size === 0 && frame !== undefined) {
    cancelAnimationFrame(frame);
    frame = undefined;
  }
}

/**
 * Renders a long list's rows progressively: an initial screenful at once, then the rest over
 * animation frames within a shared time budget, without the player doing anything. Every row ends
 * up rendered, so find-in-page keeps working. Call during component initialisation.
 */
export function createRowReveal(getTotal: () => number): RowReveal {
  let revealed = $state(claimInitialRows(untrack(getTotal)));
  let rowHeight = $state<number | undefined>(undefined);
  let count = $derived(Math.min(getTotal(), revealed));

  const list: PendingList = {
    step() {
      const total = untrack(getTotal);
      revealed = Math.min(total, revealed + REVEAL_STEP);
      return revealed < total;
    },
  };

  // Before the list renders, so a change in its length is settled in the same update.
  $effect.pre(() => {
    const total = getTotal();
    untrack(() => {
      // A narrowed list keeps some headroom, so a row coming back (an undo) renders in place; a
      // list that grows past it renders what the shared budget allows now & the rest over frames.
      if (revealed > total + RESTORE_SLACK) revealed = total + RESTORE_SLACK;
      if (revealed < total) revealed += claimInitialRows(total - revealed);
      if (revealed < total) enqueue(list);
      else dequeue(list);
    });
  });

  $effect(() => () => {
    dequeue(list);
  });

  return {
    get count() {
      return count;
    },
    measure(renderedHeight) {
      if (count === 0 || renderedHeight <= 0) return;
      rowHeight = renderedHeight / count;
      lastRowHeight = rowHeight;
    },
    get reservedHeight() {
      return Math.max(0, getTotal() - count) * (rowHeight ?? lastRowHeight);
    },
  };
}
