/**
 * Work that an update's reload must not interrupt and that the page's markup can't show: a save
 * import or backup restore being applied, a transfer result the player is reading, and (later) a
 * sync apply. Open dialogs & focused fields count as busy on their own (see `safe-reload.ts`).
 *
 * Holding is reference-counted, so overlapping tasks each release only their own hold.
 */
export class UpdateHolds {
  #count = 0;
  readonly #listeners = new Set<() => void>();

  /** Whether any task currently holds the reload off. */
  get held(): boolean {
    return this.#count > 0;
  }

  /** Holds the reload off until the returned function is called; calling it twice is harmless. */
  hold(): () => void {
    this.#count += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#count -= 1;
      for (const listener of this.#listeners) listener();
    };
  }

  /** Calls `listener` whenever a hold is released; returns a function that stops it. */
  onRelease(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}

/** The page's one set of holds. Components hold it from an `$effect` while their task runs. */
export const updateHolds = new UpdateHolds();

/**
 * Holds the update reload off for as long as `busy` is true. Call from an `$effect` and return
 * its result, so the hold is released when the condition clears or the component unmounts:
 * `$effect(() => holdUpdatesWhile(importing))`.
 */
export function holdUpdatesWhile(busy: boolean, holds = updateHolds): (() => void) | undefined {
  return busy ? holds.hold() : undefined;
}
