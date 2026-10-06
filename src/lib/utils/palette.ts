/**
 * Villager level marks, town ranks, & confetti draw from `--level-*`, `--rank-*`, & `--confetti-*`
 * in `src/app.css`. These helpers name the tokens; `palette.test.ts` checks that each exists.
 */

export const LEVEL_COLOR_COUNT = 12;
export const RANK_COLOR_COUNT = 11;
export const CONFETTI_COLOR_COUNT = 7;

/** The `var()` reference for the level mark at a zero-based index. */
export function levelColor(index: number): string {
  return `var(--level-${(Math.min(index, LEVEL_COLOR_COUNT - 1) + 1).toString()})`;
}

/** The `var()` reference for a town rank at a zero-based index; ranks past the ladder reuse the last. */
export function rankColor(index: number): string {
  return `var(--rank-${(Math.min(index, RANK_COLOR_COUNT - 1) + 1).toString()})`;
}

/**
 * Resolved confetti colors for the given one-based token numbers. canvas-confetti paints on a
 * canvas, which can't resolve `var()`, so the values are read from the document at call time.
 */
export function confettiColors(numbers: readonly number[]): string[] {
  if (typeof document === "undefined") return [];
  const style = getComputedStyle(document.documentElement);
  return numbers
    .map((number) => style.getPropertyValue(`--confetti-${number.toString()}`).trim())
    .filter((color) => color !== "");
}
