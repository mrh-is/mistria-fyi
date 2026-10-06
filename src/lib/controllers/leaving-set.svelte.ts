import { SvelteSet } from "svelte/reactivity";

import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

export interface LeavingSet<T> {
  has: (id: T) => boolean;
  /** Reactive view of the ids still lingering, for availability checks. */
  readonly ids: ReadonlySet<T>;
  /** Keep `id` alive while its row plays the leave animation, then drop it. */
  mark: (id: T) => void;
}

/** Tracks rows that just completed so they stay rendered for the leave animation. */
export function createLeavingSet<T>(durationMs: number = ROW_LEAVE_MS): LeavingSet<T> {
  const ids = new SvelteSet<T>();
  return {
    has: (id) => ids.has(id),
    ids,
    mark(id): void {
      ids.add(id);
      setTimeout(() => ids.delete(id), durationMs);
    },
  };
}
