import type { FilteredCounts, Shelf } from "#lib/engine/shelves.js";

/** What the page's one filter note reports: the most actionable shelf that lost anything. */
export interface FilterNote {
  count: number;
  shelf: Shelf;
}

export function filterNote(counts: FilteredCounts): FilterNote | undefined {
  if (counts.todo > 0) return { count: counts.todo, shelf: "todo" };
  if (counts.notNow > 0) return { count: counts.notNow, shelf: "notNow" };
  if (counts.completed > 0) return { count: counts.completed, shelf: "completed" };
  return undefined;
}

export function shelfLabel(shelf: Shelf): string {
  switch (shelf) {
    case "completed":
      return /* @wc-context: common completed heading */ "Completed";
    case "notNow":
      return /* @wc-context: shelf not now */ "Not now";
    case "todo":
      return "To do";
  }
}
