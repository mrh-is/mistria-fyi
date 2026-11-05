import * as m from "#lib/paraglide/messages.js";
import { formatNumber } from "#lib/utils/format.js";

import type { CategoryProgress } from "#lib/engine/progress.js";
import type { LocaleCode } from "#lib/types/locale.js";

/** What the quieter line under a fraction says, once filters leave some unfinished rows out. */
export type ProgressScope = { count: number; kind: "count" } | { kind: "done" };

/** Sums `parts`, such as a section's sets. */
export function addProgress(parts: readonly CategoryProgress[]): CategoryProgress {
  const sum: CategoryProgress = { completed: 0, remainingInScope: 0, total: 0 };
  for (const part of parts) {
    sum.completed += part.completed;
    sum.remainingInScope += part.remainingInScope;
    sum.total += part.total;
  }
  return sum;
}

/** Counts `rows`, whatever the page shows: an unfinished row is remaining when `inScope` holds. */
export function countProgress<Row>(
  rows: readonly Row[],
  isCompleted: (row: Row) => boolean,
  inScope: (row: Row) => boolean,
): CategoryProgress {
  let completed = 0;
  let remainingInScope = 0;
  for (const row of rows) {
    if (isCompleted(row)) completed++;
    else if (inScope(row)) remainingInScope++;
  }
  return { completed, remainingInScope, total: rows.length };
}

/** Absent when filters exclude nothing, because the fraction already says everything. */
export function progressScope({
  completed,
  remainingInScope,
  total,
}: CategoryProgress): ProgressScope | undefined {
  const unfinished = total - completed;
  if (unfinished <= 0 || remainingInScope >= unfinished) return undefined;
  return remainingInScope === 0 ? { kind: "done" } : { count: remainingInScope, kind: "count" };
}

export function progressScopeLabel(scope: ProgressScope, locale: LocaleCode): string {
  return scope.kind === "done"
    ? m.progress_done_for_now({}, { locale })
    : m.progress_for_now({ count: formatNumber(scope.count, locale) }, { locale });
}

/** Adds the quieter line to `label`, an accessible name that holds the fraction. */
export function withProgressScope(
  label: string,
  scope: ProgressScope | undefined,
  locale: LocaleCode,
): string {
  return scope ? `${label}, ${progressScopeLabel(scope, locale)}` : label;
}
