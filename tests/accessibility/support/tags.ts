/**
 * Marks a test as part of the fast `@critical` subset (`pnpm run test:accessibility:critical`).
 * Tag individual tests, never whole describes, so the subset stays a small, representative slice:
 * one or two cases per feature, with the full suite covering every route and theme.
 */
export const critical = { tag: "@critical" } as const;

/** Tags a looped test only when `condition` holds, keeping the rest in the full suite. */
export function criticalWhen(condition: boolean): { tag?: "@critical" } {
  return condition ? critical : {};
}
