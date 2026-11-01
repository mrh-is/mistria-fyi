import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

export interface SectionGrouping<Key> {
  /** The completion a current hold keeps `key` at, or `undefined` when it isn't held. */
  heldCompletion: (key: Key) => boolean | undefined;
  /**
   * Keeps `key` in the group it renders in now until the row-leaving window passes, so a toggle
   * inside a section never moves it mid-interaction. Holding again restarts the window.
   */
  hold: (key: Key) => void;
  /**
   * Whether `key` renders in the completed group. Unreported sections, including held ones that
   * stopped rendering, count as unfinished.
   */
  isGroupedComplete: (key: Key) => boolean;
  /** Records the completion a section's header shows, or `undefined` once it stops rendering. */
  report: (key: Key, complete: boolean | undefined) => void;
}

/** One section's link back to its page's grouping, for components rendered inside it. */
export interface SectionGroupItem {
  hold: () => void;
  report: (complete: boolean | undefined) => void;
}

const SECTION_GROUP_ITEM = Symbol("section-group-item");

/**
 * Splits a page's sections into unfinished & completed groups. A section moves when its header's
 * completion changes, except that a toggle inside it holds it in place for as long as a completed
 * row takes to leave.
 */
export function createSectionGrouping<Key>(
  durationMs: number = ROW_LEAVE_MS,
): SectionGrouping<Key> {
  const reported = new SvelteMap<Key, boolean>();
  const held = new SvelteMap<Key, boolean>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timer handles are resource bookkeeping, not rendered state.
  const timers = new Map<Key, ReturnType<typeof setTimeout>>();
  $effect(() => () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  function isGroupedComplete(key: Key): boolean {
    const complete = reported.get(key);
    if (complete === undefined) return false;
    return held.get(key) ?? complete;
  }

  return {
    heldCompletion: (key) => held.get(key),
    hold(key): void {
      clearTimeout(timers.get(key));
      if (!held.has(key)) held.set(key, isGroupedComplete(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          held.delete(key);
        }, durationMs),
      );
    },
    isGroupedComplete,
    report(key, complete): void {
      if (complete === undefined) {
        reported.delete(key);
      } else {
        reported.set(key, complete);
      }
    },
  };
}

export function getSectionGroupItem(): SectionGroupItem | undefined {
  return getContext<SectionGroupItem | undefined>(SECTION_GROUP_ITEM);
}

export function setSectionGroupItem(item: SectionGroupItem): void {
  setContext(SECTION_GROUP_ITEM, item);
}
