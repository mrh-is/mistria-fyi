import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";

import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

import type { Shelf } from "#lib/engine/shelves.js";

export interface SectionGrouping<Key> {
  /** The shelf a current hold keeps `key` on, or `undefined` when it isn't held. */
  heldShelf: (key: Key) => Shelf | undefined;
  /**
   * Keeps `key` on the shelf it renders on now until the row-leaving window passes, so a toggle
   * inside a section never moves it mid-interaction. Holding again restarts the window.
   */
  hold: (key: Key) => void;
  /** Records the shelf a section's header implies, or `undefined` once it stops rendering. */
  report: (key: Key, shelf: Shelf | undefined) => void;
  /** The shelf `key` renders on. Sections that report none, held or not, sit on no shelf. */
  shelfOf: (key: Key) => Shelf | undefined;
}

/** One section's link back to its page's grouping, for components rendered inside it. */
export interface SectionGroupItem {
  hold: () => void;
  report: (shelf: Shelf | undefined) => void;
}

const SECTION_GROUP_ITEM = Symbol("section-group-item");

/**
 * Splits a page's sections across the shelves. A section moves when its progress changes shelf,
 * except that a toggle inside it holds it in place for as long as a completed row takes to leave.
 */
export function createSectionGrouping<Key>(
  durationMs: number = ROW_LEAVE_MS,
): SectionGrouping<Key> {
  const reported = new SvelteMap<Key, Shelf>();
  const held = new SvelteMap<Key, Shelf | undefined>();
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Timer handles are resource bookkeeping, not rendered state.
  const timers = new Map<Key, ReturnType<typeof setTimeout>>();
  $effect(() => () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });

  function shelfOf(key: Key): Shelf | undefined {
    const shelf = reported.get(key);
    if (shelf === undefined) return undefined;
    return held.get(key) ?? shelf;
  }

  return {
    heldShelf: (key) => held.get(key),
    hold(key): void {
      clearTimeout(timers.get(key));
      if (!held.has(key)) held.set(key, shelfOf(key));
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          held.delete(key);
        }, durationMs),
      );
    },
    report(key, shelf): void {
      if (shelf === undefined) {
        reported.delete(key);
      } else {
        reported.set(key, shelf);
      }
    },
    shelfOf,
  };
}

export function getSectionGroupItem(): SectionGroupItem | undefined {
  return getContext<SectionGroupItem | undefined>(SECTION_GROUP_ITEM);
}

export function setSectionGroupItem(item: SectionGroupItem): void {
  setContext(SECTION_GROUP_ITEM, item);
}
