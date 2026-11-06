import { isDoableToday, isRowShown } from "#lib/engine/availability.js";

import type { AvailabilityRow, DayContext, ShowsSource } from "#lib/engine/availability.js";
import type { CategoryProgress } from "#lib/engine/progress.js";

/**
 * Where a category, section, set, or row sits. Availability decides the shelf, source filters
 * decide what's on the page, & neither touches a fraction's numbers.
 */
export const SHELVES = ["todo", "notNow", "completed"] as const;
export type Shelf = (typeof SHELVES)[number];

/** What the shelves need to know about one row. */
export interface ShelfRow {
  completed: boolean;
  /** Unfinished & doable today through a source the filters show. */
  doable: boolean;
  /** Unfinished & doable today through any source, whatever the filters show. */
  doableAnywhere: boolean;
  /** Whether the row matches the page's filters. */
  shown: boolean;
}

/** How many rows each shelf loses to the filters. */
export type FilteredCounts = Record<Shelf, number>;

/** Sums `parts`, such as a section's sets. */
export function addProgress(parts: readonly CategoryProgress[]): CategoryProgress {
  const sum = emptyProgress();
  for (const part of parts) {
    sum.completed += part.completed;
    sum.completedShown += part.completedShown;
    sum.todo += part.todo;
    sum.total += part.total;
    sum.waiting += part.waiting;
  }
  return sum;
}

/** Progress for steps with no sources or season, which are To do until they're finished. */
export function alwaysToDo(completed: number, total: number): CategoryProgress {
  return {
    ...emptyProgress(),
    completed,
    completedShown: completed,
    todo: total - completed,
    total,
  };
}

/** Each row is one step of `total`, whatever the filters show. */
export function countShelfRows(rows: readonly ShelfRow[]): CategoryProgress {
  const progress = emptyProgress();
  for (const row of rows) {
    progress.total++;
    if (row.completed) {
      progress.completed++;
      if (row.shown) progress.completedShown++;
    } else if (row.doable) {
      progress.todo++;
    } else if (row.shown) {
      progress.waiting++;
    }
  }
  return progress;
}

export function emptyProgress(): CategoryProgress {
  return { completed: 0, completedShown: 0, todo: 0, total: 0, waiting: 0 };
}

/** What the filters took from each shelf: a row with no shelf, or a lower one than it could have. */
export function filteredCounts(rows: readonly ShelfRow[]): FilteredCounts {
  const counts: FilteredCounts = { completed: 0, notNow: 0, todo: 0 };
  for (const row of rows) {
    if (row.completed) {
      if (!row.shown) counts.completed++;
    } else if (row.doableAnywhere) {
      if (!row.doable) counts.todo++;
    } else if (!row.shown) {
      counts.notNow++;
    }
  }
  return counts;
}

/** The shelf of a group of rows; `undefined` when the group leaves the page. */
export function progressShelf(progress: CategoryProgress): Shelf | undefined {
  if (progress.todo > 0) return "todo";
  if (progress.waiting > 0) return "notNow";
  if (progress.completed >= progress.total && progress.completedShown > 0) return "completed";
  return undefined;
}

/** The shelf of one row; `undefined` when the filters take it off the page. */
export function rowShelf(row: ShelfRow): Shelf | undefined {
  if (!row.shown) return undefined;
  if (row.completed) return "completed";
  return row.doable ? "todo" : "notNow";
}

/** A row's shelf facts. A finished row skips the availability checks, since it can't need them. */
export function shelfFacts(
  row: AvailabilityRow,
  completed: boolean,
  ctx: DayContext,
  showsSource?: ShowsSource,
): ShelfRow {
  const shown = isRowShown(row.sources, showsSource);
  if (completed) return { completed, doable: false, doableAnywhere: false, shown };
  const doableAnywhere = isDoableToday(row, ctx);
  return {
    completed,
    doable: doableAnywhere && (showsSource === undefined || isDoableToday(row, ctx, showsSource)),
    doableAnywhere,
    shown,
  };
}
