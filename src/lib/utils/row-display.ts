/** How a tracker row presents itself; `TrackerRow` renders each mode differently. */
export type TrackerRowDisplay =
  | { dimmed?: boolean; mode: "incomplete" }
  | { leaving?: boolean; mode: "completed" }
  | { mode: "obtained" }
  | { mode: "spoilered" };

/** Rows rendered per section before a "show more" button appears. */
export const SECTION_ROW_LIMIT = 50;

/** How many of `total` rows a section renders: all once expanded, else up to `SECTION_ROW_LIMIT`. */
export function sectionRowLimit(total: number, expanded: boolean): number {
  return expanded ? total : Math.min(total, SECTION_ROW_LIMIT);
}

/**
 * Picks a row's display mode. An unrevealed name wins over completion, so a spoilered row stays
 * redacted even when its progress was imported. Defaults describe a plain, incomplete row.
 */
export function trackerRowDisplay({
  completed,
  dimmed = false,
  leaving = false,
  nameVisible = true,
}: {
  completed: boolean;
  dimmed?: boolean;
  leaving?: boolean;
  nameVisible?: boolean;
}): TrackerRowDisplay {
  if (!nameVisible) return { mode: "spoilered" };
  if (completed) return { leaving, mode: "completed" };
  return { dimmed, mode: "incomplete" };
}
