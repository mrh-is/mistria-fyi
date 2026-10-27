import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isAlmanacEntryObtainable } from "#lib/engine/applicability.js";
import { isItemAvailable, isItemDimmed, isRowVisible } from "#lib/engine/availability.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { Source } from "#lib/types/acquisition.js";
import type { AlmanacCategoryId, AlmanacEntry, Item, ItemId } from "#lib/types/tracker-data.js";

interface AlmanacProjectionOptions extends CategoryProjectionOptions {
  hideSpoilered?: boolean;
  matchesEntry?: (itemIds: ItemId[]) => boolean;
  matchesSources?: (sources: Source[]) => boolean;
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
  /** Completed rows among `scopedRows`. */
  completedCount: number;
  id: AlmanacCategoryId;
  progress: CategoryProgress;
  rows: AlmanacRow[];
  /** Rows matching the filters, including unobtainable rows the filter reveals. */
  scopedRows: AlmanacRow[];
  /** Obtainable rows among `scopedRows`: revealed unobtainable rows never count toward a total. */
  scopedTotal: number;
  visibleRows: AlmanacRow[];
}

export interface AlmanacProjection extends CategoryProjection {
  rows: AlmanacRow[];
  sections: AlmanacSection[];
}

/**
 * One almanac row policy for progress, search and pages. Totals count obtainable entries,
 * independently of spoilers and display filters; showing unobtainable rows reveals them without
 * counting them, in section totals as well. Completed entries remain applicable.
 *
 * Callers choose context explicitly: search projects with default availability windows and offers
 * obtainable, unspoilered rows whatever their availability (`searchAlmanac`); pages pass user
 * windows, name/source filters and temporary completed-row retention.
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
      const windowed = { sources, visibility: item.visibility };
      const available = isItemAvailable(windowed, ctx, ctx.availabilityWindows);
      const spoilered = isSpoilered(item.visibility, options.progressionState);
      const matchesBaseFilters =
        (obtainable || options.showUnobtainable === true) &&
        (completed || available) &&
        (!options.hideSpoilered || !spoilered) &&
        (options.matchesEntry?.(entry.itemIds) ?? true);
      const matchesFilters = matchesBaseFilters && (options.matchesSources?.(sources) ?? true);
      return {
        available,
        canonicalId,
        completed,
        dimmed: isItemDimmed(windowed, completed, ctx, ctx.availabilityWindows),
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
      scopedTotal: scopedRows.filter((row) => row.obtainable).length,
      visibleRows: rows.filter((row) => row.visible),
    };
  });
  const totals: CategoryProgress = { completed: 0, remainingInScope: 0, total: 0 };
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
  return { rows, sections, totals };
}
