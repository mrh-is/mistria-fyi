/**
 * Colors picked by index: the villager relationship level marks
 * (`--color-relationship-level-*`), the renown town ranks (`--color-town-rank-*`), & confetti
 * (`--color-confetti-*`). All live in `src/app.css`; these helpers name the tokens, & `palette.test.ts`
 * checks that each exists.
 */

export const RELATIONSHIP_LEVEL_COLOR_COUNT = 10;
export const TOWN_RANK_COLOR_COUNT = 11;
export const CONFETTI_COLOR_COUNT = 7;

/** The `var()` reference for the relationship level mark at a zero-based index. */
export function relationshipLevelColor(index: number): string {
  return `var(--color-relationship-level-${(Math.min(index, RELATIONSHIP_LEVEL_COLOR_COUNT - 1) + 1).toString()})`;
}

/** The `var()` reference for a town rank at a zero-based index; ranks past the ladder reuse the last. */
export function townRankColor(index: number): string {
  return `var(--color-town-rank-${(Math.min(index, TOWN_RANK_COLOR_COUNT - 1) + 1).toString()})`;
}

/**
 * Resolved confetti colors for the given one-based token numbers. canvas-confetti paints on a
 * canvas, which can't resolve `var()`, so the values are read from the document at call time.
 */
export function confettiColors(numbers: readonly number[]): string[] {
  if (typeof document === "undefined") return [];
  const style = getComputedStyle(document.documentElement);
  return numbers
    .map((number) => style.getPropertyValue(`--color-confetti-${number.toString()}`).trim())
    .filter((color) => color !== "");
}
