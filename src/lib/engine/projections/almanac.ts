import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isAlmanacEntryObtainable } from "#lib/engine/applicability.js";
import { isItemAvailable, isItemDimmed, isRowVisible } from "#lib/engine/availability.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { Source } from "#lib/types/acquisition.js";
import type { AlmanacCategoryId, AlmanacEntry, Item, ItemId } from "#lib/types/tracker-data.js";

interface AlmanacProjectionOptions {
  hideSpoilered?: boolean;
  includeUnavailable?: boolean;
  matchesEntry?: (itemIds: ItemId[]) => boolean;
  matchesSources?: (sources: Source[]) => boolean;
  progressionState?: UserProgressionState;
  recentlyCompleted?: ReadonlySet<ItemId>;
  showCompleted?: boolean;
  showUnobtainable?: boolean;
}

export interface AlmanacRow {
  available: boolean;
  canonicalId: ItemId;
  completed: boolean;
  dimmed: boolean;
  entry: AlmanacEntry;
  item: Item;
  matchesBaseFilters: boolean;
  matchesFilters: boolean;
  obtainable: boolean;
  sources: Source[];
  spoilered: boolean;
  visible: boolean;
}

interface AlmanacSection {
  baseRows: AlmanacRow[];
  canonicalIds: ItemId[];
  completedCount: number;
  id: AlmanacCategoryId;
  progress: CategoryProgress;
  rows: AlmanacRow[];
  scopedRows: AlmanacRow[];
  visibleRows: AlmanacRow[];
}

interface AlmanacProjection {
  dates: CategoryProgress;
  rows: AlmanacRow[];
  sections: AlmanacSection[];
  totals: CategoryProgress;
}

/**
 * One almanac row policy for progress, search and pages. Totals count obtainable entries,
 * independently of spoilers and display filters. Completed entries remain applicable.
 *
 * Callers choose context explicitly: search passes default availability windows and hides
 * spoilers; pages pass user windows, name/source filters and temporary completed-row retention.
 * Dates contribute their own section to the header but are rendered by DatesSection.
 */
export function projectAlmanac(
  ctx: ProgressContext,
  options: AlmanacProjectionOptions = {},
): AlmanacProjection {
  const sections = recordEntries(trackerData.almanac).map(([id, category]) => {
    const rows = category.items.map((entry): AlmanacRow => {
      const canonicalId = entry.itemIds[0];
      const item = trackerData.items[canonicalId];
      const sources = trackerIndex.getAggregatedAlmanacSources(canonicalId);
      const completed = ctx.progress.almanac.has(canonicalId);
      const obtainable = isAlmanacEntryObtainable(entry.itemIds, ctx.progress);
      const available = isItemAvailable(sources, ctx.worldState, ctx.availabilityWindows);
      const spoilered =
        options.progressionState !== undefined &&
        !isConditionVisible(item.visibility, options.progressionState);
      const matchesBaseFilters =
        (obtainable || options.showUnobtainable === true) &&
        (completed || available || options.includeUnavailable === true) &&
        (!options.hideSpoilered || !spoilered) &&
        (options.matchesEntry?.(entry.itemIds) ?? true);
      const matchesFilters = matchesBaseFilters && (options.matchesSources?.(sources) ?? true);
      return {
        available,
        canonicalId,
        completed,
        dimmed: isItemDimmed(sources, completed, ctx.worldState, ctx.availabilityWindows),
        entry,
        item,
        matchesBaseFilters,
        matchesFilters,
        obtainable,
        sources,
        spoilered,
        visible:
          matchesFilters &&
          isRowVisible(
            canonicalId,
            completed,
            options.showCompleted ?? true,
            options.recentlyCompleted,
          ),
      };
    });
    const applicableRows = rows.filter((row) => row.obtainable);
    const progress: CategoryProgress = {
      completed: applicableRows.filter((row) => row.completed).length,
      remainingInScope: applicableRows.filter((row) => !row.completed && row.available).length,
      total: applicableRows.length,
    };
    const scopedRows = rows.filter((row) => row.matchesFilters);
    return {
      baseRows: rows.filter((row) => row.matchesBaseFilters),
      canonicalIds: applicableRows.map((row) => row.canonicalId),
      completedCount: scopedRows.filter((row) => row.completed).length,
      id,
      progress,
      rows,
      scopedRows,
      visibleRows: rows.filter((row) => row.visible),
    };
  });
  const dates: CategoryProgress = {
    completed: ctx.progress.dates.size,
    remainingInScope: trackerIndex.almanacDateCount - ctx.progress.dates.size,
    total: trackerIndex.almanacDateCount,
  };
  const totals = { ...dates };
  for (const { progress } of sections) {
    totals.completed += progress.completed;
    totals.remainingInScope += progress.remainingInScope;
    totals.total += progress.total;
  }
  // Some entries occur in several sections. Search addresses each canonical row once;
  // section progress intentionally counts every in-game section membership.
  const rows = [
    ...new Map(
      sections.flatMap((section) => section.rows).map((row) => [row.canonicalId, row]),
    ).values(),
  ];
  return { dates, rows, sections, totals };
}
