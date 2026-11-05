import { trackerData, trackerIndex } from "#lib/data/index.js";
import { isAlmanacEntryObtainable } from "#lib/engine/applicability.js";
import { isSpoilered } from "#lib/engine/projections/category-projection.js";
import { addProgress, countShelfRows, shelfFacts } from "#lib/engine/shelves.js";
import { recordEntries } from "#lib/utils/record.js";

import type { CategoryProgress, ProgressContext } from "#lib/engine/progress.js";
import type {
  CategoryProjection,
  CategoryProjectionOptions,
} from "#lib/engine/projections/category-projection.js";
import type { ShelfRow } from "#lib/engine/shelves.js";
import type { Source } from "#lib/types/acquisition.js";
import type { AlmanacCategoryId, AlmanacEntry, Item, ItemId } from "#lib/types/tracker-data.js";

interface AlmanacProjectionOptions extends CategoryProjectionOptions {
  hideSpoilered?: boolean;
  matchesEntry?: (entry: AlmanacEntry) => boolean;
  showUnobtainable?: boolean;
}

export interface AlmanacRow extends ShelfRow {
  canonicalId: ItemId;
  entry: AlmanacEntry;
  item: Item;
  /** Passes the page's search & the unobtainable filter, whatever the source filters show. */
  matchesSearch: boolean;
  obtainable: boolean;
  sources: Source[];
  spoilered: boolean;
  /** Passes every filter, so the page renders it. */
  visible: boolean;
}

interface AlmanacSection {
  canonicalIds: ItemId[];
  id: AlmanacCategoryId;
  progress: CategoryProgress;
  rows: AlmanacRow[];
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
      const facts = shelfFacts(
        { sources, visibility: item.visibility },
        completed,
        ctx,
        options.showsSource,
      );
      const spoilered = isSpoilered(item.visibility, options.progressionState);
      const matchesSearch =
        (obtainable || options.showUnobtainable === true) &&
        (!options.hideSpoilered || !spoilered) &&
        (options.matchesEntry?.(entry) ?? true);
      return {
        ...facts,
        canonicalId,
        // An unobtainable row can only be revealed; it's never something to do.
        doable: facts.doable && obtainable,
        doableAnywhere: facts.doableAnywhere && obtainable,
        entry,
        item,
        matchesSearch,
        obtainable,
        sources,
        spoilered,
        visible: matchesSearch && facts.shown,
      };
    });
    const applicableRows = rows.filter((row) => row.obtainable);
    return {
      canonicalIds: applicableRows.map((row) => row.canonicalId),
      id,
      progress: countShelfRows(applicableRows),
      rows,
      visibleRows: rows.filter((row) => row.visible),
    };
  });
  const totals = addProgress(sections.map(({ progress }) => progress));
  // Some entries occur in several sections. Search addresses each canonical row once;
  // section progress intentionally counts every in-game section membership.
  const rows = [
    ...new Map(
      sections.flatMap((section) => section.rows).map((row) => [row.canonicalId, row]),
    ).values(),
  ];
  return { rows, sections, totals };
}
